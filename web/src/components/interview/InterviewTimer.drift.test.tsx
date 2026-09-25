import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import InterviewTimer from "./InterviewTimer";
import { LanguageProvider } from "@/i18n/LanguageProvider";

beforeEach(() => {
  localStorage.setItem("interview_language", "id");
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe("timer tetap sejalan dengan jam sungguhan", () => {
  // Browser melambatkan timer di tab yang tidak aktif. Implementasi yang
  // mengurangi satu detik per tick kehilangan waktu saat kandidat berpindah
  // tab, lalu sesinya berakhir lebih awal daripada angka di layarnya.
  //
  // Test ini menjalankan jam maju 5 menit sementara hanya satu tick yang
  // sempat berjalan — persis yang terjadi di tab latar belakang.
  it("menyusul setelah tab kembali aktif", async () => {
    render(
      <LanguageProvider>
        <InterviewTimer totalSeconds={600} running={true} />
      </LanguageProvider>
    );

    expect(screen.getByRole("timer")).toHaveTextContent("10:00");

    await act(async () => {
      // 299 detik + 1 detik dari tick di bawah = tepat 5 menit.
      vi.setSystemTime(Date.now() + 299_000);
      await vi.advanceTimersByTimeAsync(1000); // satu tick saja
    });

    expect(screen.getByRole("timer")).toHaveTextContent("05:00");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "300");
  });

  it("mengakhiri sesi kalau waktunya habis saat tab tidak aktif", async () => {
    const onExpired = vi.fn();
    render(
      <LanguageProvider>
        <InterviewTimer totalSeconds={120} running={true} onExpired={onExpired} />
      </LanguageProvider>
    );

    await act(async () => {
      vi.setSystemTime(Date.now() + 600_000);
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("timer")).toHaveTextContent("00:00");
  });
});
