import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePolling } from "./usePolling";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("usePolling — waiting must have an end", () => {
  it("polls on the interval while active", () => {
    const fn = vi.fn();
    renderHook(() => usePolling(fn, 5000, true));

    act(() => {
      vi.advanceTimersByTime(15_000);
    });

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not poll when inactive", () => {
    const fn = vi.fn();
    renderHook(() => usePolling(fn, 5000, false));

    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    expect(fn).not.toHaveBeenCalled();
  });

  it("gives up after the timeout instead of spinning forever", () => {
    const fn = vi.fn();
    const onTimeout = vi.fn();

    const { result } = renderHook(() =>
      usePolling(fn, 5000, true, { timeoutMs: 12_000, onTimeout })
    );

    expect(result.current.timedOut).toBe(false);

    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    expect(result.current.timedOut).toBe(true);
    expect(onTimeout).toHaveBeenCalledTimes(1);

    const callsAtTimeout = fn.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(fn).toHaveBeenCalledTimes(callsAtTimeout);
  });

  it("fires immediately when asked, rather than waiting out a full interval", () => {
    const fn = vi.fn();
    renderHook(() => usePolling(fn, 30_000, true, { immediate: true }));

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("skips polling while the tab is hidden", () => {
    const fn = vi.fn();
    const spy = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");

    renderHook(() => usePolling(fn, 5000, true));

    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    expect(fn).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
