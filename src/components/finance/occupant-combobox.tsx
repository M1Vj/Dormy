"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type OccupantComboboxOption = {
  id: string;
  fullName: string;
  studentId?: string | null;
};

type OccupantComboboxProps = {
  occupants: OccupantComboboxOption[];
  value: string;
  onValueChange: (occupantId: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
};

export function OccupantCombobox({
  occupants,
  value,
  onValueChange,
  placeholder = "Select occupant",
  searchPlaceholder = "Search occupant...",
  emptyText = "No occupant found.",
  className,
  disabled,
}: OccupantComboboxProps) {
  const [open, setOpen] = useState(false);

  const selectedLabel = useMemo(() => {
    if (!value) return placeholder;
    const occupant = occupants.find((option) => option.id === value);
    if (!occupant) return placeholder;
    return `${occupant.fullName}${occupant.studentId ? ` (${occupant.studentId})` : ""}`;
  }, [occupants, placeholder, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", className)}
          disabled={disabled}
        >
          {selectedLabel}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {occupants.map((occupant) => (
                <CommandItem
                  key={occupant.id}
                  value={`${occupant.fullName} ${occupant.studentId ?? ""}`}
                  onSelect={() => {
                    onValueChange(occupant.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === occupant.id ? "opacity-100" : "opacity-0")}
                  />
                  {occupant.fullName}
                  {occupant.studentId ? (
                    <span className="ml-1 text-xs text-muted-foreground">({occupant.studentId})</span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
