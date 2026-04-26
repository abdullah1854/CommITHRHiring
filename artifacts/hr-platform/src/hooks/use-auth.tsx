import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { supabase, getAccessToken } from "@/lib/supabase";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isBackendDown: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ME_QUERY_KEY = ["auth-me"];

// In production the frontend lives on a different Railway domain than the
// api-server, so `/api/*` paths must be prefixed with the absolute URL of the
// backend. In dev `VITE_API_URL` is unset and Vite proxies `/api` to
// localhost:8080 (see vite.config.ts), which means the relative path Just Works.
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

async function fetchProfile(): Promise<User | null> {
  const token = await getAccessToken();
  if (!token) return null;
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`profile fetch failed: ${res.status}`);
  return res.json();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [isBackendDown, setIsBackendDown] = useState(false);

  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => {
      try {
        const profile = await fetchProfile();
        setIsBackendDown(false);
        return profile;
      } catch {
        setIsBackendDown(true);
        return null;
      }
    },
    retry: false,
    staleTime: Infinity,
  });

  // Re-hydrate the profile whenever the Supabase session changes (login,
  // refresh, sign-out from another tab, etc.) so the UI stays in sync with
  // the actual auth state.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(() => {
      queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    const profile = await fetchProfile();
    if (!profile) {
      // Auth succeeded but the backend rejected the user (deactivated, no
      // mirrored profile, or backend down). Sign them back out so the UI
      // doesn't get stuck in a half-authenticated state.
      await supabase.auth.signOut();
      throw new Error("Account not authorised. Contact your administrator.");
    }
    queryClient.setQueryData(ME_QUERY_KEY, profile);
    setIsBackendDown(false);
    setLocation("/dashboard");
  };

  const logout = async () => {
    await supabase.auth.signOut();
    queryClient.setQueryData(ME_QUERY_KEY, null);
    queryClient.clear();
    setLocation("/login");
  };

  return (
    <AuthContext.Provider value={{ user: user ?? null, isLoading, isBackendDown, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
