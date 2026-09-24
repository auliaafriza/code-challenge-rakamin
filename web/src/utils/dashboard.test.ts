import { describe, it, expect } from "vitest";
import { isAssessmentOpen, isVacancyOpen, rankRecruiters } from "./dashboard";
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
