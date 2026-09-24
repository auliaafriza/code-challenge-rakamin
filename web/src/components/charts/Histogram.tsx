export interface Bucket {
  label: string;
  value: number;
}

export default function Histogram({ buckets, unitLabel }: { buckets: Bucket[]; unitLabel: string }) {
  const max = Math.max(1, ...buckets.map((b) => b.value));
  const total = buckets.reduce((sum, b) => sum + b.value, 0);

  if (total === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Belum ada sesi yang selesai.</p>;
  }

  return (
    <div>
      <div className="flex h-36 items-end gap-2">
        {buckets.map((b) => (
          <div key={b.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <span className="text-xs font-semibold tabular-nums">{b.value || ""}</span>
            <div
              className="w-full rounded-t bg-primary"
              style={{ height: `${Math.max(b.value === 0 ? 2 : 6, (b.value / max) * 100)}%` }}
              aria-hidden="true"
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2 border-t pt-1.5">
        {buckets.map((b) => (
          <span key={b.label} className="min-w-0 flex-1 text-center text-[10px] leading-tight text-muted-foreground">
            {b.label}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{unitLabel}</p>
    </div>
  );
}
