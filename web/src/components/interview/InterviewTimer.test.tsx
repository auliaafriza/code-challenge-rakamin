import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import InterviewTimer from "./InterviewTimer";
import { LanguageProvider } from "@/i18n/LanguageProvider";

function renderTimer(props: Partial<React.ComponentProps<typeof InterviewTimer>> = {}) {
  return render(
    <LanguageProvider>
      <InterviewTimer totalSeconds={600} running={true} {...props} />
    </LanguageProvider>
  );
}

beforeEach(() => {
  localStorage.setItem("interview_language", "id");
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

const advance = async (seconds: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(seconds * 1000);
  });
};

describe("waktu yang ditampilkan", () => {
  it("mulai dari durasi penuh", () => {
    renderTimer({ totalSeconds: 600 });
    expect(screen.getByRole("timer")).toHaveTextContent("10:00");
  });

  it("berkurang seiring waktu", async () => {
    renderTimer({ totalSeconds: 600 });
    await advance(65);
    expect(screen.getByRole("timer")).toHaveTextContent("08:55");
  });

  it("berhenti saat tidak berjalan", async () => {
    renderTimer({ totalSeconds: 600, running: false });
    await advance(30);
    expect(screen.getByRole("timer")).toHaveTextContent("10:00");
  });

  it("memanggil onExpired tepat sekali saat habis", async () => {
    const onExpired = vi.fn();
    renderTimer({ totalSeconds: 2, onExpired });

    await advance(5);

    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it("tidak pernah menampilkan waktu negatif", async () => {
    renderTimer({ totalSeconds: 1 });
    await advance(10);
    expect(screen.getByRole("timer")).not.toHaveTextContent("-");
  });
});

describe("progres", () => {
  it("melaporkan waktu yang sudah berjalan, bukan sisanya", async () => {
    renderTimer({ totalSeconds: 600 });
    const bar = screen.getByRole("progressbar");

    expect(bar).toHaveAttribute("aria-valuenow", "0");
    await advance(120);
    expect(bar).toHaveAttribute("aria-valuenow", "120");
  });

  it("tidak melampaui durasi total", async () => {
    renderTimer({ totalSeconds: 3 });
    await advance(10);

    const bar = screen.getByRole("progressbar");
    expect(Number(bar.getAttribute("aria-valuenow"))).toBeLessThanOrEqual(3);
  });
});

describe("kapan boleh mendesak", () => {
  // Hitung mundur merah membuat kandidat memangkas jawaban — lalu dinilai
  // "bukti tidak cukup" oleh model. Peringatan ditahan sampai dua menit
  // terakhir, cukup untuk menutup satu jawaban.
  it("tenang selama masih ada lebih dari dua menit", async () => {
    const { container } = renderTimer({ totalSeconds: 600 });
    await advance(360); // sisa 4 menit

    expect(container.querySelector(".text-amber-600")).toBeNull();
    expect(container.querySelector(".text-destructive")).toBeNull();
  });

  it("baru memperingatkan di dua menit terakhir", async () => {
    const { container } = renderTimer({ totalSeconds: 600 });
    await advance(490); // sisa 110 detik

    expect(container.querySelector(".text-amber-600")).not.toBeNull();
  });

  // Tidak ada keadaan yang boleh memakai warna destructive atau animasi
  // berdenyut: keduanya membaca sebagai "kamu bermasalah", bukan "waktu hampir
  // habis".
  it("tidak pernah memakai warna gawat atau denyut", async () => {
    const { container } = renderTimer({ totalSeconds: 60 });
    await advance(59);

    expect(container.querySelector(".text-destructive")).toBeNull();
    expect(container.querySelector(".animate-pulse")).toBeNull();
  });
});
