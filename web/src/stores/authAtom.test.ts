import { describe, it, expect, beforeEach } from "vitest";
import { getStoredToken, getStoredUser, saveSession, clearToken } from "./authAtom";

beforeEach(() => {
  localStorage.clear();
});

describe("token yang dipakai untuk memanggil API", () => {
  it("mengembalikan null kalau belum pernah login", () => {
    expect(getStoredToken()).toBeNull();
  });

  it("mengembalikan token yang tersimpan", () => {
    saveSession("token-abc", null);
    expect(getStoredToken()).toBe("token-abc");
  });

  // Penjaga regresi, bukan uji perilaku.
  //
  // Dulu fungsi ini punya fallback `?? import.meta.env.VITE_DEV_TOKEN`. Vite
  // menuliskan SELURUH import.meta.env ke dalam bundle, jadi satu baris itu
  // memindahkan JWT admin dari .env pengembang ke berkas JavaScript yang bisa
  // diunduh siapa pun. Tidak ada gejalanya: aplikasinya bekerja normal.
  //
  // Test ini gagal kalau fallback itu kembali.
  it("tidak pernah mengambil token dari environment variable", () => {
    const env = import.meta.env as Record<string, string | undefined>;
    const before = env.VITE_DEV_TOKEN;
    env.VITE_DEV_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYWRtaW4ifQ.x";

    try {
      expect(getStoredToken()).toBeNull();
    } finally {
      if (before === undefined) delete env.VITE_DEV_TOKEN;
      else env.VITE_DEV_TOKEN = before;
    }
  });

  it("menghapus token dan identitas sekaligus saat logout", () => {
    saveSession("token-abc", { id: 1, email: "a@b.c", role: "admin" } as never);
    clearToken();
    expect(getStoredToken()).toBeNull();
    expect(getStoredUser()).toBeNull();
  });
});

describe("identitas yang tersimpan", () => {
  it("mengembalikan user yang tersimpan utuh", () => {
    saveSession("t", { id: 7, email: "a@b.c", role: "recruiter" } as never);
    expect(getStoredUser()).toMatchObject({ id: 7, role: "recruiter" });
  });

  // localStorage bisa berisi apa saja — versi lama aplikasi, atau orang yang
  // mengetiknya sendiri. Yang tidak boleh terjadi adalah aplikasi crash saat
  // boot, karena layar putih tidak memberi tahu siapa pun apa yang salah.
  it.each([
    ["JSON rusak", "{oops"],
    ["bukan objek", '"a string"'],
    ["objek tanpa role", '{"id":1}'],
    ["role bukan string", '{"id":1,"role":3}'],
    ["null", "null"],
  ])("mengembalikan null, bukan melempar, untuk %s", (_label, raw) => {
    localStorage.setItem("auth_user", raw);
    expect(() => getStoredUser()).not.toThrow();
    expect(getStoredUser()).toBeNull();
  });

  it("tidak menulis identitas kalau tidak ada yang diberikan", () => {
    saveSession("t", null);
    expect(localStorage.getItem("auth_user")).toBeNull();
  });
});
