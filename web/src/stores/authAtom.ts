import { atom } from "jotai";
import type { AuthUser } from "@/services/auth";

export interface AuthState {
  token: string | null;
  user: AuthUser | null;
}

const STORAGE_KEY = "auth_token";
const USER_KEY = "auth_user";

export function getStoredToken(): string | null {
  return localStorage.getItem(STORAGE_KEY) ?? import.meta.env.VITE_DEV_TOKEN ?? null;
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
