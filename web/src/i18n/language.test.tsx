import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider, useLanguage } from "./LanguageProvider";
import LanguageToggle from "./LanguageToggle";
import { DICTIONARIES, LANGUAGES, normalizeLanguage } from "./strings";
import type { Strings } from "./strings";

function setBrowserLanguage(value: string) {
  Object.defineProperty(navigator, "language", { configurable: true, value });
}

beforeEach(() => {
  localStorage.clear();
  setBrowserLanguage("en-US");
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Probe yang menampilkan bahasa aktif dan satu kalimat, supaya test memeriksa
// apa yang dibaca kandidat — bukan nilai state internal.
function Probe({ interviewLanguage }: { interviewLanguage?: string | null }) {
  const { language, t, setInterviewLanguage } = useLanguage();
  return (
    <div>
      <button onClick={() => setInterviewLanguage(interviewLanguage)}>terapkan</button>
      <span data-testid="lang">{language}</span>
      <span data-testid="title">{t.completeTitle}</span>
    </div>
  );
}

describe("kamus", () => {
  // Kunci yang hilang tidak menggagalkan build — ia menghasilkan teks kosong di
  // halaman kandidat, dan hanya pemakai bahasa itu yang melihatnya.
  it("setiap bahasa punya kunci yang sama persis", () => {
    const reference = Object.keys(DICTIONARIES.id).sort();
    for (const code of LANGUAGES) {
      expect(Object.keys(DICTIONARIES[code]).sort()).toEqual(reference);
    }
  });

  it("tidak ada nilai yang kosong", () => {
    for (const code of LANGUAGES) {
      for (const [key, value] of Object.entries(DICTIONARIES[code])) {
        if (typeof value === "string") expect(value.trim(), `${code}.${key}`).not.toBe("");
      }
    }
  });

  it("kunci yang sama bertipe sama di semua bahasa", () => {
    for (const key of Object.keys(DICTIONARIES.id) as (keyof Strings)[]) {
      const kinds = LANGUAGES.map((code) => typeof DICTIONARIES[code][key]);
      expect(new Set(kinds).size, String(key)).toBe(1);
    }
  });

  it("fungsi terjemahan benar-benar memakai nilainya", () => {
    for (const code of LANGUAGES) {
      expect(DICTIONARIES[code].minutes(45)).toContain("45");
      expect(DICTIONARIES[code].briefDuration(30)).toContain("30");
      expect(DICTIONARIES[code].timeLeftShort("04:12")).toContain("04:12");
    }
  });
});

describe("mengenali kode bahasa", () => {
  it.each([
    ["id", "id"],
    ["ID", "id"],
    ["id-ID", "id"],
    ["en-GB", "en"],
  ])("%s dibaca sebagai %s", (input, expected) => {
    expect(normalizeLanguage(input)).toBe(expected);
  });

  it.each([["fr"], [""], [null], [undefined]])("menolak %s", (input) => {
    expect(normalizeLanguage(input as string | null)).toBeNull();
  });
});

describe("bahasa mana yang dipakai", () => {
  it("mengikuti bahasa browser kalau belum ada yang memilih", () => {
    setBrowserLanguage("en-US");
    render(<LanguageProvider><Probe /></LanguageProvider>);
    expect(screen.getByTestId("lang")).toHaveTextContent("en");
  });

  // Produk ini dipakai pelamar kerja Indonesia. Bahasa asing muncul tepat saat
  // orang paling cemas, jadi bawaan terakhirnya bukan Inggris.
  it("jatuh ke bahasa Indonesia kalau browser-nya bahasa lain", () => {
    setBrowserLanguage("fr-FR");
    render(<LanguageProvider><Probe /></LanguageProvider>);
    expect(screen.getByTestId("lang")).toHaveTextContent("id");
  });

  it("mengikuti bahasa wawancara yang disetel perekrut", async () => {
    setBrowserLanguage("en-US");
    render(<LanguageProvider><Probe interviewLanguage="id" /></LanguageProvider>);

    await userEvent.click(screen.getByText("terapkan"));
    expect(screen.getByTestId("lang")).toHaveTextContent("id");
  });

  // Yang menanggung akibat salah bahasa adalah kandidat, jadi pilihannya
  // mengalahkan setelan siapa pun.
  it("pilihan kandidat mengalahkan bahasa wawancara", async () => {
    localStorage.setItem("interview_language", "en");
    render(<LanguageProvider><Probe interviewLanguage="id" /></LanguageProvider>);

    await userEvent.click(screen.getByText("terapkan"));
    expect(screen.getByTestId("lang")).toHaveTextContent("en");
  });

  it("mengabaikan bahasa wawancara yang tidak didukung", async () => {
    setBrowserLanguage("id-ID");
    render(<LanguageProvider><Probe interviewLanguage="fr" /></LanguageProvider>);

    await userEvent.click(screen.getByText("terapkan"));
    expect(screen.getByTestId("lang")).toHaveTextContent("id");
  });

  it("mengabaikan nilai tersimpan yang rusak", () => {
    localStorage.setItem("interview_language", "klingon");
    setBrowserLanguage("id-ID");
    render(<LanguageProvider><Probe /></LanguageProvider>);
    expect(screen.getByTestId("lang")).toHaveTextContent("id");
  });

  // Mode privat membuat localStorage melempar. Halaman tetap harus muncul.
  it("tetap merender saat localStorage tidak bisa dibaca", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("akses ditolak");
    });
    expect(() =>
      render(<LanguageProvider><Probe /></LanguageProvider>)
    ).not.toThrow();
  });

  it("menyetel lang pada <html> supaya pembaca layar memakai suara yang benar", () => {
    setBrowserLanguage("id-ID");
    render(<LanguageProvider><Probe /></LanguageProvider>);
    expect(document.documentElement.lang).toBe("id");
  });
});

describe("pemilih bahasa", () => {
  it("mengganti kalimat yang dibaca kandidat, bukan hanya labelnya", async () => {
    setBrowserLanguage("id-ID");
    render(
      <LanguageProvider>
        <LanguageToggle />
        <Probe />
      </LanguageProvider>
    );

    expect(screen.getByTestId("title")).toHaveTextContent(DICTIONARIES.id.completeTitle);

    await userEvent.click(screen.getByRole("button", { name: /en/i }));

    expect(screen.getByTestId("title")).toHaveTextContent(DICTIONARIES.en.completeTitle);
  });

  // Kandidat yang salah bahasa harus bisa keluar dari keadaan itu. Kedua
  // pilihan selalu terlihat, jadi tidak ada jebakan bahasa.
  it("menampilkan semua bahasa, bukan hanya yang sedang aktif", () => {
    render(<LanguageProvider><LanguageToggle /></LanguageProvider>);
    expect(screen.getAllByRole("button")).toHaveLength(LANGUAGES.length);
  });

  it("menandai pilihan aktif untuk pembaca layar", async () => {
    setBrowserLanguage("id-ID");
    render(<LanguageProvider><LanguageToggle /></LanguageProvider>);

    expect(screen.getByRole("button", { name: /id/i })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: /en/i }));
    expect(screen.getByRole("button", { name: /en/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("mengingat pilihannya", async () => {
    render(<LanguageProvider><LanguageToggle /></LanguageProvider>);
    await userEvent.click(screen.getByRole("button", { name: /en/i }));
    expect(localStorage.getItem("interview_language")).toBe("en");
  });

  it("pilihan tetap berlaku walau tidak bisa disimpan", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("kuota habis");
    });
    setBrowserLanguage("id-ID");
    render(
      <LanguageProvider>
        <LanguageToggle />
        <Probe />
      </LanguageProvider>
    );

    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /en/i }));
    });
    expect(screen.getByTestId("lang")).toHaveTextContent("en");
  });
});
