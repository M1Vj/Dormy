"use client";

import { useDorm } from "@/components/providers/dorm-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { useMounted } from "@/hooks/use-mounted";

export function DormSwitcher() {
  const { activeDorm } = useDorm();
  const { role } = useAuth();
  const mounted = useMounted();

  if (!mounted) {
    return (
      <div className="flex px-2 py-1.5 font-semibold text-sidebar-foreground">
        Loading...
      </div>
    );
  }

  // Admin is a global role — don't show a specific dorm name
  const label = role === "admin" ? "Dormy Admin" : (activeDorm?.name ?? "Loading...");

  return (
    <div className="flex px-2 py-1.5 text-sm font-semibold tracking-tight text-sidebar-foreground">
      <span className="truncate">{label}</span>
    </div>
  );
}
