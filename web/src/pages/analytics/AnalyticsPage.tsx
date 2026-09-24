import { useEffect, useMemo, useState } from "react";
import { sessionsApi } from "@/services/sessions";
import { vacanciesApi } from "@/services/vacancies";
import { readErrorMessage } from "@/services/portfolios";
import {
  analyticsTotals,
  durationBuckets,
  endReasonBreakdown,
  sessionsPerAssessment,
  weeklySessions,
} from "@/utils/analytics";
import { isVacancyOpen } from "@/utils/dashboard";
import type { Session, Vacancy } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import SectionCard from "@/components/dashboard/SectionCard";
import StatTile from "@/components/dashboard/StatTile";
import PipelineFunnel from "@/components/dashboard/PipelineFunnel";
import TimeSeriesChart from "@/components/charts/TimeSeriesChart";
import ChartLegend from "@/components/charts/ChartLegend";
import BarList from "@/components/charts/BarList";
import Histogram from "@/components/charts/Histogram";
import { SERIES, STATUS_COLOR } from "@/components/charts/palette";
import useIsDark from "@/components/charts/useIsDark";
import { cn } from "@/lib/utils";
import {
  Users,
  CheckCircle2,
  Radio,
  Timer,
  Briefcase,
  GitBranch,
  TrendingUp,
  ListOrdered,
  Hourglass,
  Flag,
  AlertTriangle,
  CircleCheck,
  CircleAlert,
  CircleX,
  Circle,
} from "lucide-react";

const MAX_PAGES = 20;
const PER_PAGE = 100;

const STATUS_ICON = {
  good: CircleCheck,
  warning: CircleAlert,
  serious: CircleAlert,
  critical: CircleX,
  neutral: Circle,
} as const;

export default function AnalyticsPage() {
  const isDark = useIsDark();
  const colors = isDark ? SERIES.dark : SERIES.light;

  const [sessions, setSessions] = useState<Session[]>([]);
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const first = await sessionsApi.list({ page: 1, per_page: PER_PAGE });
        const rows = [...(first.data.sessions ?? [])];
        const totalPages = Math.max(1, first.data.meta?.total_pages ?? 1);
        const lastPage = Math.min(totalPages, MAX_PAGES);

        for (let page = 2; page <= lastPage; page += 1) {
          const next = await sessionsApi.list({ page, per_page: PER_PAGE });
          rows.push(...(next.data.sessions ?? []));
        }

        const vac = await vacanciesApi.list(1).then(
          (res) => res.data.vacancies ?? [],
          () => [] as Vacancy[]
        );

        if (cancelled) return;
        setSessions(rows);
        setVacancies(vac);
        setTruncated(totalPages > MAX_PAGES);
      } catch (e) {
        if (!cancelled) setError(await readErrorMessage(e, "Gagal memuat data analytics."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const now = useMemo(() => new Date(), []);
  const totals = useMemo(() => analyticsTotals(sessions), [sessions]);
  const weekly = useMemo(() => weeklySessions(sessions, 8, now), [sessions, now]);
  const perAssessment = useMemo(() => sessionsPerAssessment(sessions), [sessions]);
  const durations = useMemo(() => durationBuckets(sessions), [sessions]);
  const reasons = useMemo(() => endReasonBreakdown(sessions), [sessions]);
  const openVacancies = useMemo(
    () => vacancies.filter((v) => isVacancyOpen(v, now)).length,
    [vacancies, now]
  );

  const funnel = useMemo(
    () => [
      { key: "invited", label: "Diundang", value: totals.total, hint: "link wawancara sudah dibuat" },
      {
        key: "started",
        label: "Mulai wawancara",
        value: totals.active + totals.ended,
        hint: "sesi sudah berjalan",
      },
      { key: "completed", label: "Selesai", value: totals.ended, hint: "siap dinilai" },
    ],
    [totals]
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Performa rekrutmen dari sesi wawancara yang benar-benar tersimpan.
        </p>
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
            Data melebihi {MAX_PAGES * PER_PAGE} sesi, jadi grafik di bawah dihitung dari sebagian saja.
            Pada skala ini agregasinya sebaiknya dikerjakan backend.
          </span>
        </p>
      )}

      <section aria-label="Ringkasan angka" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile icon={Users} label="Total kandidat" value={totals.total} caption="sesi yang pernah dibuat" />
        <StatTile
          icon={CheckCircle2}
          label="Selesai"
          value={totals.ended}
          caption={`${totals.completionRate}% dari yang diundang`}
        />
        <StatTile
          icon={Radio}
          label="Berlangsung"
          value={totals.active}
          caption={totals.active ? "sesi aktif sekarang" : "tidak ada sesi aktif"}
          tone={totals.active ? "live" : "default"}
        />
        <StatTile
          icon={Timer}
          label="Durasi rata-rata"
          value={totals.avgMinutes ?? 0}
          caption={totals.avgMinutes === null ? "belum ada sesi selesai" : "menit per wawancara"}
        />
        <StatTile
          icon={Briefcase}
          label="Lowongan terbuka"
          value={openVacancies}
          caption={`dari ${vacancies.length} total`}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <SectionCard
          className="lg:col-span-3"
          icon={TrendingUp}
          title="Sesi per minggu"
          description="Delapan minggu terakhir. Keduanya menghitung orang, jadi keduanya berbagi satu sumbu."
        >
          <div className="space-y-3 px-2 py-2">
            <ChartLegend
              items={[
                { name: "Diundang", color: colors[0] },
                { name: "Selesai", color: colors[1] },
              ]}
            />
            <TimeSeriesChart
              points={weekly}
              seriesNames={["Diundang", "Selesai"]}
              caption="Jumlah sesi yang diundang dan yang selesai, per minggu, selama delapan minggu terakhir"
            />
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Lihat sebagai tabel
              </summary>
              <table className="mt-2 w-full text-left">
                <thead>
                  <tr className="text-muted-foreground">
                    <th scope="col" className="py-1 font-medium">Minggu</th>
                    <th scope="col" className="py-1 text-right font-medium">Diundang</th>
                    <th scope="col" className="py-1 text-right font-medium">Selesai</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {weekly.map((w) => (
                    <tr key={w.label}>
                      <td className="py-1">{w.label}</td>
                      <td className="py-1 text-right tabular-nums">{w.values[0]}</td>
                      <td className="py-1 text-right tabular-nums">{w.values[1]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>
        </SectionCard>

        <SectionCard
          className="lg:col-span-2"
          icon={GitBranch}
          title="Corong sesi wawancara"
          description="Tiga tahap yang benar-benar tersimpan, menurun berurutan."
        >
          <div className="px-2 py-2">
            <PipelineFunnel stages={funnel} />
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          icon={ListOrdered}
          title="Kandidat per assessment"
          description="Enam assessment dengan kandidat terbanyak."
        >
          <div className="px-2 py-2">
            <BarList rows={perAssessment} emptyLabel="Belum ada kandidat yang diundang." />
          </div>
        </SectionCard>

        <SectionCard
          icon={Hourglass}
          title="Sebaran durasi wawancara"
          description="Sesi yang berakhir jauh lebih cepat dari jatah waktunya biasanya putus, bukan efisien."
        >
          <div className="px-2 py-2">
            <Histogram buckets={durations} unitLabel="Jumlah sesi selesai per rentang durasi." />
          </div>
        </SectionCard>
      </div>

      <SectionCard
        icon={Flag}
        title="Kenapa wawancara berakhir"
        description="Satu-satunya angka yang membedakan wawancara yang tuntas dari wawancara yang kehabisan waktu."
      >
        {reasons.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Belum ada sesi yang berakhir.</p>
        ) : (
          <ul className="space-y-3 px-2 py-2">
            {reasons.map((r) => {
              const Icon = STATUS_ICON[r.status];
              const color = r.status === "neutral" ? undefined : STATUS_COLOR[r.status];
              const max = Math.max(...reasons.map((x) => x.value), 1);

              return (
                <li key={r.key}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Icon
                        className={cn("h-3.5 w-3.5 shrink-0", !color && "text-muted-foreground")}
                        style={color ? { color } : undefined}
                        aria-hidden="true"
                      />
                      <span className="truncate text-sm">{r.label}</span>
                      <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                        — {r.hint}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm tabular-nums">
                      <strong className="font-semibold">{r.value}</strong>
                      <span className="ml-1.5 text-xs text-muted-foreground">{r.meta}</span>
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(2, (r.value / max) * 100)}%`,
                        background: color ?? "hsl(var(--muted-foreground))",
                      }}
                      aria-hidden="true"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
