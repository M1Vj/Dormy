"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { toast } from "sonner";

import { resendContributionReceipt } from "@/app/actions/finance";
import { OccupantCombobox } from "@/components/finance/occupant-combobox";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

type OccupantOption = {
  id: string;
  fullName: string;
  studentId?: string | null;
};

type ContributionOption = {
  id: string;
  title: string;
};

type OccupantContributionPaid = Record<string, number>;

export function ContributionResendReceiptDialog({
  dormId,
  occupants,
  contributions,
  occupantContributionPaid,
}: {
  dormId: string;
  occupants: OccupantOption[];
  contributions: ContributionOption[];
  occupantContributionPaid: OccupantContributionPaid;
}) {
  const [open, setOpen] = useState(false);
  const [occupantId, setOccupantId] = useState("");
  const [selectedContributionIds, setSelectedContributionIds] = useState<string[]>([]);
  const [receiptEmailOverride, setReceiptEmailOverride] = useState("");
  const [isPending, startTransition] = useTransition();

  const paidContributionOptions = useMemo(() => {
    if (!occupantId) {
      return [] as Array<ContributionOption & { paidAmount: number }>;
    }

    return contributions
      .map((contribution) => {
        const key = `${occupantId}:${contribution.id}`;
        const paidAmount = occupantContributionPaid[key] ?? 0;
        return {
          ...contribution,
          paidAmount,
        };
      })
      .filter((contribution) => contribution.paidAmount > 0.009)
      .sort((a, b) => (a.title < b.title ? -1 : 1));
  }, [occupantContributionPaid, contributions, occupantId]);

  useEffect(() => {
    setSelectedContributionIds((previous) =>
      previous.filter((contributionId) =>
        paidContributionOptions.some((option) => option.id === contributionId)
      )
    );
  }, [paidContributionOptions]);

  const toggleContribution = (contributionId: string, checked: boolean) => {
    setSelectedContributionIds((previous) => {
      if (checked) {
        return Array.from(new Set([...previous, contributionId]));
      }
      return previous.filter((id) => id !== contributionId);
    });
  };

  const handleSubmit = () => {
    if (!occupantId) {
      toast.error("Select an occupant.");
      return;
    }
    if (selectedContributionIds.length === 0) {
      toast.error("Select at least one paid contribution.");
      return;
    }

    startTransition(async () => {
      const result = await resendContributionReceipt(dormId, {
        occupant_id: occupantId,
        contribution_ids: selectedContributionIds,
        receipt_email_override: receiptEmailOverride.trim() || null,
      });

      if (result && "error" in result) {
        toast.error(typeof result.error === "string" ? result.error : "Failed to resend receipt.");
        return;
      }

      toast.success(
        result?.recipient_email
          ? `Receipt resent to ${result.recipient_email}.`
          : "Receipt resent."
      );
      setOpen(false);
      setOccupantId("");
      setSelectedContributionIds([]);
      setReceiptEmailOverride("");
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Mail className="mr-2 h-4 w-4" />
          Resend Receipt
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg bg-white/95 dark:bg-card/95 backdrop-blur-xl border-muted/50 shadow-2xl">
        <DialogHeader>
          <DialogTitle>Resend Receipt</DialogTitle>
          <DialogDescription>
            Choose an occupant and one or more contributions they already paid, then resend the receipt email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Occupant</Label>
            <OccupantCombobox occupants={occupants} value={occupantId} onValueChange={setOccupantId} />
          </div>

          <div className="space-y-2">
            <Label>Paid Contributions</Label>
            <div className="max-h-52 space-y-2 overflow-y-auto rounded-md border p-3">
              {!occupantId ? (
                <p className="text-sm text-muted-foreground">Select occupant first.</p>
              ) : paidContributionOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No paid contribution found.</p>
              ) : (
                paidContributionOptions.map((contribution) => {
                  const checked = selectedContributionIds.includes(contribution.id);
                  return (
                    <label key={contribution.id} className="flex items-start gap-3 rounded-md border border-border/50 bg-background/50 p-2.5 hover:bg-muted/30 transition-colors cursor-pointer">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) =>
                          toggleContribution(contribution.id, Boolean(value))
                        }
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{contribution.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Paid: ₱{contribution.paidAmount.toFixed(2)}
                        </p>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Selected: {selectedContributionIds.length}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Override Recipient Email (Optional)</Label>
            <Input
              value={receiptEmailOverride}
              onChange={(event) => setReceiptEmailOverride(event.target.value)}
              placeholder="name@example.com"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isPending} isLoading={isPending}>
            Resend
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
