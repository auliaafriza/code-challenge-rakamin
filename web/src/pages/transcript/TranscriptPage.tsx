import { useEffect, useState } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { sessionsApi } from "@/services/sessions";
import { ArrowLeft, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TranscriptTurn } from "@/types";

export default function TranscriptPage() {
  const { id, sessionId } = useParams<{ id: string; sessionId: string }>();
  const location = useLocation();

  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [candidateName, setCandidateName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  /** Set by `#turn-<id>` links from the evidence quotes on the portfolio page. */
  const targetTurnId = location.hash.startsWith("#turn-")
    ? Number(location.hash.replace("#turn-", ""))
    : null;

  useEffect(() => {
    Promise.all([
      sessionsApi.getTranscript(Number(sessionId)),
      sessionsApi.get(Number(sessionId)),
    ])
      .then(([tRes, sRes]) => {
        setTurns(tRes.data.turns);
        setCandidateName(sRes.data.session.candidate_name ?? null);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [sessionId]);

  // Scroll the cited turn into view once the transcript has rendered, so a
  // reviewer following a quote lands on the moment it was said rather than at
  // the top of a 40-minute conversation.
  useEffect(() => {
    if (loading || targetTurnId === null) return;
    const el = document.getElementById(`turn-${targetTurnId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [loading, targetTurnId, turns.length]);

  const handleDownload = () => {
    const lines = turns.map((t) => {
      const label = t.speaker === "ai" ? "AI" : "Candidate";
      return `[${label}]\n${t.text}`;
    });
    const blob = new Blob([lines.join("\n\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript-session-${sessionId}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link
            to={`/assessments/${id}/sessions/${sessionId}/portfolio`}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Kembali ke portfolio"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold">Transkrip wawancara</h1>
            {candidateName && <p className="text-sm text-muted-foreground">{candidateName}</p>}
          </div>
        </div>
        {!loading && !error && turns.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Unduh .txt
          </Button>
        )}
      </div>

      {targetTurnId !== null && !loading && !error && (
        <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
          Menyorot giliran yang dikutip sebagai bukti di portfolio.
        </p>
      )}

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="rounded-lg border p-6 text-center text-sm text-destructive">
          Gagal memuat transkrip. Muat ulang halaman.
        </div>
      )}

      {!loading && !error && turns.length === 0 && (
        <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
          Tidak ada transkrip untuk sesi ini.
        </div>
      )}

      {!loading && !error && turns.length > 0 && (
        <div className="space-y-3">
          {turns.map((turn) => {
            const isAI = turn.speaker === "ai";
            const isTarget = turn.id === targetTurnId;
            return (
              <div
                key={turn.id}
                id={`turn-${turn.id}`}
                className={cn(
                  "scroll-mt-24 rounded-lg p-4",
                  isAI ? "border bg-muted" : "border border-primary/20 bg-background",
                  isTarget && "ring-2 ring-primary ring-offset-2"
                )}
              >
                <p
                  className={cn(
                    "mb-1 text-xs font-semibold",
                    isAI ? "text-muted-foreground" : "text-primary"
                  )}
                >
                  {isAI ? "AI Interviewer" : "Kandidat"}
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    #{turn.turn_number}
                  </span>
                </p>
                <p className="whitespace-pre-wrap break-words text-sm">{turn.text}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
