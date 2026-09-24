import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ToastProvider, useToast } from "./toast";

function Harness({ onReady }: { onReady: (api: ReturnType<typeof useToast>) => void }) {
  const toast = useToast();
  onReady(toast);
  return null;
}

describe("ToastProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    let api!: ReturnType<typeof useToast>;
    render(
      <ToastProvider>
        <Harness onReady={(t) => (api = t)} />
      </ToastProvider>
    );
    return () => api;
  }

  it("announces a success message to assistive technology", () => {
    const toast = setup();
    act(() => {
      toast().success("Perubahan assessment tersimpan.");
    });

    const live = screen.getByRole("status");
    expect(live).toHaveTextContent("Perubahan assessment tersimpan.");
    expect(live).toHaveAttribute("aria-live", "polite");
  });

  it("keeps an error on screen longer than a success", () => {
    const toast = setup();

    act(() => {
      toast().success("Tersimpan.");
    });
    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(screen.queryByText("Tersimpan.")).toBeNull();

    act(() => {
      toast().error("Gagal menyimpan perubahan.");
    });
    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(screen.getByText("Gagal menyimpan perubahan.")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByText("Gagal menyimpan perubahan.")).toBeNull();
  });

  it("shows several messages at once instead of replacing the last one", () => {
    const toast = setup();
    act(() => {
      toast().success("Pertama.");
      toast().error("Kedua.");
    });

    expect(screen.getByText("Pertama.")).toBeTruthy();
    expect(screen.getByText("Kedua.")).toBeTruthy();
  });
});
