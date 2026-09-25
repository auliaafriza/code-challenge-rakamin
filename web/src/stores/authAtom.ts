import { atom } from "jotai";
import type { AuthUser } from "@/services/auth";

export interface AuthState {
  token: string | null;
  user: AuthUser | null;
}

const STORAGE_KEY = "auth_token";
const USER_KEY = "auth_user";

// Tidak ada fallback ke import.meta.env di sini, dan itu disengaja.
//
// Vite menuliskan SELURUH objek import.meta.env ke dalam bundle — setiap
// variabel ber-prefix VITE_ yang ada saat build, dipakai kode ini atau tidak
// (sebuah dependency membacanya sebagai objek utuh, jadi tidak bisa dihindari
// dari sisi kode). Satu baris `?? import.meta.env.VITE_DEV_TOKEN` memindahkan
// JWT dari .env pengembang ke berkas JavaScript yang bisa diunduh siapa pun,
// tanpa satu pun gejala: aplikasinya bekerja normal.
//
// Untuk login cepat saat development, tempel sekali di console browser:
//   localStorage.setItem("auth_token", "<jwt>")
export function getStoredToken(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && typeof parsed.role === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSession(token: string, user: AuthUser | null) {
  localStorage.setItem(STORAGE_KEY, token);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/** @deprecated pakai saveSession supaya identitas ikut tersimpan. */
export function saveToken(token: string) {
  localStorage.setItem(STORAGE_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(USER_KEY);
}

export const authAtom = atom<AuthState>({
  token: getStoredToken(),
  user: getStoredUser(),
});
