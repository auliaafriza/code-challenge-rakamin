import { useEffect, useRef, useState } from "react";

interface PollingOptions {
  /** Stop polling after this long and report it, instead of spinning forever. */
  timeoutMs?: number;
  /** Fire once immediately instead of waiting a full interval. */
  immediate?: boolean;
  /** Called once when the timeout is reached. */
  onTimeout?: () => void;
}

/**
 * Poll `fn` while `active`, with an end condition.
 *
 * The previous implementation had none. A portfolio stuck in `pending` polled
 * every five seconds forever, under a message reading "This takes about 2
 * minutes" — while the only button that could recover it was rendered solely for
 * the `failed` state. An assessor could watch that spinner for an hour with no
 * way out of the product.
 *
 * It also polled while the tab was hidden, burning quota to update a screen
 * nobody was looking at.
 */
export function usePolling(
  fn: () => void | Promise<void>,
  intervalMs: number,
  active: boolean,
  options: PollingOptions = {}
) {
  const { timeoutMs, immediate = false, onTimeout } = options;

  const fnRef = useRef(fn);
  fnRef.current = fn;

  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  const [timedOut, setTimedOut] = useState(false);

  // A fresh activation is a fresh deadline.
  useEffect(() => {
    if (active) setTimedOut(false);
  }, [active]);

  useEffect(() => {
    if (!active || timedOut) return;

    const startedAt = Date.now();
    let cancelled = false;
    // The React state update is asynchronous, but the interval is not: without a
    // synchronous latch the deadline branch fires again on every subsequent tick
    // before the effect re-runs, and `onTimeout` is called more than once.
    let expired = false;

    const tick = () => {
      if (cancelled || expired) return;

      if (timeoutMs !== undefined && Date.now() - startedAt >= timeoutMs) {
        expired = true;
        setTimedOut(true);
        onTimeoutRef.current?.();
        return;
      }

      // Don't poll into a hidden tab; the next visible tick will catch up.
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;

      void fnRef.current();
    };

    if (immediate) tick();

    const id = setInterval(tick, intervalMs);

    // Resume promptly when the user comes back rather than waiting out the interval.
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, active, timedOut, immediate, timeoutMs]);

  return { timedOut };
}
