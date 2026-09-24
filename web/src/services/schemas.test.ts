import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseContract,
  isContractError,
  ContractError,
  fitGapResponseSchema,
  portfolioResponseSchema,
  skillComparisonSchema,
} from "./schemas";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const report = (comparisons: unknown[]) => ({
  report: {
    id: 1,
    portfolio_id: 7,
    vacancy_id: 2,
    skill_comparisons: comparisons,
    culture_narrative: "…",
    overall_narrative: "…",
    generated_at: "2026-08-14T04:00:00Z",
  },
});

describe("contract boundary", () => {
  it("maps the API's expected_level onto the name the UI reads", () => {
    const parsed = skillComparisonSchema.parse({
      skill_label: "System Design",
      candidate_level: 4,
      expected_level: 3,
      result: "exceed",
      delta: 1,
    });

    expect(parsed.required_level).toBe(3);
  });

  it("prefers required_level once the API starts sending it", () => {
    const parsed = skillComparisonSchema.parse({
      skill_label: "System Design",
      candidate_level: 4,
      required_level: 5,
      expected_level: 3,
      result: "gap",
      delta: -1,
    });

    expect(parsed.required_level).toBe(5);
  });

  it("keeps a delta of zero instead of coercing it away", () => {
    const parsed = skillComparisonSchema.parse({
      skill_label: "Communication",
      candidate_level: 3,
      required_level: 3,
      result: "match",
      delta: 0,
    });

    expect(parsed.delta).toBe(0);
  });

  it("accepts fields it has never seen, so the API can move forward without us", () => {
    const parsed = parseContract(
      fitGapResponseSchema,
      report([
        {
          skill_label: "Communication",
          required_level: 3,
          candidate_level: 3,
          result: "match",
          delta: 0,
          some_future_field: { nested: true },
        },
      ]),
      "test"
    );

    expect(parsed.report.skill_comparisons).toHaveLength(1);
  });

  it("rejects a row that cannot state the bar, and says which field broke", () => {
    let caught: unknown;
    try {
      parseContract(
        fitGapResponseSchema,
        report([
          { skill_label: "Broken", candidate_level: 3, result: "match", delta: 0 },
        ]),
        "laporan fit/gap"
      );
    } catch (error) {
      caught = error;
    }

    expect(isContractError(caught)).toBe(true);
    const contractError = caught as ContractError;
    expect(contractError.context).toBe("laporan fit/gap");
    expect(contractError.issues.some((i) => i.path.includes("required_level"))).toBe(true);
  });

  it("normalises the two shapes the portfolio endpoint can answer with", () => {
    const generating = parseContract(portfolioResponseSchema, { status: "generating" }, "portfolio");
    expect("status" in generating).toBe(true);

    const ready = parseContract(
      portfolioResponseSchema,
      {
        portfolio: {
          id: 1,
          session_id: 1,
          generation_status: "complete",
          skills: [
            {
              id: 10,
              skill_label: "React",
              ai_level: "L3",
              ai_confidence: "High",
              competency_summary: "…",
            },
          ],
          overrides: [],
        },
      },
      "portfolio"
    );

    expect("portfolio" in ready).toBe(true);
    if ("portfolio" in ready) {
      expect(ready.portfolio.skills[0].ai_level).toBe(3);
      expect(ready.portfolio.skills[0].ai_confidence).toBe("high");
      expect(ready.portfolio.skills[0].evidence).toEqual([]);
    }
  });

  it("turns an untrustworthy level into null rather than a rating", () => {
    const parsed = skillComparisonSchema.parse({
      skill_label: "DevOps",
      required_level: 4,
      candidate_level: "not-a-level",
      result: "not_assessed",
      delta: null,
    });

    expect(parsed.candidate_level).toBeNull();
  });
});
