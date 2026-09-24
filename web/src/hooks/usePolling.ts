import { useEffect, useRef, useState } from "react";

interface PollingOptions {
  /** Stop polling after this long and report it, instead of spinning forever. */
  timeoutMs?: number;
  /** Fire once immediately instead of waiting a full interval. */
  immediate?: boolean;
  /** Called once when the timeout is reached. */
  onTimeout?: () => void;
}

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
