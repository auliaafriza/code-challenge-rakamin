import {
  formatLevel,
  FIT_GAP_RESULT_LABELS,
  FIT_GAP_RESULT_CLASSES,
  FIT_GAP_RESULT_GLYPHS,
  CONFIDENCE_LABELS,
  parseConfidence,
} from "@/utils/constants";
import { cn } from "@/lib/utils";
import ConfidenceIndicator from "@/components/portfolio/ConfidenceIndicator";
import type { SkillComparison } from "@/services/schemas";

interface ComparisonTableProps {
  comparisons: SkillComparison[];
}

/**
 * The decision surface: the table a hiring manager reads to decide whether a
 * person clears the bar for a role.
 *
 * Three things this table must never do again, each of which it used to do:
 *
 *   1. Render an empty Required cell. It read `required_level` while the API
 *      sent `expected_level`, so every row showed a candidate level with no bar
 *      to compare it against — indistinguishable from a design choice.
 *   2. Claim a provenance marker it never showed. The legend promised
 *      "human override applied" on every report while the flag was dropped
 *      server-side, so an assessor's professional correction was invisible and
 *      the model's guess and the human's judgement looked identical.
 *   3. Drop confidence. "L4 from one probe" and "L4 from four deep probes"
 *      rendered pixel-for-pixel the same, so the only caveat that matters at the
 *      moment of decision was discarded exactly at the moment of decision.
 */

function formatDelta(delta: number | null): string {
  // `delta` can legitimately be 0. A truthiness check silently drops it.
  if (delta === null || delta === 0) return "";
  return delta > 0 ? ` +${delta}` : ` −${Math.abs(delta)}`;
}

function ResultBadge({ comparison }: { comparison: SkillComparison }) {
  const label = FIT_GAP_RESULT_LABELS[comparison.result];
  const classes = FIT_GAP_RESULT_CLASSES[comparison.result];
  const glyph = FIT_GAP_RESULT_GLYPHS[comparison.result];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        classes
      )}
    >
      <span aria-hidden="true">{glyph}</span>
      {label}
      {formatDelta(comparison.delta)}
    </span>
  );
}

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

/** Who produced this rating, and — when a human corrected it — what they changed. */
function Provenance({ comparison }: { comparison: SkillComparison }) {
  if (comparison.candidate_level === null) {
    return <span className="text-xs text-muted-foreground">Tidak diprobe</span>;
  }

  if (!comparison.is_override) {
    return <span className="text-xs text-muted-foreground">Penilaian AI</span>;
  }

  const who = comparison.overridden_by_email ?? "assessor (tidak diketahui)";
  const when = formatWhen(comparison.overridden_at);

  return (
    <span
      className="inline-flex flex-wrap items-center gap-1 text-xs text-teal-800"
      title={`Diubah oleh assessor (override) — ${who}${when ? ` pada ${when}` : ""}`}
    >
      <span aria-hidden="true">✎</span>
      <span>
        AI {formatLevel(comparison.ai_level)} → {formatLevel(comparison.candidate_level)}
      </span>
      <span className="text-muted-foreground">· {who}</span>
    </span>
  );
}

export default function ComparisonTable({ comparisons }: ComparisonTableProps) {
  const matchCount = comparisons.filter((c) => c.result === "match").length;
  const gapCount = comparisons.filter((c) => c.result === "gap").length;
  const exceedCount = comparisons.filter((c) => c.result === "exceed").length;
  const notAssessedCount = comparisons.filter((c) => c.result === "not_assessed").length;

  const hasOverride = comparisons.some((c) => c.is_override);

  // A negative conclusion drawn from thin evidence is the most consequential
  // thing this report can get wrong about a person. Name it explicitly.
  const thinGaps = comparisons.filter(
    (c) => c.result === "gap" && (c.confidence === "low" || c.confidence === "unknown")
  );

  if (comparisons.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Lowongan ini belum punya skill yang bisa dibandingkan. Tambahkan skill pada vacancy, lalu
        jalankan ulang analisis.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[34rem] text-sm">
          <caption className="sr-only">
            Perbandingan level kandidat terhadap kebutuhan role, beserta asal penilaian dan tingkat
            keyakinannya.
          </caption>
          <thead>
            <tr className="border-b bg-muted/50">
              <th scope="col" className="px-3 py-2.5 text-left font-medium sm:px-4">
                Skill
              </th>
              <th scope="col" className="px-3 py-2.5 text-center font-medium sm:px-4">
                Dibutuhkan
              </th>
              <th scope="col" className="px-3 py-2.5 text-center font-medium sm:px-4">
                Kandidat
              </th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium sm:px-4">
                Keyakinan
              </th>
              <th scope="col" className="px-3 py-2.5 text-center font-medium sm:px-4">
                Hasil
              </th>
            </tr>
          </thead>
          <tbody>
            {comparisons.map((c) => (
              <tr key={c.skill_id ?? c.skill_label} className="border-b align-top last:border-0">
                <th scope="row" className="px-3 py-2.5 text-left font-medium break-words sm:px-4">
                  {c.skill_label}
                </th>

                <td className="px-3 py-2.5 text-center tabular-nums sm:px-4">
                  {formatLevel(c.required_level)}
                </td>

                <td className="px-3 py-2.5 text-center sm:px-4">
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="tabular-nums">{formatLevel(c.candidate_level)}</span>
                    <Provenance comparison={c} />
                  </div>
                </td>

                <td className="px-3 py-2.5 sm:px-4">
                  <ConfidenceIndicator confidence={c.confidence} probeCount={c.probe_count} />
                </td>

                <td className="px-3 py-2.5 text-center sm:px-4">
                  <ResultBadge comparison={c} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {thinGaps.length > 0 && (
        <div
          role="note"
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          <span className="font-semibold">Perhatian.</span> {thinGaps.length} gap ditandai dari bukti
          yang tipis ({thinGaps.map((c) => c.skill_label).join(", ")}). Keyakinannya{" "}
          {thinGaps.map((c) => CONFIDENCE_LABELS[parseConfidence(c.confidence)].toLowerCase()).join("/")},
          jadi kesimpulan negatif di sini belum layak dipakai sebagai dasar keputusan. Jadwalkan sesi
          lanjutan sebelum menolak kandidat karena skill ini.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {matchCount > 0 && <span>Match: {matchCount}</span>}
        {gapCount > 0 && <span>Gap: {gapCount}</span>}
        {exceedCount > 0 && <span>Exceeds: {exceedCount}</span>}
        {notAssessedCount > 0 && <span>Belum dinilai: {notAssessedCount}</span>}
        {/* Shown only when the marker is actually present — a legend that
            describes something absent is a claim the report cannot back. */}
        {hasOverride && <span className="ml-auto">✎ = penilaian dikoreksi assessor</span>}
      </div>
    </div>
  );
}
