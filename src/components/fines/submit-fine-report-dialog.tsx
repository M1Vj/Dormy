"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus } from "lucide-react";

import { submitFineReport } from "@/app/actions/fine-reports";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type OccupantDirectoryOption = {
  id: string;
  full_name: string | null;
  student_id: string | null;
  classification: string | null;
  room_code: string | null;
  room_level: number | null;
};

export type FineRuleOption = {
  id: string;
  title?: string | null;
  severity?: string | null;
  active?: boolean | null;
};

function occupantLabel(occupant: OccupantDirectoryOption) {
  const name = occupant.full_name?.trim() || "Unnamed occupant";
  const studentId = occupant.student_id ? ` (${occupant.student_id})` : "";
  const room = occupant.room_code ? ` · Room ${occupant.room_code}` : "";
  return `${name}${studentId}${room}`;
}

export function SubmitFineReportDialog({
  dormId,
  currentOccupantId,
  occupants,
  rules,
}: {
  dormId: string;
  currentOccupantId: string;
  occupants: OccupantDirectoryOption[];
  rules: FineRuleOption[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const [occupantOpen, setOccupantOpen] = useState(false);
  const [selectedOccupantId, setSelectedOccupantId] = useState<string>("");
  const selectedOccupant = useMemo(
    () => occupants.find((o) => o.id === selectedOccupantId) ?? null,
    [occupants, selectedOccupantId]
  );

  const eligibleOccupants = useMemo(
    () => occupants.filter((occupant) => occupant.id !== currentOccupantId),
    [currentOccupantId, occupants]
  );

  const handleSubmit = (formData: FormData) => {
    setError(null);
    if (!selectedOccupantId) {
      setError("Select an occupant to report.");
      return;
    }

    formData.set("reported_occupant_id", selectedOccupantId);

    startTransition(async () => {
      const result = await submitFineReport(dormId, formData);
      if ("error" in result) {
        setError(result.error ?? "Something went wrong.");
        return;
      }

      setOpen(false);
      setSelectedOccupantId("");
      formRef.current?.reset();
      router.refresh();
    });
  };

  const activeRules = rules.filter((rule) => rule.active !== false);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        setError(null);
        if (!nextOpen) {
          setSelectedOccupantId("");
          formRef.current?.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Report a violation
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report a violation</DialogTitle>
          <DialogDescription>
            Submit a fine report for Student Assistant review. Proof photo and exact time are required.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} action={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label>Reported occupant *</Label>
            <Popover open={occupantOpen} onOpenChange={setOccupantOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={occupantOpen}
                  className="w-full justify-between"
                >
                  {selectedOccupant ? occupantLabel(selectedOccupant) : "Select occupant..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[340px] p-0">
                <Command>
                  <CommandInput placeholder="Search occupant..." />
                  <CommandList>
                    <CommandEmpty>No occupant found.</CommandEmpty>
                    <CommandGroup>
                      {eligibleOccupants.map((occupant) => (
                        <CommandItem
                          key={occupant.id}
                          value={occupantLabel(occupant)}
                          onSelect={() => {
                            setSelectedOccupantId(occupant.id);
                            setOccupantOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedOccupantId === occupant.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <span className="truncate">{occupantLabel(occupant)}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <input type="hidden" name="reported_occupant_id" value={selectedOccupantId} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="rule_id">Rule (Optional)</Label>
            <Select name="rule_id" defaultValue="">
              <SelectTrigger id="rule_id">
                <SelectValue placeholder="Select rule (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Unspecified</SelectItem>
                {activeRules.map((rule) => (
                  <SelectItem key={rule.id} value={rule.id}>
                    {(rule.title ?? "Untitled rule") + (rule.severity ? ` (${rule.severity})` : "")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="occurred_at">Violation time *</Label>
            <Input id="occurred_at" name="occurred_at" type="datetime-local" required />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="details">Details *</Label>
            <Textarea
              id="details"
              name="details"
              placeholder="Describe what happened (include context and witnesses if any)."
              rows={4}
              required
              minLength={5}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="proof">Proof photo *</Label>
            <Input id="proof" name="proof" type="file" accept="image/*" required />
            <p className="text-xs text-muted-foreground">Auto-optimized to WebP before upload (max 10MB).</p>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Submitting…" : "Submit report"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

