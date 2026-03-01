"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";

import { createTreasurerFinanceManualEntry } from "@/app/actions/finance";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";

export function TreasurerFinanceEntryDialog({
  dormId,
  disabled = false,
}: {
  dormId: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [entryKind, setEntryKind] = useState<"inflow" | "expense">("inflow");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const defaultDate = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

  const onSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const rawAmount = Number(formData.get("amount"));
      const amount = Number.isFinite(rawAmount) ? rawAmount : Number.NaN;

      const result = await createTreasurerFinanceManualEntry(dormId, {
        entry_kind: String(formData.get("entry_kind") || "inflow") as "inflow" | "expense",
        title: String(formData.get("title") || ""),
        amount,
        happened_on: String(formData.get("happened_on") || ""),
        counterparty: String(formData.get("counterparty") || ""),
        note: String(formData.get("note") || ""),
      });

      if ("error" in result) {
        setError(result.error ?? "Unable to save entry.");
        return;
      }

      formRef.current?.reset();
      setEntryKind("inflow");
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={disabled}>
          <Plus className="mr-2 h-4 w-4" />
          Add Entry
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Finance Entry</DialogTitle>
          <DialogDescription>
            Add a manual inflow or expense for money that is outside occupant contribution payments.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} action={onSubmit} className="space-y-4">
          <input type="hidden" name="entry_kind" value={entryKind} />
          <div className="space-y-2">
            <Label htmlFor="entry_kind">Entry Type</Label>
            <Select
              value={entryKind}
              onValueChange={(value) => setEntryKind(value as "inflow" | "expense")}
            >
              <SelectTrigger id="entry_kind">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inflow">Inflow</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              placeholder={entryKind === "inflow" ? "e.g., Donation from alumni" : "e.g., Emergency plumbing"}
              required
              minLength={2}
              maxLength={160}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (₱)</Label>
              <Input id="amount" name="amount" type="number" step="0.01" min="0.01" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="happened_on">Date</Label>
              <Input id="happened_on" name="happened_on" type="date" defaultValue={defaultDate} required />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="counterparty">{entryKind === "inflow" ? "Received From" : "Paid To"} (Optional)</Label>
            <Input id="counterparty" name="counterparty" maxLength={160} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">Note (Optional)</Label>
            <Textarea id="note" name="note" rows={3} maxLength={2000} />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isPending}>
              Save Entry
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
