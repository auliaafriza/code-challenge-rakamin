import { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import PageHeader from "@/components/PageHeader";
import { RequiredMark, FieldMessage, errorProps } from "@/components/FormField";
import { useToast } from "@/components/ui/toast";
import LevelRadio from "@/components/assessment/LevelRadio";
import SkillPicker from "@/components/assessment/SkillPicker";
import { vacanciesApi } from "@/services/vacancies";
import { readErrorMessage } from "@/services/portfolios";
import { fromDateInputValue, toDateInputValue, todayInputValue } from "@/utils/constants";
import { Plus, X, Loader2 } from "lucide-react";
import type { VacancyFormValues } from "./VacancyNewPage";

export default function VacancyEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roleTitle, setRoleTitle] = useState("");

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    reset,
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

  useEffect(() => {
    let cancelled = false;
    vacanciesApi
      .get(Number(id))
      .then((res) => {
        if (cancelled) return;
        const v = res.data.vacancy;
        setRoleTitle(v.role_title);
        reset({
          role_title: v.role_title,
          culture_dimensions: v.culture_dimensions,
          competency_expectations: v.competency_expectations,
          closes_on: toDateInputValue(v.closes_at),
          skills: v.skills,
        });
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, reset]);

  const onSubmit = async (data: VacancyFormValues) => {
    setError(null);
    setSubmitting(true);
    try {
      await vacanciesApi.update(Number(id), {
        role_title: data.role_title,
        culture_dimensions: data.culture_dimensions,
        competency_expectations: data.competency_expectations,
        closes_at: fromDateInputValue(data.closes_on),
        vacancy_skills_attributes: data.skills,
      });
      toast.success("Perubahan lowongan tersimpan.");
      navigate("/vacancies");
    } catch (e) {
      // This handler previously had no catch at all: only `finally`. A failed
      // save left the button re-enabled and the page unchanged, which reads
      // exactly like a save that never got clicked.
      const message = await readErrorMessage(e, "Gagal menyimpan perubahan.");
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader backTo="/vacancies" crumbs={[{ label: "Vacancies", to: "/vacancies" }, { label: "Edit" }]} />
        <div role="alert" className="rounded-lg border border-destructive/40 p-6 text-sm">
          <p className="font-medium text-destructive">Gagal memuat lowongan ini.</p>
          <p className="mt-1 text-muted-foreground">
            Form sengaja tidak ditampilkan agar kamu tidak menimpa data yang masih ada dengan form
            kosong.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        backTo="/vacancies"
        crumbs={[{ label: "Vacancies", to: "/vacancies" }, { label: roleTitle || "Vacancy" }, { label: "Edit" }]}
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="role_title">
            Role title <RequiredMark />
          </Label>
          <Input
            id="role_title"
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
                  <LevelRadio
                    value={watch(`skills.${index}.expected_level`) ?? 3}
                    onChange={(v) => setValue(`skills.${index}.expected_level`, v)}
                  />
                </div>
              ))}
            </div>
          )}
          <div className="pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Add skill
            </Button>
          </div>
        </div>

        <Separator />

        <div className="space-y-1.5">
          <Label htmlFor="culture_dimensions">Company culture</Label>
          <Textarea id="culture_dimensions" rows={3} {...register("culture_dimensions")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="competency_expectations">Competency expectations</Label>
          <Textarea id="competency_expectations" rows={3} {...register("competency_expectations")} />
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
            Save Changes
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
