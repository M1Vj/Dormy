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
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { roles, type AppRole } from "@/lib/roles";

export { roles };

const OCCUPANT_MODE_COOKIE = "dormy_occupant_mode";

/** Roles that are also occupants and can toggle to occupant mode */
const OCCUPANT_ELIGIBLE_ROLES = new Set<AppRole>([
  "admin",
  "adviser",
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
  /** All roles the user holds in the database for the active dorm */
  actualRoles: AppRole[];
  /** The currently active role (from cookie or defaulted, could be occupant mode) */
  role: AppRole | null;
  dormId: string | null;
  isLoading: boolean;
  /** Sets a specific actual role as active and saves to cookie */
  setActiveRole: (role: AppRole) => void;
  /** Whether occupant mode is currently active (only if an eligible role is active) */
  isOccupantMode: boolean;
  /** Whether this user can toggle to occupant mode */
  canToggleOccupantMode: boolean;
  /** Toggle between actual role and occupant mode */
  toggleOccupantMode: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthProviderProps = {
  children: React.ReactNode;
  initialUser?: User | null;
  initialActualRoles?: AppRole[];
  initialDormId?: string | null;
  initialActiveRole?: AppRole | null;
  initialIsOccupantMode?: boolean;
};

export function AuthProvider({
  children,
  initialUser = null,
  initialActualRoles = [],
  initialDormId = null,
  initialActiveRole = null,
  initialIsOccupantMode = false,
}: AuthProviderProps) {
  const [supabase] = useState(() => {
    try {
      return createSupabaseBrowserClient();
    } catch {
      return null;
    }
  });
  const [user, setUser] = useState<User | null>(initialUser);
  const [actualRoles, setActualRoles] = useState<AppRole[]>(initialActualRoles);
  const [dormId, setDormId] = useState<string | null>(initialDormId);
  const [isLoading, setIsLoading] = useState(false);
  const [activeRoleCookie, setActiveRoleCookie] = useState(() => {
    return initialActiveRole ?? (readCookie("dormy_active_role") as AppRole | null);
  });
  const [isOccupantMode, setIsOccupantMode] = useState(() => {
    return initialIsOccupantMode || readCookie(OCCUPANT_MODE_COOKIE) === "1";
  });
  const refreshInProgress = useRef(false);
  const shouldSkipInitialAuthEvent = useRef(
    Boolean(initialUser || initialActualRoles.length > 0 || initialDormId)
  );

  // We determine the active 'actual' role from the cookie, or we default to the first one available
  const currentActualRole = useMemo(() => {
    if (actualRoles.length === 0) return null;
    if (activeRoleCookie && actualRoles.includes(activeRoleCookie)) {
      return activeRoleCookie;
    }
    // Fallback: Give priority to certain roles if needed, otherwise just the first one
    return actualRoles[0] ?? null;
  }, [actualRoles, activeRoleCookie]);

  const canToggleOccupantMode = Boolean(
    currentActualRole && OCCUPANT_ELIGIBLE_ROLES.has(currentActualRole)
  );

  const role = isOccupantMode && canToggleOccupantMode ? "occupant" : currentActualRole;

  const setActiveRole = useCallback((newRole: AppRole) => {
    setActiveRoleCookie(newRole);
    writeCookie("dormy_active_role", newRole, 60 * 60 * 24 * 30);
    // If we switch actual roles, we might want to disable occupant mode by default
    setIsOccupantMode(false);
    writeCookie(OCCUPANT_MODE_COOKIE, "0", 0);
  }, []);

  const router = useRouter();
  const toggleOccupantMode = useCallback(() => {
    if (!canToggleOccupantMode) return;
    setIsOccupantMode((prev) => {
      const next = !prev;
      writeCookie(OCCUPANT_MODE_COOKIE, next ? "1" : "0", 60 * 60 * 24 * 30);
      return next;
    });
    router.refresh();
  }, [canToggleOccupantMode, router]);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setUser(null);
      setActualRoles([]);
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
        const activeDormId = readCookie("dorm_id") ?? dormId;
        let membershipsQuery = supabase
          .from("dorm_memberships")
          .select("role, dorm_id")
          .eq("user_id", authUser.id)
          .order("created_at", { ascending: true });

        if (activeDormId) {
          membershipsQuery = membershipsQuery.eq("dorm_id", activeDormId);
        }

        const { data: memberships } = await membershipsQuery;

        const roles = (memberships?.map((m) => m.role as AppRole) || []);
        setActualRoles(roles);
        setDormId(activeDormId ?? memberships?.[0]?.dorm_id ?? null);
      } else {
        setActualRoles([]);
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
  }, [dormId, supabase]);

  useEffect(() => {
    if (!initialUser && initialActualRoles.length === 0 && !initialDormId) {
      refresh();
    }

    if (!supabase) {
      return;
    }

    const { data } = supabase.auth.onAuthStateChange(() => {
      if (shouldSkipInitialAuthEvent.current) {
        shouldSkipInitialAuthEvent.current = false;
        return;
      }

      refresh();
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [initialActualRoles.length, initialDormId, initialUser, refresh, supabase]);

  useEffect(() => {
    if (!user || actualRoles.length > 0) {
      return;
    }

    const interval = window.setInterval(() => {
      refresh();
    }, 8000);

    return () => window.clearInterval(interval);
  }, [refresh, actualRoles.length, user]);

  useEffect(() => {
    if (isOccupantMode && !canToggleOccupantMode) {
      setIsOccupantMode(false);
      writeCookie(OCCUPANT_MODE_COOKIE, "0", 0);
    }
  }, [canToggleOccupantMode, isOccupantMode]);

  const value = useMemo(
    () => ({
      user,
      actualRoles,
      role,
      dormId,
      isLoading,
      isOccupantMode,
      canToggleOccupantMode,
      toggleOccupantMode,
      setActiveRole,
      refresh,
    }),
    [
      user,
      actualRoles,
      role,
      dormId,
      isLoading,
      isOccupantMode,
      canToggleOccupantMode,
      toggleOccupantMode,
      setActiveRole,
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
