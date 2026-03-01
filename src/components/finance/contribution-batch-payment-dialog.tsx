/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarCheck2, Loader2, Check, ChevronsUpDown, Plus, X } from "lucide-react";

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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

type ContributionOption = {
  id: string;
  title: string;
  remaining: number;
  receiptSignature: string | null;
  receiptSubject: string | null;
  receiptMessage: string | null;
  receiptLogoUrl: string | null;
  isStore?: boolean;
  storeItems?: any[];
};

/** Per-occupant remaining amounts keyed by `occupantId:contributionId` */
type OccupantContributionRemaining = Record<string, number>;

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
  cart_items?: any[];
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
  occupantContributionRemaining,
  triggerClassName,
  triggerVariant = "default",
}: {
  dormId: string;
  contributions: ContributionOption[];
  occupants: OccupantOption[];
  /** Map of `occupantId:contributionId` → remaining amount for that occupant */
  occupantContributionRemaining?: OccupantContributionRemaining;
  triggerClassName?: string;
  triggerVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [openOccupantCombobox, setOpenOccupantCombobox] = useState(false);
  const [occupantId, setOccupantIdRaw] = useState<string>("");

  /** When occupant changes, reset contribution selections since remaining amounts change per-occupant */
  const setOccupantId = useCallback((newId: string) => {
    setOccupantIdRaw(newId);
    setSelectedContributionIds([]);
    setAmount(0);
    setAllocationTargetId("");
  }, []);
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
  const [overpaymentConfirmOpen, setOverpaymentConfirmOpen] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<BatchPaymentPayload | null>(null);
  const [emailPreview, setEmailPreview] = useState<{
    recipient_email: string;
    subject: string;
    text: string;
  } | null>(null);

  // Store cart state: keyed by contribution id
  const [storeCartItems, setStoreCartItems] = useState<Record<string, any[]>>({});

  const storeCartTotal = useMemo(() => {
    return Object.values(storeCartItems)
      .flat()
      .reduce((sum, item) => sum + (item.subtotal || 0), 0);
  }, [storeCartItems]);

  /** Resolve the per-occupant remaining for each contribution, falling back to total remaining if no occupant is selected */
  const getOccupantRemaining = useCallback(
    (contributionId: string) => {
      if (!occupantId) return null;
      const key = `${occupantId}:${contributionId}`;
      return occupantContributionRemaining?.[key] ?? 0;
    },
    [occupantId, occupantContributionRemaining]
  );

  const selectedContributions = useMemo(
    () => contributions.filter((contribution) => selectedContributionIds.includes(contribution.id)),
    [contributions, selectedContributionIds]
  );

  const hasAnyStoreContributions = useMemo(
    () => selectedContributions.some((c) => c.isStore),
    [selectedContributions]
  );

  const computedTotal = useMemo(
    () =>
      selectedContributions.reduce((sum, contribution) => {
        const remaining = occupantId
          ? (getOccupantRemaining(contribution.id) ?? 0)
          : contribution.remaining;
        return sum + Math.max(0, remaining);
      }, 0),
    [selectedContributions, occupantId, getOccupantRemaining]
  );

  const amountDifference = useMemo(() => Number((amount - computedTotal).toFixed(2)), [amount, computedTotal]);

  const previewRows = useMemo(() => {
    if (!selectedContributions.length) return [] as Array<{ title: string; amount: number }>;
    const rows = selectedContributions.map((contribution) => {
      const remaining = occupantId
        ? (getOccupantRemaining(contribution.id) ?? 0)
        : contribution.remaining;
      return {
        id: contribution.id,
        title: contribution.title,
        amount: Math.max(0, remaining),
      };
    });

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
  }, [allocationTargetId, amountDifference, selectedContributions, occupantId, getOccupantRemaining]);

  const toggleContribution = (id: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...selectedContributionIds, id]))
      : selectedContributionIds.filter((value) => value !== id);

    setSelectedContributionIds(next);

    const nextSelected = contributions.filter((contribution) => next.includes(contribution.id));
    const nextTotal = nextSelected.reduce((sum, contribution) => {
      // For store contributions, don't add remaining — amount comes from cart
      if (contribution.isStore) return sum;
      const remaining = occupantId
        ? (occupantContributionRemaining?.[`${occupantId}:${contribution.id}`] ?? 0)
        : contribution.remaining;
      return sum + Math.max(0, remaining);
    }, 0);
    setAmount(Number((nextTotal + storeCartTotal).toFixed(2)));

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
      setOverpaymentConfirmOpen(false);
      setPendingPayload(null);
      setEmailPreview(null);
      setStoreCartItems({});
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

    // Use global templates for batch receipt emails

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
      cart_items: hasAnyStoreContributions ? Object.values(storeCartItems).flat() : undefined,
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
    if (computedTotal <= 0) {
      const payload = buildPayload();
      if (!payload) return;
      setOverpaymentConfirmOpen(true);
      return;
    }
    await processProceedToConfirmation();
  };

  const processProceedToConfirmation = async () => {
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
          <Button variant={triggerVariant} className={triggerClassName}>
            <CalendarCheck2 className="mr-2 h-4 w-4" />
            Pay Contributions
          </Button>
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
              <div className="space-y-2 flex flex-col">
                <Label>Occupant</Label>
                <Popover open={openOccupantCombobox} onOpenChange={setOpenOccupantCombobox}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openOccupantCombobox}
                      className="justify-between w-full font-normal shadow-sm"
                    >
                      {occupantId
                        ? (() => {
                          const occ = occupants.find((o) => o.id === occupantId);
                          return occ ? `${occ.fullName}${occ.studentId ? ` (${occ.studentId})` : ""}` : "Select occupant...";
                        })()
                        : "Select occupant..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search occupant..." />
                      <CommandList>
                        <CommandEmpty>No occupant found.</CommandEmpty>
                        <CommandGroup>
                          {occupants.map((occupant) => (
                            <CommandItem
                              key={occupant.id}
                              value={`${occupant.fullName} ${occupant.studentId || ""}`}
                              onSelect={() => {
                                setOccupantId(occupant.id);
                                setOpenOccupantCombobox(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  occupantId === occupant.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {occupant.fullName}
                              {occupant.studentId ? (
                                <span className="ml-1 text-muted-foreground text-xs">
                                  ({occupant.studentId})
                                </span>
                              ) : null}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
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
                      <label key={contribution.id} className={`flex items-start gap-3 rounded-md border border-border/50 bg-background/50 p-3 hover:bg-muted/30 transition-colors ${occupantId ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => toggleContribution(contribution.id, Boolean(value))}
                          className="mt-0.5"
                          disabled={!occupantId}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium leading-none">{contribution.title}</p>
                          {occupantId ? (
                            <p className="text-xs text-muted-foreground mt-1.5">
                              Remaining: <span className="font-semibold text-foreground">₱{(getOccupantRemaining(contribution.id) ?? 0).toFixed(2)}</span>
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground mt-1.5">Select an occupant first</p>
                          )}
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

            {/* Store Cart Builder — per selected store contribution */}
            {hasAnyStoreContributions && selectedContributions.filter((c) => c.isStore).map((contribution) => {
              const cartForContribution = storeCartItems[contribution.id] || [];
              const items = contribution.storeItems || [];

              const addCartItem = () => {
                const newItem = { id: crypto.randomUUID(), item_id: "", quantity: 1, options: [], subtotal: 0 };
                const updated = [...cartForContribution, newItem];
                const next = { ...storeCartItems, [contribution.id]: updated };
                setStoreCartItems(next);
                // Recalculate amount
                const newTotal = Object.values(next).flat().reduce((s, i) => s + (i.subtotal || 0), 0);
                const nonStoreTotal = selectedContributions
                  .filter((c) => !c.isStore)
                  .reduce((s, c) => {
                    const rem = occupantId ? (occupantContributionRemaining?.[`${occupantId}:${c.id}`] ?? 0) : c.remaining;
                    return s + Math.max(0, rem);
                  }, 0);
                setAmount(Number((nonStoreTotal + newTotal).toFixed(2)));
              };

              const removeCartItem = (itemIdx: number) => {
                const updated = cartForContribution.filter((_: any, i: number) => i !== itemIdx);
                const next = { ...storeCartItems, [contribution.id]: updated };
                setStoreCartItems(next);
                const newTotal = Object.values(next).flat().reduce((s, i) => s + (i.subtotal || 0), 0);
                const nonStoreTotal = selectedContributions
                  .filter((c) => !c.isStore)
                  .reduce((s, c) => {
                    const rem = occupantId ? (occupantContributionRemaining?.[`${occupantId}:${c.id}`] ?? 0) : c.remaining;
                    return s + Math.max(0, rem);
                  }, 0);
                setAmount(Number((nonStoreTotal + newTotal).toFixed(2)));
              };

              const updateCartItem = (itemIdx: number, patch: Partial<any>) => {
                const updated = cartForContribution.map((ci: any, i: number) => i === itemIdx ? { ...ci, ...patch } : ci);
                const next = { ...storeCartItems, [contribution.id]: updated };
                setStoreCartItems(next);
                const newTotal = Object.values(next).flat().reduce((s, i) => s + (i.subtotal || 0), 0);
                const nonStoreTotal = selectedContributions
                  .filter((c) => !c.isStore)
                  .reduce((s, c) => {
                    const rem = occupantId ? (occupantContributionRemaining?.[`${occupantId}:${c.id}`] ?? 0) : c.remaining;
                    return s + Math.max(0, rem);
                  }, 0);
                setAmount(Number((nonStoreTotal + newTotal).toFixed(2)));
              };

              return (
                <div key={contribution.id} className="space-y-3 rounded-xl border p-4 bg-muted/10">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Store Cart — {contribution.title}</Label>
                    <Button type="button" variant="secondary" size="sm" onClick={addCartItem}>
                      <Plus className="mr-2 h-4 w-4" /> Add Item
                    </Button>
                  </div>
                  {cartForContribution.length === 0 ? (
                    <div className="rounded border border-dashed border-muted-foreground/30 p-6 text-center text-sm text-muted-foreground">
                      No items added to cart yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {cartForContribution.map((cartItem: any, cartIdx: number) => {
                        const selectedStoreItem = items.find((i: any) => i.id === cartItem.item_id);
                        return (
                          <div key={cartItem.id} className="relative rounded-lg border bg-background p-4 shadow-sm space-y-3">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-2 top-2 h-6 w-6 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => removeCartItem(cartIdx)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                            <div className="grid grid-cols-[1fr_80px] gap-3">
                              <div className="space-y-1">
                                <Label className="text-xs font-semibold">Item</Label>
                                <Select
                                  onValueChange={(val) => {
                                    const sItem = items.find((i: any) => i.id === val);
                                    if (sItem) {
                                      const defaultOpts = (sItem.options || []).map((o: any) => ({
                                        name: o.name,
                                        value: o.choices[0] || "",
                                      }));
                                      updateCartItem(cartIdx, {
                                        item_id: val,
                                        options: defaultOpts,
                                        subtotal: sItem.price * (cartItem.quantity || 1),
                                      });
                                    } else {
                                      updateCartItem(cartIdx, { item_id: val });
                                    }
                                  }}
                                  value={cartItem.item_id}
                                >
                                  <SelectTrigger className="h-9">
                                    <SelectValue placeholder="Select item" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {items.map((si: any) => (
                                      <SelectItem key={si.id} value={si.id}>
                                        {si.name} (₱{si.price})
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs font-semibold">Qty</Label>
                                <Input
                                  type="number"
                                  min="1"
                                  className="h-9"
                                  value={cartItem.quantity}
                                  onChange={(e) => {
                                    const qty = parseInt(e.target.value) || 1;
                                    updateCartItem(cartIdx, {
                                      quantity: qty,
                                      subtotal: selectedStoreItem ? selectedStoreItem.price * qty : cartItem.subtotal,
                                    });
                                  }}
                                />
                              </div>
                            </div>

                            {selectedStoreItem?.options?.length > 0 && (
                              <div className="grid grid-cols-2 gap-3 pt-3 border-t">
                                {selectedStoreItem.options.map((opt: any, optIndex: number) => (
                                  <div key={opt.name} className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">{opt.name}</Label>
                                    <Select
                                      onValueChange={(val) => {
                                        const newOpts = [...(cartItem.options || [])];
                                        newOpts[optIndex] = { name: opt.name, value: val };
                                        updateCartItem(cartIdx, { options: newOpts });
                                      }}
                                      value={cartItem.options?.[optIndex]?.value || ""}
                                    >
                                      <SelectTrigger className="h-8 text-xs">
                                        <SelectValue placeholder={`Select ${opt.name}`} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {opt.choices.map((choice: string) => (
                                          <SelectItem key={choice} value={choice}>
                                            {choice}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="flex justify-end pt-1">
                              <span className="text-sm font-semibold text-emerald-600">
                                Subtotal: ₱{(cartItem.subtotal || 0).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

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
                    <Label>Template Settings</Label>
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                      The global contribution receipt settings (Subject, Message, Signature, and Logo) will be used for this receipt.
                    </p>
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

      <Dialog open={overpaymentConfirmOpen} onOpenChange={setOverpaymentConfirmOpen}>
        <DialogContent className="sm:max-w-md bg-white/95 dark:bg-card/95 backdrop-blur-xl border-muted/50 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-amber-600 dark:text-amber-500">Contributions Already Settled</DialogTitle>
            <DialogDescription className="text-sm">
              The selected contributions are already fully paid. Do you want to record an overpayment anyway?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-4 text-amber-800 dark:text-amber-200">
            <p className="text-sm">
              <strong>Note:</strong> Overpayments are recorded but do not lower the remaining balances below zero.
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
                processProceedToConfirmation();
              }}
            >
              Confirm Payment
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
