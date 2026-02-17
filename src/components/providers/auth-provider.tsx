"use client";

import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { roles, type AppRole } from "@/lib/roles";

export { roles };

interface AuthContextValue {
  user: User | null;
  role: AppRole | null;
  dormId: string | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => {
    try {
      return createSupabaseBrowserClient();
    } catch {
      return null;
    }
  });
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [dormId, setDormId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const refreshInProgress = useRef(false);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setUser(null);
      setRole(null);
      setDormId(null);
      return;
    }

    if (refreshInProgress.current) {
      return;
    }

    refreshInProgress.current = true;
    setIsLoading(true);
    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      setUser(authUser ?? null);

      if (authUser) {
        const { data: membership } = await supabase
          .from("dorm_memberships")
          .select("role, dorm_id")
          .eq("user_id", authUser.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        setRole((membership?.role as AppRole) ?? null);
        setDormId(membership?.dorm_id ?? null);
      } else {
        setRole(null);
        setDormId(null);
      }
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "name" in error &&
        (error as { name?: string }).name === "AbortError"
      ) {
        return;
      }

      console.error("Auth refresh failed:", error);
    } finally {
      refreshInProgress.current = false;
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    refresh();

    if (!supabase) {
      return;
    }

    const { data } = supabase.auth.onAuthStateChange(() => {
      refresh();
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [refresh, supabase]);

  useEffect(() => {
    if (!user || role) {
      return;
    }

    const interval = window.setInterval(() => {
      refresh();
    }, 8000);

    return () => window.clearInterval(interval);
  }, [refresh, role, user]);

  const value = useMemo(
    () => ({ user, role, dormId, isLoading, refresh }),
    [user, role, dormId, isLoading, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
