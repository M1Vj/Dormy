"use client";

import { Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDorm } from "@/components/providers/dorm-provider";
import { useMounted } from "@/hooks/use-mounted";

export function DormSwitcher() {
  const { activeDorm, dorms, isSwitching, switchDorm } = useDorm();
  const mounted = useMounted();

  if (!mounted) {
    return (
      <Button variant="ghost" className="justify-between px-2">
        <span className="truncate">{activeDorm?.name ?? "Select dorm"}</span>
        <ChevronDown className="ml-2 h-4 w-4" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="justify-between px-2">
          <span className="truncate">
            {activeDorm?.name ?? "Select dorm"}
          </span>
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        {dorms.length === 0 ? (
          <DropdownMenuItem disabled>No dorms available</DropdownMenuItem>
        ) : (
          dorms.map((dorm) => (
            <DropdownMenuItem
              key={dorm.id}
              onSelect={() => switchDorm(dorm.id)}
            >
              <span className="flex-1 truncate">{dorm.name}</span>
              {activeDorm?.id === dorm.id ? (
                <Check className="ml-2 h-4 w-4" />
              ) : null}
            </DropdownMenuItem>
          ))
        )}
        {isSwitching ? (
          <div className="px-2 py-1 text-xs text-muted-foreground">
            Switching dorm...
          </div>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
