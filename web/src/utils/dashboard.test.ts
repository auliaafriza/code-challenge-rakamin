import { describe, it, expect } from "vitest";
import {
  buildAttentionList,
  buildFunnel,
  buildRecentCandidates,
  computeTotals,
  isAssessmentOpen,
  isVacancyOpen,
  rankRecruiters,
} from "./dashboard";
import type { Assessment, Vacancy } from "@/types";
import type { DirectoryUser } from "@/services/users";

const NOW = new Date("2026-09-23T10:00:00Z");

function vacancy(over: Partial<Vacancy> = {}): Vacancy {
  return {
    id: 1,
    role_title: "Frontend Engineer",
    culture_dimensions: "",
    competency_expectations: "",
    skills: [],
    ...over,
  };
}

function assessment(over: Partial<Assessment> = {}): Assessment {
  return { id: 1, name: "Frontend", time_limit_min: 45, ...over };
}

describe("apa yang disebut terbuka", () => {
  it("tanpa tanggal tutup berarti terbuka", () => {
    expect(isVacancyOpen(vacancy({ closes_at: null }), NOW)).toBe(true);
    expect(isVacancyOpen(vacancy({ closes_at: undefined }), NOW)).toBe(true);
  });

  it("tanggal tutup yang sudah lewat berarti tertutup", () => {
    expect(isVacancyOpen(vacancy({ closes_at: "2026-09-22T23:59:00Z" }), NOW)).toBe(false);
  });

  it("tanggal tutup di masa depan berarti masih terbuka", () => {
    expect(isVacancyOpen(vacancy({ closes_at: "2026-09-24T00:00:00Z" }), NOW)).toBe(true);
  });

  it("tanggal rusak dihitung terbuka, bukan tertutup", () => {
    expect(isVacancyOpen(vacancy({ closes_at: "bukan-tanggal" }), NOW)).toBe(true);
  });

  it("memakai aturan yang sama untuk expires_at assessment", () => {
    expect(isAssessmentOpen(assessment({ expires_at: "2026-09-22T00:00:00Z" }), NOW)).toBe(false);
    expect(isAssessmentOpen(assessment({ expires_at: "2026-10-01T00:00:00Z" }), NOW)).toBe(true);
    expect(isAssessmentOpen(assessment({ expires_at: null }), NOW)).toBe(true);
  });
});

describe("peringkat recruiter", () => {
  const directory: DirectoryUser[] = [
    { id: 1, display_name: "Rina", role: "recruiter", role_label: "Recruiter" },
    { id: 2, display_name: "Bayu", role: "hiring_manager", role_label: "Hiring Manager" },
  ];

  it("menjumlahkan assessment dan lowongan per pembuat", () => {
    const result = rankRecruiters(
      [assessment({ id: 1, created_by: 1 }), assessment({ id: 2, created_by: 1 }), assessment({ id: 3, created_by: 2 })],
      [vacancy({ id: 1, created_by: 1 })],
      directory
    );

    expect(result[0]).toMatchObject({ name: "Rina", assessments: 2, vacancies: 1, total: 3 });
    expect(result[1]).toMatchObject({ name: "Bayu", assessments: 1, vacancies: 0, total: 1 });
  });

  it("melewati baris tanpa created_by alih-alih menciptakan orang tak dikenal", () => {
    const result = rankRecruiters(
      [assessment({ id: 1, created_by: undefined }), assessment({ id: 2, created_by: 1 })],
      [],
      directory
    );

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Rina");
  });

  it("tetap menampilkan pembuat yang tidak ada di direktori", () => {
    const result = rankRecruiters([assessment({ id: 1, created_by: 99 })], [], directory);

    expect(result[0].name).toBe("Pengguna #99");
    expect(result[0].roleLabel).toBe("Akun tidak aktif");
  });

  it("memotong daftar sesuai limit", () => {
    const many = Array.from({ length: 8 }, (_, i) => assessment({ id: i, created_by: i + 1 }));

    expect(rankRecruiters(many, [], directory, 3)).toHaveLength(3);
  });

  it("mengurutkan nama secara stabil saat jumlahnya seri", () => {
    const result = rankRecruiters(
      [assessment({ id: 1, created_by: 2 }), assessment({ id: 2, created_by: 1 })],
      [],
      directory
    );

    expect(result.map((r) => r.name)).toEqual(["Bayu", "Rina"]);
  });
});

const PAST = "2026-09-01T00:00:00Z";
const SOON = "2026-09-26T00:00:00Z"; // 3 hari setelah NOW
const FAR = "2026-12-01T00:00:00Z";

describe("angka ringkasan", () => {
  it("menjumlahkan lintas assessment dan menghitung lowongan yang masih terbuka", () => {
    const totals = computeTotals(
      [
        assessment({ id: 1, sessions_count: 10, completed_count: 4, active_count: 2 }),
        assessment({ id: 2, sessions_count: 5, completed_count: 1, active_count: 1 }),
      ],
      [vacancy({ id: 1, closes_at: FAR }), vacancy({ id: 2, closes_at: PAST })],
      NOW
    );

    expect(totals).toEqual({ candidates: 15, completed: 5, inInterview: 3, openVacancies: 1 });
  });

  // Hitungan yang hilang bukan nol yang benar — tapi menampilkan NaN di
  // dashboard lebih buruk daripada menampilkan nol, karena NaN membuat orang
  // berhenti memercayai seluruh angka di halaman itu.
  it("memperlakukan hitungan yang tidak dikirim backend sebagai nol, bukan NaN", () => {
    const totals = computeTotals([assessment({ id: 1 })], [], NOW);
    expect(totals).toEqual({ candidates: 0, completed: 0, inInterview: 0, openVacancies: 0 });
  });
});

describe("funnel", () => {
  it("menempatkan 'mulai wawancara' di antara diundang dan selesai", () => {
    const stages = buildFunnel([
      assessment({ sessions_count: 10, completed_count: 3, active_count: 2 }),
    ]);

    expect(stages.map((s) => [s.key, s.value])).toEqual([
      ["invited", 10],
      ["started", 5],
      ["completed", 3],
    ]);
  });

  // Funnel yang tahapannya naik-turun memberi tahu pembacanya bahwa datanya
  // salah, bukan bahwa prosesnya buruk. Urutan menurun adalah kontraknya.
  it("tidak pernah menaik", () => {
    const stages = buildFunnel([
      assessment({ sessions_count: 8, completed_count: 2, active_count: 1 }),
      assessment({ id: 2, sessions_count: 4, completed_count: 4, active_count: 0 }),
    ]);

    const values = stages.map((s) => s.value);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });
});

describe("daftar yang perlu diperhatikan", () => {
  // Kegagalan paling mahal di produk ini adalah yang ditanggung orang yang
  // tidak bisa melaporkannya. Kandidat yang memegang link kedaluwarsa tidak
  // menghubungi siapa pun — ia hanya berhenti mencoba.
  it("menandai assessment kedaluwarsa yang kandidatnya belum selesai", () => {
    const items = buildAttentionList(
      [
        assessment({
          id: 3,
          name: "Backend",
          expires_at: PAST,
          sessions_count: 5,
          completed_count: 1,
          active_count: 0,
        }),
      ],
      [],
      NOW
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: "expired-3", severity: "high", to: "/assessments/3/edit" });
    expect(items[0].detail).toContain("4");
  });

  it("diam soal assessment kedaluwarsa yang semua kandidatnya sudah selesai", () => {
    const items = buildAttentionList(
      [assessment({ expires_at: PAST, sessions_count: 3, completed_count: 3, active_count: 0 })],
      [],
      NOW
    );
    expect(items).toHaveLength(0);
  });

  it("diam soal assessment yang masih berlaku meski banyak yang belum selesai", () => {
    const items = buildAttentionList(
      [assessment({ expires_at: FAR, sessions_count: 9, completed_count: 0, active_count: 0 })],
      [],
      NOW
    );
    expect(items).toHaveLength(0);
  });

  it("membedakan sesi yang berhenti karena error dari sesi yang selesai", () => {
    const failed = buildAttentionList(
      [assessment({ id: 4, latest_session: { status: "ended", end_reason: "error" } })],
      [],
      NOW
    );
    expect(failed.map((i) => i.id)).toEqual(["failed-4"]);

    const finished = buildAttentionList(
      [assessment({ id: 4, latest_session: { status: "ended", end_reason: "all_covered" } })],
      [],
      NOW
    );
    expect(finished).toHaveLength(0);
  });

  it("mengingatkan lowongan yang tutup dalam seminggu, bukan yang masih lama", () => {
    const items = buildAttentionList(
      [],
      [vacancy({ id: 1, closes_at: SOON }), vacancy({ id: 2, closes_at: FAR })],
      NOW
    );

    expect(items.map((i) => i.id)).toEqual(["closing-1"]);
    expect(items[0].severity).toBe("medium");
  });

  it("tidak mengingatkan lowongan yang sudah tutup — itu bukan lagi sesuatu yang bisa dikejar", () => {
    const items = buildAttentionList([], [vacancy({ id: 1, closes_at: PAST })], NOW);
    expect(items).toHaveLength(0);
  });

  it("melewati lowongan tanpa tanggal tutup", () => {
    const items = buildAttentionList([], [vacancy({ id: 1, closes_at: null } as never)], NOW);
    expect(items).toHaveLength(0);
  });

  it("menaruh yang high di atas yang medium", () => {
    const items = buildAttentionList(
      [assessment({ id: 1, expires_at: PAST, sessions_count: 2, completed_count: 0 })],
      [vacancy({ id: 9, closes_at: SOON })],
      NOW
    );

    expect(items.map((i) => i.severity)).toEqual(["high", "medium"]);
  });

  // Daftar peringatan yang panjang tidak dibaca. Empat adalah batasnya, dan
  // yang dipotong harus yang paling tidak mendesak.
  it("memotong di empat butir dan mempertahankan yang high", () => {
    const assessments = [1, 2, 3, 4, 5].map((id) =>
      assessment({ id, name: `A${id}`, expires_at: PAST, sessions_count: 2, completed_count: 0 })
    );
    const vacancies = [6, 7].map((id) => vacancy({ id, closes_at: SOON }));

    const items = buildAttentionList(assessments, vacancies, NOW);

    expect(items).toHaveLength(4);
    expect(items.every((i) => i.severity === "high")).toBe(true);
  });
});

describe("kandidat terbaru", () => {
  const withSession = (id: number, over: Record<string, unknown>) =>
    assessment({ id, name: `A${id}`, latest_session: { status: "ended", ...over } as never });

  it("melewati assessment yang belum punya sesi sama sekali", () => {
    expect(buildRecentCandidates([assessment({ id: 1 })])).toEqual([]);
  });

  it("mengurutkan dari yang paling baru", () => {
    const rows = buildRecentCandidates([
      withSession(1, { candidate_name: "Lama", ended_at: "2026-09-01T00:00:00Z" }),
      withSession(2, { candidate_name: "Baru", ended_at: "2026-09-20T00:00:00Z" }),
      withSession(3, { candidate_name: "Tengah", ended_at: "2026-09-10T00:00:00Z" }),
    ]);

    expect(rows.map((r) => r.name)).toEqual(["Baru", "Tengah", "Lama"]);
  });

  it("memakai started_at lalu created_at kalau belum ada ended_at", () => {
    const rows = buildRecentCandidates([
      withSession(1, { status: "active", started_at: "2026-09-20T00:00:00Z" }),
      withSession(2, { status: "pending", created_at: "2026-09-21T00:00:00Z" }),
    ]);

    expect(rows.map((r) => r.assessmentId)).toEqual([2, 1]);
  });

  // Nama kandidat datang dari isian manusia. Kosong atau berisi spasi saja
  // menghasilkan baris tabel yang terlihat rusak, bukan baris yang informatif.
  it.each([
    ["kosong", ""],
    ["spasi saja", "   "],
    ["tidak dikirim", undefined],
    ["null", null],
  ])("memberi nama pengganti kalau nama %s", (_label, candidate_name) => {
    const rows = buildRecentCandidates([withSession(1, { candidate_name })]);
    expect(rows[0].name).toBe("Kandidat tanpa nama");
  });

  it("memotong sesuai limit", () => {
    const rows = buildRecentCandidates(
      [1, 2, 3, 4, 5, 6, 7].map((id) => withSession(id, { ended_at: `2026-09-0${1}T00:00:00Z` })),
      3
    );
    expect(rows).toHaveLength(3);
  });

  it("membuat key yang unik antar assessment meski sesinya tidak punya id", () => {
    const rows = buildRecentCandidates([withSession(1, {}), withSession(2, {})]);
    expect(new Set(rows.map((r) => r.key)).size).toBe(2);
  });
});
