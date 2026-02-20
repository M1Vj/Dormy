"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, UserPlus } from "lucide-react";

import { addCommitteeMember } from "@/app/actions/committees";
import type { CommitteeMemberRole } from "@/app/actions/committees";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Occupant {
  id: string; // occupant id
  full_name: string;
  user_id: string | null;
}

export function AddMemberDialog({
  committeeId,
  occupants,
}: {
  committeeId: string;
  occupants: Occupant[];
}) {
  const [open, setOpen] = useState(false);
  const [occupantOpen, setOccupantOpen] = useState(false);
  const [selectedOccupant, setSelectedOccupant] = useState<Occupant | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleAdd = () => {
    if (!selectedOccupant?.user_id) return;

    startTransition(async () => {
      await addCommitteeMember(committeeId, selectedOccupant.user_id!, "member");
      setOpen(false);
      setSelectedOccupant(null);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="mr-2 h-4 w-4" />
          Add Member
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Committee Member</DialogTitle>
          <DialogDescription>
            Select an occupant to add to this committee. They must have a text user account.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Occupant</Label>
            <Popover open={occupantOpen} onOpenChange={setOccupantOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={occupantOpen}
                  className="w-full justify-between"
                >
                  {selectedOccupant
                    ? selectedOccupant.full_name
                    : "Select occupant..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0">
                <Command>
                  <CommandInput placeholder="Search occupant..." />
                  <CommandList>
                    <CommandEmpty>No occupant found.</CommandEmpty>
                    <CommandGroup>
                      {occupants.map((occupant) => (
                        <CommandItem
                          key={occupant.id}
                          value={occupant.full_name}
                          onSelect={() => {
                            setSelectedOccupant(occupant);
                            setOccupantOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedOccupant?.id === occupant.id
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                          {occupant.full_name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!selectedOccupant || isPending}>
            {isPending ? "Adding..." : "Add Member"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
