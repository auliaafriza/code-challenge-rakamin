import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import { api } from "./api";

// Diuji lewat adapter, bukan dengan memanggil interceptor secara langsung.
// Yang ingin dijamin adalah perilaku saat sebuah request benar-benar gagal —
// termasuk urutan interceptor-nya — bukan bahwa sebuah fungsi dipanggil.
function respondWith(status: number, data: unknown = {}) {
  api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    const response = { data, status, statusText: "", headers: {}, config };
    if (status >= 400) {
      return Promise.reject(Object.assign(new Error(`status ${status}`), { config, response }));
    }
    return response;
  };
}

let originalAdapter: unknown;
let assignedHref: string | null;

beforeEach(() => {
  originalAdapter = api.defaults.adapter;
  localStorage.clear();
  assignedHref = null;

  // jsdom menolak navigasi sungguhan. Yang diperiksa di sini adalah niat untuk
  // pindah halaman, bukan pindahnya.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      get href() {
        return "http://localhost/";
      },
      set href(value: string) {
        assignedHref = value;
      },
    },
  });
});

afterEach(() => {
  api.defaults.adapter = originalAdapter as never;
  vi.restoreAllMocks();
});

describe("token pada setiap request", () => {
  it("menyertakan Authorization kalau ada token tersimpan", async () => {
    localStorage.setItem("auth_token", "token-abc");
    respondWith(200, { ok: true });

    const response = await api.get("/assessments");
    expect(response.config.headers.Authorization).toBe("Bearer token-abc");
  });

  it("tidak menyertakan Authorization kalau belum login", async () => {
    respondWith(200, { ok: true });

    const response = await api.get("/assessments");
    expect(response.config.headers.Authorization).toBeUndefined();
  });
});

describe("pembungkus { data: ... } dari Rails", () => {
  it("membuka satu lapis pembungkus", async () => {
    respondWith(200, { data: { id: 1, name: "Frontend" } });

    const response = await api.get("/assessments/1");
    expect(response.data).toEqual({ id: 1, name: "Frontend" });
  });

  it("membiarkan respons yang memang tidak punya pembungkus", async () => {
    respondWith(200, { id: 1, name: "Frontend" });

    const response = await api.get("/assessments/1");
    expect(response.data).toEqual({ id: 1, name: "Frontend" });
  });

  it("tidak tersandung respons yang bukan objek", async () => {
    respondWith(200, "sekadar teks");

    const response = await api.get("/health");
    expect(response.data).toBe("sekadar teks");
  });
});

describe("sesi yang kedaluwarsa", () => {
  it.each([401, 403])("membuang token dan melempar ke /login saat %i", async (status) => {
    localStorage.setItem("auth_token", "token-lama");
    respondWith(status);

    await expect(api.get("/assessments")).rejects.toThrow();
    expect(localStorage.getItem("auth_token")).toBeNull();
    expect(assignedHref).toBe("/login");
  });

  // Ini pernah jadi bug nyata: login dengan password salah menjawab 401,
  // interceptor menganggapnya sesi kedaluwarsa, dan halaman login memuat ulang
  // dirinya sendiri sebelum pesan "password salah" sempat terlihat. Yang
  // dialami orang: tombol login yang tidak melakukan apa-apa.
  it.each(["/auth/login", "/auth/signup"])(
    "tidak memuat ulang halaman saat %s ditolak",
    async (url) => {
      respondWith(401, { error: "Email atau password salah" });

      await expect(api.post(url, {})).rejects.toThrow();
      expect(assignedHref).toBeNull();
    }
  );

  it("membiarkan token saat endpoint auth ditolak", async () => {
    localStorage.setItem("auth_token", "token-lama");
    respondWith(403, { error: "Akun belum diberi peran" });

    await expect(api.post("/auth/login", {})).rejects.toThrow();
    expect(localStorage.getItem("auth_token")).toBe("token-lama");
  });

  it.each([404, 422, 500])("tidak melempar ke /login untuk status %i", async (status) => {
    localStorage.setItem("auth_token", "token-abc");
    respondWith(status);

    await expect(api.get("/assessments")).rejects.toThrow();
    expect(assignedHref).toBeNull();
    expect(localStorage.getItem("auth_token")).toBe("token-abc");
  });

  it("tidak melempar ke /login saat jaringan mati tanpa status", async () => {
    localStorage.setItem("auth_token", "token-abc");
    api.defaults.adapter = async () => Promise.reject(new Error("Network Error"));

    await expect(api.get("/assessments")).rejects.toThrow("Network Error");
    expect(assignedHref).toBeNull();
    expect(localStorage.getItem("auth_token")).toBe("token-abc");
  });
});
