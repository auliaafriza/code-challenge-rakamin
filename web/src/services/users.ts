import api from "./api";

export interface DirectoryUser {
  id: number;
  display_name: string;
  role: string;
  role_label: string;
  /** Hanya dikirim ke admin. */
  email?: string;
}

export const usersApi = {
  list: () => api.get<{ users: DirectoryUser[] }>("/users"),
};
