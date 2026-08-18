import { z } from "zod";
import { parseLevel, parseConfidence, type Confidence, type Level } from "@/utils/constants";

/**
 * The contract between this app and the API, declared once, enforced at runtime.
 *
 * Why this file exists
 * -------------------
 * `src/types/index.ts` was hand-written and never confronted with a real
 * response. It declared `required_level`; the API sends `expected_level`. Nothing
 * failed — TypeScript is erased at runtime, `LEVEL_LABELS[undefined]` is
 * `undefined`, and React renders `undefined` as an empty string. So the Required
 * column of the fit/gap report — the number a hiring manager compares a person
 * against — rendered blank on every row, and looked like a design choice.
 *
 * A hand-written type cannot catch that. A runtime schema can. Every response we
 * depend on is parsed here; anything that does not match raises a `ContractError`
 * the UI surfaces explicitly, instead of degrading into blank cells.
 *
 * Two properties this file must keep:
 *   1. Forward-compatible — unknown fields are stripped, never rejected. The API
 *      can add fields without breaking this client.
 *   2. Backward-compatible — where the API is mid-rename, we accept both names
 *      and normalise here, so exactly one shape reaches the components.
 */

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

/**
 * Parse `data` against `schema`, or throw a `ContractError`.
 *
 * `context` names the call site ("fit/gap report") so the UI can tell the user
 * which screen has bad data, and the log can tell an engineer which endpoint.
 */
export function parseContract<T>(schema: z.ZodType<T>, data: unknown, context: string): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const issues: ContractIssue[] = result.error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join(".") : "(root)",
    message: issue.message,
  }));

  // Surface to observability before throwing — a contract drift in production is
  // an engineering signal, not just a user-facing error.
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

/**
 * One row of the decision surface.
 *
 * `required_level` accepts the API's legacy `expected_level` and normalises it.
 * That rename is the whole of P0-1: keeping the adapter here means the component
 * reads exactly one name, and the test below locks the mapping so the next
 * rename fails loudly instead of blanking a column.
 */
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
      // `delta` may legitimately be 0 — never coerce it through a truthiness check.
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

// ── Inferred types — the single source of truth for the components ───────────

export type PortfolioSkill = z.infer<typeof portfolioSkillSchema>;
export type AssessorOverride = z.infer<typeof assessorOverrideSchema>;
export type Portfolio = z.infer<typeof portfolioSchema>;
export type SkillComparison = z.infer<typeof skillComparisonSchema>;
export type FitGapReport = z.infer<typeof fitGapReportSchema>;
export type FitResult = z.infer<typeof fitResultSchema>;
