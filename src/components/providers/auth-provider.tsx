"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

export const roles = [
  "admin",
  "student_assistant",
  "treasurer",
  "adviser",
  "assistant_adviser",
  "occupant",
  "event_officer",
] as const;

export type AppRole = (typeof roles)[number];

interface AuthContextValue {
  user: User | null;
  role: AppRole | null;
  dormId: string | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [dormId, setDormId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = async () => {
    setIsLoading(true);
    const supabase = createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    setUser(authUser ?? null);

    if (authUser) {
      const { data: membership } = await supabase
        .from("dorm_memberships")
        .select("role, dorm_id")
        .eq("user_id", authUser.id)
        .maybeSingle();

      setRole((membership?.role as AppRole) ?? null);
      setDormId(membership?.dorm_id ?? null);
    } else {
      setRole(null);
      setDormId(null);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange(() => {
      refresh();
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({ user, role, dormId, isLoading, refresh }),
    [user, role, dormId, isLoading]
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
