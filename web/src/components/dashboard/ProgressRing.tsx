import { cn } from "@/lib/utils";

interface ProgressRingProps {
  value: number;
  label: string;
  className?: string;
}

export default function ProgressRing({ value, label, className }: ProgressRingProps) {
  const safe = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const dash = (safe / 100) * circumference;

  return (
    <div className={cn("relative h-12 w-12 shrink-0", className)}>
      <svg viewBox="0 0 48 48" className="h-full w-full -rotate-90" role="img" aria-label={label}>
        <title>{label}</title>
        <circle cx="24" cy="24" r={radius} fill="none" strokeWidth="4" className="stroke-muted" />
        {safe > 0 && (
          <circle
            cx="24"
            cy="24"
            r={radius}
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
            className="stroke-primary"
          />
        )}
      </svg>
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold tabular-nums"
      >
        {Math.round(safe)}%
      </span>
    </div>
  );
}
