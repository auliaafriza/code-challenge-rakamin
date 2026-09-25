import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Provider as JotaiProvider } from "jotai";
import InterviewPage from "./InterviewPage";
import CandidateLayout from "@/components/layout/CandidateLayout";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import { DICTIONARIES } from "@/i18n/strings";

const getCandidateInfo = vi.fn();

vi.mock("@/services/sessions", () => ({
  sessionsApi: {
    getCandidateInfo: (token: string) => getCandidateInfo(token),
    audioComplete: vi.fn(),
  },
}));

// Hook audio menyentuh AudioContext dan WebSocket, yang tidak ada di jsdom dan
// bukan yang diuji di sini.
vi.mock("@/hooks/useAudioCapture", () => ({
  useAudioCapture: () => ({ start: vi.fn(), stop: vi.fn(), mute: vi.fn(), unmute: vi.fn() }),
}));
vi.mock("@/hooks/useAudioPlayback", () => ({
  useAudioPlayback: () => ({
    playChunk: vi.fn(),
    stop: vi.fn(),
    scheduleAfterPlayback: vi.fn(),
    waitForDrain: vi.fn(),
    cancelDrain: vi.fn(),
  }),
}));
vi.mock("@/hooks/useAudioWebSocket", () => ({
  useAudioWebSocket: () => ({
    connect: vi.fn(),
    send: vi.fn(),
    sendJson: vi.fn(),
    disconnect: vi.fn(),
    connectionState: "idle",
  }),
}));

function renderPage() {
  return render(
    <LanguageProvider>
      <JotaiProvider>
        <MemoryRouter initialEntries={["/interview/abc123"]}>
          <Routes>
            <Route element={<CandidateLayout />}>
              <Route path="/interview/:token" element={<InterviewPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </JotaiProvider>
    </LanguageProvider>
  );
}

const rejectWith = (status: number) =>
  getCandidateInfo.mockRejectedValue({ response: { status } });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("interview_language", "id");
  getCandidateInfo.mockReset();
});

describe("link yang tidak bisa dipakai", () => {
  // Setiap kegagalan dulu berakhir di layar "Interview Complete". Kandidat yang
  // belum memulai apa pun diberi tahu wawancaranya sudah selesai, lalu menutup
  // tab dan menunggu hasil yang tidak akan pernah ada.
  it.each([
    [410, DICTIONARIES.id.errExpiredTitle],
    [404, DICTIONARIES.id.errUnknownTitle],
    [500, DICTIONARIES.id.errUnreachableTitle],
  ])("status %i memberi pesan yang berbeda", async (status, title) => {
    rejectWith(status);
    renderPage();

    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.queryByText(DICTIONARIES.id.completeTitle)).not.toBeInTheDocument();
  });

  it("menawarkan coba lagi hanya untuk kegagalan sementara", async () => {
    rejectWith(500);
    renderPage();

    const retry = await screen.findByRole("button", { name: DICTIONARIES.id.retry });
    expect(retry).toBeInTheDocument();

    getCandidateInfo.mockResolvedValue({
      data: { session_id: 1, role_title: "Frontend Engineer", time_limit_min: 45, session_status: "pending" },
    });
    await userEvent.click(retry);

    await waitFor(() => expect(getCandidateInfo).toHaveBeenCalledTimes(2));
  });

  it.each([410, 404])("tidak menawarkan coba lagi untuk status %i yang tidak akan berubah", async (status) => {
    rejectWith(status);
    renderPage();

    await screen.findByRole("heading");
    expect(screen.queryByRole("button", { name: DICTIONARIES.id.retry })).not.toBeInTheDocument();
  });

  // Emoji berubah bentuk di tiap sistem operasi, dan ini satu-satunya elemen
  // visual di layar paling menegangkan dalam produk ini.
  it("memakai ikon, bukan emoji", async () => {
    rejectWith(410);
    const { container } = renderPage();

    await screen.findByText(DICTIONARIES.id.errExpiredTitle);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.textContent).not.toContain("⚠️");
  });
});

describe("kandidat tahu ia sedang di mana", () => {
  // Dicari di dalam <header>, bukan di seluruh halaman: judul halaman juga
  // memuat nama posisi, jadi pencarian global tetap lulus walau header-nya
  // kosong — dan header itulah yang dilihat kandidat di setiap layar.
  it("menampilkan posisi yang dilamar di header", async () => {
    getCandidateInfo.mockResolvedValue({
      data: { session_id: 1, role_title: "Senior Frontend Engineer", time_limit_min: 45, session_status: "pending" },
    });
    renderPage();

    const header = screen.getByRole("banner");
    expect(await within(header).findByText("Senior Frontend Engineer")).toBeInTheDocument();
  });

  it("header tetap utuh kalau posisinya tidak diketahui", async () => {
    rejectWith(500);
    renderPage();

    expect(await screen.findByText("AI Interview")).toBeInTheDocument();
  });
});

describe("bahasa halaman kandidat", () => {
  it("memakai bahasa wawancara yang dikirim server", async () => {
    localStorage.clear(); // kandidat belum memilih apa pun
    Object.defineProperty(navigator, "language", { configurable: true, value: "en-US" });
    getCandidateInfo.mockResolvedValue({
      data: {
        session_id: 1,
        role_title: "Frontend Engineer",
        time_limit_min: 45,
        session_status: "ended",
        language: "id",
      },
    });
    renderPage();

    expect(await screen.findByText(DICTIONARIES.id.completeTitle)).toBeInTheDocument();
  });

  // Yang menanggung akibat salah bahasa adalah kandidat, bukan perekrut.
  it("pilihan kandidat mengalahkan setelan wawancara", async () => {
    localStorage.setItem("interview_language", "en");
    getCandidateInfo.mockResolvedValue({
      data: {
        session_id: 1,
        role_title: "Frontend Engineer",
        time_limit_min: 45,
        session_status: "ended",
        language: "id",
      },
    });
    renderPage();

    expect(await screen.findByText(DICTIONARIES.en.completeTitle)).toBeInTheDocument();
  });

  it("kandidat bisa mengganti bahasa dari header, termasuk di layar error", async () => {
    rejectWith(410);
    renderPage();

    expect(await screen.findByText(DICTIONARIES.id.errExpiredTitle)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /en/i }));

    expect(screen.getByText(DICTIONARIES.en.errExpiredTitle)).toBeInTheDocument();
  });
});
