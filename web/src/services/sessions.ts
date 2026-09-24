import api from "./api";
import { parseContract, portfolioResponseSchema, type Portfolio } from "./schemas";
import type { Session, CoverageMap, TranscriptTurn, CandidateInfo, PaginationMeta } from "@/types";

export interface SessionListParams {
  page?: number;
  /** Dibatasi server ke maksimum 100. */
  per_page?: number;
  /** Saring ke satu assessment. */
  assessment_id?: number | "";
  status?: "" | "pending" | "active" | "ended";
  /** Cari berdasarkan nama kandidat. */
  q?: string;
}

/** What the portfolio endpoint actually means, as one closed set of states. */
export type PortfolioFetchResult =
  | { state: "generating" }
  | { state: "ready"; portfolio: Portfolio };

export const sessionsApi = {
  list: (params: SessionListParams = {}) =>
    api.get<{ sessions: Session[]; meta: PaginationMeta }>("/sessions", { params }),

  get: (id: number) =>
    api.get<{ session: Session; assessment: { id: number; name: string; time_limit_min: number } }>(
      `/sessions/${id}`
    ),

  endSession: (id: number, reason = "manual_assessor") =>
    api.post<{ session: Session }>(`/sessions/${id}/end_session`, {
      session: { reason },
    }),

  getCoverage: (id: number) => api.get<CoverageMap>(`/sessions/${id}/coverage`),

  getTranscript: (id: number, fromTurn?: number) =>
    api.get<{ turns: TranscriptTurn[]; total: number }>(`/sessions/${id}/transcript`, {
      params: fromTurn ? { from_turn: fromTurn } : undefined,
    }),

  fetchPortfolio: async (id: number): Promise<PortfolioFetchResult> => {
    const res = await api.get(`/sessions/${id}/portfolio`);
    const parsed = parseContract(portfolioResponseSchema, res.data, "portfolio");

    if ("portfolio" in parsed) return { state: "ready", portfolio: parsed.portfolio };
    return { state: "generating" };
  },

  regeneratePortfolio: (id: number) =>
    api.post<{ message: string }>(`/sessions/${id}/portfolio/regenerate`),

  updateCandidate: (id: number, candidateName: string) =>
    api.patch<{ session: Session }>(`/sessions/${id}`, {
      session: { candidate_name: candidateName },
    }),

  /** Discard an invite that was never used. The API refuses once it has started. */
  deleteSession: (id: number) => api.delete<{ message: string }>(`/sessions/${id}`),

  getCandidateInfo: (token: string) => api.get<CandidateInfo>(`/sessions/${token}/candidate`),

  audioComplete: (token: string) =>
    api.post<{ ended: boolean; message: string }>(`/sessions/${token}/audio_complete`),
};
