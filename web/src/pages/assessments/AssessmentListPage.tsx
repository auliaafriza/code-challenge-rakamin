import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useToast } from "@/components/ui/toast";
import { assessmentsApi } from "@/services/assessments";
import { readErrorMessage } from "@/services/portfolios";
import { Plus, Clock, ChevronRight, Trash2, Languages, CalendarClock, ListChecks } from "lucide-react";
import { LANGUAGE_LABELS, formatDate, isExpired } from "@/utils/constants";
import EntityAvatar from "@/components/dashboard/EntityAvatar";
import ListToolbar from "@/components/dashboard/ListToolbar";
import Pagination from "@/components/dashboard/Pagination";
import ProgressRing from "@/components/dashboard/ProgressRing";
import { cn } from "@/lib/utils";
import type { Assessment, PaginationMeta } from "@/types";

type Status = "active" | "live" | "expired";

function statusOf(a: Assessment): Status {
  if (a.latest_session?.status === "active") return "live";
  if (isExpired(a.expires_at)) return "expired";
  return "active";
}

const STATUS_STYLE: Record<Status, { label: string; className: string }> = {
  live: { label: "Berlangsung", className: "border-primary/30 bg-accent text-primary" },
  active: { label: "Aktif", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  expired: { label: "Kedaluwarsa", className: "border-border bg-muted text-muted-foreground" },
};

function StatusBadge({ status }: { status: Status }) {
  const { label, className } = STATUS_STYLE[status];
  return (
    <span className={cn("shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium", className)}>
      {label}
    </span>
  );
}

function SessionSummary({ session }: { session?: Assessment["latest_session"] }) {
  if (!session) return null;

  if (session.status === "active")
    return (
      <span className="flex items-center gap-1 text-xs text-primary">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" aria-hidden="true" />
        Live now
      </span>
    );

  if (session.status === "ended" && session.end_reason === "error")
    return <span className="text-xs text-destructive">Terakhir: gagal</span>;

  if (session.status === "ended")
    return <span className="text-xs text-muted-foreground">Terakhir: selesai</span>;

  return <span className="text-xs text-muted-foreground">Menunggu kandidat</span>;
}

export default function AssessmentListPage() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
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
    assessmentsApi
      .list(targetPage)
      .then((res) => {
        setAssessments(res.data.assessments);
        setMeta(res.data.meta ?? null);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(page);
  }, [load, page]);

  const handleDelete = async (assessment: Assessment) => {
    try {
      await assessmentsApi.delete(assessment.id);
      setAssessments((prev) => prev.filter((a) => a.id !== assessment.id));
      toast.success(`Assessment “${assessment.name}” dihapus.`);
    } catch (e) {
      toast.error(
        await readErrorMessage(
          e,
          "Gagal menghapus assessment. Assessment yang sudah punya sesi wawancara tidak bisa dihapus."
        )
      );
    }
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assessments.filter((a) => {
      if (q && !a.name.toLowerCase().includes(q)) return false;
      if (filter && statusOf(a) !== filter) return false;
      return true;
    });
  }, [assessments, query, filter]);

  const filtering = query.trim() !== "" || filter !== "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Assessment</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Kelola assessment untuk setiap posisi dan pantau progresnya.
          </p>
        </div>
        <Button onClick={() => navigate("/assessments/new")}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> New Assessment
        </Button>
      </div>

      <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
        <ListToolbar
          query={query}
          onQueryChange={setQuery}
          placeholder="Cari assessment…"
          filter={filter}
          onFilterChange={setFilter}
          filterLabel="Saring berdasarkan status"
          options={[
            { value: "", label: "Semua status" },
            { value: "active", label: "Aktif" },
            { value: "live", label: "Berlangsung" },
            { value: "expired", label: "Kedaluwarsa" },
          ]}
        />

        {error && (
          <div role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">
            Gagal memuat daftar assessment.{" "}
            <button type="button" onClick={() => load(page)} className="underline underline-offset-2">
              Coba lagi
            </button>
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : assessments.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
            <p className="mb-3">Belum ada assessment.</p>
            <Button variant="outline" onClick={() => navigate("/assessments/new")}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Buat assessment pertama
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
            {visible.map((a) => {
              const assigned = a.sessions_count ?? 0;
              const completed = a.completed_count ?? 0;
              const rate = assigned > 0 ? (completed / assigned) * 100 : 0;

              return (
                <li key={a.id} className="group">
                  <div className="flex items-start gap-3 px-1 py-3 sm:items-center">
                    <button
                      type="button"
                      onClick={() => navigate(`/assessments/${a.id}/invite`)}
                      className="flex min-w-0 flex-1 items-start gap-3 rounded-lg p-1 text-left transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring sm:items-center"
                    >
                      <EntityAvatar name={a.name} />

                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium">{a.name}</span>
                          <StatusBadge status={statusOf(a)} />
                        </span>

                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            {a.time_limit_min} menit
                          </span>
                          {a.language && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="flex items-center gap-1">
                                <Languages className="h-3 w-3" aria-hidden="true" />
                                {LANGUAGE_LABELS[a.language] ?? a.language}
                              </span>
                            </>
                          )}
                          {typeof a.skills_count === "number" && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="flex items-center gap-1">
                                <ListChecks className="h-3 w-3" aria-hidden="true" />
                                {a.skills_count} skill
                              </span>
                            </>
                          )}
                          {a.expires_at && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span
                                className={cn(
                                  "flex items-center gap-1",
                                  isExpired(a.expires_at) && "text-destructive"
                                )}
                              >
                                <CalendarClock className="h-3 w-3" aria-hidden="true" />
                                {isExpired(a.expires_at) ? "Berakhir" : "s/d"} {formatDate(a.expires_at)}
                              </span>
                            </>
                          )}
                          {a.latest_session && (
                            <>
                              <span aria-hidden="true">·</span>
                              <SessionSummary session={a.latest_session} />
                            </>
                          )}
                        </span>

                        {assigned > 0 && (
                          <span className="mt-1 block text-xs text-muted-foreground sm:hidden">
                            <strong className="font-semibold text-foreground">{completed}</strong> dari{" "}
                            <strong className="font-semibold text-foreground">{assigned}</strong> sesi selesai ·{" "}
                            {Math.round(rate)}%
                          </span>
                        )}
                      </span>

                      <span className="hidden shrink-0 items-center gap-5 text-center sm:flex">
                        <span>
                          <span className="block text-sm font-semibold tabular-nums">{assigned}</span>
                          <span className="block text-[11px] text-muted-foreground">Diundang</span>
                        </span>
                        <span>
                          <span className="block text-sm font-semibold tabular-nums">{completed}</span>
                          <span className="block text-[11px] text-muted-foreground">Selesai</span>
                        </span>
                        <ProgressRing
                          value={rate}
                          label={`${completed} dari ${assigned} sesi selesai`}
                        />
                      </span>
                    </button>

                    <div className="flex shrink-0 items-center gap-1">
                      <ConfirmDialog
                        trigger={
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Hapus assessment ${a.name}`}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        }
                        title="Hapus assessment ini?"
                        description={
                          <>
                            <strong>{a.name}</strong> akan dihapus permanen beserta konfigurasi
                            skill-nya. Assessment yang sudah pernah dipakai untuk wawancara tidak bisa
                            dihapus — datanya adalah bukti penilaian kandidat.
                          </>
                        }
                        onConfirm={() => handleDelete(a)}
                      />
                      <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {!loading && assessments.length > 0 && (
          <>
            <Pagination
              page={meta?.current_page ?? page}
              totalPages={meta?.total_pages ?? 1}
              totalCount={meta?.total_count ?? assessments.length}
              shown={visible.length}
              onChange={setPage}
              unit="assessment"
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
