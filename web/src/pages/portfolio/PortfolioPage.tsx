import { useCallback, useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import SkillPortfolioCard from "@/components/portfolio/SkillPortfolioCard";
import DataIntegrityNotice from "@/components/DataIntegrityNotice";
import { sessionsApi } from "@/services/sessions";
import { vacanciesApi } from "@/services/vacancies";
import { portfoliosApi, readErrorMessage } from "@/services/portfolios";
import { usePolling } from "@/hooks/usePolling";
import { ArrowLeft, Download, Loader2, RefreshCw, Zap, FileText, AlertTriangle } from "lucide-react";
import type { Portfolio, AssessorOverride } from "@/services/schemas";
import type { Vacancy } from "@/types";

/** Generation is normally ~2 minutes. Past this we stop claiming it is on its way. */
const GENERATION_TIMEOUT_MS = 5 * 60 * 1000;

export default function PortfolioPage() {
  const { id, sessionId } = useParams<{ id: string; sessionId: string }>();
  const navigate = useNavigate();

  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [overrides, setOverrides] = useState<Record<number, AssessorOverride>>({});
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [selectedVacancy, setSelectedVacancy] = useState<string>("");
  const [exporting, setExporting] = useState<"pdf" | "json" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [candidateName, setCandidateName] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const fetchPortfolio = useCallback(async () => {
    const result = await sessionsApi.fetchPortfolio(Number(sessionId));

    if (result.state === "generating") {
      setGenerating(true);
      return;
    }

    const p = result.portfolio;
    setPortfolio(p);
    setGenerating(p.generation_status === "pending" || p.generation_status === "generating");

    const map: Record<number, AssessorOverride> = {};
    p.overrides.forEach((o) => {
      map[o.portfolio_skill_id] = o;
    });
    setOverrides(map);
  }, [sessionId]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [, vRes, sRes] = await Promise.all([
        fetchPortfolio(),
        vacanciesApi.list(),
        sessionsApi.get(Number(sessionId)),
      ]);
      setVacancies(vRes.data.vacancies);
      setCandidateName(sRes.data.session.candidate_name ?? null);
    } catch (error) {
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, [fetchPortfolio, sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const { timedOut } = usePolling(fetchPortfolio, 5000, generating, {
    timeoutMs: GENERATION_TIMEOUT_MS,
  });

  const stalled = timedOut || portfolio?.stalled === true;

  const handleRetryGeneration = async () => {
    setRetrying(true);
    setLoadError(null);
    try {
      await sessionsApi.regeneratePortfolio(Number(sessionId));
      setPortfolio(null);
      setGenerating(true);
      await fetchPortfolio();
    } catch (error) {
      setLoadError(new Error(await readErrorMessage(error, "Gagal menjalankan ulang generasi.")));
    } finally {
      setRetrying(false);
    }
  };

  const handleOverrideSaved = (skillId: number, override: AssessorOverride) => {
    setOverrides((prev) => ({ ...prev, [skillId]: override }));
  };

  const handleRunFitGap = () => {
    if (!selectedVacancy || !portfolio) return;
    navigate(`/assessments/${id}/sessions/${sessionId}/fitgap/${selectedVacancy}`);
  };

  const handleExport = async (format: "pdf" | "json") => {
    if (!portfolio) return;
    setExporting(format);
    setExportError(null);
    try {
      await portfoliosApi.downloadExport(
        portfolio.id,
        format,
        `portfolio-${sessionId}.${format}`,
        selectedVacancy ? Number(selectedVacancy) : undefined
      );
    } catch (error: any) {
      setExportError(error?.message ?? "Ekspor gagal.");
    } finally {
      setExporting(null);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const ready = !generating && portfolio?.generation_status === "complete";
  const configured = portfolio?.skills.filter((s) => !s.is_discovered) ?? [];
  const discovered = portfolio?.skills.filter((s) => s.is_discovered) ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-2">
          <Link
            to={`/assessments/${id}/invite`}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Kembali"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold">Hasil Portfolio</h1>
            {candidateName && <p className="text-sm text-muted-foreground">{candidateName}</p>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            to={`/assessments/${id}/sessions/${sessionId}/transcript`}
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            Transkrip
          </Link>
          {ready && (
            <>
              <Button variant="outline" size="sm" onClick={() => handleExport("pdf")} disabled={!!exporting}>
                {exporting === "pdf" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                )}
                PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExport("json")} disabled={!!exporting}>
                {exporting === "json" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                )}
                JSON
              </Button>
            </>
          )}
        </div>
      </div>

      {loadError != null && (
        <DataIntegrityNotice error={loadError} subject="portfolio" onRetry={() => void load()} />
      )}

      {exportError && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {exportError}
        </div>
      )}

      {generating && !stalled && (
        <div className="space-y-3 rounded-lg border p-12 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          <div>
            <p className="font-medium">Menyusun portfolio…</p>
            <p className="mt-1 text-sm text-muted-foreground">
              AI sedang menganalisis transkrip wawancara. Biasanya sekitar 2 menit.
            </p>
          </div>
        </div>
      )}

      {generating && stalled && (
        <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-6 text-center">
          <AlertTriangle className="mx-auto h-6 w-6 text-amber-700" aria-hidden="true" />
          <div>
            <p className="font-medium text-amber-900">Generasi tampaknya tertahan</p>
            <p className="mt-1 text-sm text-amber-900/80">
              Sudah lebih lama dari yang wajar dan belum selesai. Biasanya ini berarti worker
              latar belakang tidak mengambil pekerjaannya.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRetryGeneration} disabled={retrying}>
            {retrying ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            )}
            Jalankan ulang
          </Button>
        </div>
      )}

      {!generating && portfolio?.generation_status === "failed" && (
        <div className="space-y-3 rounded-lg border border-destructive/40 p-6 text-center">
          <p className="text-sm text-destructive">
            {portfolio.generation_error || "Penyusunan portfolio gagal."}
          </p>
          <Button variant="outline" size="sm" onClick={handleRetryGeneration} disabled={retrying}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Coba lagi
          </Button>
        </div>
      )}

      {ready && configured.length === 0 && discovered.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Portfolio selesai dibuat, tapi tidak ada satu pun skill yang berhasil dinilai dari
          wawancara ini. Periksa transkripnya — kemungkinan sesi berakhir terlalu awal.
        </div>
      )}

      {ready && (configured.length > 0 || discovered.length > 0) && (
        <>
          {configured.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold">Skill yang dikonfigurasi</h2>
              {configured.map((skill) => (
                <SkillPortfolioCard
                  key={skill.id}
                  skill={skill}
                  override={overrides[skill.id]}
                  onOverrideSaved={(o) => handleOverrideSaved(skill.id, o)}
                  assessmentId={id}
                  sessionId={sessionId}
                />
              ))}
            </div>
          )}

          {discovered.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <div>
                  <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                    <Zap className="h-4 w-4 text-amber-500" aria-hidden="true" />
                    Skill yang ditemukan AI
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Skill yang diprobe AI tapi tidak ada dalam konfigurasi assessment
                  </p>
                </div>
                {discovered.map((skill) => (
                  <SkillPortfolioCard
                    key={skill.id}
                    skill={skill}
                    override={overrides[skill.id]}
                    onOverrideSaved={(o) => handleOverrideSaved(skill.id, o)}
                    assessmentId={id}
                    sessionId={sessionId}
                  />
                ))}
              </div>
            </>
          )}

          <Separator />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select value={selectedVacancy} onValueChange={setSelectedVacancy}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue placeholder="Pilih lowongan…" />
              </SelectTrigger>
              <SelectContent>
                {vacancies.map((v) => (
                  <SelectItem key={v.id} value={String(v.id)}>
                    {v.role_title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleRunFitGap} disabled={!selectedVacancy}>
              Jalankan analisis Fit/Gap
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
