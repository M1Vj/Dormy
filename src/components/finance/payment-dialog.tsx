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

import { recordTransaction } from "@/app/actions/finance";
import { draftPaymentReceiptEmail } from "@/app/actions/email";
import { LedgerCategory } from "@/lib/types/finance";

const formSchema = z.object({
  amount: z.number().min(1, "Amount must be greater than 0"),
  method: z.string().min(1, "Method is required"),
  note: z.string().optional(),
  sendReceiptEmail: z.boolean(),
  receiptSubject: z.string().trim().max(140).optional(),
  receiptMessage: z.string().trim().max(2000).optional(),
  receiptSignature: z.string().trim().max(100).optional(),
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

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: 0,
      method: "cash",
      note: "",
      sendReceiptEmail: true,
      receiptSubject: eventTitle ? `Payment receipt: ${eventTitle}` : "Payment receipt",
      receiptMessage: "",
      receiptSignature: "Dormy Admin",
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

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsPending(true);
    try {
      const response = await recordTransaction(dormId, {
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
            subject: values.receiptSubject?.trim() || undefined,
            message: values.receiptMessage?.trim() || undefined,
            signature: values.receiptSignature?.trim() || undefined,
          }
          : { enabled: false },
      });

      if (response && 'error' in response) { // Check if error exists
        toast.error(response.error);
        return;
      }

      toast.success("Payment recorded");
      setOpen(false);
      form.reset();
    } catch {
      toast.error("Failed to record payment");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Wallet className="mr-2 h-4 w-4" />
            Pay
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>
            Record a payment for {category === 'maintenance_fee' ? 'maintenance fee' : category === 'contributions' ? 'event contribution' : 'fines'}.
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

            <div className="rounded-lg border p-3">
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
                        Sends a receipt to the occupant email on file. Customize the subject/message, or draft with AI.
                      </p>
                    </div>
                  </FormItem>
                )}
              />

              {sendReceiptEmail ? (
                <div className="mt-4 space-y-4 rounded-md border p-4 bg-muted/20">
                  <div className="flex items-center justify-between pb-2 border-b">
                    <span className="font-medium text-sm">Compose Receipt</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={onDraftReceipt}
                      disabled={isDrafting}
                      className="h-7 text-xs"
                    >
                      {isDrafting ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : "✨ AI Draft"}
                    </Button>
                  </div>

                  <FormField
                    control={form.control}
                    name="receiptSubject"
                    render={({ field }) => (
                      <FormItem className="flex flex-col sm:flex-row sm:items-center gap-2 space-y-0">
                        <FormLabel className="sm:w-20 text-muted-foreground">Subject:</FormLabel>
                        <FormControl>
                          <Input className="h-8 shadow-none border-transparent hover:border-input focus-visible:border-input bg-transparent" placeholder="Payment receipt" {...field} />
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
                            className="resize-none shadow-none border-transparent hover:border-input focus-visible:border-input bg-transparent min-h-[120px]"
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
                      <FormItem className="flex flex-col sm:flex-row sm:items-center gap-2 space-y-0 pt-1">
                        <FormLabel className="sm:w-20 text-muted-foreground">Sign-off:</FormLabel>
                        <FormControl>
                          <Input className="h-8 shadow-none border-transparent hover:border-input focus-visible:border-input bg-transparent" placeholder="Dormy Admin" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="submit" isLoading={isPending}>
                Record Payment
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
