import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAtomValue } from "jotai";
import { authAtom } from "@/stores/authAtom";
import { assessmentsApi } from "@/services/assessments";
import { vacanciesApi } from "@/services/vacancies";
import { usersApi, type DirectoryUser } from "@/services/users";
import { readErrorMessage } from "@/services/portfolios";
import {
  buildAttentionList,
  buildFunnel,
  buildRecentCandidates,
  computeTotals,
  isVacancyOpen,
  rankRecruiters,
} from "@/utils/dashboard";
import { formatDate } from "@/utils/constants";
import type { Assessment, Vacancy } from "@/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import StatTile from "@/components/dashboard/StatTile";
import SectionCard from "@/components/dashboard/SectionCard";
import PipelineFunnel from "@/components/dashboard/PipelineFunnel";
import { cn } from "@/lib/utils";
import {
  Briefcase,
  Users,
  CheckCircle2,
  Radio,
  Plus,
  ArrowRight,
  Trophy,
  AlertTriangle,
  Lightbulb,
  GitBranch,
  UserRound,
} from "lucide-react";

const MAX_PAGES = 20;

async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<{ items: T[]; totalPages: number }>
): Promise<{ items: T[]; complete: boolean }> {
  const first = await fetchPage(1);
  const items = [...first.items];
  const totalPages = Math.max(1, first.totalPages || 1);
  const lastPage = Math.min(totalPages, MAX_PAGES);

  for (let page = 2; page <= lastPage; page += 1) {
    const next = await fetchPage(page);
    items.push(...next.items);
  }

  return { items, complete: totalPages <= MAX_PAGES };
}

function greetingFor(hour: number): string {
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 19) return "Selamat sore";
  return "Selamat malam";
}

export default function DashboardPage() {
  const { user } = useAtomValue(authAtom);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [a, v, dir] = await Promise.all([
          fetchAllPages<Assessment>(async (page) => {
            const res = await assessmentsApi.list(page);
            return { items: res.data.assessments ?? [], totalPages: res.data.meta?.total_pages ?? 1 };
          }),
          fetchAllPages<Vacancy>(async (page) => {
            const res = await vacanciesApi.list(page);
            return { items: res.data.vacancies ?? [], totalPages: res.data.meta?.total_pages ?? 1 };
          }),
          usersApi.list().then(
            (res) => res.data.users ?? [],
            () => [] as DirectoryUser[]
          ),
        ]);

        if (cancelled) return;
        setAssessments(a.items);
        setVacancies(v.items);
        setDirectory(dir);
        setTruncated(!a.complete || !v.complete);
      } catch (e) {
        if (!cancelled) setError(await readErrorMessage(e, "Gagal memuat data dashboard."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const now = useMemo(() => new Date(), []);

  const totals = useMemo(() => computeTotals(assessments, vacancies, now), [assessments, vacancies, now]);
  const funnel = useMemo(() => buildFunnel(assessments), [assessments]);
  const attention = useMemo(
    () => buildAttentionList(assessments, vacancies, now),
    [assessments, vacancies, now]
  );
  const recentCandidates = useMemo(() => buildRecentCandidates(assessments), [assessments]);
  const topRecruiters = useMemo(
    () => rankRecruiters(assessments, vacancies, directory),
    [assessments, vacancies, directory]
  );
  const openVacancyCount = useMemo(
    () => vacancies.filter((v) => isVacancyOpen(v, now)).length,
    [vacancies, now]
  );

  const firstName = (user?.display_name ?? user?.email?.split("@")[0] ?? "").split(" ")[0] || "kamu";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greetingFor(now.getHours())}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ringkasan proses rekrutmen yang sedang berjalan.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/vacancies/new">
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Lowongan
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/assessments/new">
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Assessment
            </Link>
          </Button>
        </div>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {truncated && (
        <p role="note" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Data melebihi {MAX_PAGES} halaman, jadi angka di bawah dihitung dari sebagian saja.
            Agregasi seperti ini sebaiknya pindah ke satu endpoint ringkasan di backend.
          </span>
        </p>
      )}

      <section aria-label="Ringkasan angka" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
        ) : (
          <>
            <StatTile
              icon={Users}
              label="Total kandidat"
              value={totals.candidates}
              caption={`dari ${assessments.length} assessment`}
              to="/assessments"
            />
            <StatTile
              icon={CheckCircle2}
              label="Wawancara selesai"
              value={totals.completed}
              caption={
                totals.candidates > 0
                  ? `${Math.round((totals.completed / totals.candidates) * 100)}% dari yang diundang`
                  : "belum ada yang diundang"
              }
              to="/assessments"
            />
            <StatTile
              icon={Radio}
              label="Sedang wawancara"
              value={totals.inInterview}
              caption={totals.inInterview ? "berlangsung sekarang" : "tidak ada sesi aktif"}
              tone={totals.inInterview ? "live" : "default"}
              to="/assessments"
            />
            <StatTile
              icon={Briefcase}
              label="Lowongan terbuka"
              value={openVacancyCount}
              caption={`dari ${vacancies.length} total`}
              to="/vacancies"
            />
          </>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <SectionCard
          className="lg:col-span-3"
          icon={GitBranch}
          title="Daftar sesi wawancara"
          description="Dihitung dari status sesi yang ada dan diurutkan dari yang terbanyak. Sesi yang sudah selesai siap dinilai."
        >
          {loading ? (
            <div className="space-y-4 px-2 py-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="space-y-4 px-2 py-2">
              <PipelineFunnel stages={funnel} />

              <p className="rounded-lg bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                <strong className="text-foreground">
                  {Math.max(0, (funnel[0]?.value ?? 0) - (funnel[1]?.value ?? 0))} kandidat
                </strong>{" "}
                sudah dikirimi link tapi belum memulai wawancara.
                {totals.inInterview > 0 && (
                  <>
                    {" "}
                    <strong className="text-foreground">{totals.inInterview}</strong> sedang berlangsung
                    sekarang.
                  </>
                )}
              </p>
            </div>
          )}
        </SectionCard>

        <SectionCard
          className="lg:col-span-2"
          icon={Lightbulb}
          title="Perlu perhatian"
          description="Hal yang perlu diperhatikan, diurutkan dari yang paling mendesak. Bisa berupa sesi yang sudah selesai tapi belum dinilai, atau link undangan yang hampir kadaluarsa."
        >
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : attention.length === 0 ? (
            <EmptyHint>Tidak ada data.</EmptyHint>
          ) : (
            <ul className="space-y-1">
              {attention.map((item) => (
                <li key={item.id}>
                  <Link
                    to={item.to}
                    className="flex gap-2.5 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent"
                  >
                    {item.severity === "high" ? (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-label="Mendesak" />
                    ) : (
                      <span
                        aria-label="Perlu ditindaklanjuti"
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500"
                      />
                    )}
                    <span className="min-w-0">
                      <span className="block text-sm font-medium leading-snug">{item.title}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                        {item.detail}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <SectionCard
          className="lg:col-span-3"
          icon={UserRound}
          title="Kandidat terbaru"
          description="Sesi terakhir dari setiap assessment."
          action={
            <Link to="/assessments" className="text-xs font-medium text-primary hover:underline">
              Lihat semua
            </Link>
          }
        >
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-lg" />
              ))}
            </div>
          ) : recentCandidates.length === 0 ? (
            <EmptyHint>Belum ada kandidat yang diundang.</EmptyHint>
          ) : (
            <ul className="divide-y">
              {recentCandidates.map((c) => (
                <li key={c.key}>
                  <Link
                    to={`/assessments/${c.assessmentId}/invite`}
                    className="flex flex-col gap-1 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent sm:flex-row sm:items-center sm:gap-3"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
                      >
                        {c.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{c.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{c.assessmentName}</span>
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3 pl-10 sm:pl-0">
                      <CandidateStatus status={c.status} endReason={c.endReason} />
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {c.at ? formatDate(c.at) : "—"}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          className="lg:col-span-2"
          icon={Trophy}
          title="Recruiter paling aktif"
          description="Diurutkan dari jumlah assessment dan lowongan yang dibuat sampai ukuran aktivitas"
        >
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : topRecruiters.length === 0 ? (
            <EmptyHint>Belum ada assessment atau lowongan yang dibuat.</EmptyHint>
          ) : (
            <ol className="space-y-1">
              {topRecruiters.map((r, i) => (
                <li key={r.userId} className="flex items-center gap-3 rounded-lg px-2 py-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.name}</span>
                    <span className="block text-xs text-muted-foreground">{r.roleLabel}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-muted-foreground">
                    <span className="block">
                      <strong className="text-sm font-semibold text-foreground">{r.assessments}</strong> assessment
                    </span>
                    <span className="block">
                      <strong className="text-sm font-semibold text-foreground">{r.vacancies}</strong> lowongan
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function CandidateStatus({
  status,
  endReason,
}: {
  status: "pending" | "active" | "ended";
  endReason?: string | null;
}) {
  const failed = status === "ended" && endReason === "error";
  const label = failed
    ? "Gagal"
    : { pending: "Menunggu", active: "Berlangsung", ended: "Selesai" }[status];

  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        failed && "border-destructive/30 bg-destructive/5 text-destructive",
        !failed && status === "active" && "border-primary/25 bg-accent text-primary",
        !failed && status === "ended" && "border-border bg-muted text-muted-foreground",
        status === "pending" && "border-amber-300 bg-amber-50 text-amber-900"
      )}
    >
      {label}
    </span>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}
