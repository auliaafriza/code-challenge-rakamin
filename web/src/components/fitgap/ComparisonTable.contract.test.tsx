import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { z } from "zod";
import ComparisonTable from "./ComparisonTable";
import { skillComparisonSchema } from "@/services/schemas";

const parse = (raw: unknown[]) => z.array(skillComparisonSchema).parse(raw);

const row = (label: string) => screen.getByText(label).closest("tr")!;

describe("Fit/Gap comparison table — the decision surface", () => {
  it("states the level the role requires, even when the API still calls it expected_level", () => {
    const legacy = parse([
      {
        skill_label: "System Design",
        skill_id: "sk-eng-014",
        candidate_level: 4,
        expected_level: 3,
        result: "exceed",
        delta: 1,
        confidence: "high",
      },
    ]);

    render(<ComparisonTable comparisons={legacy} />);

    expect(row("System Design")).toHaveTextContent("L3");
  });

  it("shows that a human corrected the model, and who", () => {
    const comparisons = parse([
      {
        skill_label: "Security Engineering",
        skill_id: "sk-eng-010",
        required_level: 3,
        candidate_level: 4,
        ai_level: 2,
        result: "exceed",
        delta: 1,
        confidence: "medium",
        is_override: true,
        overridden_by_email: "assessor@rakamin.test",
        overridden_at: "2026-08-14T04:00:00Z",
      },
    ]);

    render(<ComparisonTable comparisons={comparisons} />);

    const target = row("Security Engineering");
    expect(within(target).getByTitle(/override/i)).toBeInTheDocument();
    // The correction itself, not just a marker that one happened.
    expect(target).toHaveTextContent("AI L2");
    expect(target).toHaveTextContent("L4");
    expect(target).toHaveTextContent("assessor@rakamin.test");

    expect(screen.getByText(/dikoreksi assessor/i)).toBeInTheDocument();
  });

  it("still marks an override whose author was never recorded", () => {
    const comparisons = parse([
      {
        skill_label: "Testing & QA",
        required_level: 3,
        candidate_level: 4,
        ai_level: 2,
        result: "exceed",
        delta: 1,
        confidence: "low",
        is_override: true,
        overridden_by_email: null,
        overridden_at: null,
      },
    ]);

    render(<ComparisonTable comparisons={comparisons} />);

    const target = row("Testing & QA");
    expect(within(target).getByTitle(/override/i)).toBeInTheDocument();
    expect(target).not.toHaveTextContent("Penilaian AI");
  });

  it("does not advertise an override legend when nothing was overridden", () => {
    const comparisons = parse([
      {
        skill_label: "RESTful API Design",
        required_level: 3,
        candidate_level: 3,
        ai_level: 3,
        result: "match",
        delta: 0,
        confidence: "high",
      },
    ]);

    render(<ComparisonTable comparisons={comparisons} />);

    expect(screen.queryByText(/dikoreksi assessor/i)).not.toBeInTheDocument();
  });

  it("surfaces confidence, so a one-probe guess does not read like a four-probe finding", () => {
    const comparisons = parse([
      {
        skill_label: "Cloud Infrastructure",
        required_level: 3,
        candidate_level: 3,
        result: "match",
        delta: 0,
        confidence: "low",
        probe_count: 1,
      },
      {
        skill_label: "Database Design & SQL",
        required_level: 3,
        candidate_level: 3,
        result: "match",
        delta: 0,
        confidence: "high",
        probe_count: 4,
      },
    ]);

    render(<ComparisonTable comparisons={comparisons} />);

    const thin = row("Cloud Infrastructure");
    const solid = row("Database Design & SQL");

    expect(thin).toHaveTextContent(/rendah/i);
    expect(thin).toHaveTextContent("1 probe");
    expect(solid).toHaveTextContent(/tinggi/i);
    expect(solid).toHaveTextContent("4 probes");

    // Both are "Match L3". The caveat is the only thing distinguishing them.
    expect(thin.textContent).not.toEqual(solid.textContent);
  });

  it("reports missing confidence as unmeasured, not as low", () => {
    const comparisons = parse([
      {
        skill_label: "Mentoring",
        required_level: 2,
        candidate_level: 2,
        result: "match",
        delta: 0,
        confidence: null,
      },
    ]);

    render(<ComparisonTable comparisons={comparisons} />);

    const target = row("Mentoring");
    expect(target).toHaveTextContent(/belum terukur/i);
    expect(target).not.toHaveTextContent(/rendah/i);
  });

  it("distinguishes a skill that was never probed from a skill rated L1", () => {
    const comparisons = parse([
      {
        skill_label: "DevOps & CI/CD",
        required_level: 4,
        candidate_level: null,
        result: "not_assessed",
        delta: null,
        confidence: null,
      },
    ]);

    render(<ComparisonTable comparisons={comparisons} />);

    const target = row("DevOps & CI/CD");
    expect(target).toHaveTextContent("—");
    expect(target).toHaveTextContent(/belum dinilai/i);
    expect(target).not.toHaveTextContent("L1");
  });

  it("warns when a gap rests on thin evidence", () => {
    const comparisons = parse([
      {
        skill_label: "Leadership & Ownership",
        required_level: 4,
        candidate_level: 2,
        result: "gap",
        delta: -2,
        confidence: "low",
        probe_count: 1,
      },
    ]);

    render(<ComparisonTable comparisons={comparisons} />);

    const note = screen.getByRole("note");
    expect(note).toHaveTextContent(/Leadership & Ownership/);
    expect(note).toHaveTextContent(/sesi lanjutan/i);
  });

  it("refuses a payload that cannot state the bar at all", () => {
    expect(() =>
      parse([
        {
          skill_label: "Broken",
          candidate_level: 3,
          result: "match",
          delta: 0,
        },
      ])
    ).toThrow();
  });

  it("renders an empty vacancy as an explained empty state", () => {
    render(<ComparisonTable comparisons={[]} />);
    expect(screen.getByText(/belum punya skill yang bisa dibandingkan/i)).toBeInTheDocument();
  });
});
