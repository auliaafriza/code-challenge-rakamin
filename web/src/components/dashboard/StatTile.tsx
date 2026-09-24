import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "default" | "live" | "warn";

const TONE_ICON: Record<Tone, string> = {
  default: "bg-accent text-primary",
  live: "bg-primary text-primary-foreground",
  warn: "bg-amber-100 text-amber-900",
};

interface StatTileProps {
  icon: LucideIcon;
  label: string;
  value: number;
  caption?: string;
  tone?: Tone;
  to?: string;
}

export default function StatTile({ icon: Icon, label, value, caption, tone = "default", to }: StatTileProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", TONE_ICON[tone])}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-4 text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
      {caption && <p className="mt-1 text-xs text-muted-foreground">{caption}</p>}
    </>
  );

  const className = cn(
    "block rounded-xl border bg-card p-5 text-card-foreground shadow-sm transition-colors",
    to &&
      "hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
  );

  if (!to) return <div className={className}>{body}</div>;

  return (
    <Link to={to} className={className}>
      {body}
    </Link>
  );
}
