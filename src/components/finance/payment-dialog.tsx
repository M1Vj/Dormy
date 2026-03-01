/* eslint-disable @next/next/no-img-element */
"use client";

import { usePathname } from "next/navigation";

import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { Loader2, Wallet, AlertCircle, Plus, X } from "lucide-react";

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

const cartItemOptionSchema = z.object({
  name: z.string(),
  value: z.string(),
});

const cartItemSchema = z.object({
  id: z.string(),
  item_id: z.string().min(1, "Item is required"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  options: z.array(cartItemOptionSchema).optional(),
  subtotal: z.number().min(0),
});

const formSchema = z.object({
  amount: z.number().min(0, "Amount must be greater than or equal to 0"),
  method: z.string().min(1, "Method is required"),
  note: z.string().optional(),
  sendReceiptEmail: z.boolean(),
  receiptSubject: z.string().trim().max(140).optional(),
  receiptMessage: z.string().trim().max(2000).optional(),
  receiptSignature: z.string().trim().max(600).optional(),
  cartItems: z.array(cartItemSchema).optional(),
});

interface PaymentDialogProps {
  dormId: string;
  occupantId: string;
  category: LedgerCategory;
  eventId?: string;
  eventTitle?: string;
  metadata?: Record<string, unknown>;
  // IMPORTANT: Do NOT use React.ReactNode for passing trigger elements from
  // Server Components if this component will be rendered inside an array (.map).
  // Next.js RSC (Flight) serialization can deduplicate identical JSX nodes,
  // causing buttons to randomly disappear. Pass scalar props instead.
  trigger?: React.ReactNode;
  triggerText?: string;
  triggerVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  triggerClassName?: string;
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

function StoreCartBuilder({ form, storeItems }: { form: any; storeItems: any[] }) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "cartItems",
  });

  const cartValues = form.watch("cartItems") || [];

  useEffect(() => {
    const total = cartValues.reduce((acc: number, item: any) => acc + (item.subtotal || 0), 0);
    if (form.getValues("amount") !== total) {
      form.setValue("amount", total, { shouldValidate: true, shouldDirty: true });
    }
  }, [cartValues, form]);

  return (
    <div className="space-y-4 rounded-xl border p-4 bg-muted/10">
      <div className="flex items-center justify-between">
        <FormLabel className="text-base">Store Cart</FormLabel>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => append({ id: crypto.randomUUID(), item_id: "", quantity: 1, options: [], subtotal: 0 })}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Item
        </Button>
      </div>

      {fields.length === 0 ? (
        <div className="rounded border border-dashed border-muted-foreground/30 p-6 text-center text-sm text-muted-foreground">
          No items added to cart yet.
        </div>
      ) : (
        <div className="space-y-4">
          {fields.map((field, index) => {
            const currentItemVal = cartValues[index];
            const selectedStoreItem = storeItems.find((i) => i.id === currentItemVal?.item_id);

            return (
              <div key={field.id} className="relative rounded-lg border bg-background p-4 shadow-sm space-y-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2 h-6 w-6 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => remove(index)}
                >
                  <X className="h-4 w-4" />
                </Button>

                <div className="grid grid-cols-[1fr_80px] gap-4">
                  <FormField
                    control={form.control}
                    name={`cartItems.${index}.item_id`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-semibold">Item</FormLabel>
                        <Select
                          onValueChange={(val) => {
                            field.onChange(val);
                            const sItem = storeItems.find((i) => i.id === val);
                            if (sItem) {
                              const defaultOpts = (sItem.options || []).map((o: any) => ({
                                name: o.name,
                                value: o.choices[0] || "",
                              }));
                              form.setValue(`cartItems.${index}.options`, defaultOpts);
                              form.setValue(`cartItems.${index}.subtotal`, sItem.price * (currentItemVal?.quantity || 1));
                            }
                          }}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Select item" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {storeItems.map((si) => (
                              <SelectItem key={si.id} value={si.id}>
                                {si.name} (₱{si.price})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`cartItems.${index}.quantity`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-semibold">Qty</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="1"
                            className="h-9"
                            {...field}
                            onChange={(e) => {
                              const qty = parseInt(e.target.value) || 1;
                              field.onChange(qty);
                              if (selectedStoreItem) {
                                form.setValue(`cartItems.${index}.subtotal`, selectedStoreItem.price * qty);
                              }
                            }}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                {selectedStoreItem?.options?.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 pt-3 border-t">
                    {selectedStoreItem.options.map((opt: any, optIndex: number) => (
                      <FormField
                        key={opt.name}
                        control={form.control}
                        name={`cartItems.${index}.options.${optIndex}.value`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">{opt.name}</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder={`Select ${opt.name}`} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {opt.choices.map((choice: string) => (
                                  <SelectItem key={choice} value={choice}>
                                    {choice}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <span className="text-sm font-semibold text-emerald-600">
                    Subtotal: ₱{(currentItemVal?.subtotal || 0).toFixed(2)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PaymentDialog({
  dormId,
  occupantId,
  category,
  eventId,
  eventTitle,
  metadata,
  trigger,
  triggerText = "Pay",
  triggerVariant = "outline",
  triggerClassName = "w-full",
}: PaymentDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const pathname = usePathname();
  const [isPreparingPreview, setIsPreparingPreview] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [overpaymentConfirmOpen, setOverpaymentConfirmOpen] = useState(false);
  const [pendingFormValues, setPendingFormValues] = useState<PaymentFormValues | null>(null);
  const [pendingPayload, setPendingPayload] = useState<TransactionPayload | null>(null);
  const [emailPreview, setEmailPreview] = useState<{
    recipient_email: string;
    subject: string;
    text: string;
  } | null>(null);
  const isContribution = category === "contributions";

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: 0,
      method: "cash",
      note: "",
      sendReceiptEmail: true,
      receiptSubject: eventTitle ? `Payment receipt: ${eventTitle}` : "Payment receipt",
      receiptMessage: "",
      receiptSignature: isContribution ? "Global contribution signature" : "Dormy Admin",
      cartItems: [],
    },
  });

  const sendReceiptEmail = form.watch("sendReceiptEmail");
  const cartItems = form.watch("cartItems");

  // Automatically update the main amount when cart items change 
  // Moved calculation into StoreCartBuilder

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

    return {
      occupant_id: occupantId,
      category,
      entry_type: "payment",
      amount: values.amount,
      method: values.method,
      note: values.note,
      event_id: eventId,
      metadata: {
        ...metadata,
        cart_items: values.cartItems, // Forward cart items to the action for processing
      },
      receipt_email: values.sendReceiptEmail
        ? {
          enabled: true,
          subject: isContribution
            ? undefined // Fetched on backend
            : values.receiptSubject?.trim() || undefined,
          message: isContribution
            ? undefined // Fetched on backend
            : values.receiptMessage?.trim() || undefined,
          signature: isContribution
            ? undefined // Fetched on backend
            : values.receiptSignature?.trim() || undefined,
          logo_url: isContribution ? undefined : undefined,
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
    if (isContribution && metadata?.remaining_balance !== undefined && (metadata.remaining_balance as number) <= 0) {
      setPendingFormValues(values);
      setOverpaymentConfirmOpen(true);
      return;
    }
    await processSubmit(values);
  }

  async function processSubmit(values: PaymentFormValues) {
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

  if (metadata?.is_store && !pathname?.startsWith("/treasurer")) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <div className="inline-block w-full">
            {trigger || (
              <Button variant={triggerVariant} size="sm" className={triggerClassName}>
                <Wallet className="mr-2 h-4 w-4" />
                {triggerText}
              </Button>
            )}
          </div>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Store Payment</DialogTitle>
            <DialogDescription>
              Record payment for store items and variations.
            </DialogDescription>
          </DialogHeader>
          <div className="py-6 flex flex-col items-center justify-center text-center gap-2 text-muted-foreground">
            <AlertCircle className="h-8 w-8 text-amber-500" />
            <p>Store contributions can only be managed and processed by the Treasurer.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <div className="inline-block w-full">
            {trigger || (
              <Button variant={triggerVariant} size="sm" className={triggerClassName}>
                <Wallet className="mr-2 h-4 w-4" />
                {triggerText}
              </Button>
            )}
          </div>
        </DialogTrigger>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[560px] bg-white/95 dark:bg-card/95 backdrop-blur-xl border-muted/50 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">Record Payment</DialogTitle>
            <DialogDescription className="text-sm">
              Record a payment for {category === "maintenance_fee" ? "maintenance fee" : category === "contributions" ? "event contribution" : "fines"}.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

              {metadata?.is_store && Array.isArray(metadata?.store_items) ? (
                <StoreCartBuilder form={form} storeItems={metadata.store_items} />
              ) : null}

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
                        readOnly={metadata?.is_store === true}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        className={metadata?.is_store === true ? "bg-muted font-mono" : ""}
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
                            ? "Uses the global contribution receipt template."
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
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Template Settings</p>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                            The global contribution receipt settings (Subject, Message, Signature, and Logo) will be used for this receipt.
                          </p>
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

      <Dialog open={overpaymentConfirmOpen} onOpenChange={setOverpaymentConfirmOpen}>
        <DialogContent className="sm:max-w-md bg-white/95 dark:bg-card/95 backdrop-blur-xl border-muted/50 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-amber-600 dark:text-amber-500">Contribution Already Settled</DialogTitle>
            <DialogDescription className="text-sm">
              This occupant has already fully paid this contribution. Do you want to record an overpayment anyway?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-4 text-amber-800 dark:text-amber-200">
            <p className="text-sm">
              <strong>Note:</strong> Overpayments are recorded but do not lower the remaining balance below zero.
            </p>
          </div>
          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" onClick={() => setOverpaymentConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => {
                setOverpaymentConfirmOpen(false);
                if (pendingFormValues) {
                  processSubmit(pendingFormValues);
                }
              }}
            >
              Confirm Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl bg-white/95 dark:bg-card/95 backdrop-blur-xl border-muted/50 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">Confirm Receipt Email</DialogTitle>
            <DialogDescription className="text-sm">
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
