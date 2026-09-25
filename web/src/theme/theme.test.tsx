import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, useTheme } from "./ThemeProvider";
import ThemeToggle from "./ThemeToggle";

type Listener = (e: MediaQueryListEvent) => void;
let listeners: Listener[] = [];

function mockSystemDark(dark: boolean) {
  listeners = [];
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: dark,
    media: query,
    onchange: null,
    addEventListener: (_: string, cb: Listener) => listeners.push(cb),
    removeEventListener: (_: string, cb: Listener) => {
      listeners = listeners.filter((l) => l !== cb);
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

function Probe() {
  const { resolved, preference } = useTheme();
  return (
    <>
      <span data-testid="resolved">{resolved}</span>
      <span data-testid="preference">{preference}</span>
    </>
  );
}

const root = () => document.documentElement;

beforeEach(() => {
  localStorage.clear();
  root().className = "";
  delete root().dataset.theme;
  mockSystemDark(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("tema mengikuti sistem secara bawaan", () => {
  it("terang saat OS terang", () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId("resolved")).toHaveTextContent("light");
    expect(root().classList.contains("dark")).toBe(false);
  });

  it("gelap saat OS gelap", () => {
    mockSystemDark(true);
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId("resolved")).toHaveTextContent("dark");
    expect(root().classList.contains("dark")).toBe(true);
  });

  // Orang mengganti tema OS di tengah hari. Mengikuti sistem berarti ikut saat
  // sistemnya berubah, bukan hanya saat halaman pertama kali dimuat.
  it("ikut berubah saat OS berganti tema", async () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId("resolved")).toHaveTextContent("light");

    await act(async () => {
      listeners.forEach((l) => l({ matches: true } as MediaQueryListEvent));
    });

    expect(screen.getByTestId("resolved")).toHaveTextContent("dark");
  });
});

describe("kelas dan dataset selalu sepakat", () => {
  // Komponen chart membaca dataset.theme, shell memakai kelas .dark. Kalau
  // keduanya bisa berbeda, hasilnya chart gelap di dalam halaman terang —
  // persis kegagalan yang membuat dark mode setengah jadi terlihat rusak.
  it.each([
    ["dark", true],
    ["light", false],
  ])("preferensi %s menyetel keduanya", async (preference, expectDark) => {
    render(<ThemeProvider><Probe /></ThemeProvider>);

    localStorage.setItem("theme", preference);
    render(<ThemeProvider><Probe /></ThemeProvider>);

    expect(root().classList.contains("dark")).toBe(expectDark);
    expect(root().dataset.theme).toBe(preference);
  });

  it("color-scheme ikut disetel supaya kontrol bawaan browser tidak silau", () => {
    mockSystemDark(true);
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(root().style.colorScheme).toBe("dark");
  });
});

describe("pilihan pengguna", () => {
  it("mengalahkan setelan OS", async () => {
    mockSystemDark(true);
    render(
      <ThemeProvider>
        <ThemeToggle />
        <Probe />
      </ThemeProvider>
    );
    expect(screen.getByTestId("resolved")).toHaveTextContent("dark");

    await userEvent.click(screen.getByRole("button", { name: "Terang" }));

    expect(screen.getByTestId("resolved")).toHaveTextContent("light");
    expect(root().classList.contains("dark")).toBe(false);
  });

  it("tersimpan antar kunjungan", async () => {
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Gelap" }));
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("bisa dikembalikan ke mengikuti sistem", async () => {
    localStorage.setItem("theme", "light");
    mockSystemDark(true);
    render(
      <ThemeProvider>
        <ThemeToggle />
        <Probe />
      </ThemeProvider>
    );
    expect(screen.getByTestId("resolved")).toHaveTextContent("light");

    await userEvent.click(screen.getByRole("button", { name: "Ikuti sistem" }));

    expect(screen.getByTestId("preference")).toHaveTextContent("system");
    expect(screen.getByTestId("resolved")).toHaveTextContent("dark");
  });

  it("mengabaikan nilai tersimpan yang rusak", () => {
    localStorage.setItem("theme", "neon");
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId("preference")).toHaveTextContent("system");
  });

  it("tetap merender saat localStorage melempar", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("akses ditolak");
    });
    expect(() => render(<ThemeProvider><Probe /></ThemeProvider>)).not.toThrow();
  });

  it("menandai pilihan aktif untuk pembaca layar", async () => {
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Gelap" }));
    expect(screen.getByRole("button", { name: "Gelap" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Terang" })).toHaveAttribute("aria-pressed", "false");
  });
});
