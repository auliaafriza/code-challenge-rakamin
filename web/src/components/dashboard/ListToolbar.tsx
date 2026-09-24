import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface ListToolbarProps {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder: string;
  /** Pilihan filter; nilai "" berarti semua. */
  filter: string;
  onFilterChange: (value: string) => void;
  filterLabel: string;
  options: { value: string; label: string }[];
}

export default function ListToolbar({
  query,
  onQueryChange,
  placeholder,
  filter,
  onFilterChange,
  filterLabel,
  options,
}: ListToolbarProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="pl-9"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <span className="sr-only">{filterLabel}</span>
        <select
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          aria-label={filterLabel}
          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-44"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
