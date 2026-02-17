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

const OCCUPANT_MODE_COOKIE = "dormy_occupant_mode";

/** Roles that are also occupants and can toggle to occupant mode */
const OCCUPANT_ELIGIBLE_ROLES = new Set<AppRole>([
  "student_assistant",
  "treasurer",
  "officer",
]);

function readCookie(name: string) {
  if (typeof document === "undefined") {
    return null;
  }

  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`));

  if (!match) {
    return null;
  }

  const [, value] = match.split("=");
  return value ?? null;
}

function writeCookie(name: string, value: string, maxAgeSeconds: number) {
  if (typeof document === "undefined") {
    return;
  }

  const maxAge = Math.max(0, Math.floor(maxAgeSeconds));
  const secure = window.location.protocol === "https:" ? "; Secure" : "";

  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

interface AuthContextValue {
  user: User | null;
  /** The actual role from the database */
  actualRole: AppRole | null;
  /** The currently active role (may be overridden to 'occupant') */
  role: AppRole | null;
  dormId: string | null;
  isLoading: boolean;
  /** Whether occupant mode is currently active */
  isOccupantMode: boolean;
  /** Whether this user can toggle to occupant mode */
  canToggleOccupantMode: boolean;
  /** Toggle between actual role and occupant mode */
  toggleOccupantMode: () => void;
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
  const [actualRole, setActualRole] = useState<AppRole | null>(null);
  const [dormId, setDormId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOccupantMode, setIsOccupantMode] = useState(() => {
    return readCookie(OCCUPANT_MODE_COOKIE) === "1";
  });
  const refreshInProgress = useRef(false);

  const canToggleOccupantMode = Boolean(
    actualRole && OCCUPANT_ELIGIBLE_ROLES.has(actualRole)
  );

  const role = isOccupantMode && canToggleOccupantMode ? "occupant" : actualRole;

  const toggleOccupantMode = useCallback(() => {
    if (!canToggleOccupantMode) return;
    setIsOccupantMode((prev) => {
      const next = !prev;
      writeCookie(OCCUPANT_MODE_COOKIE, next ? "1" : "0", 60 * 60 * 24 * 30);
      return next;
    });
  }, [canToggleOccupantMode]);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setUser(null);
      setActualRole(null);
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

        setActualRole((membership?.role as AppRole) ?? null);
        setDormId(membership?.dorm_id ?? null);
      } else {
        setActualRole(null);
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
    if (!user || actualRole) {
      return;
    }

    const interval = window.setInterval(() => {
      refresh();
    }, 8000);

    return () => window.clearInterval(interval);
  }, [refresh, actualRole, user]);

  useEffect(() => {
    if (isOccupantMode && !canToggleOccupantMode) {
      setIsOccupantMode(false);
      writeCookie(OCCUPANT_MODE_COOKIE, "0", 0);
    }
  }, [canToggleOccupantMode, isOccupantMode]);

  const value = useMemo(
    () => ({
      user,
      actualRole,
      role,
      dormId,
      isLoading,
      isOccupantMode,
      canToggleOccupantMode,
      toggleOccupantMode,
      refresh,
    }),
    [
      user,
      actualRole,
      role,
      dormId,
      isLoading,
      isOccupantMode,
      canToggleOccupantMode,
      toggleOccupantMode,
      refresh,
    ]
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
