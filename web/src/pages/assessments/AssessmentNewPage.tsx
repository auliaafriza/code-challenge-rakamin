import { useState } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import PageHeader from "@/components/PageHeader";
import { RequiredMark, FieldMessage, errorProps } from "@/components/FormField";
import { useToast } from "@/components/ui/toast";
import SkillCard from "@/components/assessment/SkillCard";
import SkillPicker from "@/components/assessment/SkillPicker";
import { Plus, Loader2 } from "lucide-react";
import { assessmentsApi } from "@/services/assessments";
import { readErrorMessage } from "@/services/portfolios";
import {
  TIME_LIMIT_OPTIONS,
  LANGUAGE_OPTIONS,
  fromDateInputValue,
  todayInputValue,
} from "@/utils/constants";
import type { AssessmentSkill } from "@/types";

export interface AssessmentFormValues {
  name: string;
  time_limit_min: number;
  language: "en" | "id";
  /** Local date-input value; converted to an ISO timestamp on submit. */
  expires_on: string;
  skills: Partial<AssessmentSkill>[];
}

export default function AssessmentNewPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<AssessmentFormValues>({
    defaultValues: {
      name: "",
      time_limit_min: 45,
      language: "en",
      expires_on: "",
      skills: [],
    },
  });

  const { register, handleSubmit, control, formState: { errors } } = form;
  const { fields, append, remove, move } = useFieldArray({ control, name: "skills" });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = fields.findIndex((f) => f.id === active.id);
      const newIndex = fields.findIndex((f) => f.id === over.id);
      move(oldIndex, newIndex);
    }
  };

  const addCustomSkill = () => {
    append({
      skill_label: "",
      is_custom: true,
      expected_level: 3,
      display_order: fields.length,
    });
  };

  const addB7Skill = (skill: Partial<AssessmentSkill>) => {
    append({ ...skill, display_order: fields.length });
  };

  const onSubmit = async (data: AssessmentFormValues) => {
    if (data.skills.length === 0) {
      setError("Tambahkan minimal satu skill sebelum menyimpan.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await assessmentsApi.create({
        name: data.name,
        time_limit_min: data.time_limit_min,
        language: data.language,
        expires_at: fromDateInputValue(data.expires_on),
        assessment_skills_attributes: data.skills.map((s, i) => ({
          ...s,
          display_order: i,
        })),
      });
      toast.success(`Assessment “${data.name}” berhasil dibuat.`);
      navigate(`/assessments/${res.data.assessment.id}/invite`);
    } catch (e) {
      const message = await readErrorMessage(e, "Gagal menyimpan assessment.");
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        backTo="/assessments"
        crumbs={[{ label: "Assessments", to: "/assessments" }, { label: "New Assessment" }]}
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="name">
            Role title <RequiredMark />
          </Label>
          <Input
            id="name"
            placeholder="Senior Frontend Engineer"
            {...register("name", { required: "Role title wajib diisi." })}
            {...errorProps(errors.name, "name")}
          />
          <FieldMessage error={errors.name} id="name-error" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="time_limit_min">
            Session time limit <RequiredMark />
          </Label>
          <Controller
            control={control}
            name="time_limit_min"
            render={({ field }) => (
              <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                <SelectTrigger id="time_limit_min" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_LIMIT_OPTIONS.map((min) => (
                    <SelectItem key={min} value={String(min)}>
                      {min} min
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="language">
            Interview language <RequiredMark />
          </Label>
          <Controller
            control={control}
            name="language"
            rules={{ required: "Pilih bahasa wawancara." }}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="language" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <p className="text-xs text-muted-foreground">
            Bahasa yang dipakai AI interviewer saat berbicara dengan kandidat.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="expires_on">Berlaku sampai</Label>
          <Input
            id="expires_on"
            type="date"
            className="w-48"
            min={todayInputValue()}
            {...register("expires_on")}
          />
          <p className="text-xs text-muted-foreground">
            Opsional. Setelah tanggal ini link undangan berhenti berlaku, jadi kandidat tidak bisa
            masuk ke proses yang sudah ditutup. Kosongkan bila tidak ada batas waktu.
          </p>
        </div>

        <Separator />

        <div className="space-y-3">
          <Label>
            Skills to assess <RequiredMark />
          </Label>

          {fields.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              <p className="mb-1">Belum ada skill ditambahkan.</p>
              <p>Minimal satu skill diperlukan untuk melanjutkan.</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={fields.map((f) => f.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {fields.map((field, index) => (
                    <SkillCard
                      key={field.id}
                      id={field.id}
                      index={index}
                      form={form}
                      onRemove={() => remove(index)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Add from Skill Taxonomy
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={addCustomSkill}>
              <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Add custom skill
            </Button>
          </div>
        </div>

        <Separator />

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate("/assessments")}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Save &amp; Create Session
          </Button>
        </div>
      </form>

      <SkillPicker open={pickerOpen} onOpenChange={setPickerOpen} onSelect={addB7Skill} />
    </div>
  );
}
