"use client";

import { usePathname } from "next/navigation";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useForm, useFieldArray, type UseFormReturn } from "react-hook-form";
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
  recordOptionalContributionDecline,
  previewTransactionReceiptEmail,
  recordTransaction,
} from "@/app/actions/finance";
import { draftPaymentReceiptEmail } from "@/app/actions/email";
import { getOptionalContributionDecisionLabel } from "@/lib/contribution-ledger";
import {
  calculateCartSubtotal,
  formatChoiceLabel,
  normalizeStoreItems,
} from "@/lib/store-pricing";
import { LedgerCategory } from "@/lib/types/finance";

const cartItemOptionSchema = z.object({
  name: z.string(),
  value: z.string(),
  price_adjustment: z.number().optional(),
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
  declineOptionalContribution: z.boolean(),
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

type PaymentCartItem = z.infer<typeof cartItemSchema>;

function StoreCartBuilder({
  form,
  storeItems,
}: {
  form: UseFormReturn<PaymentFormValues>;
  storeItems: unknown[];
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "cartItems",
  });

  const normalizedStoreItems = useMemo(() => normalizeStoreItems(storeItems), [storeItems]);
  const watchedCartValues = form.watch("cartItems");
  const cartValues = useMemo(() => watchedCartValues ?? [], [watchedCartValues]);

  const syncAmountFromCart = useCallback((source: PaymentCartItem[]) => {
    const total = source.reduce(
      (acc, item) => acc + Math.max(0, Number(item?.subtotal ?? 0)),
      0
    );
    const normalizedTotal = Number(total.toFixed(2));
    if (Number(form.getValues("amount") || 0) !== normalizedTotal) {
      form.setValue("amount", normalizedTotal, {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
  }, [form]);

  useEffect(() => {
    syncAmountFromCart(cartValues);
  }, [cartValues, syncAmountFromCart]);

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
            const selectedStoreItem = normalizedStoreItems.find((i) => i.id === currentItemVal?.item_id);
            const selectedOptions = selectedStoreItem?.options ?? [];
            const currentQty = Math.max(1, Number(currentItemVal?.quantity || 1));

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
                            const sItem = normalizedStoreItems.find((i) => i.id === val);
                            if (sItem) {
                              const defaultOpts = (sItem.options || [])
                                .map((o) => {
                                  const firstChoice = o.choices[0];
                                  if (!firstChoice?.label) {
                                    return null;
                                  }
                                  return {
                                    name: o.name,
                                    value: firstChoice.label,
                                    price_adjustment: firstChoice.priceAdjustment ?? 0,
                                  };
                                })
                                .filter((option): option is { name: string; value: string; price_adjustment: number } => Boolean(option));
                              const subtotal = calculateCartSubtotal({
                                item: sItem,
                                quantity: currentQty,
                                options: defaultOpts,
                                fallbackSubtotal: 0,
                              });
                              form.setValue(`cartItems.${index}.options`, defaultOpts, {
                                shouldDirty: true,
                                shouldValidate: true,
                              });
                              form.setValue(`cartItems.${index}.subtotal`, subtotal, {
                                shouldDirty: true,
                                shouldValidate: true,
                              });
                              syncAmountFromCart(form.getValues("cartItems") || []);
                            } else {
                              form.setValue(`cartItems.${index}.options`, [], {
                                shouldDirty: true,
                                shouldValidate: true,
                              });
                              form.setValue(`cartItems.${index}.subtotal`, 0, {
                                shouldDirty: true,
                                shouldValidate: true,
                              });
                              syncAmountFromCart(form.getValues("cartItems") || []);
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
                            {normalizedStoreItems.map((si) => (
                              <SelectItem key={si.id} value={si.id}>
                                {si.name} (₱{si.price.toFixed(2)})
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
                                const subtotal = calculateCartSubtotal({
                                  item: selectedStoreItem,
                                  quantity: qty,
                                  options: currentItemVal?.options || [],
                                  fallbackSubtotal: currentItemVal?.subtotal || 0,
                                });
                                form.setValue(`cartItems.${index}.subtotal`, subtotal, {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                });
                                syncAmountFromCart(form.getValues("cartItems") || []);
                              }
                            }}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                {selectedOptions.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 pt-3 border-t">
                    {selectedOptions.map((opt, optIndex: number) => (
                      <FormField
                        key={opt.name}
                        control={form.control}
                        name={`cartItems.${index}.options.${optIndex}.value`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">{opt.name}</FormLabel>
                            <Select
                              onValueChange={(selectedValue) => {
                                field.onChange(selectedValue);
                                const selectedChoice = opt.choices.find(
                                  (choice: { label: string; priceAdjustment: number }) =>
                                    choice.label === selectedValue
                                );
                                const nextOptions = Array.isArray(currentItemVal?.options)
                                  ? [...currentItemVal.options]
                                  : [];
                                nextOptions[optIndex] = {
                                  name: opt.name,
                                  value: selectedValue,
                                  price_adjustment: selectedChoice?.priceAdjustment ?? 0,
                                };
                                form.setValue(`cartItems.${index}.options`, nextOptions, {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                });
                                const subtotal = calculateCartSubtotal({
                                  item: selectedStoreItem,
                                  quantity: currentQty,
                                  options: nextOptions,
                                  fallbackSubtotal: currentItemVal?.subtotal || 0,
                                });
                                form.setValue(`cartItems.${index}.subtotal`, subtotal, {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                });
                                syncAmountFromCart(form.getValues("cartItems") || []);
                              }}
                              value={field.value || ""}
                            >
                              <FormControl>
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder={`Select ${opt.name}`} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {opt.choices.map((choice: { label: string; priceAdjustment: number }) => (
                                  <SelectItem key={choice.label} value={choice.label}>
                                    {formatChoiceLabel(choice)}
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
  const remainingBalance =
    typeof metadata?.remaining_balance === "number"
      ? metadata.remaining_balance
      : typeof metadata?.remaining_balance === "string"
        ? Number(metadata.remaining_balance)
        : null;

  const defaultFormValues: PaymentFormValues = {
    amount: 0,
    method: "cash",
    note: "",
    declineOptionalContribution: false,
    sendReceiptEmail: true,
    receiptSubject: eventTitle ? `Payment receipt: ${eventTitle}` : "Payment receipt",
    receiptMessage: "",
    receiptSignature: isContribution ? "Global contribution signature" : "Dormy Admin",
    cartItems: [],
  };

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultFormValues,
  });

  const sendReceiptEmail = form.watch("sendReceiptEmail");
  const declineOptionalContribution = form.watch("declineOptionalContribution");
  const isOptionalContribution = metadata?.is_optional === true;
  const isStoreContribution = metadata?.is_store === true;

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

  function buildPayload(
    values: PaymentFormValues,
    options?: { allowSettledOverpayment?: boolean }
  ): TransactionPayload | null {

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
        allow_settled_overpayment: options?.allowSettledOverpayment === true,
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
      form.reset(defaultFormValues);
    } catch {
      toast.error("Failed to record payment");
    } finally {
      setIsPending(false);
    }
  }

  async function submitOptionalDecline(values: PaymentFormValues) {
    const contributionId =
      typeof metadata?.contribution_id === "string" && metadata.contribution_id.trim().length > 0
        ? metadata.contribution_id.trim()
        : null;

    if (!contributionId) {
      toast.error("Contribution ID is missing for this optional record.");
      return;
    }

    setIsPending(true);
    try {
      const response = await recordOptionalContributionDecline(dormId, {
        occupant_id: occupantId,
        contribution_ids: [contributionId],
        send_email: values.sendReceiptEmail,
        email_override: null,
      });

      if (response && "error" in response) {
        toast.error(response.error);
        return;
      }

      toast.success(
        isStoreContribution ? "Optional item marked as not availed." : "Optional contribution marked as declined."
      );
      setConfirmOpen(false);
      setPendingPayload(null);
      setEmailPreview(null);
      setOpen(false);
      form.reset(defaultFormValues);
    } catch {
      toast.error("Failed to update optional contribution.");
    } finally {
      setIsPending(false);
    }
  }

  async function onSubmit(values: PaymentFormValues) {
    if (isContribution && isOptionalContribution && values.declineOptionalContribution) {
      await submitOptionalDecline(values);
      return;
    }

    if (isContribution && remainingBalance !== null && remainingBalance <= 0.009) {
      setPendingFormValues(values);
      setOverpaymentConfirmOpen(true);
      return;
    }
    await processSubmit(values);
  }

  async function processSubmit(
    values: PaymentFormValues,
    options?: { allowSettledOverpayment?: boolean }
  ) {
    if (values.declineOptionalContribution) {
      await submitOptionalDecline(values);
      return;
    }

    const payload = buildPayload(values, options);
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

  function handlePaymentDialogOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setConfirmOpen(false);
      setOverpaymentConfirmOpen(false);
      setPendingFormValues(null);
      setPendingPayload(null);
      setEmailPreview(null);
      form.reset(defaultFormValues);
    }
  }

  if (metadata?.is_store && !pathname?.startsWith("/treasurer")) {
    return (
      <Dialog open={open} onOpenChange={handlePaymentDialogOpenChange}>
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
      <Dialog open={open} onOpenChange={handlePaymentDialogOpenChange}>
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
              Record a payment for {category === "maintenance_fee" ? "maintenance fee" : category === "contributions" ? "event contribution" : category === "gadgets" ? "gadget charges" : "fines"}.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

              {metadata?.is_store && Array.isArray(metadata?.store_items) ? (
                <StoreCartBuilder form={form} storeItems={metadata.store_items} />
              ) : null}

              {isContribution && isOptionalContribution ? (
                <FormField
                  control={form.control}
                  name="declineOptionalContribution"
                  render={({ field }) => (
                    <FormItem className="flex items-start gap-3 rounded-xl border bg-amber-50/70 p-4 dark:bg-amber-950/20">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(checked) => {
                            const nextValue = Boolean(checked);
                            field.onChange(nextValue);
                            if (nextValue) {
                              form.setValue("amount", 0, { shouldDirty: true, shouldValidate: true });
                              form.setValue("cartItems", [], { shouldDirty: true, shouldValidate: true });
                            }
                          }}
                          className="mt-1"
                        />
                      </FormControl>
                      <div className="space-y-1">
                        <FormLabel className="leading-none">
                          {isStoreContribution ? "Occupant will not avail this optional item" : "Occupant will not pay this optional contribution"}
                        </FormLabel>
                        <p className="text-xs text-muted-foreground">
                          This sets the remaining payable to zero for this contribution only and sends an email notice instead of recording income.
                        </p>
                      </div>
                    </FormItem>
                  )}
                />
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
                        readOnly={metadata?.is_store === true || declineOptionalContribution}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        className={metadata?.is_store === true || declineOptionalContribution ? "bg-muted font-mono" : ""}
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
                        <FormLabel className="leading-none">
                          {declineOptionalContribution ? "Email update" : "Email receipt"}
                        </FormLabel>
                        <p className="text-xs text-muted-foreground">
                          {declineOptionalContribution
                            ? `Sends an email confirming the occupant ${getOptionalContributionDecisionLabel({
                                isStore: isStoreContribution,
                              })}.`
                            : isContribution
                            ? "Uses the global contribution receipt template."
                            : "Sends a receipt to the occupant email on file. Customize the subject/message, or draft with AI."}
                        </p>
                      </div>
                    </FormItem>
                  )}
                />

                {sendReceiptEmail && !declineOptionalContribution ? (
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
                  {declineOptionalContribution ? "Save Decision" : "Submit Payment"}
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
              {isStoreContribution
                ? "This occupant has already fully paid this store contribution. Do you want to record another payment anyway?"
                : "This occupant has already fully paid this contribution. Do you want to record an overpayment anyway?"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-4 text-amber-800 dark:text-amber-200">
            <p className="text-sm">
              <strong>Note:</strong>{" "}
              {isStoreContribution
                ? "Continue only if this is an intentional extra store payment, such as an added merch purchase or a duplicate payment."
                : "Overpayments are recorded but do not lower the remaining balance below zero."}
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
                  processSubmit(pendingFormValues, { allowSettledOverpayment: true });
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
