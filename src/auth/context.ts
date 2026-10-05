import { createContext, useContext } from "react";
import type { Profile } from "./types";
export interface AuthState {
  profile: Profile | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}
export const AuthContext = createContext<AuthState | null>(null);
export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("AuthProvider required");
  return auth;
}
