import { describe, it, expect } from "vitest";
import {
  analyticsTotals,
  durationBuckets,
  endReasonBreakdown,
  formatDuration,
  sessionsPerAssessment,
  weeklySessions,
} from "./analytics";
import type { Session } from "@/types";

const NOW = new Date("2026-09-23T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

let nextId = 1;
function session(over: Partial<Session> = {}): Session {
  return {
    id: nextId++,
    assessment_id: 1,
    invite_token: "t",
    invite_url: "u",
    status: "pending",
    created_at: ago(1),
    ...over,
  };
}

describe("ringkasan angka", () => {
  it("memisahkan sesi gagal dari sesi selesai", () => {
    const totals = analyticsTotals([
      session({ status: "ended", end_reason: "all_covered" }),
      session({ status: "ended", end_reason: "error" }),
      session({ status: "active" }),
      session({ status: "pending" }),
    ]);

    expect(totals.ended).toBe(2);
    expect(totals.failed).toBe(1);
    expect(totals.active).toBe(1);
    expect(totals.pending).toBe(1);
    expect(totals.completionRate).toBe(50);
  });

  it("mengabaikan durasi yang tidak tercatat saat menghitung rata-rata", () => {
    const totals = analyticsTotals([
      session({ status: "ended", duration_seconds: 1800 }),
      session({ status: "ended", duration_seconds: 2400 }),
      session({ status: "ended", duration_seconds: 0 }),
      session({ status: "ended" }),
    ]);

    expect(totals.avgMinutes).toBe(35);
  });

  it("tidak membagi dengan nol saat belum ada sesi", () => {
    const totals = analyticsTotals([]);
    expect(totals.avgMinutes).toBeNull();
    expect(totals.completionRate).toBe(0);
  });
});

describe("sesi per minggu", () => {
  it("selalu mengembalikan jumlah minggu yang diminta, termasuk yang kosong", () => {
    const points = weeklySessions([], 8, NOW);
    expect(points).toHaveLength(8);
    expect(points.every((p) => p.values[0] === 0 && p.values[1] === 0)).toBe(true);
  });

  it("menaruh sesi hari ini di kolom terakhir", () => {
    const points = weeklySessions([session({ created_at: ago(0) })], 8, NOW);
    expect(points[7].values[0]).toBe(1);
  });

  it("memberi kolom terakhir rentang tujuh hari penuh, bukan satu hari", () => {
    const points = weeklySessions(
      [session({ created_at: ago(0) }), session({ created_at: ago(5) })],
      8,
      NOW
    );
    expect(points[7].values[0]).toBe(2);
  });

  it("menghitung penyelesaian pada minggu ia berakhir, bukan minggu ia dibuat", () => {
    const points = weeklySessions(
      [session({ status: "ended", created_at: ago(20), ended_at: ago(0) })],
      8,
      NOW
    );

    expect(points[7].values[1]).toBe(1);
    expect(points[7].values[0]).toBe(0);
  });

  it("membuang sesi yang lebih tua dari rentang, bukan menumpuknya ke minggu pertama", () => {
    const points = weeklySessions([session({ created_at: ago(400) })], 8, NOW);
    expect(points.reduce((sum, p) => sum + p.values[0], 0)).toBe(0);
  });
});

describe("kandidat per assessment", () => {
  it("mengelompokkan dan mengurutkan dari yang terbanyak", () => {
    const rows = sessionsPerAssessment([
      session({ assessment: { id: 1, name: "Frontend", time_limit_min: 45 } }),
      session({ assessment: { id: 1, name: "Frontend", time_limit_min: 45 } }),
      session({ assessment: { id: 2, name: "Backend", time_limit_min: 60 } }),
    ]);

    expect(rows.map((r) => r.label)).toEqual(["Frontend", "Backend"]);
    expect(rows[0].value).toBe(2);
    expect(rows[0].meta).toBe("67%");
  });

  it("tetap menghitung sesi yang assessment-nya sudah dihapus", () => {
    const rows = sessionsPerAssessment([session({ assessment: null })]);
    expect(rows[0].label).toBe("Assessment terhapus");
  });
});

describe("sebaran durasi", () => {
  it("menempatkan tiap durasi pada bucket yang benar", () => {
    const buckets = durationBuckets([
      session({ status: "ended", duration_seconds: 5 * 60 }),
      session({ status: "ended", duration_seconds: 25 * 60 }),
      session({ status: "ended", duration_seconds: 90 * 60 }),
    ]);

    expect(buckets[0].value).toBe(1); // < 10m
    expect(buckets[2].value).toBe(1); // 20–30m
    expect(buckets[5].value).toBe(1); // > 60m
  });

  it("hanya menghitung sesi yang sudah berakhir", () => {
    const buckets = durationBuckets([session({ status: "active", duration_seconds: 600 })]);
    expect(buckets.every((b) => b.value === 0)).toBe(true);
  });

  it("menempatkan durasi tepat di batas ke bucket atasnya", () => {
    const buckets = durationBuckets([session({ status: "ended", duration_seconds: 10 * 60 })]);
    expect(buckets[0].value).toBe(0);
    expect(buckets[1].value).toBe(1);
  });
});

describe("alasan sesi berakhir", () => {
  it("memetakan alasan ke label dan tingkat status", () => {
    const rows = endReasonBreakdown([
      session({ status: "ended", end_reason: "all_covered" }),
      session({ status: "ended", end_reason: "error" }),
      session({ status: "ended", end_reason: "error" }),
    ]);

    expect(rows[0]).toMatchObject({ label: "Gagal karena error", status: "critical", value: 2 });
    expect(rows[1]).toMatchObject({ label: "Semua skill tercakup", status: "good", value: 1 });
  });

  it("memberi label pada sesi yang berakhir tanpa alasan tersimpan", () => {
    const rows = endReasonBreakdown([session({ status: "ended" })]);
    expect(rows[0].label).toBe("Tidak tercatat");
  });

  it("tidak menghitung sesi yang belum berakhir", () => {
    expect(endReasonBreakdown([session({ status: "active" })])).toEqual([]);
  });
});

describe("format durasi", () => {
  it("membulatkan ke menit dan membuang detik", () => {
    expect(formatDuration(2530)).toBe("42 mnt");
    expect(formatDuration(45)).toBe("45 dtk");
    expect(formatDuration(3900)).toBe("1j 5m");
    expect(formatDuration(7200)).toBe("2 jam");
  });

  it("membedakan tidak tercatat dari nol", () => {
    expect(formatDuration(0)).toBe("—");
    expect(formatDuration(undefined)).toBe("—");
    expect(formatDuration(null)).toBe("—");
  });
});
