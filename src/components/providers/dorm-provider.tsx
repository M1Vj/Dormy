"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";

import { switchDorm as switchDormAction } from "@/app/actions/dorm";

export type Dorm = {
  id: string;
  name: string;
  slug: string;
  treasurer_maintenance_access?: boolean | null;
};

interface DormContextValue {
  activeDorm: Dorm | null;
  dorms: Dorm[];
  isSwitching: boolean;
  switchDorm: (dormId: string) => Promise<void>;
}

const DormContext = createContext<DormContextValue | undefined>(undefined);

export function DormProvider({
  children,
  dorms,
  initialDormId,
}: {
  children: React.ReactNode;
  dorms: Dorm[];
  initialDormId: string | null;
}) {
  const router = useRouter();
  const [activeDormId, setActiveDormId] = useState<string | null>(
    initialDormId
  );
  const [isSwitching, setIsSwitching] = useState(false);
  const hasSyncedRef = useRef(false);

  const activeDorm = useMemo(
    () => dorms.find((dorm) => dorm.id === activeDormId) ?? null,
    [dorms, activeDormId]
  );

  useEffect(() => {
    if (!activeDormId || hasSyncedRef.current) {
      return;
    }

    hasSyncedRef.current = true;
    switchDormAction(activeDormId);
  }, [activeDormId]);

  const switchDorm = useCallback(async (dormId: string) => {
    if (!dormId || dormId === activeDormId) {
      return;
    }

    setIsSwitching(true);
    const result = await switchDormAction(dormId);
    if (!result?.error) {
      setActiveDormId(dormId);
      router.refresh();
    }
    setIsSwitching(false);
  }, [activeDormId, router]);

  const value = useMemo(
    () => ({ activeDorm, dorms, isSwitching, switchDorm }),
    [activeDorm, dorms, isSwitching, switchDorm]
  );

  return <DormContext.Provider value={value}>{children}</DormContext.Provider>;
}

export function useDorm() {
  const context = useContext(DormContext);
  if (!context) {
    throw new Error("useDorm must be used within DormProvider");
  }
  return context;
}
