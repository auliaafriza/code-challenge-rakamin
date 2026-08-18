import api from "./api";
import {
  fitGapResponseSchema,
  parseContract,
  type AssessorOverride,
  type FitGapReport,
} from "./schemas";

export interface OverrideInput {
  override_level: number;
  assessor_notes: string;
}

/**
 * A 4xx/5xx body that arrives while `responseType: "blob"` is set comes back as
 * a Blob, not JSON — so a plain `catch` sees an unreadable object and the real
 * message ("Portfolio is not ready for export") never reaches the assessor.
 */
export async function readErrorMessage(error: any, fallback: string): Promise<string> {
  const data = error?.response?.data;

  if (data instanceof Blob) {
    try {
      const text = await data.text();
      const parsed = JSON.parse(text);
      return parsed?.errors?.[0]?.message ?? parsed?.message ?? parsed?.error ?? fallback;
    } catch {
      return fallback;
    }
  }

  if (typeof data === "string" && data.trim() !== "") return data;

  return data?.errors?.[0]?.message ?? data?.message ?? data?.error ?? error?.message ?? fallback;
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const portfoliosApi = {
  /**
   * Create or update an assessor override.
   *
   * Named for what it does. It was previously `getOverride` — a GET-sounding
   * name on a POST that mutates a rating about a person.
   */
  saveOverride: (portfolioSkillId: number, data: OverrideInput) =>
    api.post<{ override: AssessorOverride }>(`/portfolio_skills/${portfolioSkillId}/override`, {
      override: data,
    }),

  triggerFitGap: (portfolioId: number, vacancyId: number) =>
    api.post<{ report?: unknown; status?: string; message?: string }>(
      `/portfolios/${portfolioId}/fitgap`,
      { fitgap: { vacancy_id: vacancyId } }
    ),

  getFitGap: async (portfolioId: number, vacancyId: number): Promise<FitGapReport> => {
    const res = await api.get(`/portfolios/${portfolioId}/fitgap/${vacancyId}`);
    return parseContract(fitGapResponseSchema, res.data, "laporan fit/gap").report;
  },

  regenerateFitGap: (portfolioId: number, vacancyId: number) =>
    api.post<{ status: string; message: string }>(
      `/portfolios/${portfolioId}/regenerate_fitgap`,
      { vacancy_id: vacancyId }
    ),

  /**
   * Download an export, or throw an Error whose message is the server's own.
   * Never fails silently: the previous implementation had no `catch` at all, so
   * a rejected export just stopped the spinner and left the screen unchanged.
   */
  downloadExport: async (
    portfolioId: number,
    format: "pdf" | "json",
    filename: string,
    vacancyId?: number
  ): Promise<void> => {
    try {
      const res = await api.get(`/portfolios/${portfolioId}/export`, {
        params: { format, ...(vacancyId ? { vacancy_id: vacancyId } : {}) },
        responseType: "blob",
      });

      const blob =
        res.data instanceof Blob
          ? res.data
          : new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });

      triggerBrowserDownload(blob, filename);
    } catch (error: any) {
      throw new Error(await readErrorMessage(error, "Gagal mengunduh berkas ekspor."));
    }
  },
};
