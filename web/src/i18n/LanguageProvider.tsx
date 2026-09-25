import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { DICTIONARIES, normalizeLanguage } from "./strings";
import type { Language, Strings } from "./strings";

const STORAGE_KEY = "interview_language";

interface LanguageContextValue {
  language: Language;
  /** true kalau kandidat memilihnya sendiri, bukan hasil tebakan. */
  chosen: boolean;
  setLanguage: (next: Language) => void;
  /** Bahasa yang dipakai AI untuk wawancara, kalau diketahui. */
  setInterviewLanguage: (value?: string | null) => void;
  t: Strings;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readStored(): Language | null {
  try {
    return normalizeLanguage(localStorage.getItem(STORAGE_KEY));
  } catch {
    // Mode privat, atau site data diblokir. Bukan alasan halaman gagal muat.
    return null;
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [chosenLanguage, setChosenLanguage] = useState<Language | null>(() => readStored());
  const [interviewLanguage, setInterviewLanguageState] = useState<Language | null>(null);

  // Urutannya disengaja:
  //   1. pilihan kandidat sendiri — selalu menang
  //   2. bahasa wawancara yang disetel perekrut — halaman sebaiknya sama
  //      dengan bahasa yang akan dipakai AI berbicara
  //   3. bahasa browser
  //   4. Indonesia
  //
  // Bawaan terakhir bukan Inggris: produk ini dipakai pelamar kerja Indonesia,
  // dan bahasa asing muncul tepat saat orang paling cemas — ketika ada yang
  // gagal.
  const language: Language =
    chosenLanguage ?? interviewLanguage ?? normalizeLanguage(navigator?.language) ?? "id";

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setChosenLanguage(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Pilihannya tetap berlaku untuk sesi ini walau tidak bisa disimpan.
    }
  }, []);

  const setInterviewLanguage = useCallback((value?: string | null) => {
    setInterviewLanguageState(normalizeLanguage(value));
  }, []);

  const value = useMemo(
    () => ({
      language,
      chosen: chosenLanguage !== null,
      setLanguage,
      setInterviewLanguage,
      t: DICTIONARIES[language],
    }),
    [language, chosenLanguage, setLanguage, setInterviewLanguage]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage dipakai di luar <LanguageProvider>");
  return ctx;
}

/** Pintasan untuk komponen yang hanya butuh teksnya. */
export function useT(): Strings {
  return useLanguage().t;
}
