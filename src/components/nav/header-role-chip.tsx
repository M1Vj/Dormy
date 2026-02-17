"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { getRoleLabel } from "@/lib/roles";

export function HeaderRoleChip() {
  const { role, isOccupantMode, isLoading } = useAuth();

  if (isLoading || !role) {
    return null;
  }

  return (
    <Badge
      variant="outline"
      className={`max-w-28 truncate px-2 py-0 text-[11px] sm:max-w-none sm:text-xs ${isOccupantMode
          ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          : ""
        }`}
    >
      {getRoleLabel(role)}
      {isOccupantMode ? " 👁" : ""}
    </Badge>
  );
}
