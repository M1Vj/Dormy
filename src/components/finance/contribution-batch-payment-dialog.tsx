"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarCheck2, Loader2, Mail } from "lucide-react";

import { draftPaymentReceiptEmail } from "@/app/actions/email";
import { recordContributionBatchPayment } from "@/app/actions/finance";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type ContributionOption = {
  id: string;
  title: string;
  remaining: number;
};

type OccupantOption = {
  id: string;
  fullName: string;
  studentId?: string | null;
};

function nowLocalDateTimeValue() {
  const now = new Date();
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function ContributionBatchPaymentDialog({
  dormId,
  contributions,
  occupants,
  trigger,
}: {
  dormId: string;
  contributions: ContributionOption[];
  occupants: OccupantOption[];
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [occupantId, setOccupantId] = useState<string>("");
  const [selectedContributionIds, setSelectedContributionIds] = useState<string[]>([]);
  const [amount, setAmount] = useState<number>(0);
  const [method, setMethod] = useState<"cash" | "gcash">("cash");
  const [paidAtLocal, setPaidAtLocal] = useState(nowLocalDateTimeValue());
  const [allocationTargetId, setAllocationTargetId] = useState<string>("");
  const [sendReceiptEmail, setSendReceiptEmail] = useState(true);
  const [receiptEmailOverride, setReceiptEmailOverride] = useState("");
  const [receiptSubject, setReceiptSubject] = useState("Contribution payment receipt");
  const [receiptMessage, setReceiptMessage] = useState("");
  const [receiptSignature, setReceiptSignature] = useState("Dormy Treasurer");
  const [receiptLogoUrl, setReceiptLogoUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);

  const selectedContributions = useMemo(
    () => contributions.filter((contribution) => selectedContributionIds.includes(contribution.id)),
    [contributions, selectedContributionIds]
  );

  const computedTotal = useMemo(
    () => selectedContributions.reduce((sum, contribution) => sum + Math.max(0, contribution.remaining), 0),
    [selectedContributions]
  );

  const amountDifference = useMemo(() => Number((amount - computedTotal).toFixed(2)), [amount, computedTotal]);

  const previewRows = useMemo(() => {
    if (!selectedContributions.length) return [] as Array<{ title: string; amount: number }>;
    const rows = selectedContributions.map((contribution) => ({
      id: contribution.id,
      title: contribution.title,
      amount: Math.max(0, contribution.remaining),
    }));

    if (Math.abs(amountDifference) < 0.01) {
      return rows.map((row) => ({ title: row.title, amount: row.amount }));
    }

    if (!allocationTargetId) {
      return rows.map((row) => ({ title: row.title, amount: row.amount }));
    }

    return rows.map((row) => {
      if (row.id !== allocationTargetId) {
        return { title: row.title, amount: row.amount };
      }
      return { title: row.title, amount: Number((row.amount + amountDifference).toFixed(2)) };
    });
  }, [allocationTargetId, amountDifference, selectedContributions]);

  const toggleContribution = (id: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...selectedContributionIds, id]))
      : selectedContributionIds.filter((value) => value !== id);

    setSelectedContributionIds(next);

    const nextSelected = contributions.filter((contribution) => next.includes(contribution.id));
    const nextTotal = nextSelected.reduce((sum, contribution) => sum + Math.max(0, contribution.remaining), 0);
    setAmount(Number(nextTotal.toFixed(2)));

    if (!next.includes(allocationTargetId)) {
      setAllocationTargetId("");
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setSelectedContributionIds([]);
      setAmount(0);
      setAllocationTargetId("");
      setPaidAtLocal(nowLocalDateTimeValue());
    }
  };

  const handleDraft = async () => {
    if (!occupantId) {
      toast.error("Select an occupant first.");
      return;
    }
    if (amount <= 0) {
      toast.error("Enter a valid amount first.");
      return;
    }

    setIsDrafting(true);
    try {
      const result = await draftPaymentReceiptEmail({
        dorm_id: dormId,
        occupant_id: occupantId,
        category: "contributions",
        amount,
        method,
        note: selectedContributions.map((item) => item.title).join(", "),
        event_id: null,
      });

      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }

      if (result?.subject) {
        setReceiptSubject(result.subject);
      }
      if (result?.message) {
        setReceiptMessage(result.message);
      }
      toast.success(result?.model === "fallback" ? "Draft ready (template)." : "AI draft ready.");
    } catch {
      toast.error("Failed to draft receipt email.");
    } finally {
      setIsDrafting(false);
    }
  };

  const handleSubmit = async () => {
    if (!occupantId) {
      toast.error("Select an occupant.");
      return;
    }

    if (!selectedContributionIds.length) {
      toast.error("Select at least one contribution.");
      return;
    }

    if (amount <= 0) {
      toast.error("Amount must be greater than zero.");
      return;
    }

    if (Math.abs(amountDifference) >= 0.01 && !allocationTargetId) {
      toast.error("Choose where to apply the excess or short payment amount.");
      return;
    }

    const paidAt = new Date(paidAtLocal);
    if (Number.isNaN(paidAt.getTime())) {
      toast.error("Provide a valid payment date and time.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await recordContributionBatchPayment(dormId, {
        occupant_id: occupantId,
        contribution_ids: selectedContributionIds,
        amount,
        method,
        paid_at_iso: paidAt.toISOString(),
        allocation_target_id: allocationTargetId || null,
        send_receipt_email: sendReceiptEmail,
        receipt_email_override: receiptEmailOverride.trim() || null,
        receipt_subject: receiptSubject.trim() || null,
        receipt_message: receiptMessage.trim() || null,
        receipt_signature: receiptSignature.trim() || null,
        receipt_logo_url: receiptLogoUrl.trim() || null,
      });

      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success("Batch payment recorded.");
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Failed to record batch payment.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <CalendarCheck2 className="mr-2 h-4 w-4" />
            Pay Contributions
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record Contribution Payment</DialogTitle>
          <DialogDescription>
            One payment can cover multiple contributions and optionally send one combined receipt email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Occupant</Label>
              <Select value={occupantId} onValueChange={setOccupantId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select occupant" />
                </SelectTrigger>
                <SelectContent>
                  {occupants.map((occupant) => (
                    <SelectItem key={occupant.id} value={occupant.id}>
                      {occupant.fullName}
                      {occupant.studentId ? ` (${occupant.studentId})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={method} onValueChange={(value) => setMethod(value as "cash" | "gcash")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="gcash">GCash</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Contribution Selection</Label>
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
              {contributions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payable contributions available.</p>
              ) : (
                contributions.map((contribution) => {
                  const checked = selectedContributionIds.includes(contribution.id);
                  return (
                    <label key={contribution.id} className="flex items-start gap-3 rounded-md border p-2">
                      <Checkbox checked={checked} onCheckedChange={(value) => toggleContribution(contribution.id, Boolean(value))} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{contribution.title}</p>
                        <p className="text-xs text-muted-foreground">Remaining: ₱{contribution.remaining.toFixed(2)}</p>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">Selected: {selectedContributionIds.length}</Badge>
              <Badge variant="secondary">Exact Total: ₱{computedTotal.toFixed(2)}</Badge>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Amount Paid (₱)</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(parseFloat(event.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label>Date & Time</Label>
              <Input type="datetime-local" value={paidAtLocal} onChange={(event) => setPaidAtLocal(event.target.value)} />
            </div>
          </div>

          {Math.abs(amountDifference) >= 0.01 ? (
            <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-medium text-amber-700">
                Amount difference: {amountDifference > 0 ? "+" : ""}₱{amountDifference.toFixed(2)}
              </p>
              <Label>Apply difference to</Label>
              <Select value={allocationTargetId} onValueChange={setAllocationTargetId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select contribution" />
                </SelectTrigger>
                <SelectContent>
                  {selectedContributions.map((contribution) => (
                    <SelectItem key={contribution.id} value={contribution.id}>
                      {contribution.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label className="text-sm">Receipt Email</Label>
                <p className="text-xs text-muted-foreground">Send one receipt containing all selected contributions.</p>
              </div>
              <Checkbox checked={sendReceiptEmail} onCheckedChange={(value) => setSendReceiptEmail(Boolean(value))} />
            </div>

            {sendReceiptEmail ? (
              <div className="space-y-3 pt-2">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Override Recipient Email (Optional)</Label>
                    <Input value={receiptEmailOverride} onChange={(event) => setReceiptEmailOverride(event.target.value)} placeholder="name@example.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Logo URL (Optional)</Label>
                    <Input value={receiptLogoUrl} onChange={(event) => setReceiptLogoUrl(event.target.value)} placeholder="https://..." />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <Label>Receipt Message</Label>
                  <Button type="button" variant="outline" size="sm" onClick={handleDraft} disabled={isDrafting}>
                    {isDrafting ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Mail className="mr-2 h-3 w-3" />}
                    AI Draft
                  </Button>
                </div>

                <Input value={receiptSubject} onChange={(event) => setReceiptSubject(event.target.value)} placeholder="Receipt subject" />
                <Textarea value={receiptMessage} onChange={(event) => setReceiptMessage(event.target.value)} rows={4} placeholder="Receipt message" />
                <Input value={receiptSignature} onChange={(event) => setReceiptSignature(event.target.value)} placeholder="Signature" />

                <div className="rounded-md bg-muted/40 p-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Preview Summary</p>
                  <div className="space-y-1 text-xs">
                    {previewRows.map((row, index) => (
                      <div key={`${row.title}-${index}`} className="flex justify-between gap-4">
                        <span className="truncate">{row.title}</span>
                        <span>₱{Math.max(0, row.amount).toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="mt-2 flex justify-between border-t pt-2 text-sm font-semibold">
                      <span>Total</span>
                      <span>₱{amount.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting || selectedContributionIds.length === 0}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Record Batch Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
