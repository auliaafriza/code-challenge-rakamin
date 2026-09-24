import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import LevelBadge from "./LevelBadge";
import ConfidenceIndicator from "./ConfidenceIndicator";
import OverridePanel from "./OverridePanel";
import { Zap, Quote } from "lucide-react";
import { parseLevel, parseConfidence } from "@/utils/constants";
import type { PortfolioSkill, AssessorOverride } from "@/services/schemas";

interface SkillPortfolioCardProps {
  skill: PortfolioSkill;
  override?: AssessorOverride;
  onOverrideSaved: (override: AssessorOverride) => void;
  /** Route params, so each quote can link back to where it was said. */
  assessmentId?: string;
  sessionId?: string;
}

export default function SkillPortfolioCard({
  skill,
  override,
  onOverrideSaved,
  assessmentId,
  sessionId,
}: SkillPortfolioCardProps) {
  const aiLevel = parseLevel(skill.ai_level);
  const effectiveLevel = override?.override_level ?? aiLevel;
  const confidence = parseConfidence(skill.ai_confidence);

  const transcriptBase =
    assessmentId && sessionId
      ? `/assessments/${assessmentId}/sessions/${sessionId}/transcript`
      : null;

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <LevelBadge level={effectiveLevel} />
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold break-words">{skill.skill_label}</span>
                {skill.is_discovered && (
                  <span className="flex items-center gap-0.5 text-xs text-amber-700">
                    <Zap className="h-3 w-3" aria-hidden="true" /> Ditemukan AI
                  </span>
                )}
              </div>
              <ConfidenceIndicator
                confidence={skill.ai_confidence}
                probeCount={skill.probe_count}
              />
            </div>
          </div>
          <OverridePanel skill={skill} existingOverride={override} onSaved={onOverrideSaved} />
        </div>

        {confidence === "low" && (
          <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Baru dieksplorasi sekilas. Keyakinannya rendah — kalau skill ini menentukan keputusan,
            jadwalkan sesi khusus sebelum menyimpulkan.
          </div>
        )}

        {confidence === "unknown" && (
          <div className="rounded border border-dashed border-neutral-300 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
            Tingkat keyakinan tidak dilaporkan untuk skill ini. Perlakukan levelnya sebagai belum
            terverifikasi, bukan sebagai temuan yang lemah.
          </div>
        )}

        {skill.evidence.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Bukti dari wawancara
            </span>
            <ul className="space-y-1.5">
              {skill.evidence.map((quote, i) => {
                const turnId = skill.evidence_turn_ids?.[i];
                return (
                  <li key={i} className="flex gap-1.5 text-sm">
                    <Quote className="mt-1 h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="break-words">
                      <span className="italic">“{quote}”</span>{" "}
                      {transcriptBase && turnId !== undefined && (
                        <Link
                          to={`${transcriptBase}#turn-${turnId}`}
                          className="whitespace-nowrap text-xs text-primary underline underline-offset-2"
                        >
                          lihat di transkrip
                        </Link>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {skill.competency_summary && (
          <div className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Ringkasan kompetensi
            </span>
            <p className="text-sm leading-relaxed text-muted-foreground break-words">
              {skill.competency_summary}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
