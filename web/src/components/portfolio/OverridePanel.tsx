import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import LevelRadio from "@/components/assessment/LevelRadio";
import LevelBadge from "./LevelBadge";
import { portfoliosApi, readErrorMessage } from "@/services/portfolios";
import { assessorOverrideSchema } from "@/services/schemas";
import { Loader2, Pencil } from "lucide-react";
import { parseLevel, type Level } from "@/utils/constants";
import type { PortfolioSkill, AssessorOverride } from "@/services/schemas";

interface OverridePanelProps {
  skill: PortfolioSkill;
  existingOverride?: AssessorOverride;
  onSaved: (override: AssessorOverride) => void;
}

function formatWhen(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function OverridePanel({ skill, existingOverride, onSaved }: OverridePanelProps) {
  const aiLevel = parseLevel(skill.ai_level);
  const savedLevel = existingOverride?.override_level ?? null;

  const [open, setOpen] = useState(false);
  // Form state, not a claim about the candidate: when the model produced no
  // usable rating we start in the middle of the scale rather than at L1.
  const [draftLevel, setDraftLevel] = useState<Level>(savedLevel ?? aiLevel ?? 3);
  const [draftNotes, setDraftNotes] = useState(existingOverride?.assessor_notes ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Derived state must follow the source of truth. Previously the initial value
  // was captured once at mount, so a refetch (or another tab's save) left the
  // panel showing a rating that no longer existed.
  useEffect(() => {
    setDraftLevel(savedLevel ?? aiLevel ?? 3);
    setDraftNotes(existingOverride?.assessor_notes ?? "");
  }, [savedLevel, aiLevel, existingOverride?.assessor_notes]);

  const hasOverride = !!existingOverride;

  const discardDraft = () => {
    // Cancel means cancel. The old panel kept the abandoned edit in state, so
    // reopening showed a rating the assessor had explicitly backed out of — and
    // it looked saved.
    setDraftLevel(savedLevel ?? aiLevel ?? 3);
    setDraftNotes(existingOverride?.assessor_notes ?? "");
    setSaveError(null);
    setOpen(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await portfoliosApi.saveOverride(skill.id, {
        override_level: draftLevel,
        assessor_notes: draftNotes,
      });
      onSaved(assessorOverrideSchema.parse((res.data as any).override));
      setOpen(false);
    } catch (error) {
      setSaveError(await readErrorMessage(error, "Gagal menyimpan override. Coba lagi."));
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <div className="flex flex-col items-end gap-1">
        {hasOverride ? (
          <>
            <div className="flex items-center gap-1.5 text-sm">
              <LevelBadge level={aiLevel} size="sm" />
              <span className="text-xs text-muted-foreground">AI</span>
              <span aria-hidden="true" className="text-muted-foreground">
                →
              </span>
              <LevelBadge level={existingOverride!.override_level} size="sm" />
              <span className="text-xs font-medium text-teal-700">Dikoreksi assessor</span>
            </div>
            {/* Accountability is only real if it is visible: who decided, and when. */}
            <p className="text-[11px] text-muted-foreground">
              {existingOverride!.overridden_by_email ?? "assessor (tidak diketahui)"}
              {formatWhen(existingOverride!.overridden_at)
                ? ` · ${formatWhen(existingOverride!.overridden_at)}`
                : ""}
            </p>
            <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
              <Pencil className="mr-1 h-3 w-3" aria-hidden="true" /> Ubah override
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            Override penilaian
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="w-full space-y-3 rounded-lg border bg-muted/30 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Override penilaian AI
      </div>

      {aiLevel === null && (
        <p className="rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
          AI tidak menghasilkan level yang bisa dibaca untuk skill ini. Penilaianmu akan menjadi
          satu-satunya sumber.
        </p>
      )}

      <div className="space-y-1.5">
        <Label className="text-sm">Penilaianmu:</Label>
        <LevelRadio value={draftLevel} onChange={(v) => setDraftLevel(v as Level)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`notes-${skill.id}`} className="text-sm">
          Catatan (opsional):
        </Label>
        <Textarea
          id={`notes-${skill.id}`}
          value={draftNotes}
          onChange={(e) => setDraftNotes(e.target.value)}
          rows={3}
          placeholder="Alasan koreksi — akan terbaca oleh siapa pun yang memakai laporan ini."
        />
      </div>

      {saveError && (
        <p role="alert" className="text-xs text-destructive">
          {saveError}
        </p>
      )}

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={discardDraft} disabled={saving}>
          Batal
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          Simpan override
        </Button>
      </div>
    </div>
  );
}
