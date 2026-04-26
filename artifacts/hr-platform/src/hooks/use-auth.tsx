import { createContext, useContext, ReactNode, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";

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
  loginAsDemo: (role?: "admin" | "recruiter") => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ME_QUERY_KEY = ["auth-me"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [isBackendDown, setIsBackendDown] = useState(false);

  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (res.status === 401) {
          setIsBackendDown(false);
          return null;
        }
        if (!res.ok) {
          setIsBackendDown(true);
          return null;
        }
        setIsBackendDown(false);
        return res.json();
      } catch {
        setIsBackendDown(true);
        return null;
      }
    },
    retry: false,
    staleTime: Infinity,
  });

  const login = async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || "Invalid credentials");
    }
    const userData = await res.json();
    queryClient.setQueryData(ME_QUERY_KEY, userData);
    setIsBackendDown(false);
    setLocation("/dashboard");
  };

  const loginAsDemo = async (role: "admin" | "recruiter" = "admin") => {
    try {
      const res = await fetch("/api/auth/demo-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        const userData = await res.json();
        queryClient.setQueryData(ME_QUERY_KEY, userData);
        setIsBackendDown(false);
        setLocation("/dashboard");
        return;
      }
    } catch {
      // Fall through to local demo mode
    }
    // Fallback: local demo user if backend unavailable
    const DEMO_USERS: Record<string, User> = {
      admin: { id: "demo-admin-1", email: "admin@talentiq.demo", name: "Alex Admin", role: "admin", isActive: true },
      recruiter: { id: "demo-recruiter-1", email: "recruiter@talentiq.demo", name: "Rachel Recruiter", role: "recruiter", isActive: true },
    };
    queryClient.setQueryData(ME_QUERY_KEY, DEMO_USERS[role]);
    setLocation("/dashboard");
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      // Ignore errors
    }
    queryClient.setQueryData(ME_QUERY_KEY, null);
    setLocation("/login");
  };

  return (
    <AuthContext.Provider value={{ user: user ?? null, isLoading, isBackendDown, login, loginAsDemo, logout }}>
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
