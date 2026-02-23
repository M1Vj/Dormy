"use client";

import { useState } from "react";
import { PenSquare } from "lucide-react";
import { toast } from "sonner";

import { overwriteLedgerEntry } from "@/app/actions/finance";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type LedgerOverwriteDialogProps = {
  dormId: string;
  trigger?: React.ReactNode;
  defaultEntryId?: string;
};

export function LedgerOverwriteDialog({
  dormId,
  trigger,
  defaultEntryId,
}: LedgerOverwriteDialogProps) {
  const [open, setOpen] = useState(false);
  const [entryId, setEntryId] = useState(defaultEntryId ?? "");
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState("");
  const [isPending, setIsPending] = useState(false);

  const resetForm = () => {
    setEntryId(defaultEntryId ?? "");
    setAmount(0);
    setNote("");
    setReason("");
    setMethod("");
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!entryId.trim()) {
      toast.error("Entry ID is required.");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid replacement amount.");
      return;
    }

    if (!note.trim()) {
      toast.error("Replacement note is required.");
      return;
    }

    if (!reason.trim()) {
      toast.error("Overwrite reason is required.");
      return;
    }

    setIsPending(true);

    try {
      const result = await overwriteLedgerEntry(dormId, {
        entry_id: entryId.trim(),
        amount,
        note: note.trim(),
        reason: reason.trim(),
        method: method.trim() || undefined,
      });

      if (result?.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Ledger entry overwritten.");
      setOpen(false);
      resetForm();
    } catch {
      toast.error("Failed to overwrite ledger entry.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          resetForm();
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <PenSquare className="mr-2 h-4 w-4" />
            Overwrite entry
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg bg-white/95 dark:bg-card/95 backdrop-blur-xl border-muted/50 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Overwrite ledger entry</DialogTitle>
          <DialogDescription className="text-sm">
            Voids the original transaction and creates a corrected replacement entry.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="entry-id">Ledger entry ID</Label>
            <Input
              id="entry-id"
              value={entryId}
              onChange={(event) => setEntryId(event.target.value)}
              placeholder="Paste ledger entry UUID"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="replacement-amount">Replacement amount (PHP)</Label>
            <Input
              id="replacement-amount"
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(Number(event.target.value) || 0)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="replacement-note">Replacement note</Label>
            <Textarea
              id="replacement-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Example: Corrected charge after receipt verification"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="overwrite-reason">Reason for overwrite</Label>
            <Textarea
              id="overwrite-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain why the original entry must be corrected"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="replacement-method">Method (optional)</Label>
            <Input
              id="replacement-method"
              value={method}
              onChange={(event) => setMethod(event.target.value)}
              placeholder="cash, gcash, bank_transfer"
            />
          </div>

          <DialogFooter>
            <Button type="submit" isLoading={isPending}>
              Confirm overwrite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
