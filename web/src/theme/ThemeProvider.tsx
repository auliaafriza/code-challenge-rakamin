import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

// "system" adalah bawaannya, dan itu disengaja: komponen chart sudah membaca
// prefers-color-scheme sejak awal. Tanpa shell yang ikut, pengguna ber-OS gelap
// melihat chart gelap di dalam halaman putih — dark mode setengah jadi yang
// lebih buruk daripada tidak ada sama sekali.
export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

interface ThemeContextValue {
  preference: ThemePreference;
  /** Yang benar-benar tampil sekarang, setelah "system" diterjemahkan. */
  resolved: "light" | "dark";
  setPreference: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStored(): ThemePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
  } catch {
    return "system";
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readStored());
  const [systemDark, setSystemDark] = useState<boolean>(() => systemPrefersDark());

  // Mengikuti OS berarti ikut saat OS-nya berubah, bukan hanya saat halaman
  // dimuat. Orang mengganti tema di tengah hari.
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const resolved: "light" | "dark" =
    preference === "system" ? (systemDark ? "dark" : "light") : preference;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
    // useIsDark milik komponen chart membaca dataset.theme lebih dulu, jadi
    // keduanya harus disetel agar chart dan shell tidak pernah berbeda.
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Tetap berlaku untuk sesi ini.
    }
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme dipakai di luar <ThemeProvider>");
  return ctx;
}
