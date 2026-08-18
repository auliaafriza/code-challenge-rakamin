export const TIME_LIMIT_OPTIONS = [10, 30, 45, 60, 90] as const;

/** The product's unit of judgement about a person. Only these five values are real. */
export type Level = 1 | 2 | 3 | 4 | 5;

export const LEVELS: readonly Level[] = [1, 2, 3, 4, 5] as const;

export function isLevel(value: unknown): value is Level {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

/**
 * Parse an L-level coming from the API ("L3", 3, "3") into a Level.
 *
 * Returns `null` when the value cannot be trusted — missing, malformed, or out
 * of range. It NEVER falls back to a real level.
 *
 * This is deliberate. The previous implementation returned `1` for anything it
 * could not parse, which silently turned "we have no rating for this person"
 * into "this person is L1 Foundational" — the most damaging rating on the
 * scale, asserted about a candidate who never chose to be here and cannot see
 * or contest the result. An absent rating is not a rating.
 */
export function parseLevel(value: unknown): Level | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") {
    return isLevel(value) ? value : null;
  }

  if (typeof value !== "string") return null;

  const digits = value.replace(/\D/g, "");
  if (digits === "") return null;

  const parsed = Number.parseInt(digits, 10);
  return isLevel(parsed) ? parsed : null;
}

/** Display label for a level. Unknown levels render as an em dash, never as a level. */
export function formatLevel(value: unknown): string {
  const level = parseLevel(value);
  return level === null ? "—" : LEVEL_LABELS[level];
}

/** Human-readable reason a level is missing, for tooltips and screen readers. */
export const LEVEL_UNKNOWN_LABEL = "Tidak dinilai";

export const LEVEL_LABELS: Record<Level, string> = {
  1: "L1",
  2: "L2",
  3: "L3",
  4: "L4",
  5: "L5",
};

export const LEVEL_DESCRIPTIONS: Record<Level, string> = {
  1: "Foundational",
  2: "Functional",
  3: "Proficient",
  4: "Advanced",
  5: "Expert",
};

// L-badge colors. Colour alone never carries the level — the label always ships
// with it (WCAG 1.4.1).
export const LEVEL_BADGE_CLASSES: Record<Level, string> = {
  1: "bg-neutral-200 text-neutral-800",
  2: "bg-blue-100 text-blue-800",
  3: "bg-teal-100 text-teal-800",
  4: "bg-purple-100 text-purple-800",
  5: "bg-yellow-100 text-yellow-900",
};

export const LEVEL_BADGE_UNKNOWN_CLASS =
  "bg-neutral-100 text-neutral-500 border border-dashed border-neutral-300";

// ── Confidence ───────────────────────────────────────────────────────────────

/**
 * `unknown` is a first-class state, distinct from `low`.
 *
 * "We did not measure this" and "we measured this and the evidence was thin"
 * are different claims about a person. The UI must not collapse them.
 */
export type Confidence = "high" | "medium" | "low" | "unknown";

export function parseConfidence(value: unknown): Confidence {
  if (typeof value !== "string") return "unknown";
  const normalized = value.trim().toLowerCase();
  if (normalized === "high" || normalized === "medium" || normalized === "low") {
    return normalized;
  }
  return "unknown";
}

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: "Tinggi",
  medium: "Sedang",
  low: "Rendah",
  unknown: "Belum terukur",
};

export const CONFIDENCE_DOT_CLASSES: Record<Confidence, string> = {
  high: "bg-green-600",
  medium: "bg-amber-500",
  low: "bg-red-600",
  unknown: "bg-neutral-300 ring-1 ring-neutral-400",
};

export const CONFIDENCE_TEXT_CLASSES: Record<Confidence, string> = {
  high: "text-green-700",
  medium: "text-amber-700",
  low: "text-red-700",
  unknown: "text-neutral-500",
};

/** Why this confidence was assigned, mirroring Portfolios::Generator's rules. */
export const CONFIDENCE_EXPLANATIONS: Record<Confidence, string> = {
  high: "Diprobe 3 kali atau lebih dan skill tercakup penuh.",
  medium: "Diprobe 2 kali, atau cakupannya baru sebagian.",
  low: "Diprobe paling banyak 1 kali. Bukti tipis.",
  unknown: "Tingkat keyakinan tidak dilaporkan untuk skill ini.",
};

// ── Coverage state display ───────────────────────────────────────────────────

export const COVERAGE_STATE_LABELS: Record<string, string> = {
  not_yet: "not yet",
  initiated: "initiated",
  partial: "partial",
  covered: "covered",
};

export const COVERAGE_STATE_WIDTH: Record<string, number> = {
  not_yet: 0,
  initiated: 25,
  partial: 60,
  covered: 100,
};

export const COVERAGE_STATE_COLOR: Record<string, string> = {
  not_yet: "bg-neutral-200",
  initiated: "bg-blue-300",
  partial: "bg-teal-400",
  covered: "bg-teal-600",
};

// ── Fit/Gap result display ───────────────────────────────────────────────────

export const FIT_GAP_RESULT_LABELS: Record<string, string> = {
  match: "Match",
  gap: "Gap",
  exceed: "Exceeds",
  not_assessed: "Belum dinilai",
};

export const FIT_GAP_RESULT_CLASSES: Record<string, string> = {
  match: "text-green-800 bg-green-50 border border-green-200",
  gap: "text-amber-900 bg-amber-50 border border-amber-300",
  exceed: "text-teal-800 bg-teal-50 border border-teal-200",
  not_assessed: "text-neutral-600 bg-neutral-50 border border-dashed border-neutral-300",
};

/**
 * Text glyphs, not emoji. Emoji are announced by screen readers as their CLDR
 * name ("check mark button Match") and are the only differentiator for
 * colour-blind users when paired with colour alone. Every badge also carries
 * its text label.
 */
export const FIT_GAP_RESULT_GLYPHS: Record<string, string> = {
  match: "=",
  gap: "▼",
  exceed: "▲",
  not_assessed: "–",
};

// ── Interview language ───────────────────────────────────────────────────────

/**
 * The interview language was collected on the create form and then shown
 * nowhere else — not on the list, not on the detail page, and not even on the
 * edit form that claims to let you change it.
 *
 * That is not a cosmetic omission. The language decides which language the AI
 * interviewer speaks to the candidate in, so an assessor who picked the wrong
 * one at creation had no way to see the mistake and no way to correct it. The
 * first person to find out was the candidate, mid-interview.
 *
 * Keys mirror `Assessment::SUPPORTED_LANGUAGES` in api/app/models/assessment.rb.
 * If the two ever drift, the UI falls back to showing the raw code rather than
 * silently rendering nothing.
 */
export const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  id: "Bahasa Indonesia",
};

export const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "id", label: "Bahasa Indonesia" },
] as const;

export type LanguageCode = (typeof LANGUAGE_OPTIONS)[number]["value"];

/** Display a language code, never blank. */
export function formatLanguage(code?: string | null): string {
  if (!code) return "—";
  return LANGUAGE_LABELS[code] ?? code;
}

// ── Due dates ────────────────────────────────────────────────────────────────

/**
 * Assessments and vacancies had no expiry at all: an invite link generated once
 * stayed valid forever. For a product that records judgements about people,
 * an interview link with no end date is a standing invitation to a stale
 * process — and, under UU PDP, personal data collected with no defined
 * retention boundary.
 */
export function toDateInputValue(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // <input type="date"> wants a local-calendar YYYY-MM-DD, not a UTC slice.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Turn a date input value back into an ISO timestamp at end-of-day, local. */
export function fromDateInputValue(value?: string | null): string | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 23, 59, 59).toISOString();
}

export function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function isExpired(iso?: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && d.getTime() < Date.now();
}

/** Today, as a date-input min, so a due date cannot be set in the past. */
export function todayInputValue(): string {
  return toDateInputValue(new Date().toISOString());
}
