import { createContext, useContext, useMemo, useState } from "react";
import { Outlet } from "react-router-dom";
import LanguageToggle from "@/i18n/LanguageToggle";

interface CandidateChrome {
  /** Posisi yang dilamar, begitu diketahui dari server. */
  roleTitle: string | null;
  setRoleTitle: (value: string | null) => void;
}

const ChromeContext = createContext<CandidateChrome | null>(null);

/**
 * Halaman kandidat menaruh posisi yang dilamar di header lewat sini.
 *
 * Header sebelumnya hanya bertuliskan "AI Interview". Orang yang mengklik link
 * dari email tidak punya satu pun penanda bahwa ia di tempat yang benar,
 * sebelum menyerahkan suaranya selama 45 menit. Nama posisinya sudah ikut di
 * respons yang sama yang memuat halaman ini — hanya belum pernah ditampilkan.
 */
export function useCandidateChrome(): CandidateChrome {
  const ctx = useContext(ChromeContext);
  if (!ctx) throw new Error("useCandidateChrome dipakai di luar <CandidateLayout>");
  return ctx;
}

export default function CandidateLayout() {
  const [roleTitle, setRoleTitle] = useState<string | null>(null);
  const value = useMemo(() => ({ roleTitle, setRoleTitle }), [roleTitle]);

  return (
    <ChromeContext.Provider value={value}>
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <header className="border-b bg-card">
          <div className="mx-auto flex h-12 max-w-2xl items-center justify-between gap-3 px-4">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="shrink-0 text-sm font-semibold">AI Interview</span>
              {roleTitle && (
                <>
                  <span className="shrink-0 text-muted-foreground" aria-hidden="true">
                    ·
                  </span>
                  <span className="truncate text-sm text-muted-foreground" title={roleTitle}>
                    {roleTitle}
                  </span>
                </>
              )}
            </div>
            <LanguageToggle className="shrink-0" />
          </div>
        </header>

        <main className="flex flex-1 flex-col">
          <Outlet />
        </main>
      </div>
    </ChromeContext.Provider>
  );
}
