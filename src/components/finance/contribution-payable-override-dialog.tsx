"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, PenLine } from "lucide-react";

import { overrideContributionPayable } from "@/app/actions/finance";
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

export function ContributionPayableOverrideDialog({
  dormId,
  contributionId,
  occupantId,
  currentPayable,
  trigger,
}: {
  dormId: string;
  contributionId: string;
  occupantId: string;
  currentPayable: number;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [newPayable, setNewPayable] = useState<number>(Number(currentPayable.toFixed(2)));
  const [reason, setReason] = useState("");

  const handleSubmit = async () => {
    if (newPayable < 0) {
      toast.error("New payable cannot be negative.");
      return;
    }

    if (reason.trim().length < 3) {
      toast.error("Reason must be at least 3 characters.");
      return;
    }

    setIsPending(true);
    try {
      const result = await overrideContributionPayable(dormId, {
        contribution_id: contributionId,
        occupant_id: occupantId,
        new_payable: newPayable,
        reason,
      });

      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success("Payable updated.");
      setOpen(false);
      setReason("");
      router.refresh();
    } catch {
      toast.error("Failed to update payable.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" variant="outline">
            <PenLine className="mr-2 h-4 w-4" />
            Change Payable
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-white/95 dark:bg-card/95 backdrop-blur-xl border-muted/50 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Change Payable</DialogTitle>
          <DialogDescription className="text-sm">
            Set a custom payable amount for this occupant in the selected contribution.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Current Payable</Label>
            <Input value={`₱${currentPayable.toFixed(2)}`} readOnly />
          </div>

          <div className="space-y-2">
            <Label>New Payable (₱)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={newPayable}
              onChange={(event) => setNewPayable(parseFloat(event.target.value) || 0)}
            />
          </div>

          <div className="space-y-2">
            <Label>Reason</Label>
            <Textarea
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain why payable amount is being changed"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isPending}>
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
