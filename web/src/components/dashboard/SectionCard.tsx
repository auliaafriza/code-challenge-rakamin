import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  className?: string;
  /** Tautan kecil di kanan judul, mis. "Lihat semua". */
  action?: React.ReactNode;
  children: React.ReactNode;
}

export default function SectionCard({ icon: Icon, title, description, className, action, children }: SectionCardProps) {
  return (
    <section className={cn("rounded-xl border bg-card text-card-foreground shadow-sm", className)}>
      <header className="flex items-start gap-3 border-b px-5 py-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-tight">{title}</h2>
          {description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="shrink-0 pt-0.5">{action}</div>}
      </header>
      <div className="px-3 py-3">{children}</div>
    </section>
  );
}
