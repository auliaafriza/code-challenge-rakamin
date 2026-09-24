import axios from "axios";
import { getStoredToken, clearToken } from "@/stores/authAtom";

// Port 3001 — bukan 3000. Itu port yang dipakai Puma di config/puma.rb, dan
// default yang tidak cocok tidak pernah gagal saat build: ia gagal di browser
// orang lain, sebagai request yang tidak pernah dijawab.
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001/api/v1";
const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL ?? "ws://localhost:3001";

export const WS_URL = WS_BASE_URL;

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => {
    if (response.data && typeof response.data === "object" && "data" in response.data) {
      response.data = response.data.data;
    }
    return response;
  },
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url ?? "";

    const isAuthEndpoint = url.startsWith("/auth/");

    if (!isAuthEndpoint && (status === 401 || status === 403)) {
      clearToken();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
