import type { Session } from "@/types";

const DAY = 24 * 60 * 60 * 1000;

export interface WeeklyPoint {
  label: string;
  values: [number, number];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function shortDate(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function weeklySessions(sessions: Session[], weeks = 8, now: Date = new Date()): WeeklyPoint[] {
  const buckets: WeeklyPoint[] = [];
  const starts: number[] = [];

  for (let i = weeks; i >= 1; i -= 1) {
    const start = new Date(now.getTime() - i * 7 * DAY);
    start.setHours(0, 0, 0, 0);
    starts.push(start.getTime());
    buckets.push({ label: shortDate(start), values: [0, 0] });
  }

  const indexFor = (iso?: string | null): number => {
    if (!iso) return -1;
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return -1;
    for (let i = starts.length - 1; i >= 0; i -= 1) {
      if (t >= starts[i]) return i;
    }
    return -1;
  };

  sessions.forEach((s) => {
    const created = indexFor(s.created_at);
    if (created >= 0) buckets[created].values[0] += 1;

    if (s.status === "ended") {
      const ended = indexFor(s.ended_at ?? s.created_at);
      if (ended >= 0) buckets[ended].values[1] += 1;
    }
  });

  return buckets;
}

export interface CountRow {
  key: string;
  label: string;
  value: number;
  meta?: string;
}

/** Jumlah kandidat per assessment, terbanyak di atas. */
export function sessionsPerAssessment(sessions: Session[], limit = 6): CountRow[] {
  const tally = new Map<string, { label: string; value: number }>();

  sessions.forEach((s) => {
    const key = String(s.assessment?.id ?? "unknown");
    const label = s.assessment?.name ?? "Assessment terhapus";
    const row = tally.get(key) ?? { label, value: 0 };
    row.value += 1;
    tally.set(key, row);
  });

  const total = sessions.length || 1;

  return [...tally.entries()]
    .map(([key, row]) => ({
      key,
      label: row.label,
      value: row.value,
      meta: `${Math.round((row.value / total) * 100)}%`,
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, limit);
}

export interface Bucket {
  label: string;
  value: number;
}

const DURATION_EDGES = [10, 20, 30, 45, 60];

export function durationBuckets(sessions: Session[]): Bucket[] {
  const labels = ["< 10m", "10–20m", "20–30m", "30–45m", "45–60m", "> 60m"];
  const counts = new Array(labels.length).fill(0);

  sessions.forEach((s) => {
    if (s.status !== "ended") return;
    const secs = s.duration_seconds;
    if (typeof secs !== "number" || secs <= 0) return;

    const minutes = secs / 60;
    let i = DURATION_EDGES.findIndex((edge) => minutes < edge);
    if (i === -1) i = labels.length - 1;
    counts[i] += 1;
  });

  return labels.map((label, i) => ({ label, value: counts[i] }));
}

export type StatusKey = "good" | "warning" | "serious" | "critical" | "neutral";

export interface ReasonRow extends CountRow {
  status: StatusKey;
  hint: string;
}

const REASON_META: Record<string, { label: string; status: StatusKey; hint: string }> = {
  all_covered: { label: "Semua skill tercakup", status: "good", hint: "berakhir karena cukup" },
  time_ceiling: { label: "Batas waktu habis", status: "warning", hint: "mungkin belum semua tergali" },
  manual_candidate: { label: "Dihentikan kandidat", status: "serious", hint: "berhenti dari sisi kandidat" },
  manual_assessor: { label: "Dihentikan assessor", status: "neutral", hint: "dihentikan dari dashboard" },
  error: { label: "Gagal karena error", status: "critical", hint: "perlu diulang" },
};

export function endReasonBreakdown(sessions: Session[]): ReasonRow[] {
  const ended = sessions.filter((s) => s.status === "ended");
  const tally = new Map<string, number>();

  ended.forEach((s) => {
    const key = s.end_reason ?? "unknown";
    tally.set(key, (tally.get(key) ?? 0) + 1);
  });

  const total = ended.length || 1;

  return [...tally.entries()]
    .map(([key, value]) => {
      const meta = REASON_META[key] ?? {
        label: "Tidak tercatat",
        status: "neutral" as StatusKey,
        hint: "sesi berakhir tanpa alasan tersimpan",
      };
      return {
        key,
        label: meta.label,
        status: meta.status,
        hint: meta.hint,
        value,
        meta: `${Math.round((value / total) * 100)}%`,
      };
    })
    .sort((a, b) => b.value - a.value);
}

export interface AnalyticsTotals {
  total: number;
  pending: number;
  active: number;
  ended: number;
  failed: number;
  /** Rata-rata durasi sesi selesai, dalam menit. null bila belum ada. */
  avgMinutes: number | null;
  /** Persentase sesi yang diundang lalu benar-benar selesai. */
  completionRate: number;
}

export function analyticsTotals(sessions: Session[]): AnalyticsTotals {
  const ended = sessions.filter((s) => s.status === "ended");
  const withDuration = ended.filter((s) => typeof s.duration_seconds === "number" && s.duration_seconds! > 0);

  return {
    total: sessions.length,
    pending: sessions.filter((s) => s.status === "pending").length,
    active: sessions.filter((s) => s.status === "active").length,
    ended: ended.length,
    failed: ended.filter((s) => s.end_reason === "error").length,
    avgMinutes:
      withDuration.length === 0
        ? null
        : Math.round(
            withDuration.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0) / withDuration.length / 60
          ),
    completionRate: sessions.length === 0 ? 0 : Math.round((ended.length / sessions.length) * 100),
  };
}

export function formatDuration(seconds?: number | null): string {
  if (typeof seconds !== "number" || seconds <= 0) return "—";

  if (seconds < 60) return `${Math.round(seconds)} dtk`;

  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} mnt`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} jam` : `${hours}j ${minutes}m`;
}
