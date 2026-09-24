import { cn } from "@/lib/utils";
import type { Session } from "@/types";

export type Stage = "pending" | "active" | "ended" | "failed";

export function stageOf(session: Session): Stage {
  if (session.status === "ended" && session.end_reason === "error") return "failed";
  return session.status;
}

export const STAGE_LABEL: Record<Stage, string> = {
  pending: "Diundang",
  active: "Berlangsung",
  ended: "Selesai",
  failed: "Gagal",
};

const STAGE_STYLE: Record<Stage, string> = {
  pending: "border-amber-300 bg-amber-50 text-amber-900",
  active: "border-primary/30 bg-accent text-primary",
  ended: "border-emerald-200 bg-emerald-50 text-emerald-800",
  failed: "border-destructive/30 bg-destructive/5 text-destructive",
};

export default function CandidateStatusBadge({ stage }: { stage: Stage }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        STAGE_STYLE[stage]
      )}
    >
      {STAGE_LABEL[stage]}
    </span>
  );
}
