"use client";

import { useDorm } from "@/components/providers/dorm-provider";
import { useMounted } from "@/hooks/use-mounted";

export function DormSwitcher() {
  const { activeDorm } = useDorm();
  const mounted = useMounted();

  if (!mounted || !activeDorm) {
    return (
      <div className="flex px-2 py-1.5 font-semibold text-sidebar-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex px-2 py-1.5 text-sm font-semibold tracking-tight text-sidebar-foreground">
      <span className="truncate">{activeDorm.name}</span>
    </div>
  );
}
