"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { Loader2, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import {
  previewTransactionReceiptEmail,
  recordTransaction,
} from "@/app/actions/finance";
import { draftPaymentReceiptEmail } from "@/app/actions/email";
import { LedgerCategory } from "@/lib/types/finance";

const formSchema = z.object({
  amount: z.number().min(1, "Amount must be greater than 0"),
  method: z.string().min(1, "Method is required"),
  note: z.string().optional(),
  sendReceiptEmail: z.boolean(),
  receiptSubject: z.string().trim().max(140).optional(),
  receiptMessage: z.string().trim().max(2000).optional(),
  receiptSignature: z.string().trim().max(600).optional(),
});

interface PaymentDialogProps {
  dormId: string;
  occupantId: string;
  category: LedgerCategory;
  eventId?: string;
  eventTitle?: string;
  metadata?: Record<string, unknown>;
  trigger?: React.ReactNode;
}

type PaymentFormValues = z.infer<typeof formSchema>;
type TransactionPayload = {
  occupant_id: string;
  category: LedgerCategory;
  amount: number;
  entry_type: "payment";
  method?: string;
  note?: string;
  metadata?: Record<string, unknown>;
  event_id?: string;
  receipt_email?:
    | {
      enabled: boolean;
      subject?: string;
      message?: string;
      signature?: string;
      logo_url?: string;
    }
    | undefined;
};

export function PaymentDialog({
  dormId,
  occupantId,
  category,
  eventId,
  eventTitle,
  metadata,
  trigger,
}: PaymentDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [isPreparingPreview, setIsPreparingPreview] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<TransactionPayload | null>(null);
  const [emailPreview, setEmailPreview] = useState<{
    recipient_email: string;
    subject: string;
    text: string;
  } | null>(null);
  const isContribution = category === "contributions";
  const contributionSignature =
    isContribution &&
    typeof metadata?.contribution_receipt_signature === "string" &&
    metadata.contribution_receipt_signature.trim().length > 0
      ? metadata.contribution_receipt_signature.trim()
      : "";
  const contributionReceiptSubject =
    isContribution &&
    typeof metadata?.contribution_receipt_subject === "string" &&
    metadata.contribution_receipt_subject.trim().length > 0
      ? metadata.contribution_receipt_subject.trim()
      : "";
  const contributionReceiptMessage =
    isContribution &&
    typeof metadata?.contribution_receipt_message === "string" &&
    metadata.contribution_receipt_message.trim().length > 0
      ? metadata.contribution_receipt_message.trim()
      : "";
  const contributionReceiptLogoUrl =
    isContribution &&
    typeof metadata?.contribution_receipt_logo_url === "string" &&
    metadata.contribution_receipt_logo_url.trim().length > 0
      ? metadata.contribution_receipt_logo_url.trim()
      : "";

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: 0,
      method: "cash",
      note: "",
      sendReceiptEmail: true,
      receiptSubject:
        contributionReceiptSubject || (eventTitle ? `Payment receipt: ${eventTitle}` : "Payment receipt"),
      receiptMessage: contributionReceiptMessage || "",
      receiptSignature: isContribution ? "" : "Dormy Admin",
    },
  });

  const sendReceiptEmail = form.watch("sendReceiptEmail");

  async function onDraftReceipt() {
    const values = form.getValues();
    if (!values.amount || values.amount <= 0) {
      toast.error("Enter an amount first.");
      return;
    }

    setIsDrafting(true);
    try {
      const result = await draftPaymentReceiptEmail({
        dorm_id: dormId,
        occupant_id: occupantId,
        category,
        amount: values.amount,
        method: values.method,
        note: values.note,
        event_id: eventId ?? null,
      });

      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }

      if (result?.subject) {
        form.setValue("receiptSubject", result.subject, { shouldDirty: true });
      }
      if (result?.message) {
        form.setValue("receiptMessage", result.message, { shouldDirty: true });
      }

      toast.success(result?.model === "fallback" ? "Draft ready (template)" : "AI draft ready");
    } catch {
      toast.error("Failed to draft receipt email.");
    } finally {
      setIsDrafting(false);
    }
  }

  function buildPayload(values: PaymentFormValues): TransactionPayload | null {
    if (values.sendReceiptEmail && isContribution && !contributionSignature) {
      toast.error("Set the contribution receipt signature on the contribution page first.");
      return null;
    }

    return {
      occupant_id: occupantId,
      category,
      entry_type: "payment",
      amount: values.amount,
      method: values.method,
      note: values.note,
      event_id: eventId,
      metadata,
      receipt_email: values.sendReceiptEmail
        ? {
            enabled: true,
            subject: isContribution
              ? contributionReceiptSubject || undefined
              : values.receiptSubject?.trim() || undefined,
            message: isContribution
              ? contributionReceiptMessage || undefined
              : values.receiptMessage?.trim() || undefined,
            signature: isContribution
              ? contributionSignature || undefined
              : values.receiptSignature?.trim() || undefined,
            logo_url: isContribution ? contributionReceiptLogoUrl || undefined : undefined,
          }
        : { enabled: false },
    };
  }

  async function submitPayment(payload: TransactionPayload) {
    setIsPending(true);
    try {
      const response = await recordTransaction(dormId, payload);

      if (response && "error" in response) {
        toast.error(response.error);
        return;
      }

      toast.success("Payment recorded");
      setConfirmOpen(false);
      setPendingPayload(null);
      setEmailPreview(null);
      setOpen(false);
      form.reset();
    } catch {
      toast.error("Failed to record payment");
    } finally {
      setIsPending(false);
    }
  }

  async function onSubmit(values: PaymentFormValues) {
    const payload = buildPayload(values);
    if (!payload) return;

    if (!values.sendReceiptEmail) {
      await submitPayment(payload);
      return;
    }

    setIsPreparingPreview(true);
    try {
      const preview = await previewTransactionReceiptEmail(dormId, payload);
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
  }

  async function handleConfirmSubmit() {
    if (!pendingPayload) {
      toast.error("No pending payment to submit.");
      return;
    }
    await submitPayment(pendingPayload);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          {trigger || (
            <Button variant="outline" size="sm">
              <Wallet className="mr-2 h-4 w-4" />
              Pay
            </Button>
          )}
        </DialogTrigger>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Record a payment for {category === "maintenance_fee" ? "maintenance fee" : category === "contributions" ? "event contribution" : "fines"}.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount (₱)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Method</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="gcash">GCash</SelectItem>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="note"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Note (Optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Receipt No., etc." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="rounded-xl border bg-muted/10 p-4">
                <FormField
                  control={form.control}
                  name="sendReceiptEmail"
                  render={({ field }) => (
                    <FormItem className="flex items-start gap-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                          className="mt-1"
                        />
                      </FormControl>
                      <div className="space-y-1">
                        <FormLabel className="leading-none">Email receipt</FormLabel>
                        <p className="text-xs text-muted-foreground">
                          {isContribution
                            ? "Uses the saved contribution receipt template from the contribution page."
                            : "Sends a receipt to the occupant email on file. Customize the subject/message, or draft with AI."}
                        </p>
                      </div>
                    </FormItem>
                  )}
                />

                {sendReceiptEmail ? (
                  <div className="mt-4 space-y-4 rounded-xl border bg-background/80 p-4">
                    {isContribution ? (
                      <>
                        <div className="rounded-lg border bg-muted/20 p-3">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Template Subject</p>
                          <p className="mt-1 text-sm font-medium">
                            {contributionReceiptSubject || eventTitle || "Contribution payment receipt"}
                          </p>
                        </div>
                        <div className="rounded-lg border bg-muted/20 p-3">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Template Message</p>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                            {contributionReceiptMessage || "Default contribution receipt message will be used."}
                          </p>
                        </div>
                        <div className="rounded-lg border bg-muted/20 p-3">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Signature Source</p>
                          {contributionSignature ? (
                            contributionSignature.startsWith("http") ? (
                              <img
                                src={contributionSignature}
                                alt="Contribution signature"
                                className="mt-2 max-h-20 w-auto rounded border bg-white p-2"
                              />
                            ) : (
                              <pre className="mt-2 whitespace-pre-wrap rounded-md border bg-background p-3 text-xs leading-relaxed">
                                {contributionSignature}
                              </pre>
                            )
                          ) : (
                            <p className="mt-1 text-xs text-destructive">
                              Set the contribution receipt signature on the contribution page first.
                            </p>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between border-b pb-2">
                          <span className="text-sm font-medium">Compose Receipt</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={onDraftReceipt}
                            disabled={isDrafting}
                            className="h-7 text-xs"
                          >
                            {isDrafting ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : "AI Draft"}
                          </Button>
                        </div>

                        <FormField
                          control={form.control}
                          name="receiptSubject"
                          render={({ field }) => (
                            <FormItem className="flex flex-col gap-2 space-y-0 sm:flex-row sm:items-center">
                              <FormLabel className="text-muted-foreground sm:w-20">Subject</FormLabel>
                              <FormControl>
                                <Input
                                  className="h-8 border-transparent bg-transparent shadow-none hover:border-input focus-visible:border-input"
                                  placeholder="Payment receipt"
                                  {...field}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <Separator />

                        <FormField
                          control={form.control}
                          name="receiptMessage"
                          render={({ field }) => (
                            <FormItem className="space-y-1">
                              <FormControl>
                                <Textarea
                                  className="min-h-[120px] resize-none border-transparent bg-transparent shadow-none hover:border-input focus-visible:border-input"
                                  placeholder={eventTitle ? `Type your message here... Thanks for paying for ${eventTitle}.` : "Type your message here..."}
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <Separator />

                        <FormField
                          control={form.control}
                          name="receiptSignature"
                          render={({ field }) => (
                            <FormItem className="flex flex-col gap-2 space-y-0 pt-1 sm:flex-row sm:items-center">
                              <FormLabel className="text-muted-foreground sm:w-20">Sign-off</FormLabel>
                              <FormControl>
                                <Input
                                  className="h-8 border-transparent bg-transparent shadow-none hover:border-input focus-visible:border-input"
                                  placeholder="Dormy Admin"
                                  {...field}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </>
                    )}
                  </div>
                ) : null}
              </div>
              <DialogFooter className="pt-1">
                <Button type="submit" isLoading={isPending || isPreparingPreview}>
                  Submit Payment
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Confirm Receipt Email</DialogTitle>
            <DialogDescription>
              Review the exact email that will be sent before finalizing this payment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">To</p>
                <p className="mt-1 text-sm font-medium">{emailPreview?.recipient_email || "—"}</p>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Subject</p>
                <p className="mt-1 text-sm font-medium">{emailPreview?.subject || "—"}</p>
              </div>
            </div>
            <div className="rounded-lg border bg-muted/10 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Email Preview (Text)</p>
              <pre className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border bg-background p-3 text-xs leading-relaxed">
                {emailPreview?.text || "No preview available."}
              </pre>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)} disabled={isPending}>
              Back
            </Button>
            <Button type="button" onClick={handleConfirmSubmit} disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm and Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
