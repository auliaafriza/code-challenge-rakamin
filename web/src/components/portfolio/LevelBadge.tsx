import {
  parseLevel,
  LEVEL_LABELS,
  LEVEL_DESCRIPTIONS,
  LEVEL_BADGE_CLASSES,
  LEVEL_BADGE_UNKNOWN_CLASS,
  LEVEL_UNKNOWN_LABEL,
} from "@/utils/constants";
import { cn } from "@/lib/utils";

interface LevelBadgeProps {
  level: number | string | null | undefined;
  size?: "sm" | "md";
  className?: string;
}

/**
 * A rating on the L1–L5 scale, or an explicit "not rated".
 *
 * An unparseable level renders as an em dash with an accessible label, never as
 * L1 and never as an empty badge. Colour is redundant with the text label so the
 * level survives greyscale printing and colour-blind vision (WCAG 1.4.1).
 */
export default function LevelBadge({ level, size = "md", className }: LevelBadgeProps) {
  const parsed = parseLevel(level);

  const base = cn(
    "inline-flex flex-col items-center justify-center rounded font-semibold",
    size === "md" ? "px-3 py-2 min-w-14 text-base" : "px-2 py-1 min-w-10 text-sm"
  );

  if (parsed === null) {
    return (
      <div
        className={cn(base, LEVEL_BADGE_UNKNOWN_CLASS, className)}
        title={LEVEL_UNKNOWN_LABEL}
        aria-label={LEVEL_UNKNOWN_LABEL}
      >
        <span aria-hidden="true">—</span>
        {size === "md" && (
          <span className="text-[10px] font-normal opacity-80">{LEVEL_UNKNOWN_LABEL}</span>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(base, LEVEL_BADGE_CLASSES[parsed], className)}
      aria-label={`${LEVEL_LABELS[parsed]} — ${LEVEL_DESCRIPTIONS[parsed]}`}
    >
      <span>{LEVEL_LABELS[parsed]}</span>
      {size === "md" && (
        <span className="text-[10px] font-normal opacity-80">{LEVEL_DESCRIPTIONS[parsed]}</span>
      )}
    </div>
  );
}
