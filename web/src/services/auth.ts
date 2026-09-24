import api from "./api";

export const STAFF_ROLES = ["admin", "assessor", "recruiter", "hiring_manager"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const SELF_ASSIGNABLE_ROLES = ["recruiter", "hiring_manager", "assessor"] as const;
export type SelfAssignableRole = (typeof SELF_ASSIGNABLE_ROLES)[number];

export const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  assessor: "Assessor",
  recruiter: "Recruiter",
  hiring_manager: "Hiring Manager",
  user: "Belum diberi peran",
};

export const ROLE_DESCRIPTIONS: Record<SelfAssignableRole, string> = {
  recruiter: "Membuka lowongan, membuat assessment, dan mengundang kandidat.",
  hiring_manager: "Membaca portfolio dan laporan fit/gap untuk mengambil keputusan.",
  assessor: "Menilai hasil wawancara dan mengoreksi level yang diberikan AI.",
};

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "—";
  return ROLE_LABELS[role] ?? role;
}

export interface AuthUser {
  id: number;
  email: string;
  role: string;
  role_label?: string;
  display_name?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface SignupPayload {
  email: string;
  password: string;
  role: SelfAssignableRole;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export const authApi = {
  login: (data: LoginPayload) => api.post<AuthResponse>("/auth/login", data),

  signup: (data: SignupPayload) => api.post<AuthResponse>("/auth/signup", data),
};
