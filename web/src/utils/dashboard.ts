import type { Assessment, Vacancy } from "@/types";
import type { DirectoryUser } from "@/services/users";

export function isVacancyOpen(vacancy: Vacancy, now: Date = new Date()): boolean {
  if (!vacancy.closes_at) return true;
  const closesAt = new Date(vacancy.closes_at);
  if (Number.isNaN(closesAt.getTime())) return true;
  return closesAt.getTime() > now.getTime();
}

export function isAssessmentOpen(assessment: Assessment, now: Date = new Date()): boolean {
  if (!assessment.expires_at) return true;
  const expiresAt = new Date(assessment.expires_at);
  if (Number.isNaN(expiresAt.getTime())) return true;
  return expiresAt.getTime() > now.getTime();
}

export interface RecruiterStat {
  userId: number;
  name: string;
  roleLabel: string;
  assessments: number;
  vacancies: number;
  total: number;
}

export function rankRecruiters(
  assessments: Assessment[],
  vacancies: Vacancy[],
  directory: DirectoryUser[],
  limit = 5
): RecruiterStat[] {
  const byId = new Map<number, DirectoryUser>(directory.map((u) => [u.id, u]));
  const tally = new Map<number, RecruiterStat>();

  const bump = (userId: number | undefined, key: "assessments" | "vacancies") => {
    if (typeof userId !== "number") return;
    const known = byId.get(userId);
    const row =
      tally.get(userId) ??
      {
        userId,
        name: known?.display_name ?? `Pengguna #${userId}`,
        roleLabel: known?.role_label ?? "Akun tidak aktif",
        assessments: 0,
        vacancies: 0,
        total: 0,
      };
    row[key] += 1;
    row.total += 1;
    tally.set(userId, row);
  };

  assessments.forEach((a) => bump(a.created_by, "assessments"));
  vacancies.forEach((v) => bump(v.created_by, "vacancies"));

  return [...tally.values()]
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export interface FunnelStage {
  key: string;
  label: string;
  value: number;
  hint: string;
}

export function buildFunnel(assessments: Assessment[]): FunnelStage[] {
  const invited = sumBy(assessments, (a) => a.sessions_count);
  const completed = sumBy(assessments, (a) => a.completed_count);
  const active = sumBy(assessments, (a) => a.active_count);

  return [
    { key: "invited", label: "Diundang", value: invited, hint: "link wawancara sudah dibuat" },
    { key: "started", label: "Mulai wawancara", value: active + completed, hint: "sesi sudah berjalan" },
    { key: "completed", label: "Selesai", value: completed, hint: "siap dinilai" },
  ];
}

function sumBy(rows: Assessment[], pick: (row: Assessment) => number | undefined): number {
  return rows.reduce((total, row) => total + (pick(row) ?? 0), 0);
}

export interface DashboardTotals {
  candidates: number;
  completed: number;
  inInterview: number;
  openVacancies: number;
}

export function computeTotals(
  assessments: Assessment[],
  vacancies: Vacancy[],
  now: Date = new Date()
): DashboardTotals {
  return {
    candidates: sumBy(assessments, (a) => a.sessions_count),
    completed: sumBy(assessments, (a) => a.completed_count),
    inInterview: sumBy(assessments, (a) => a.active_count),
    openVacancies: vacancies.filter((v) => isVacancyOpen(v, now)).length,
  };
}

export interface AttentionItem {
  id: string;
  severity: "high" | "medium";
  title: string;
  detail: string;
  to: string;
}

export function buildAttentionList(
  assessments: Assessment[],
  vacancies: Vacancy[],
  now: Date = new Date()
): AttentionItem[] {
  const items: AttentionItem[] = [];

  assessments.forEach((a) => {
    const pending = (a.sessions_count ?? 0) - (a.completed_count ?? 0) - (a.active_count ?? 0);
    if (!isAssessmentOpen(a, now) && pending > 0) {
      items.push({
        id: `expired-${a.id}`,
        severity: "high",
        title: `${a.name} sudah kedaluwarsa`,
        detail: `${pending} kandidat memegang link yang tidak bisa dibuka lagi. Mereka tidak akan tahu kenapa.`,
        to: `/assessments/${a.id}/edit`,
      });
    }

    if (a.latest_session?.status === "ended" && a.latest_session.end_reason === "error") {
      items.push({
        id: `failed-${a.id}`,
        severity: "high",
        title: `Sesi terakhir ${a.name} gagal`,
        detail: "Wawancara berhenti karena error, bukan karena selesai. Perlu diulang.",
        to: `/assessments/${a.id}/invite`,
      });
    }
  });

  const DAY = 24 * 60 * 60 * 1000;
  vacancies.forEach((v) => {
    if (!v.closes_at || !isVacancyOpen(v, now)) return;
    const daysLeft = Math.ceil((new Date(v.closes_at).getTime() - now.getTime()) / DAY);
    if (daysLeft > 7) return;
    items.push({
      id: `closing-${v.id}`,
      severity: "medium",
      title: `${v.role_title} tutup ${daysLeft <= 1 ? "besok atau hari ini" : `${daysLeft} hari lagi`}`,
      detail: "Perpanjang tanggalnya kalau proses masih berjalan.",
      to: `/vacancies/${v.id}/edit`,
    });
  });

  const weight = { high: 0, medium: 1 };
  return items.sort((a, b) => weight[a.severity] - weight[b.severity]).slice(0, 4);
}

export interface RecentCandidate {
  key: string;
  name: string;
  assessmentName: string;
  assessmentId: number;
  status: "pending" | "active" | "ended";
  endReason?: string | null;
  at?: string | null;
}

export function buildRecentCandidates(assessments: Assessment[], limit = 5): RecentCandidate[] {
  return assessments
    .filter((a) => a.latest_session)
    .map((a) => {
      const s = a.latest_session!;
      return {
        key: `${a.id}-${s.id ?? "x"}`,
        name: s.candidate_name?.trim() || "Kandidat tanpa nama",
        assessmentName: a.name,
        assessmentId: a.id,
        status: s.status,
        endReason: s.end_reason,
        at: s.ended_at ?? s.started_at ?? s.created_at,
      };
    })
    .sort((a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime())
    .slice(0, limit);
}
