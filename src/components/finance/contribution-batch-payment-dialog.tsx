/* eslint-disable @next/next/no-img-element */
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarCheck2, Loader2 } from "lucide-react";

import {
  previewContributionBatchPaymentEmail,
  recordContributionBatchPayment,
} from "@/app/actions/finance";
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

type ContributionOption = {
  id: string;
  title: string;
  remaining: number;
  receiptSignature: string | null;
  receiptSubject: string | null;
  receiptMessage: string | null;
  receiptLogoUrl: string | null;
};

type OccupantOption = {
  id: string;
  fullName: string;
  studentId?: string | null;
};

type BatchPaymentPayload = {
  occupant_id: string;
  contribution_ids: string[];
  amount: number;
  method: "cash" | "gcash";
  paid_at_iso: string;
  allocation_target_id: string | null;
  send_receipt_email: boolean;
  receipt_email_override: string | null;
  receipt_subject: string | null;
  receipt_message: string | null;
  receipt_signature: string | null;
  receipt_logo_url: string | null;
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPreparingPreview, setIsPreparingPreview] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<BatchPaymentPayload | null>(null);
  const [emailPreview, setEmailPreview] = useState<{
    recipient_email: string;
    subject: string;
    text: string;
  } | null>(null);

  const selectedContributions = useMemo(
    () => contributions.filter((contribution) => selectedContributionIds.includes(contribution.id)),
    [contributions, selectedContributionIds]
  );

  const computedTotal = useMemo(
    () => selectedContributions.reduce((sum, contribution) => sum + Math.max(0, contribution.remaining), 0),
    [selectedContributions]
  );

  const amountDifference = useMemo(() => Number((amount - computedTotal).toFixed(2)), [amount, computedTotal]);
  const selectedContributionSignatureSet = useMemo(
    () =>
      Array.from(
        new Set(
          selectedContributions
            .map((contribution) => contribution.receiptSignature?.trim() ?? "")
            .filter((value) => value.length > 0)
        )
      ),
    [selectedContributions]
  );
  const selectedContributionSubjectSet = useMemo(
    () =>
      Array.from(
        new Set(
          selectedContributions
            .map((contribution) => contribution.receiptSubject?.trim() ?? "")
            .filter((value) => value.length > 0)
        )
      ),
    [selectedContributions]
  );
  const selectedContributionMessageSet = useMemo(
    () =>
      Array.from(
        new Set(
          selectedContributions
            .map((contribution) => contribution.receiptMessage?.trim() ?? "")
            .filter((value) => value.length > 0)
        )
      ),
    [selectedContributions]
  );
  const selectedContributionLogoSet = useMemo(
    () =>
      Array.from(
        new Set(
          selectedContributions
            .map((contribution) => contribution.receiptLogoUrl?.trim() ?? "")
            .filter((value) => value.length > 0)
        )
      ),
    [selectedContributions]
  );
  const selectedContributionSignature =
    selectedContributionSignatureSet.length === 1 ? selectedContributionSignatureSet[0] : "";
  const selectedContributionSubject =
    selectedContributionSubjectSet.length === 1 ? selectedContributionSubjectSet[0] : "";
  const selectedContributionMessage =
    selectedContributionMessageSet.length === 1 ? selectedContributionMessageSet[0] : "";
  const selectedContributionLogoUrl =
    selectedContributionLogoSet.length === 1 ? selectedContributionLogoSet[0] : "";
  const hasMixedContributionSignatures = selectedContributionSignatureSet.length > 1;
  const hasMixedContributionSubjects = selectedContributionSubjectSet.length > 1;
  const hasMixedContributionMessages = selectedContributionMessageSet.length > 1;
  const hasMixedContributionLogos = selectedContributionLogoSet.length > 1;
  const hasMissingContributionSignature =
    selectedContributions.length > 0 &&
    selectedContributions.some((contribution) => !(contribution.receiptSignature?.trim() ?? ""));

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
      setConfirmOpen(false);
      setPendingPayload(null);
      setEmailPreview(null);
    }
  };

  const buildPayload = () => {
    if (!occupantId) {
      toast.error("Select an occupant.");
      return null;
    }

    if (!selectedContributionIds.length) {
      toast.error("Select at least one contribution.");
      return null;
    }

    if (amount <= 0) {
      toast.error("Amount must be greater than zero.");
      return null;
    }

    if (Math.abs(amountDifference) >= 0.01 && !allocationTargetId) {
      toast.error("Choose where to apply the excess or short payment amount.");
      return null;
    }

    const paidAt = new Date(paidAtLocal);
    if (Number.isNaN(paidAt.getTime())) {
      toast.error("Provide a valid payment date and time.");
      return null;
    }

    if (sendReceiptEmail) {
      if (hasMixedContributionSignatures) {
        toast.error("Selected contributions use different signatures. Use one signature template.");
        return null;
      }
      if (hasMixedContributionSubjects) {
        toast.error("Selected contributions use different receipt subjects. Use one receipt template.");
        return null;
      }
      if (hasMixedContributionMessages) {
        toast.error("Selected contributions use different receipt messages. Use one receipt template.");
        return null;
      }
      if (hasMixedContributionLogos) {
        toast.error("Selected contributions use different receipt logos. Use one receipt template.");
        return null;
      }
      if (hasMissingContributionSignature || !selectedContributionSignature) {
        toast.error("Set the contribution receipt signature on the contribution page first.");
        return null;
      }
    }

    const payload: BatchPaymentPayload = {
      occupant_id: occupantId,
      contribution_ids: selectedContributionIds,
      amount,
      method,
      paid_at_iso: paidAt.toISOString(),
      allocation_target_id: allocationTargetId || null,
      send_receipt_email: sendReceiptEmail,
      receipt_email_override: receiptEmailOverride.trim() || null,
      receipt_subject: null,
      receipt_message: null,
      receipt_signature: null,
      receipt_logo_url: null,
    };

    return payload;
  };

  const submitPayment = async (payload: BatchPaymentPayload) => {
    setIsSubmitting(true);
    try {
      const result = await recordContributionBatchPayment(dormId, payload);

      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success("Batch payment recorded.");
      setConfirmOpen(false);
      setPendingPayload(null);
      setEmailPreview(null);
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Failed to record batch payment.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProceedToConfirmation = async () => {
    const payload = buildPayload();
    if (!payload) {
      return;
    }

    if (!payload.send_receipt_email) {
      await submitPayment(payload);
      return;
    }

    setIsPreparingPreview(true);
    try {
      const preview = await previewContributionBatchPaymentEmail(dormId, payload);
      if (preview && "error" in preview) {
        toast.error(preview.error);
        return;
      }
      if (!preview || !("success" in preview) || !preview.success) {
        toast.error("Failed to generate email preview.");
        return;
      }

      setPendingPayload(payload);
      setEmailPreview({
        recipient_email: preview.recipient_email,
        subject: preview.subject,
        text: preview.text,
      });
      setConfirmOpen(true);
    } catch {
      toast.error("Failed to generate email preview.");
    } finally {
      setIsPreparingPreview(false);
    }
  };

  const handleConfirmSubmit = async () => {
    if (!pendingPayload) {
      toast.error("No pending payment to submit.");
      return;
    }

    await submitPayment(pendingPayload);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          {trigger || (
            <Button>
              <CalendarCheck2 className="mr-2 h-4 w-4" />
              Pay Contributions
            </Button>
          )}
        </DialogTrigger>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl bg-white/95 dark:bg-card/95 backdrop-blur-xl border-muted/50 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">Record Contribution Payment</DialogTitle>
            <DialogDescription className="text-sm">
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
                      <label key={contribution.id} className="flex items-start gap-3 rounded-md border border-border/50 bg-background/50 p-3 hover:bg-muted/30 transition-colors cursor-pointer">
                        <Checkbox checked={checked} onCheckedChange={(value) => toggleContribution(contribution.id, Boolean(value))} className="mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium leading-none">{contribution.title}</p>
                          <p className="text-xs text-muted-foreground mt-1.5">Remaining: <span className="font-semibold text-foreground">₱{contribution.remaining.toFixed(2)}</span></p>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1 font-medium">
                <Badge variant="secondary" className="bg-secondary/50">Selected: {selectedContributionIds.length}</Badge>
                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">Exact Total: ₱{computedTotal.toFixed(2)}</Badge>
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

            <div className="space-y-4 rounded-lg border border-border/50 bg-muted/10 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label className="text-sm">Receipt Email</Label>
                  <p className="text-xs text-muted-foreground">Send one receipt containing all selected contributions.</p>
                </div>
                <Checkbox checked={sendReceiptEmail} onCheckedChange={(value) => setSendReceiptEmail(Boolean(value))} />
              </div>

              {sendReceiptEmail ? (
                <div className="space-y-3 pt-2">
                  <div className="space-y-2">
                    <Label>Override Recipient Email (Optional)</Label>
                    <Input
                      value={receiptEmailOverride}
                      onChange={(event) => setReceiptEmailOverride(event.target.value)}
                      placeholder="name@example.com"
                    />
                  </div>

                  <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                    <Label>Saved Receipt Template Source</Label>
                    {hasMixedContributionSignatures ? (
                      <p className="text-xs text-destructive">
                        Selected contributions use different signatures. Select contributions that share one signature.
                      </p>
                    ) : hasMissingContributionSignature || !selectedContributionSignature ? (
                      <p className="text-xs text-destructive">
                        Set the receipt signature on the contribution page before sending this email.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Subject</p>
                          <p className="text-sm font-medium">
                            {hasMixedContributionSubjects
                              ? "Mixed templates"
                              : selectedContributionSubject || "Contribution payment receipt"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Message</p>
                          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                            {hasMixedContributionMessages
                              ? "Mixed templates"
                              : selectedContributionMessage || "Default contribution receipt message will be used."}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Logo</p>
                          {hasMixedContributionLogos ? (
                            <p className="text-xs text-destructive">Selected contributions use different logos.</p>
                          ) : selectedContributionLogoUrl ? (
                            <img
                              src={selectedContributionLogoUrl}
                              alt="Contribution logo"
                              className="mt-2 max-h-16 w-auto rounded border bg-white p-2"
                            />
                          ) : (
                            <p className="text-xs text-muted-foreground">No logo saved for this template.</p>
                          )}
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Signature</p>
                          {selectedContributionSignature.startsWith("http") ? (
                            <img
                              src={selectedContributionSignature}
                              alt="Contribution signature"
                              className="mt-2 max-h-20 w-auto rounded border bg-white p-2"
                            />
                          ) : (
                            <pre className="mt-2 whitespace-pre-wrap rounded-md border bg-background p-3 text-xs leading-relaxed">
                              {selectedContributionSignature}
                            </pre>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

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
            <Button
              type="button"
              onClick={handleProceedToConfirmation}
              disabled={isSubmitting || isPreparingPreview || selectedContributionIds.length === 0}
            >
              {isPreparingPreview || isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Submit Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl bg-white/95 dark:bg-card/95 backdrop-blur-xl border-muted/50 shadow-2xl">
          <DialogHeader>
            <DialogTitle>Confirm Receipt Email</DialogTitle>
            <DialogDescription>
              Review the exact email content before finalizing this payment.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label>To</Label>
              <p className="text-sm">{emailPreview?.recipient_email || "—"}</p>
            </div>
            <div>
              <Label>Subject</Label>
              <p className="text-sm">{emailPreview?.subject || "—"}</p>
            </div>
            <div>
              <Label>Email Preview (Text)</Label>
              <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">
                {emailPreview?.text || "No preview available."}
              </pre>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)} disabled={isSubmitting}>
              Back
            </Button>
            <Button type="button" onClick={handleConfirmSubmit} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm and Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
