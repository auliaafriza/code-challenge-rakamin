import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

interface Crumb {
  label: string;
  to?: string;
}

interface PageHeaderProps {
  /** Where the back control goes. Always the parent list, never history.back(). */
  backTo: string;
  /** Trail rendered after the back control. The last entry is the current page. */
  crumbs: Crumb[];
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
}

export default function PageHeader({
  backTo,
  crumbs,
  title,
  subtitle,
  actions,
}: PageHeaderProps) {
  return (
    <div className="mb-6 space-y-3">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm">
        <Link
          to={backTo}
          className="inline-flex items-center gap-1 rounded text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Back</span>
        </Link>

        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <span key={`${crumb.label}-${i}`} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="text-muted-foreground">
                /
              </span>
              {crumb.to && !isLast ? (
                <Link
                  to={crumb.to}
                  className="rounded text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="font-medium" aria-current={isLast ? "page" : undefined}>
                  {crumb.label}
                </span>
              )}
            </span>
          );
        })}
      </nav>

      {(title || actions) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          {title && (
            <div>
              <h1 className="text-xl font-semibold">{title}</h1>
              {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
            </div>
          )}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
    </div>
  );
}
