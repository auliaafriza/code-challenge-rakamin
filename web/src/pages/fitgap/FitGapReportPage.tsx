import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import ComparisonTable from "@/components/fitgap/ComparisonTable";
import ConfidenceIndicator from "@/components/portfolio/ConfidenceIndicator";
import DataIntegrityNotice from "@/components/DataIntegrityNotice";
import { portfoliosApi, readErrorMessage } from "@/services/portfolios";
import { sessionsApi } from "@/services/sessions";
import { usePolling } from "@/hooks/usePolling";
import { formatLevel } from "@/utils/constants";
import { ArrowLeft, Download, Loader2, RefreshCw, Zap, AlertTriangle, Info } from "lucide-react";
import type { FitGapReport, Portfolio } from "@/services/schemas";

const GENERATION_TIMEOUT_MS = 3 * 60 * 1000;

function formatWhen(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function FitGapReportPage() {
  const { id, sessionId, vacancyId } = useParams<{
    id: string;
    sessionId: string;
    vacancyId: string;
  }>();

  const [report, setReport] = useState<FitGapReport | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [exporting, setExporting] = useState<"pdf" | "json" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const requestedRef = useRef(false);

  const fetchReport = useCallback(
    async (portfolioId: number) => {
      try {
        const fetched = await portfoliosApi.getFitGap(portfolioId, Number(vacancyId));
        setReport(fetched);
        setGenerating(false);
        setError(null);
      } catch (e: any) {
        if (e?.response?.status === 404) {
          setGenerating(true);
          if (!requestedRef.current) {
            requestedRef.current = true;
            try {
              const triggered = await portfoliosApi.triggerFitGap(portfolioId, Number(vacancyId));
              // Server kini bisa membangun laporannya langsung saat antrean
              // tidak tersedia. Kalau ia sudah mengirim hasilnya, memasangnya
              // sekarang menghemat satu putaran polling penuh.
              if (triggered.data?.report) {
                setReport(triggered.data.report as FitGapReport);
                setGenerating(false);
              }
            } catch (triggerError) {
              setGenerating(false);
              setError(triggerError);
            }
          }
          return;
        }
        setGenerating(false);
        setError(e);
      }
    },
    [vacancyId]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await sessionsApi.fetchPortfolio(Number(sessionId));
      if (result.state !== "ready") {
        setGenerating(true);
        return;
      }
      setPortfolio(result.portfolio);
      await fetchReport(result.portfolio.id);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [sessionId, fetchReport]);

  useEffect(() => {
    void load();
  }, [load]);

  const { timedOut } = usePolling(
    () => (portfolio ? fetchReport(portfolio.id) : undefined),
    5000,
    generating && !!portfolio,
    { timeoutMs: GENERATION_TIMEOUT_MS }
  );

  const handleRegenerate = async () => {
    if (!portfolio) return;
    setRegenerating(true);
    setError(null);
    try {
      const res = await portfoliosApi.regenerateFitGap(portfolio.id, Number(vacancyId));
      requestedRef.current = true;
      if (res.data?.report) {
        setReport(res.data.report as FitGapReport);
        setGenerating(false);
      } else {
        setReport(null);
        setGenerating(true);
      }
    } catch (e) {
      setError(e);
    } finally {
      setRegenerating(false);
    }
  };

  const handleExport = async (format: "pdf" | "json") => {
    if (!portfolio) return;
    setExporting(format);
    setExportError(null);
    try {
      await portfoliosApi.downloadExport(
        portfolio.id,
        format,
        `fitgap-${sessionId}-${vacancyId}.${format}`,
        Number(vacancyId)
      );
    } catch (e: any) {
      setExportError(e?.message ?? "Ekspor gagal.");
    } finally {
      setExporting(null);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const generatedAt = formatWhen(report?.generated_at);

  const staleAgainstOverrides =
    report != null &&
    report.generated_at != null &&
    (portfolio?.overrides ?? []).some(
      (o) =>
        o.overridden_at != null &&
        new Date(o.overridden_at).getTime() > new Date(report.generated_at as string).getTime()
    );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-2">
          <Link
            to={`/assessments/${id}/sessions/${sessionId}/portfolio`}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Kembali ke portfolio"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold">Laporan Fit/Gap</h1>
            {generatedAt && (
              <p className="text-xs text-muted-foreground">Dihitung {generatedAt}</p>
            )}
          </div>
        </div>

        {portfolio && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRegenerate}
              disabled={regenerating || generating}
            >
              {regenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              )}
              Hitung ulang
            </Button>
            {report && (
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
        )}
      </div>

      {error != null && (
        <DataIntegrityNotice error={error} subject="laporan fit/gap" onRetry={() => void load()} />
      )}

      {exportError && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {exportError}
        </div>
      )}

      {staleAgainstOverrides && (
        <div role="note" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">Laporan ini lebih tua dari koreksimu.</p>
            <p className="text-amber-900/80">
              Ada override yang disimpan setelah laporan ini dihitung, jadi angka di bawah belum
              memakainya. Tekan “Hitung ulang” sebelum memakai laporan ini untuk mengambil keputusan.
            </p>
          </div>
        </div>
      )}

      {generating && !timedOut && (
        <div className="space-y-3 rounded-lg border p-12 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Menyusun laporan fit/gap…</p>
        </div>
      )}

      {generating && timedOut && (
        <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-6 text-center">
          <AlertTriangle className="mx-auto h-6 w-6 text-amber-700" aria-hidden="true" />
          <p className="font-medium text-amber-900">Perhitungan tampaknya tertahan</p>
          <p className="text-sm text-amber-900/80">
            Worker latar belakang kemungkinan tidak mengambil pekerjaannya.
          </p>
          <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={regenerating}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Jalankan ulang
          </Button>
        </div>
      )}

      {report && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Perbandingan skill</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <ComparisonTable comparisons={report.skill_comparisons} />
            </CardContent>
          </Card>

          <Separator />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Kecocokan kultur &amp; kompetensi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-4 pb-4">
              {report.narrative_is_fallback && (
                <p className="flex items-start gap-1.5 rounded border border-dashed border-neutral-300 bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-600">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                  Narasi ini dihasilkan secara otomatis dari hitungan, bukan oleh model —
                  pemanggilan AI gagal saat laporan dibuat.
                </p>
              )}
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {report.culture_narrative || report.overall_narrative || "Narasi tidak tersedia."}
              </p>
            </CardContent>
          </Card>

          {portfolio && portfolio.skills.some((s) => s.is_discovered) && (
            <>
              <Separator />
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-1.5 text-sm">
                    <Zap className="h-4 w-4 text-amber-500" aria-hidden="true" />
                    Skill di luar kebutuhan lowongan
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 px-4 pb-4">
                  {portfolio.skills
                    .filter((s) => s.is_discovered)
                    .map((s) => (
                      <div key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium">{s.skill_label}</span>
                        <span className="tabular-nums">{formatLevel(s.ai_level)}</span>
                        <ConfidenceIndicator
                          confidence={s.ai_confidence}
                          probeCount={s.probe_count}
                        />
                        <span className="text-xs text-muted-foreground">
                          — tidak dibutuhkan role ini, bisa jadi nilai tambah.
                        </span>
                      </div>
                    ))}
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
