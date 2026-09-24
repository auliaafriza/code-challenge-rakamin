import { useState } from "react";
import { UseFormReturn, useWatch } from "react-hook-form";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X, ChevronDown, ChevronRight, Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import LevelRadio from "./LevelRadio";
import CustomSkillForm from "./CustomSkillForm";
import { cn } from "@/lib/utils";
import type { AssessmentFormValues } from "@/pages/assessments/AssessmentNewPage";

interface SkillCardProps {
  index: number;
  id: string;
  form: UseFormReturn<AssessmentFormValues>;
  onRemove: () => void;
}

const CUSTOM_FIELDS = [
  "skill_label",
  "scope_include",
  "l1_anchor",
  "l2_anchor",
  "l3_anchor",
  "l4_anchor",
  "l5_anchor",
] as const;

export default function SkillCard({ index, id, form, onRemove }: SkillCardProps) {
  const [anchorsOpen, setAnchorsOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const skill = useWatch({ control: form.control, name: `skills.${index}` });
  const isCustom = skill?.is_custom;
  const skillLabel = skill?.skill_label || "Skill baru";

  const isNew = isCustom && !skill?.skill_label;
  const [editing, setEditing] = useState<boolean>(Boolean(isNew));
  /** Values as they were when editing began, so Cancel can actually revert. */
  const [snapshot, setSnapshot] = useState<Record<string, unknown> | null>(null);

  const style = { transform: CSS.Transform.toString(transform), transition };

  const beginEdit = () => {
    const current: Record<string, unknown> = {};
    CUSTOM_FIELDS.forEach((f) => {
      current[f] = form.getValues(`skills.${index}.${f}` as const);
    });
    current.expected_level = form.getValues(`skills.${index}.expected_level`);
    setSnapshot(current);
    setEditing(true);
  };

  const commitEdit = async () => {
    const ok = await form.trigger(
      CUSTOM_FIELDS.map((f) => `skills.${index}.${f}` as const),
      { shouldFocus: true }
    );
    if (!ok) return;
    setSnapshot(null);
    setEditing(false);
  };

  const cancelEdit = () => {
    if (snapshot === null) {
      onRemove();
      return;
    }
    Object.entries(snapshot).forEach(([key, value]) => {
      form.setValue(`skills.${index}.${key}` as never, value as never);
    });
    form.clearErrors(CUSTOM_FIELDS.map((f) => `skills.${index}.${f}` as const));
    setEditing(false);
  };

  const filledAnchors = CUSTOM_FIELDS.filter(
    (f) => f !== "skill_label" && f !== "scope_include"
  ).filter((f) => Boolean(skill?.[f as keyof typeof skill])).length;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("rounded-lg border bg-white", isDragging && "opacity-50 shadow-lg")}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          className="cursor-grab touch-none rounded text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
          aria-label={`Ubah urutan skill ${skillLabel}. Tekan spasi lalu panah atas/bawah untuk memindahkan.`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{skillLabel}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {isCustom
                ? "Custom"
                : skill?.skill_id
                  ? `SK-${String(skill.skill_id).padStart(3, "0")}`
                  : ""}
            </span>
          </div>
          {isCustom && !editing && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Expected L{skill?.expected_level ?? 3} · {filledAnchors}/5 anchor terisi
            </p>
          )}
        </div>

        {isCustom && !editing && (
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={beginEdit}>
            <Pencil className="mr-1 h-3 w-3" aria-hidden="true" /> Edit
          </Button>
        )}

        <button
          type="button"
          onClick={onRemove}
          className="rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label={`Hapus skill ${skillLabel}`}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="space-y-3 px-3 pb-3">
        {isCustom ? (
          editing ? (
            <>
              <CustomSkillForm index={index} form={form} />
              <div className="flex justify-end gap-2 border-t pt-3">
                <Button type="button" variant="outline" size="sm" onClick={cancelEdit}>
                  Batal
                </Button>
                <Button type="button" size="sm" onClick={commitEdit}>
                  <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Selesai
                </Button>
              </div>
            </>
          ) : null
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setAnchorsOpen((o) => !o)}
              aria-expanded={anchorsOpen}
              className="flex items-center gap-1 rounded text-xs text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {anchorsOpen ? (
                <ChevronDown className="h-3 w-3" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
              )}
              {anchorsOpen ? "Hide L1–L5 anchors" : "Show L1–L5 anchors"}
            </button>

            {anchorsOpen && (
              <div className="space-y-1 rounded bg-muted/50 p-2 text-xs text-muted-foreground">
                {[1, 2, 3, 4, 5].map((level) => {
                  const anchor = skill?.[`l${level}_anchor` as keyof typeof skill] as string;
                  return anchor ? (
                    <div key={level}>
                      <span className="font-medium text-foreground">L{level}</span> {anchor}
                    </div>
                  ) : null;
                })}
              </div>
            )}

            <div className="space-y-1.5">
              <span className="text-xs text-muted-foreground">Expected level:</span>
              <LevelRadio
                value={skill?.expected_level ?? 3}
                onChange={(v) => form.setValue(`skills.${index}.expected_level`, v)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
