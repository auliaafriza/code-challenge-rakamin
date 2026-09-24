import { describe, it, expect, vi, afterEach } from "vitest";
import {
  toDateInputValue,
  fromDateInputValue,
  isExpired,
  formatLanguage,
  LANGUAGE_LABELS,
} from "./constants";

describe("due date conversion", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips a date without drifting across a timezone boundary", () => {
    const iso = fromDateInputValue("2026-08-31");
    expect(iso).not.toBeNull();
    expect(toDateInputValue(iso)).toBe("2026-08-31");
  });

  it("stores the end of the chosen day, not the start", () => {
    const iso = fromDateInputValue("2026-08-31")!;
    const d = new Date(iso);
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
  });

  it("treats an empty or malformed value as no due date at all", () => {
    expect(fromDateInputValue("")).toBeNull();
    expect(fromDateInputValue(null)).toBeNull();
    expect(fromDateInputValue("not-a-date")).toBeNull();
    expect(toDateInputValue(undefined)).toBe("");
    expect(toDateInputValue("garbage")).toBe("");
  });

  it("never reports a missing due date as expired", () => {
    expect(isExpired(null)).toBe(false);
    expect(isExpired(undefined)).toBe(false);
    expect(isExpired("")).toBe(false);
  });

  it("compares against real time in both directions", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T12:00:00Z"));

    expect(isExpired("2026-08-17T23:59:59Z")).toBe(true);
    expect(isExpired("2026-08-19T23:59:59Z")).toBe(false);
  });
});

describe("language display", () => {
  it("shows a human label for every code the backend accepts", () => {
    // Mirrors Assessment::SUPPORTED_LANGUAGES.
    expect(Object.keys(LANGUAGE_LABELS).sort()).toEqual(["en", "id"]);
    expect(formatLanguage("id")).toBe("Bahasa Indonesia");
    expect(formatLanguage("en")).toBe("English");
  });

  it("falls back to the raw code rather than rendering nothing", () => {
    expect(formatLanguage("ja")).toBe("ja");
  });

  it("shows an em dash when there is genuinely no value", () => {
    expect(formatLanguage(null)).toBe("—");
    expect(formatLanguage(undefined)).toBe("—");
  });
});
