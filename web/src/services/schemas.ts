import { z } from "zod";
import { parseLevel, parseConfidence, type Confidence, type Level } from "@/utils/constants";

// ── Errors ───────────────────────────────────────────────────────────────────

export interface ContractIssue {
  path: string;
  message: string;
}

/** Thrown when a response does not match the contract. Carries what broke. */
export class ContractError extends Error {
  readonly issues: ContractIssue[];
  readonly context: string;

  constructor(context: string, issues: ContractIssue[]) {
    super(`Response contract mismatch (${context}): ${issues.map((i) => i.path).join(", ")}`);
    this.name = "ContractError";
    this.context = context;
    this.issues = issues;
  }
}

export function isContractError(error: unknown): error is ContractError {
  return error instanceof ContractError;
}

export function parseContract<T>(schema: z.ZodType<T>, data: unknown, context: string): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const issues: ContractIssue[] = result.error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join(".") : "(root)",
    message: issue.message,
  }));

  if (typeof console !== "undefined") {
    console.error(`[contract] ${context}`, issues);
  }

  throw new ContractError(context, issues);
}

// ── Primitives ───────────────────────────────────────────────────────────────

/** Accepts "L3" | 3 | "3" | null. Yields a Level, or null when untrustworthy. */
const levelValue = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v): Level | null => parseLevel(v));

/** Any string; unrecognised or absent values become the explicit "unknown" state. */
const confidenceValue = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v): Confidence => parseConfidence(v));

const isoDate = z.union([z.string(), z.null()]).optional();

// ── Portfolio ────────────────────────────────────────────────────────────────

export const portfolioSkillSchema = z
  .object({
    id: z.number(),
    skill_id: z.union([z.string(), z.number(), z.null()]).optional(),
    skill_label: z.string(),
    is_discovered: z.boolean().optional().default(false),
    ai_level: levelValue,
    ai_confidence: confidenceValue,
    evidence: z.array(z.string()).optional().default([]),
    evidence_turn_ids: z.array(z.number()).optional().default([]),
    competency_summary: z.string().optional().default(""),
    probe_count: z.union([z.number(), z.null()]).optional(),
    coverage_state: z.union([z.string(), z.null()]).optional(),
  })
  .transform((s) => ({ ...s, skill_id: s.skill_id == null ? null : String(s.skill_id) }));

export const assessorOverrideSchema = z.object({
  id: z.number(),
  portfolio_skill_id: z.number(),
  ai_level: levelValue,
  override_level: levelValue,
  assessor_notes: z.union([z.string(), z.null()]).optional().default(""),
  overridden_by: z.union([z.number(), z.null()]).optional(),
  overridden_by_email: z.union([z.string(), z.null()]).optional(),
  overridden_at: isoDate,
});

export const portfolioSchema = z.object({
  id: z.number(),
  session_id: z.number(),
  candidate_id: z.union([z.number(), z.null()]).optional(),
  generation_status: z.enum(["pending", "generating", "complete", "failed"]),
  generated_at: isoDate,
  generation_started_at: isoDate,
  /** Backend-computed: generation has been in flight longer than it should be. */
  stalled: z.boolean().optional().default(false),
  generation_error: z.union([z.string(), z.null()]).optional(),
  skills: z.array(portfolioSkillSchema).optional().default([]),
  overrides: z.array(assessorOverrideSchema).optional().default([]),
});

/** `GET /sessions/:id/portfolio` answers either a portfolio or a bare status. */
export const portfolioResponseSchema = z.union([
  z.object({ portfolio: portfolioSchema }),
  z.object({ status: z.string() }),
]);

// ── Fit/Gap ──────────────────────────────────────────────────────────────────

export const fitResultSchema = z.enum(["match", "gap", "exceed", "not_assessed"]);

export const skillComparisonSchema = z
  .object({
    skill_label: z.string(),
    skill_id: z.union([z.string(), z.number(), z.null()]).optional(),
    required_level: levelValue,
    expected_level: levelValue,
    candidate_level: levelValue,
    ai_level: levelValue,
    result: fitResultSchema,
    delta: z.union([z.number(), z.null()]).optional(),
    confidence: confidenceValue,
    probe_count: z.union([z.number(), z.null()]).optional(),
    is_override: z.boolean().optional().default(false),
    overridden_by_email: z.union([z.string(), z.null()]).optional(),
    overridden_at: isoDate,
  })
  .transform((c) => {
    const required = c.required_level ?? c.expected_level;
    return {
      skill_label: c.skill_label,
      skill_id: c.skill_id == null ? null : String(c.skill_id),
      required_level: required,
      candidate_level: c.candidate_level,
      /** The model's own rating, before any human correction. */
      ai_level: c.ai_level,
      result: c.result,
      delta: c.delta ?? null,
      confidence: c.confidence,
      probe_count: c.probe_count ?? null,
      is_override: c.is_override,
      overridden_by_email: c.overridden_by_email ?? null,
      overridden_at: c.overridden_at ?? null,
    };
  })
  .refine((c) => c.required_level !== null, {
    message:
      "required_level is missing — the report cannot state the bar this candidate is measured against",
    path: ["required_level"],
  });

export const fitGapReportSchema = z.object({
  id: z.number(),
  portfolio_id: z.number(),
  vacancy_id: z.number(),
  skill_comparisons: z.array(skillComparisonSchema),
  culture_narrative: z.union([z.string(), z.null()]).optional(),
  overall_narrative: z.union([z.string(), z.null()]).optional(),
  /** True when the narrative came from the deterministic fallback, not the model. */
  narrative_is_fallback: z.boolean().optional().default(false),
  generated_at: isoDate,
});

export const fitGapResponseSchema = z.object({ report: fitGapReportSchema });

export type PortfolioSkill = z.infer<typeof portfolioSkillSchema>;
export type AssessorOverride = z.infer<typeof assessorOverrideSchema>;
export type Portfolio = z.infer<typeof portfolioSchema>;
export type SkillComparison = z.infer<typeof skillComparisonSchema>;
export type FitGapReport = z.infer<typeof fitGapReportSchema>;
export type FitResult = z.infer<typeof fitResultSchema>;
