import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useToast } from "@/components/ui/toast";
import { assessmentsApi } from "@/services/assessments";
import { readErrorMessage } from "@/services/portfolios";
import { Plus, Clock, ChevronRight, Trash2, Languages, CalendarClock } from "lucide-react";
import { LANGUAGE_LABELS, formatDate, isExpired } from "@/utils/constants";
import type { Assessment } from "@/types";

function SessionSummary({ session }: { session?: Assessment["latest_session"] }) {
  if (!session) return null;

  if (session.status === "active")
    return (
      <span className="flex items-center gap-1 text-xs text-primary">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" aria-hidden="true" />
        Live now
      </span>
    );

  if (session.status === "ended" && session.end_reason === "error")
    return <span className="text-xs text-destructive">Last: failed</span>;

  if (session.status === "ended")
    return <span className="text-xs text-muted-foreground">Last: completed</span>;

  return <span className="text-xs text-muted-foreground">Awaiting candidate</span>;
}

export default function AssessmentListPage() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    assessmentsApi
      .list()
      .then((res) => setAssessments(res.data.assessments))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (assessment: Assessment) => {
    try {
      await assessmentsApi.delete(assessment.id);
      setAssessments((prev) => prev.filter((a) => a.id !== assessment.id));
      toast.success(`Assessment “${assessment.name}” dihapus.`);
    } catch (e) {
      // The model guards this with dependent: :restrict_with_error, so an
      // assessment that already has sessions cannot be deleted — the server
      // says why, and that reason belongs on screen rather than in a console.
      toast.error(
        await readErrorMessage(
          e,
          "Gagal menghapus assessment. Assessment yang sudah punya sesi wawancara tidak bisa dihapus."
        )
      );
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Assessments</h1>
        <Button onClick={() => navigate("/assessments/new")}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> New Assessment
        </Button>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">
          Gagal memuat daftar assessment.{" "}
          <button type="button" onClick={load} className="underline underline-offset-2">
            Coba lagi
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : assessments.length === 0 ? (
        <div className="rounded-lg border p-12 text-center text-sm text-muted-foreground">
          <p className="mb-3">Belum ada assessment.</p>
          <Button variant="outline" onClick={() => navigate("/assessments/new")}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Buat assessment pertama
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {assessments.map((a) => (
            <Card key={a.id} className="transition-colors hover:border-primary/40">
              <CardContent className="flex items-center justify-between gap-2 px-4 py-3">
                <button
                  type="button"
                  onClick={() => navigate(`/assessments/${a.id}/invite`)}
                  className="min-w-0 flex-1 rounded text-left focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <p className="truncate text-sm font-medium">{a.name}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      {a.time_limit_min} min
                    </span>
                    {/* The chosen interview language was captured at creation and
                        then shown nowhere. It changes how the whole session runs. */}
                    {a.language && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="flex items-center gap-1">
                          <Languages className="h-3 w-3" aria-hidden="true" />
                          {LANGUAGE_LABELS[a.language] ?? a.language}
                        </span>
                      </>
                    )}
                    {a.expires_at && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`flex items-center gap-1 ${
                            isExpired(a.expires_at) ? "text-destructive" : ""
                          }`}
                        >
                          <CalendarClock className="h-3 w-3" aria-hidden="true" />
                          {isExpired(a.expires_at) ? "Berakhir" : "s/d"} {formatDate(a.expires_at)}
                        </span>
                      </>
                    )}
                    {a.latest_session && (
                      <>
                        <span aria-hidden="true">·</span>
                        <SessionSummary session={a.latest_session} />
                      </>
                    )}
                  </div>
                </button>

                <div className="flex shrink-0 items-center gap-1">
                  <ConfirmDialog
                    trigger={
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Hapus assessment ${a.name}`}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    }
                    title="Hapus assessment ini?"
                    description={
                      <>
                        <strong>{a.name}</strong> akan dihapus permanen beserta konfigurasi
                        skill-nya. Assessment yang sudah pernah dipakai untuk wawancara tidak bisa
                        dihapus — datanya adalah bukti penilaian kandidat.
                      </>
                    }
                    onConfirm={() => handleDelete(a)}
                  />
                  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
