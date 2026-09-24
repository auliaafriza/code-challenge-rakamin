import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { sessionsApi } from "@/services/sessions";
import { assessmentsApi } from "@/services/assessments";
import { readErrorMessage } from "@/services/portfolios";
import { formatDate } from "@/utils/constants";
import { formatDuration } from "@/utils/analytics";
import type { Assessment, PaginationMeta, Session } from "@/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Pagination from "@/components/dashboard/Pagination";
import EntityAvatar from "@/components/dashboard/EntityAvatar";
import CandidateStatusBadge, { stageOf } from "@/components/candidates/CandidateStatusBadge";
import { Search, Radio, FileText, MessageSquare, Users } from "lucide-react";

const PER_PAGE = 20;

export default function CandidatesPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [assessmentId, setAssessmentId] = useState<number | "">("");
  const [status, setStatus] = useState<"" | "pending" | "active" | "ended">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, assessmentId, status]);

  const requestId = useRef(0);

  const load = useCallback(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);

    sessionsApi
      .list({ page, per_page: PER_PAGE, q: debouncedQuery, assessment_id: assessmentId, status })
      .then((res) => {
        if (id !== requestId.current) return;
        setSessions(res.data.sessions ?? []);
        setMeta(res.data.meta ?? null);
      })
      .catch(async (e) => {
        if (id !== requestId.current) return;
        setError(await readErrorMessage(e, "Gagal memuat daftar kandidat."));
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [page, debouncedQuery, assessmentId, status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    assessmentsApi
      .list(1)
      .then((res) => setAssessments(res.data.assessments ?? []))
      .catch(() => setAssessments([]));
  }, []);

  const filtering = debouncedQuery !== "" || assessmentId !== "" || status !== "";

  const resetFilters = () => {
    setQuery("");
    setAssessmentId("");
    setStatus("");
  };

  const summary = useMemo(() => meta?.total_count ?? sessions.length, [meta, sessions.length]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Candidates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Semua kandidat yang pernah diundang, dari seluruh assessment.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/assessments">
            <Users className="mr-1.5 h-4 w-4" aria-hidden="true" /> Undang kandidat
          </Link>
        </Button>
      </div>

      <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari nama kandidat…"
              aria-label="Cari nama kandidat"
              className="pl-9"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={assessmentId}
              onChange={(e) => setAssessmentId(e.target.value === "" ? "" : Number(e.target.value))}
              aria-label="Saring berdasarkan assessment"
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-52"
            >
              <option value="">Semua assessment</option>
              {assessments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              aria-label="Saring berdasarkan tahap"
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-40"
            >
              <option value="">Semua tahap</option>
              <option value="pending">Diundang</option>
              <option value="active">Berlangsung</option>
              <option value="ended">Selesai</option>
            </select>

            {filtering && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="shrink-0">
                Reset
              </Button>
            )}
          </div>
        </div>

        {assessments.length >= 20 && (
          <p className="text-xs text-muted-foreground">
            Pilihan assessment di atas memuat 20 yang terbaru.
          </p>
        )}

        {error && (
          <div role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">
            {error}{" "}
            <button type="button" onClick={load} className="underline underline-offset-2">
              Coba lagi
            </button>
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
            {filtering ? (
              <>
                <p className="mb-3">Tidak ada kandidat yang cocok dengan filter ini.</p>
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Hapus filter
                </Button>
              </>
            ) : (
              <>
                <p className="mb-3">Belum ada kandidat yang diundang.</p>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/assessments">Buka daftar assessment</Link>
                </Button>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Daftar kandidat beserta assessment, tahap, durasi, dan aktivitas terakhirnya
                </caption>
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="px-2 py-2 font-medium">Nama</th>
                    <th scope="col" className="px-2 py-2 font-medium">Assessment</th>
                    <th scope="col" className="px-2 py-2 font-medium">Tahap</th>
                    <th scope="col" className="px-2 py-2 font-medium">Durasi</th>
                    <th scope="col" className="px-2 py-2 font-medium">Aktivitas terakhir</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sessions.map((s) => (
                    <tr key={s.id} className="transition-colors hover:bg-accent/50">
                      <td className="px-2 py-3">
                        <span className="flex items-center gap-2.5">
                          <EntityAvatar name={s.candidate_name || "?"} className="h-8 w-8 rounded-full" />
                          <span className="truncate font-medium">
                            {s.candidate_name || "Kandidat tanpa nama"}
                          </span>
                        </span>
                      </td>
                      <td className="px-2 py-3 text-muted-foreground">
                        <span className="block max-w-[16rem] truncate">{s.assessment?.name ?? "—"}</span>
                      </td>
                      <td className="px-2 py-3">
                        <CandidateStatusBadge stage={stageOf(s)} />
                      </td>
                      <td className="px-2 py-3 tabular-nums text-muted-foreground">
                        {formatDuration(s.duration_seconds)}
                      </td>
                      <td className="px-2 py-3 tabular-nums text-muted-foreground">
                        {formatDate(s.ended_at ?? s.started_at ?? s.created_at)}
                      </td>
                      <td className="px-2 py-3">
                        <span className="flex justify-end gap-1">
                          <RowActions session={s} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y md:hidden">
              {sessions.map((s) => (
                <li key={s.id} className="py-3">
                  <div className="flex items-start gap-2.5">
                    <EntityAvatar name={s.candidate_name || "?"} className="h-9 w-9 rounded-full" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {s.candidate_name || "Kandidat tanpa nama"}
                        </span>
                        <CandidateStatusBadge stage={stageOf(s)} />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {s.assessment?.name ?? "—"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDuration(s.duration_seconds)} ·{" "}
                        {formatDate(s.ended_at ?? s.started_at ?? s.created_at)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <RowActions session={s} withLabels />
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <Pagination
              page={meta?.current_page ?? page}
              totalPages={meta?.total_pages ?? 1}
              totalCount={summary}
              shown={sessions.length}
              onChange={setPage}
              unit="kandidat"
            />
          </>
        )}
      </div>
    </div>
  );
}

function RowActions({ session, withLabels = false }: { session: Session; withLabels?: boolean }) {
  const base = `/assessments/${session.assessment_id}/sessions/${session.id}`;
  const name = session.candidate_name || "kandidat";

  if (session.status === "active") {
    return (
      <Button asChild variant="outline" size="sm">
        <Link to={`${base}/monitor`} aria-label={`Pantau wawancara ${name}`}>
          <Radio className="h-3.5 w-3.5 sm:mr-1.5" aria-hidden="true" />
          <span className={withLabels ? "" : "hidden sm:inline"}>Pantau</span>
        </Link>
      </Button>
    );
  }

  if (session.status === "ended") {
    return (
      <>
        <Button asChild variant="outline" size="sm">
          <Link to={`${base}/portfolio`} aria-label={`Buka portfolio ${name}`}>
            <FileText className="h-3.5 w-3.5 sm:mr-1.5" aria-hidden="true" />
            <span className={withLabels ? "" : "hidden sm:inline"}>Portfolio</span>
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link to={`${base}/transcript`} aria-label={`Buka transkrip ${name}`}>
            <MessageSquare className="h-3.5 w-3.5 sm:mr-1.5" aria-hidden="true" />
            <span className={withLabels ? "" : "hidden sm:inline"}>Transkrip</span>
          </Link>
        </Button>
      </>
    );
  }

  return (
    <Button asChild variant="ghost" size="sm">
      <Link to={`/assessments/${session.assessment_id}/invite`} aria-label={`Kelola undangan ${name}`}>
        Undangan
      </Link>
    </Button>
  );
}
