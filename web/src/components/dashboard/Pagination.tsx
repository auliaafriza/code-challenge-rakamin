import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  totalPages: number;
  totalCount: number;
  shown: number;
  onChange: (page: number) => void;
  unit: string;
}

export default function Pagination({ page, totalPages, totalCount, shown, onChange, unit }: PaginationProps) {
  if (totalPages <= 1) {
    return (
      <p className="px-1 text-xs text-muted-foreground">
        Menampilkan {shown} {unit}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1">
      <p className="text-xs text-muted-foreground">
        Halaman {page} dari {totalPages} · {totalCount} {unit}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          aria-label="Halaman sebelumnya"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Halaman berikutnya"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
