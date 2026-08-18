import {
  parseConfidence,
  CONFIDENCE_LABELS,
  CONFIDENCE_DOT_CLASSES,
  CONFIDENCE_TEXT_CLASSES,
  CONFIDENCE_EXPLANATIONS,
  type Confidence,
} from "@/utils/constants";
import { cn } from "@/lib/utils";

interface ConfidenceIndicatorProps {
  confidence: Confidence | string | null | undefined;
  /** Number of probes behind the rating, when the API reports it. */
  probeCount?: number | null;
  className?: string;
}

/**
 * How sure the model is about a rating — and, when it is not sure, why.
 *
 * The previous implementation funnelled every unrecognised value into `LOW` and
 * painted it destructive red. A missing field therefore read as a finding about
 * the candidate: "we assessed this and the evidence was weak", when the truth
 * was "we never measured it". `unknown` is now its own state, visually neutral,
 * so absence is never mistaken for a negative result about a person.
 */
export default function ConfidenceIndicator({
  confidence,
  probeCount,
  className,
}: ConfidenceIndicatorProps) {
  const level = parseConfidence(confidence);
  const label = CONFIDENCE_LABELS[level];

  const probes =
    typeof probeCount === "number" && probeCount >= 0
      ? `${probeCount} probe${probeCount === 1 ? "" : "s"}`
      : null;

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs", CONFIDENCE_TEXT_CLASSES[level], className)}
      title={CONFIDENCE_EXPLANATIONS[level]}
    >
      <span className={cn("h-2 w-2 shrink-0 rounded-full", CONFIDENCE_DOT_CLASSES[level])} aria-hidden="true" />
      <span>
        Keyakinan: <span className="font-medium">{label}</span>
        {probes && <span className="text-muted-foreground"> · {probes}</span>}
      </span>
    </span>
  );
}

export { parseConfidence };
