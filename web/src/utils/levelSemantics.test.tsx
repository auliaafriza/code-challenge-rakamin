import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { parseLevel, parseConfidence, formatLevel } from "@/utils/constants";
import ConfidenceIndicator from "@/components/portfolio/ConfidenceIndicator";
import LevelBadge from "@/components/portfolio/LevelBadge";

/**
 * The L1–L5 scale is this product's unit of judgement about a person, and
 * confidence is the caveat attached to it. These tests ask one question of the
 * presentation layer: when the datum is absent or malformed, does the UI say so,
 * or does it quietly assert something about the candidate anyway?
 */

describe("parseLevel — absent data must not become a rating", () => {
  it("returns null rather than L1 when the level is missing", () => {
    // The old implementation returned 1 for anything unparseable. L1 is
    // "Foundational" — the most damaging rating on the scale — asserted about a
    // person who never chose to be assessed and cannot see the result.
    expect(parseLevel("")).toBeNull();
    expect(parseLevel(null)).toBeNull();
    expect(parseLevel(undefined)).toBeNull();
    expect(parseLevel("unknown")).toBeNull();
  });

  it("does not crash on a null or non-string level", () => {
    expect(() => parseLevel(null)).not.toThrow();
    expect(() => parseLevel({} as unknown)).not.toThrow();
    expect(parseLevel({} as unknown)).toBeNull();
  });

  it("rejects levels outside the scale instead of inventing a badge", () => {
    expect(parseLevel(0)).toBeNull();
    expect(parseLevel(7)).toBeNull();
    expect(parseLevel(-2)).toBeNull();
    expect(parseLevel("L9")).toBeNull();
  });

  it("accepts the shapes the API actually sends", () => {
    expect(parseLevel("L3")).toBe(3);
    expect(parseLevel(3)).toBe(3);
    expect(parseLevel("3")).toBe(3);
  });

  it("formats an unknown level as an em dash, never as a level", () => {
    expect(formatLevel(null)).toBe("—");
    expect(formatLevel("garbage")).toBe("—");
    expect(formatLevel(4)).toBe("L4");
  });
});

describe("LevelBadge — an unrated skill is labelled, not blank and not L1", () => {
  it("labels a missing rating accessibly", () => {
    render(<LevelBadge level={null} />);
    expect(screen.getByLabelText(/tidak dinilai/i)).toBeInTheDocument();
    expect(screen.queryByText("L1")).not.toBeInTheDocument();
  });

  it("keeps the level readable without relying on colour", () => {
    render(<LevelBadge level={4} />);
    // Text label present, so the badge survives greyscale and colour-blindness.
    expect(screen.getByText("L4")).toBeInTheDocument();
    expect(screen.getByLabelText(/L4 — Advanced/)).toBeInTheDocument();
  });

  it("does not render an unstyled empty badge for an out-of-range level", () => {
    render(<LevelBadge level={7} />);
    expect(screen.getByLabelText(/tidak dinilai/i)).toBeInTheDocument();
  });
});

describe("ConfidenceIndicator — absence is not the same as low confidence", () => {
  it("reports missing confidence as unmeasured", () => {
    render(<ConfidenceIndicator confidence={undefined} />);
    expect(screen.getByText(/belum terukur/i)).toBeInTheDocument();
    expect(screen.queryByText(/rendah/i)).not.toBeInTheDocument();
  });

  it("reports an unrecognised value as unmeasured rather than guessing", () => {
    render(<ConfidenceIndicator confidence="somewhat sure" />);
    expect(screen.getByText(/belum terukur/i)).toBeInTheDocument();
  });

  it("normalises the capitalisation the model actually produces", () => {
    // Verified, not assumed: the original implementation already lower-cased its
    // input, so capitalised model output was handled correctly all along. The
    // test stays as a regression guard for behaviour that is genuinely right.
    render(<ConfidenceIndicator confidence="High" />);
    expect(screen.getByText(/tinggi/i)).toBeInTheDocument();
    expect(parseConfidence("  MEDIUM ")).toBe("medium");
  });

  it("shows how much probing sits behind the rating", () => {
    render(<ConfidenceIndicator confidence="low" probeCount={1} />);
    expect(screen.getByText(/1 probe/)).toBeInTheDocument();
  });
});
