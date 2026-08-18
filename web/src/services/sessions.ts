import api from "./api";
import { parseContract, portfolioResponseSchema, type Portfolio } from "./schemas";
import type { Session, CoverageMap, TranscriptTurn, CandidateInfo } from "@/types";

/** What the portfolio endpoint actually means, as one closed set of states. */
export type PortfolioFetchResult =
  | { state: "generating" }
  | { state: "ready"; portfolio: Portfolio };

export const sessionsApi = {
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

  /**
   * Fetch the portfolio, validated against the contract.
   *
   * The endpoint answers either `{ portfolio }` or a bare `{ status }`, and the
   * caller previously had to guess which — reading `generation_status` out of an
   * `any` and treating a missing portfolio as "still generating". Collapsing it
   * into one closed result type means the page cannot forget a state.
   */
  fetchPortfolio: async (id: number): Promise<PortfolioFetchResult> => {
    const res = await api.get(`/sessions/${id}/portfolio`);
    const parsed = parseContract(portfolioResponseSchema, res.data, "portfolio");

    if ("portfolio" in parsed) return { state: "ready", portfolio: parsed.portfolio };
    return { state: "generating" };
  },

  regeneratePortfolio: (id: number) =>
    api.post<{ message: string }>(`/sessions/${id}/portfolio/regenerate`),

  getCandidateInfo: (token: string) => api.get<CandidateInfo>(`/sessions/${token}/candidate`),

  audioComplete: (token: string) =>
    api.post<{ ended: boolean; message: string }>(`/sessions/${token}/audio_complete`),
};
