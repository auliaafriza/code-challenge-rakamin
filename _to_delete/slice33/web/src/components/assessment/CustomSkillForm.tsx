import { UseFormReturn, useWatch } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RequiredMark, FieldMessage, errorProps } from "@/components/FormField";
import LevelRadio from "./LevelRadio";
import type { AssessmentFormValues } from "@/pages/assessments/AssessmentNewPage";

interface CustomSkillFormProps {
  index: number;
  form: UseFormReturn<AssessmentFormValues>;
}

const LEVEL_PLACEHOLDERS: Record<number, string> = {
  1: "What does L1 look like for this skill?",
  2: "What does L2 look like for this skill?",
  3: "What does L3 look like for this skill?",
  4: "What does L4 look like for this skill?",
  5: "What does L5 look like for this skill?",
};

const ANCHOR_KEYS = ["l1_anchor", "l2_anchor", "l3_anchor", "l4_anchor", "l5_anchor"] as const;

/**
 * The most punishing form in the product: seven required free-text fields,
 * every one of them a definition the AI will later grade a human being against.
 *
 * All seven were registered `required: true` and not one of them rendered a
 * message. Leave any single field blank and react-hook-form blocks the submit,
 * the Save button re-enables, and the page sits there — no message, no focus
 * move, no indication which of the seven fields is the problem. The assessor's
 * only feedback that anything happened at all was that nothing happened.
 */
export default function CustomSkillForm({ index, form }: CustomSkillFormProps) {
  const {
    register,
    setValue,
    formState: { errors },
  } = form;
  const expectedLevel = useWatch({ control: form.control, name: `skills.${index}.expected_level` });
  const skillErrors = errors.skills?.[index];

  return (
    <div className="space-y-3 pt-1">
      <div className="space-y-1.5">
        <Label htmlFor={`skills.${index}.skill_label`}>
          Name <RequiredMark />
        </Label>
        <Input
          id={`skills.${index}.skill_label`}
          placeholder="e.g. Communication"
          {...register(`skills.${index}.skill_label`, { required: "Nama skill wajib diisi." })}
          {...errorProps(skillErrors?.skill_label, `skills.${index}.skill_label`)}
        />
        <FieldMessage error={skillErrors?.skill_label} id={`skills.${index}.skill_label-error`} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`skills.${index}.scope_include`}>
          What counts (scope include) <RequiredMark />
        </Label>
        <Textarea
          id={`skills.${index}.scope_include`}
          placeholder="Clear technical explanation, stakeholder alignment, async written communication..."
          rows={2}
          {...register(`skills.${index}.scope_include`, {
            required: "Jelaskan apa saja yang termasuk dalam skill ini.",
          })}
          {...errorProps(skillErrors?.scope_include, `skills.${index}.scope_include`)}
        />
        <FieldMessage error={skillErrors?.scope_include} id={`skills.${index}.scope_include-error`} />
      </div>

      <div className="space-y-2">
        {ANCHOR_KEYS.map((key, i) => (
          <div key={key} className="space-y-1">
            <Label htmlFor={`skills.${index}.${key}`}>
              L{i + 1} anchor <RequiredMark />
            </Label>
            <Textarea
              id={`skills.${index}.${key}`}
              placeholder={LEVEL_PLACEHOLDERS[i + 1]}
              rows={2}
              {...register(`skills.${index}.${key}`, {
                required: `Anchor L${i + 1} wajib diisi — level tanpa definisi tidak bisa dinilai.`,
              })}
              {...errorProps(skillErrors?.[key], `skills.${index}.${key}`)}
            />
            <FieldMessage error={skillErrors?.[key]} id={`skills.${index}.${key}-error`} />
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label>Expected level</Label>
        <LevelRadio
          value={expectedLevel ?? 3}
          onChange={(v) => setValue(`skills.${index}.expected_level`, v)}
        />
      </div>
    </div>
  );
}
