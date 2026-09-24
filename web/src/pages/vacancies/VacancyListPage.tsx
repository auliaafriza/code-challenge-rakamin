import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useToast } from "@/components/ui/toast";
import { vacanciesApi } from "@/services/vacancies";
import { readErrorMessage } from "@/services/portfolios";
import { Plus, ChevronRight, Trash2, CalendarClock, ListChecks } from "lucide-react";
import { formatDate, isExpired } from "@/utils/constants";
import EntityAvatar from "@/components/dashboard/EntityAvatar";
import ListToolbar from "@/components/dashboard/ListToolbar";
import Pagination from "@/components/dashboard/Pagination";
import { cn } from "@/lib/utils";
import type { PaginationMeta, Vacancy } from "@/types";

const DAY = 24 * 60 * 60 * 1000;

type Status = "open" | "closing" | "closed";

function statusOf(v: Vacancy): Status {
  if (!v.closes_at) return "open";
  if (isExpired(v.closes_at)) return "closed";
  const daysLeft = (new Date(v.closes_at).getTime() - Date.now()) / DAY;
  return daysLeft <= 7 ? "closing" : "open";
}

const STATUS_STYLE: Record<Status, { label: string; className: string }> = {
  open: { label: "Aktif", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  closing: { label: "Segera tutup", className: "border-amber-300 bg-amber-50 text-amber-900" },
  closed: { label: "Ditutup", className: "border-border bg-muted text-muted-foreground" },
};

function StatusBadge({ status }: { status: Status }) {
  const { label, className } = STATUS_STYLE[status];
  return (
    <span className={cn("shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium", className)}>
      {label}
    </span>
  );
}

export default function VacancyListPage() {
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const navigate = useNavigate();
  const toast = useToast();

  const load = useCallback((targetPage: number) => {
    setLoading(true);
    setError(false);
    vacanciesApi
      .list(targetPage)
      .then((res) => {
        setVacancies(res.data.vacancies);
        setMeta(res.data.meta ?? null);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(page);
  }, [load, page]);

  const handleDelete = async (vacancy: Vacancy) => {
    try {
      await vacanciesApi.delete(vacancy.id);
      setVacancies((prev) => prev.filter((v) => v.id !== vacancy.id));
      toast.success(`Lowongan “${vacancy.role_title}” dihapus.`);
    } catch (e) {
      toast.error(await readErrorMessage(e, "Gagal menghapus lowongan."));
    }
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vacancies.filter((v) => {
      if (q && !v.role_title.toLowerCase().includes(q)) return false;
      if (filter && statusOf(v) !== filter) return false;
      return true;
    });
  }, [vacancies, query, filter]);

  const filtering = query.trim() !== "" || filter !== "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vacancy</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Kelola lowongan pekerjaan dan pantau progres rekrutmen.
          </p>
        </div>
        <Button onClick={() => navigate("/vacancies/new")}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> New Vacancy
        </Button>
      </div>

      <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
        <ListToolbar
          query={query}
          onQueryChange={setQuery}
          placeholder="Cari lowongan…"
          filter={filter}
          onFilterChange={setFilter}
          filterLabel="Saring berdasarkan status"
          options={[
            { value: "", label: "Semua status" },
            { value: "open", label: "Aktif" },
            { value: "closing", label: "Segera tutup" },
            { value: "closed", label: "Ditutup" },
          ]}
        />

        {error && (
          <div role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">
            Gagal memuat daftar lowongan.{" "}
            <button type="button" onClick={() => load(page)} className="underline underline-offset-2">
              Coba lagi
            </button>
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : vacancies.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
            <p className="mb-3">Belum ada lowongan.</p>
            <Button variant="outline" onClick={() => navigate("/vacancies/new")}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Buat lowongan pertama
            </Button>
          </div>
        ) : visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Tidak ada yang cocok di halaman ini.{" "}
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setFilter("");
              }}
              className="underline underline-offset-2"
            >
              Hapus filter
            </button>
          </p>
        ) : (
          <ul className="divide-y">
            {visible.map((v) => (
              <li key={v.id}>
                <div className="flex items-start gap-3 px-1 py-3 sm:items-center">
                  <button
                    type="button"
                    onClick={() => navigate(`/vacancies/${v.id}/edit`)}
                    className="flex min-w-0 flex-1 items-start gap-3 rounded-lg p-1 text-left transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring sm:items-center"
                  >
                    <EntityAvatar name={v.role_title} />

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">{v.role_title}</span>
                        <StatusBadge status={statusOf(v)} />
                      </span>

                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <ListChecks className="h-3 w-3" aria-hidden="true" />
                          {v.skills?.length ?? 0} skill dibutuhkan
                        </span>
                        {v.closes_at && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span
                              className={cn(
                                "flex items-center gap-1",
                                isExpired(v.closes_at) && "text-destructive"
                              )}
                            >
                              <CalendarClock className="h-3 w-3" aria-hidden="true" />
                              {isExpired(v.closes_at) ? "Ditutup" : "Tutup"} {formatDate(v.closes_at)}
                            </span>
                          </>
                        )}
                      </span>
                    </span>
                  </button>

                  <div className="flex shrink-0 items-center gap-1">
                    <ConfirmDialog
                      trigger={
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Hapus lowongan ${v.role_title}`}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      }
                      title="Hapus lowongan ini?"
                      description={
                        <>
                          <strong>{v.role_title}</strong> akan dihapus permanen beserta daftar skill
                          yang dibutuhkannya. Laporan Fit/Gap yang sudah dibuat terhadap lowongan ini
                          tidak akan bisa dihitung ulang.
                        </>
                      }
                      onConfirm={() => handleDelete(v)}
                    />
                    <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {!loading && vacancies.length > 0 && (
          <>
            <Pagination
              page={meta?.current_page ?? page}
              totalPages={meta?.total_pages ?? 1}
              totalCount={meta?.total_count ?? vacancies.length}
              shown={visible.length}
              onChange={setPage}
              unit="lowongan"
            />
            {filtering && (
              <p className="px-1 text-xs text-muted-foreground">
                Pencarian dan filter hanya berlaku untuk halaman yang sedang terbuka.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
