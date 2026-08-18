import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import PageHeader from "@/components/PageHeader";
import { RequiredMark, FieldMessage, errorProps } from "@/components/FormField";
import { useToast } from "@/components/ui/toast";
import LevelRadio from "@/components/assessment/LevelRadio";
import SkillPicker from "@/components/assessment/SkillPicker";
import { vacanciesApi } from "@/services/vacancies";
import { readErrorMessage } from "@/services/portfolios";
import { fromDateInputValue, todayInputValue } from "@/utils/constants";
import { Plus, X, Loader2 } from "lucide-react";
import type { VacancySkill } from "@/types";

export interface VacancyFormValues {
  role_title: string;
  culture_dimensions: string;
  competency_expectations: string;
  closes_on: string;
  skills: Partial<VacancySkill>[];
}

export default function VacancyNewPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<VacancyFormValues>({
    defaultValues: {
      role_title: "",
      culture_dimensions: "",
      competency_expectations: "",
      closes_on: "",
      skills: [],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "skills" });

  const onSubmit = async (data: VacancyFormValues) => {
    setError(null);
    setSubmitting(true);
    try {
      await vacanciesApi.create({
        role_title: data.role_title,
        culture_dimensions: data.culture_dimensions,
        competency_expectations: data.competency_expectations,
        closes_at: fromDateInputValue(data.closes_on),
        vacancy_skills_attributes: data.skills,
      });
      toast.success(`Lowongan “${data.role_title}” berhasil dibuat.`);
      navigate("/vacancies");
    } catch (e) {
      const message = await readErrorMessage(e, "Gagal menyimpan lowongan.");
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        backTo="/vacancies"
        crumbs={[{ label: "Vacancies", to: "/vacancies" }, { label: "New Vacancy" }]}
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="role_title">
            Role title <RequiredMark />
          </Label>
          <Input
            id="role_title"
            placeholder="Senior Frontend Engineer"
            {...register("role_title", { required: "Role title wajib diisi." })}
            {...errorProps(errors.role_title, "role_title")}
          />
          <FieldMessage error={errors.role_title} id="role_title-error" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="closes_on">Lowongan ditutup</Label>
          <Input
            id="closes_on"
            type="date"
            className="w-48"
            min={todayInputValue()}
            {...register("closes_on")}
          />
          <p className="text-xs text-muted-foreground">
            Opsional. Dipakai untuk menandai lowongan yang sudah tidak aktif saat membandingkan
            portfolio kandidat. Kosongkan bila belum ditentukan.
          </p>
        </div>

        <Separator />

        <div className="space-y-3">
          <Label>Expected skills</Label>

          {fields.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              Belum ada skill ditambahkan.
            </div>
          ) : (
            <div className="space-y-2">
              {fields.map((field, index) => (
                <div key={field.id} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{watch(`skills.${index}.skill_label`)}</span>
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      aria-label={`Hapus skill ${watch(`skills.${index}.skill_label`)}`}
                      className="rounded p-0.5 text-muted-foreground hover:text-destructive focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Expected level:</span>
                    <LevelRadio
                      value={watch(`skills.${index}.expected_level`) ?? 3}
                      onChange={(v) => setValue(`skills.${index}.expected_level`, v)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Spacing: the add button previously sat flush against the empty
              state, reading as part of the placeholder rather than a control. */}
          <div className="pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Add skill expectation
            </Button>
          </div>
        </div>

        <Separator />

        <div className="space-y-1.5">
          <Label htmlFor="culture_dimensions">Company culture (used in AI narrative)</Label>
          <Textarea
            id="culture_dimensions"
            placeholder="Ownership-driven, async-first, direct feedback culture..."
            rows={3}
            {...register("culture_dimensions")}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="competency_expectations">
            Competency expectations (used in AI narrative)
          </Label>
          <Textarea
            id="competency_expectations"
            placeholder="Strong communicator who can align cross-functional teams..."
            rows={3}
            {...register("competency_expectations")}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate("/vacancies")}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Save Vacancy
          </Button>
        </div>
      </form>

      <SkillPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(s) => append({ skill_id: s.skill_id, skill_label: s.skill_label, expected_level: 3 })}
      />
    </div>
  );
}
