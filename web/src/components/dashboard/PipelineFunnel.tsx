import type { FunnelStage } from "@/utils/dashboard";
import { ChevronRight } from "lucide-react";

interface PipelineFunnelProps {
  stages: FunnelStage[];
}

export default function PipelineFunnel({ stages }: PipelineFunnelProps) {
  const base = stages[0]?.value ?? 0;

  return (
    <ol className="space-y-3">
      {stages.map((stage, i) => {
        const pct = base > 0 ? Math.round((stage.value / base) * 100) : 0;
        return (
          <li key={stage.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
                {stage.label}
              </span>
              <span className="shrink-0 text-sm tabular-nums">
                <strong className="font-semibold">{stage.value}</strong>
                {i > 0 && <span className="ml-1.5 text-xs text-muted-foreground">{pct}%</span>}
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${base > 0 ? pct : 0}%` }}
                aria-hidden="true"
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{stage.hint}</p>
          </li>
        );
      })}
    </ol>
  );
}
