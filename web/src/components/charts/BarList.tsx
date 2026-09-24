import { cn } from "@/lib/utils";

export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** Teks kecil di kanan, mis. persentase. */
  meta?: string;
}

export default function BarList({ rows, emptyLabel }: { rows: BarRow[]; emptyLabel: string }) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.key}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm">{row.label}</span>
            <span className="shrink-0 text-sm tabular-nums">
              <strong className="font-semibold">{row.value}</strong>
              {row.meta && <span className="ml-1.5 text-xs text-muted-foreground">{row.meta}</span>}
            </span>
          </div>
          <div className={cn("mt-1 h-2 overflow-hidden rounded-full bg-muted")}>
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
              aria-hidden="true"
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
