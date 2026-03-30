"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarCheck2, Loader2, Plus, X } from "lucide-react";

import {
  previewContributionBatchPaymentEmail,
  recordContributionBatchPayment,
} from "@/app/actions/finance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { OccupantCombobox } from "@/components/finance/occupant-combobox";
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
import {
  calculateCartSubtotal,
  formatChoiceLabel,
  getStoreContributionPriceRange,
  normalizeStoreItems,
  type StoreItem,
} from "@/lib/store-pricing";

type ContributionOption = {
  id: string;
  title: string;
  remaining: number;
  receiptSignature: string | null;
  receiptSubject: string | null;
  receiptMessage: string | null;
  receiptLogoUrl: string | null;
  isOptional?: boolean;
  isStore?: boolean;
  storeItems?: StoreItem[];
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
  declined_contribution_ids: string[];
  paid_elsewhere_contribution_ids: string[];
  paid_elsewhere_location: string | null;
  allow_overpayment_contribution_ids: string[];
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
  cart_items?: Array<{
    contribution_id: string;
    item_id: string;
    quantity: number;
    options: Array<{ name: string; value: string; price_adjustment?: number }>;
    subtotal: number;
  }>;
};

type StoreCartOption = {
  name: string;
  value: string;
  price_adjustment?: number;
};

type StoreCartItem = {
  id: string;
  item_id: string;
  quantity: number;
  options: StoreCartOption[];
  subtotal: number;
};

function nowLocalDateTimeValue() {
  const now = new Date();
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function formatPesos(value: number) {
  return `₱${Number(value || 0).toFixed(2)}`;
}

export function ContributionBatchPaymentDialog({
  dormId,
  contributions,
  occupants,
  occupantContributionRemaining,
  prefilledOccupantId,
  lockOccupant = false,
  triggerText = "Pay Contributions",
  triggerClassName,
  triggerVariant = "default",
}: {
  dormId: string;
  contributions: ContributionOption[];
  occupants: OccupantOption[];
  /** Map of `occupantId:contributionId` → remaining amount for that occupant */
  occupantContributionRemaining?: OccupantContributionRemaining;
  prefilledOccupantId?: string;
  lockOccupant?: boolean;
  triggerText?: string;
  triggerClassName?: string;
  triggerVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
}) {
  const router = useRouter();
  const resolvedPrefilledOccupantId = prefilledOccupantId ?? "";
  const [open, setOpen] = useState(false);
  const [occupantId, setOccupantIdRaw] = useState<string>(resolvedPrefilledOccupantId);

  /** When occupant changes, reset contribution selections since remaining amounts change per-occupant */
  const setOccupantId = useCallback((newId: string) => {
    setOccupantIdRaw(newId);
    setSelectedContributionIds([]);
    setDeclinedContributionIds([]);
    setPaidElsewhereContributionIds([]);
    setConfirmedSettledContributionIds([]);
    setAmount(0);
    setAllocationTargetId("");
  }, []);
  const [selectedContributionIds, setSelectedContributionIds] = useState<string[]>([]);
  const [declinedContributionIds, setDeclinedContributionIds] = useState<string[]>([]);
  const [paidElsewhereContributionIds, setPaidElsewhereContributionIds] = useState<string[]>([]);
  const [paidElsewhereLocation, setPaidElsewhereLocation] = useState("");
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
  const [settledContributionWarningOpen, setSettledContributionWarningOpen] = useState(false);
  const [pendingSettledContribution, setPendingSettledContribution] =
    useState<ContributionOption | null>(null);
  const [confirmedSettledContributionIds, setConfirmedSettledContributionIds] = useState<string[]>([]);
  const [pendingPayload, setPendingPayload] = useState<BatchPaymentPayload | null>(null);
  const [emailPreview, setEmailPreview] = useState<{
    recipient_email: string;
    subject: string;
    text: string;
  } | null>(null);

  const selectedOccupant = useMemo(
    () => occupants.find((occupant) => occupant.id === occupantId) ?? null,
    [occupantId, occupants]
  );

  // Store cart state: keyed by contribution id
  const [storeCartItems, setStoreCartItems] = useState<Record<string, StoreCartItem[]>>({});

  const sumCartSubtotals = useCallback((items: StoreCartItem[] | undefined) => {
    return (items ?? []).reduce((sum, item) => sum + Math.max(0, Number(item?.subtotal ?? 0)), 0);
  }, []);

  const getStoreCartSubtotal = useCallback(
    (contributionId: string, carts: Record<string, StoreCartItem[]> = storeCartItems) =>
      Number(sumCartSubtotals(carts[contributionId]).toFixed(2)),
    [storeCartItems, sumCartSubtotals]
  );

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

  const getStoreFallbackAmount = useCallback(
    (contribution: ContributionOption) => {
      if (occupantId) {
        const remaining = occupantContributionRemaining?.[`${occupantId}:${contribution.id}`] ?? 0;
        return Number(Math.max(0, remaining).toFixed(2));
      }

      if (contribution.remaining > 0) {
        return Number(contribution.remaining.toFixed(2));
      }

      const storePriceRange = getStoreContributionPriceRange(contribution.storeItems || []);
      return Number((storePriceRange?.min ?? 0).toFixed(2));
    },
    [occupantId, occupantContributionRemaining]
  );

  const computeAmountForSelection = useCallback(
    (
      selected: ContributionOption[],
      carts: Record<string, StoreCartItem[]> = storeCartItems,
      declinedIds: string[] = declinedContributionIds,
      paidElsewhereIds: string[] = paidElsewhereContributionIds
    ) => {
      const nonStoreTotal = selected
        .filter(
          (contribution) =>
            !contribution.isStore &&
            !declinedIds.includes(contribution.id) &&
            !paidElsewhereIds.includes(contribution.id)
        )
        .reduce((sum, contribution) => {
          const remaining = occupantId
            ? (occupantContributionRemaining?.[`${occupantId}:${contribution.id}`] ?? 0)
            : contribution.remaining;
          return sum + Math.max(0, remaining);
        }, 0);

      const storeTotal = selected
        .filter(
          (contribution) =>
            contribution.isStore &&
            !declinedIds.includes(contribution.id) &&
            !paidElsewhereIds.includes(contribution.id)
        )
        .reduce((sum, contribution) => {
          const cartSubtotal = getStoreCartSubtotal(contribution.id, carts);
          const fallbackAmount = getStoreFallbackAmount(contribution);
          return sum + (cartSubtotal > 0 ? cartSubtotal : fallbackAmount);
        }, 0);

      return Number((nonStoreTotal + storeTotal).toFixed(2));
    },
    [
      declinedContributionIds,
      getStoreCartSubtotal,
      getStoreFallbackAmount,
      occupantId,
      occupantContributionRemaining,
      paidElsewhereContributionIds,
      storeCartItems,
    ]
  );

  const hasAnyStoreContributions = useMemo(
    () => selectedContributions.some((c) => c.isStore),
    [selectedContributions]
  );

  const computedTotal = useMemo(
    () => computeAmountForSelection(selectedContributions),
    [computeAmountForSelection, selectedContributions]
  );

  const amountDifference = useMemo(() => Number((amount - computedTotal).toFixed(2)), [amount, computedTotal]);
  const onlySpecialSelections =
    selectedContributionIds.length > 0 &&
    selectedContributionIds.every(
      (contributionId) =>
        declinedContributionIds.includes(contributionId) ||
        paidElsewhereContributionIds.includes(contributionId)
    );
  const selectedDirectPaymentCount = selectedContributionIds.filter(
    (contributionId) =>
      !declinedContributionIds.includes(contributionId) &&
      !paidElsewhereContributionIds.includes(contributionId)
  ).length;

  const previewRows = useMemo(() => {
    if (!selectedContributions.length) {
      return [] as Array<{ title: string; amount: number; status: "paid" | "declined" | "paid_elsewhere" }>;
    }
    const rows = selectedContributions.map((contribution) => {
      if (declinedContributionIds.includes(contribution.id)) {
        return {
          id: contribution.id,
          title: contribution.title,
          amount: 0,
          status: "declined" as const,
        };
      }

      if (paidElsewhereContributionIds.includes(contribution.id)) {
        const remaining = occupantId
          ? (getOccupantRemaining(contribution.id) ?? 0)
          : contribution.remaining;
        return {
          id: contribution.id,
          title: contribution.title,
          amount: contribution.isStore
            ? getStoreFallbackAmount(contribution)
            : Math.max(0, remaining),
          status: "paid_elsewhere" as const,
        };
      }

      if (contribution.isStore) {
        const cartSubtotal = getStoreCartSubtotal(contribution.id);
        return {
          id: contribution.id,
          title: contribution.title,
          amount: cartSubtotal > 0 ? cartSubtotal : getStoreFallbackAmount(contribution),
          status: "paid" as const,
        };
      }

      const remaining = occupantId
        ? (getOccupantRemaining(contribution.id) ?? 0)
        : contribution.remaining;
      return {
        id: contribution.id,
        title: contribution.title,
        amount: Math.max(0, remaining),
        status: "paid" as const,
      };
    });

    if (Math.abs(amountDifference) < 0.01) {
      return rows.map((row) => ({ title: row.title, amount: row.amount, status: row.status }));
    }

    if (!allocationTargetId) {
      return rows.map((row) => ({ title: row.title, amount: row.amount, status: row.status }));
    }

    return rows.map((row) => {
      if (row.id !== allocationTargetId) {
        return { title: row.title, amount: row.amount, status: row.status };
      }
      return {
        title: row.title,
        amount: Number((row.amount + amountDifference).toFixed(2)),
        status: row.status,
      };
    });
  }, [allocationTargetId, amountDifference, declinedContributionIds, paidElsewhereContributionIds, selectedContributions, occupantId, getOccupantRemaining, getStoreCartSubtotal, getStoreFallbackAmount]);

  const applyContributionSelection = useCallback(
    (id: string, checked: boolean) => {
      const next = checked
        ? Array.from(new Set([...selectedContributionIds, id]))
        : selectedContributionIds.filter((value) => value !== id);

      setSelectedContributionIds(next);

      const nextSelected = contributions.filter((contribution) => next.includes(contribution.id));
      setAmount(computeAmountForSelection(nextSelected));

      if (!next.includes(allocationTargetId)) {
        setAllocationTargetId("");
      }

      if (!checked) {
        setDeclinedContributionIds((current) => current.filter((value) => value !== id));
        setPaidElsewhereContributionIds((current) => current.filter((value) => value !== id));
        setConfirmedSettledContributionIds((current) => current.filter((value) => value !== id));
      }
    },
    [allocationTargetId, computeAmountForSelection, contributions, selectedContributionIds]
  );

  const isSettledContribution = useCallback(
    (contribution: ContributionOption) => {
      if (!occupantId) {
        return false;
      }
      const remaining = getOccupantRemaining(contribution.id);
      return remaining !== null && remaining <= 0.009;
    },
    [getOccupantRemaining, occupantId]
  );

  const toggleContribution = useCallback(
    (id: string, checked: boolean) => {
      const contribution = contributions.find((item) => item.id === id);
      if (!contribution) {
        return;
      }

      if (
        checked &&
        isSettledContribution(contribution) &&
        !confirmedSettledContributionIds.includes(contribution.id)
      ) {
        setPendingSettledContribution(contribution);
        setSettledContributionWarningOpen(true);
        return;
      }

      applyContributionSelection(id, checked);
    },
    [applyContributionSelection, confirmedSettledContributionIds, contributions, isSettledContribution]
  );

  const toggleDeclinedContribution = (id: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...declinedContributionIds, id]))
      : declinedContributionIds.filter((value) => value !== id);

    setDeclinedContributionIds(next);
    if (checked) {
      setPaidElsewhereContributionIds((current) => current.filter((value) => value !== id));
    }
    const nextSelected = contributions.filter((contribution) => selectedContributionIds.includes(contribution.id));
    setAmount(computeAmountForSelection(nextSelected, storeCartItems, next, paidElsewhereContributionIds.filter((value) => value !== id)));
    if (checked && allocationTargetId === id) {
      setAllocationTargetId("");
    }
  };

  const togglePaidElsewhereContribution = (id: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...paidElsewhereContributionIds, id]))
      : paidElsewhereContributionIds.filter((value) => value !== id);

    setPaidElsewhereContributionIds(next);
    if (checked) {
      setDeclinedContributionIds((current) => current.filter((value) => value !== id));
    }
    const nextSelected = contributions.filter((contribution) => selectedContributionIds.includes(contribution.id));
    setAmount(
      computeAmountForSelection(
        nextSelected,
        storeCartItems,
        declinedContributionIds.filter((value) => value !== id),
        next
      )
    );
    if (checked && allocationTargetId === id) {
      setAllocationTargetId("");
    }
    if (!checked && next.length === 0) {
      setPaidElsewhereLocation("");
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setOccupantIdRaw(resolvedPrefilledOccupantId);
      setSelectedContributionIds([]);
      setDeclinedContributionIds([]);
      setPaidElsewhereContributionIds([]);
      setPaidElsewhereLocation("");
      setAmount(0);
      setAllocationTargetId("");
      setPaidAtLocal(nowLocalDateTimeValue());
      setConfirmOpen(false);
      setOverpaymentConfirmOpen(false);
      setSettledContributionWarningOpen(false);
      setPendingSettledContribution(null);
      setConfirmedSettledContributionIds([]);
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

    if (amount <= 0 && declinedContributionIds.length === 0 && paidElsewhereContributionIds.length === 0) {
      toast.error("Amount must be greater than zero.");
      return null;
    }

    if (paidElsewhereContributionIds.length > 0 && !paidElsewhereLocation.trim()) {
      toast.error("Enter where the occupant paid elsewhere.");
      return null;
    }

    if (Math.abs(amountDifference) >= 0.01 && amount > 0 && !allocationTargetId) {
      toast.error("Choose where to apply the excess or short payment amount.");
      return null;
    }

    const paidAt = new Date(paidAtLocal);
    if (Number.isNaN(paidAt.getTime())) {
      toast.error("Provide a valid payment date and time.");
      return null;
    }

    // Use global templates for batch receipt emails
    const selectedContributionSet = new Set(
      selectedContributionIds.filter(
        (id) =>
          !declinedContributionIds.includes(id) &&
          !paidElsewhereContributionIds.includes(id)
      )
    );

    const payload: BatchPaymentPayload = {
      occupant_id: occupantId,
      contribution_ids: selectedContributionIds.filter(
        (id) =>
          !declinedContributionIds.includes(id) &&
          !paidElsewhereContributionIds.includes(id)
      ),
      declined_contribution_ids: declinedContributionIds,
      paid_elsewhere_contribution_ids: paidElsewhereContributionIds,
      paid_elsewhere_location:
        paidElsewhereContributionIds.length > 0 ? paidElsewhereLocation.trim() || null : null,
      allow_overpayment_contribution_ids: confirmedSettledContributionIds.filter(
        (id) =>
          selectedContributionSet.has(id) &&
          !declinedContributionIds.includes(id) &&
          !paidElsewhereContributionIds.includes(id)
      ),
      amount:
        onlySpecialSelections
          ? 0
          : amount,
      method,
      paid_at_iso: paidAt.toISOString(),
      allocation_target_id: allocationTargetId || null,
      send_receipt_email: sendReceiptEmail,
      receipt_email_override: receiptEmailOverride.trim() || null,
      receipt_subject: null,
      receipt_message: null,
      receipt_signature: null,
      receipt_logo_url: null,
      cart_items: hasAnyStoreContributions
        ? Object.entries(storeCartItems)
            .filter(([contributionId]) => selectedContributionSet.has(contributionId))
            .flatMap(([contributionId, items]) =>
            (items ?? [])
              .filter((item) => typeof item?.item_id === "string" && item.item_id.trim().length > 0)
              .map((item) => ({
                contribution_id: contributionId,
                item_id: String(item.item_id),
                quantity: Math.max(1, Number(item.quantity ?? 1)),
                options: Array.isArray(item.options)
                  ? item.options
                      .map((option) => ({
                        name: String(option?.name ?? "").trim(),
                        value: String(option?.value ?? "").trim(),
                        price_adjustment:
                          typeof option?.price_adjustment === "number"
                            ? option.price_adjustment
                            : undefined,
                      }))
                      .filter((option: { name: string; value: string }) => option.value.length > 0)
                  : [],
                subtotal: Math.max(0, Number(item.subtotal ?? 0)),
              }))
            )
        : undefined,
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
    if (
      computedTotal <= 0 &&
      (declinedContributionIds.length > 0 || paidElsewhereContributionIds.length > 0)
    ) {
      if (sendReceiptEmail && paidElsewhereContributionIds.length > 0) {
        await processProceedToConfirmation();
        return;
      }
      const payload = buildPayload();
      if (!payload) return;
      await submitPayment(payload);
      return;
    }

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
            {triggerText}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl bg-white/95 dark:bg-card/95 backdrop-blur-xl border-muted/50 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">Record Contribution Payment</DialogTitle>
            <DialogDescription className="text-sm">
              One payment can cover multiple contributions, and selected items can also be marked as declined or paid elsewhere for this occupant.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 flex flex-col">
                <Label>Occupant</Label>
                {lockOccupant ? (
                  <div className="flex min-h-10 items-center rounded-md border bg-muted/30 px-3 text-sm shadow-sm">
                    {selectedOccupant?.fullName ?? "Selected occupant"}
                    {selectedOccupant?.studentId ? (
                      <span className="ml-2 text-xs text-muted-foreground">{selectedOccupant.studentId}</span>
                    ) : null}
                  </div>
                ) : (
                  <OccupantCombobox
                    occupants={occupants}
                    value={occupantId}
                    onValueChange={setOccupantId}
                    placeholder="Select occupant..."
                    className="shadow-sm"
                  />
                )}
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
                    const declined = declinedContributionIds.includes(contribution.id);
                    const paidElsewhere = paidElsewhereContributionIds.includes(contribution.id);
                    const occupantRemaining = occupantId
                      ? (getOccupantRemaining(contribution.id) ?? 0)
                      : null;
                    const isSettledForOccupant =
                      occupantRemaining !== null && occupantRemaining <= 0.009;
                    const storePriceRange = contribution.isStore
                      ? getStoreContributionPriceRange(contribution.storeItems || [])
                      : null;
                    const storeCartSubtotal = contribution.isStore
                      ? getStoreCartSubtotal(contribution.id)
                      : 0;
                    return (
                      <div
                        key={contribution.id}
                        className={`rounded-md border border-border/50 bg-background/50 p-3 transition-colors ${
                          occupantId ? "hover:bg-muted/30" : "opacity-80"
                        }`}
                      >
                        <label
                          className={`flex items-start gap-3 ${
                            occupantId ? "cursor-pointer" : "cursor-not-allowed"
                          }`}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => toggleContribution(contribution.id, Boolean(value))}
                            className="mt-0.5"
                            disabled={!occupantId}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-medium leading-none">{contribution.title}</p>
                              {contribution.isOptional ? <Badge variant="secondary">Optional</Badge> : null}
                              {contribution.isStore ? <Badge variant="outline">Store</Badge> : null}
                              {declined ? <Badge variant="outline" className="border-amber-300 text-amber-700">Declined</Badge> : null}
                              {paidElsewhere ? <Badge variant="outline" className="border-sky-300 text-sky-700">Paid Elsewhere</Badge> : null}
                              {isSettledForOccupant ? <Badge variant="outline" className="border-emerald-300 text-emerald-700">Settled</Badge> : null}
                            </div>
                            {occupantId ? (
                              <div className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                                {isSettledForOccupant ? (
                                  <p className="font-medium text-emerald-700">
                                    {contribution.isStore
                                      ? "This store contribution is already settled for this occupant."
                                      : "This contribution is already settled for this occupant."}
                                  </p>
                                ) : contribution.isStore ? (
                                  <p>
                                    {occupantRemaining !== null ? (
                                      <>
                                        Remaining payable: <span className="font-semibold text-foreground">{formatPesos(occupantRemaining)}</span>
                                      </>
                                    ) : storePriceRange ? (
                                      storePriceRange.min === storePriceRange.max ? (
                                        <>
                                          Item price: <span className="font-semibold text-foreground">{formatPesos(storePriceRange.min)}</span>
                                        </>
                                      ) : (
                                        <>
                                          Price range: <span className="font-semibold text-foreground">{formatPesos(storePriceRange.min)} - {formatPesos(storePriceRange.max)}</span>
                                        </>
                                      )
                                    ) : (
                                      <>
                                        Item price: <span className="font-semibold text-foreground">{formatPesos(0)}</span>
                                      </>
                                    )}
                                  </p>
                                ) : (
                                  <p>
                                    {declined ? (
                                      <span className="font-semibold text-amber-700">Remaining will be set to zero.</span>
                                    ) : paidElsewhere ? (
                                      <span className="font-semibold text-sky-700">Remaining will be set to zero.</span>
                                    ) : (
                                      <>
                                        Remaining: <span className="font-semibold text-foreground">{formatPesos(getOccupantRemaining(contribution.id) ?? 0)}</span>
                                      </>
                                    )}
                                  </p>
                                )}
                                {contribution.isStore && storeCartSubtotal > 0 && !declined ? (
                                  <p>
                                    Cart total: <span className="font-semibold text-foreground">{formatPesos(storeCartSubtotal)}</span>
                                  </p>
                                ) : null}
                                {declined ? (
                                  <p className="font-medium text-amber-700">
                                    {contribution.isStore
                                      ? "No payment will be recorded for this item."
                                      : "No payment will be recorded for this contribution."}
                                  </p>
                                ) : paidElsewhere ? (
                                  <p className="font-medium text-sky-700">
                                    {contribution.isStore
                                      ? "This item will be marked as paid elsewhere."
                                      : "This contribution will be marked as paid elsewhere."}
                                  </p>
                                ) : null}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground mt-1.5">Select an occupant first</p>
                            )}
                          </div>
                        </label>
                        {checked && !isSettledForOccupant ? (
                          <div className="mt-3 space-y-2">
                            {contribution.isOptional ? (
                              <div className="rounded-md border bg-amber-50/60 p-3 dark:bg-amber-950/20">
                                <label className="flex items-start gap-3 text-sm">
                                  <Checkbox
                                    checked={declined}
                                    onCheckedChange={(value) =>
                                      toggleDeclinedContribution(contribution.id, Boolean(value))
                                    }
                                    className="mt-0.5"
                                  />
                                  <div className="space-y-1">
                                    <span className="font-medium">
                                      {contribution.isStore ? "Occupant will not avail this optional item" : "Occupant will not pay this optional contribution"}
                                    </span>
                                    <p className="text-xs text-muted-foreground">
                                      This only affects this contribution and removes it from the payment total.
                                    </p>
                                  </div>
                                </label>
                              </div>
                            ) : null}
                            <div className="rounded-md border bg-sky-50/60 p-3 dark:bg-sky-950/20">
                              <label className="flex items-start gap-3 text-sm">
                                <Checkbox
                                  checked={paidElsewhere}
                                  onCheckedChange={(value) =>
                                    togglePaidElsewhereContribution(contribution.id, Boolean(value))
                                  }
                                  className="mt-0.5"
                                />
                                <div className="space-y-1">
                                  <span className="font-medium">
                                    Occupant paid this contribution somewhere else
                                  </span>
                                  <p className="text-xs text-muted-foreground">
                                    This removes the remaining balance for this contribution and sends an update email instead of counting income.
                                  </p>
                                </div>
                              </label>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1 font-medium">
                <Badge variant="secondary" className="bg-secondary/50">Selected: {selectedContributionIds.length}</Badge>
                {declinedContributionIds.length > 0 ? (
                  <Badge variant="secondary" className="bg-amber-500/10 text-amber-700 dark:text-amber-400">
                    Declined: {declinedContributionIds.length}
                  </Badge>
                ) : null}
                {paidElsewhereContributionIds.length > 0 ? (
                  <Badge variant="secondary" className="bg-sky-500/10 text-sky-700 dark:text-sky-400">
                    Paid Elsewhere: {paidElsewhereContributionIds.length}
                  </Badge>
                ) : null}
                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">Exact Total: ₱{computedTotal.toFixed(2)}</Badge>
              </div>
            </div>

            {/* Store Cart Builder — per selected store contribution */}
            {hasAnyStoreContributions && selectedContributions.filter((c) => c.isStore && !declinedContributionIds.includes(c.id) && !paidElsewhereContributionIds.includes(c.id)).map((contribution) => {
              const cartForContribution = storeCartItems[contribution.id] || [];
              const items = normalizeStoreItems(contribution.storeItems || []);
              const computeSubtotal = (itemId: string, quantity: number, options: unknown) =>
                calculateCartSubtotal({
                  item: items.find((item) => item.id === itemId),
                  quantity,
                  options,
                  fallbackSubtotal: 0,
                });

              const addCartItem = () => {
                const newItem = { id: crypto.randomUUID(), item_id: "", quantity: 1, options: [], subtotal: 0 };
                const updated = [...cartForContribution, newItem];
                const next = { ...storeCartItems, [contribution.id]: updated };
                setStoreCartItems(next);
                setAmount(computeAmountForSelection(selectedContributions, next));
              };

              const removeCartItem = (itemIdx: number) => {
                const updated = cartForContribution.filter((_, i: number) => i !== itemIdx);
                const next = { ...storeCartItems, [contribution.id]: updated };
                setStoreCartItems(next);
                setAmount(computeAmountForSelection(selectedContributions, next));
              };

              const updateCartItem = (itemIdx: number, patch: Partial<StoreCartItem>) => {
                const updated = cartForContribution.map((ci, i: number) => i === itemIdx ? { ...ci, ...patch } : ci);
                const next = { ...storeCartItems, [contribution.id]: updated };
                setStoreCartItems(next);
                setAmount(computeAmountForSelection(selectedContributions, next));
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
                      {cartForContribution.map((cartItem, cartIdx: number) => {
                        const selectedStoreItem = items.find((i) => i.id === cartItem.item_id);
                        const selectedOptions = selectedStoreItem?.options ?? [];
                        const currentQty = Math.max(1, Number(cartItem.quantity || 1));
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
                                    const sItem = items.find((i) => i.id === val);
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
                                      updateCartItem(cartIdx, {
                                        item_id: val,
                                        options: defaultOpts,
                                        subtotal: computeSubtotal(val, currentQty, defaultOpts),
                                      });
                                    } else {
                                      updateCartItem(cartIdx, {
                                        item_id: val,
                                        options: [],
                                        subtotal: 0,
                                      });
                                    }
                                  }}
                                  value={cartItem.item_id}
                                >
                                  <SelectTrigger className="h-9">
                                    <SelectValue placeholder="Select item" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {items.map((si) => (
                                      <SelectItem key={si.id} value={si.id}>
                                        {si.name} (₱{si.price.toFixed(2)})
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
                                      subtotal: computeSubtotal(
                                        cartItem.item_id,
                                        qty,
                                        cartItem.options || []
                                      ),
                                    });
                                  }}
                                />
                              </div>
                            </div>

                            {selectedOptions.length > 0 && (
                              <div className="grid grid-cols-2 gap-3 pt-3 border-t">
                                {selectedOptions.map((opt, optIndex) => (
                                  <div key={opt.name} className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">{opt.name}</Label>
                                    <Select
                                      onValueChange={(val) => {
                                        const newOpts = [...(cartItem.options || [])];
                                        const selectedChoice = opt.choices.find(
                                          (choice: { label: string; priceAdjustment: number }) =>
                                            choice.label === val
                                        );
                                        newOpts[optIndex] = {
                                          name: opt.name,
                                          value: val,
                                          price_adjustment: selectedChoice?.priceAdjustment ?? 0,
                                        };
                                        updateCartItem(cartIdx, {
                                          options: newOpts,
                                          subtotal: computeSubtotal(
                                            cartItem.item_id,
                                            currentQty,
                                            newOpts
                                          ),
                                        });
                                      }}
                                      value={cartItem.options?.[optIndex]?.value || ""}
                                    >
                                      <SelectTrigger className="h-8 text-xs">
                                        <SelectValue placeholder={`Select ${opt.name}`} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {opt.choices.map((choice: { label: string; priceAdjustment: number }) => (
                                          <SelectItem key={choice.label} value={choice.label}>
                                            {formatChoiceLabel(choice)}
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
                  min="0"
                  step="0.01"
                  value={onlySpecialSelections ? 0 : amount}
                  readOnly={onlySpecialSelections}
                  onChange={(event) => setAmount(parseFloat(event.target.value) || 0)}
                  className={onlySpecialSelections ? "bg-muted font-mono" : ""}
                />
              </div>
              <div className="space-y-2">
                <Label>Date & Time</Label>
                <Input type="datetime-local" value={paidAtLocal} onChange={(event) => setPaidAtLocal(event.target.value)} />
              </div>
            </div>

            {Math.abs(amountDifference) >= 0.01 && !onlySpecialSelections ? (
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
                    {selectedContributions
                      .filter((contribution) => !declinedContributionIds.includes(contribution.id))
                      .map((contribution) => (
                      <SelectItem key={contribution.id} value={contribution.id}>
                        {contribution.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {paidElsewhereContributionIds.length > 0 ? (
              <div className="space-y-2 rounded-md border border-sky-200 bg-sky-50/70 p-3">
                <Label>Where was this paid?</Label>
                <Input
                  value={paidElsewhereLocation}
                  onChange={(event) => setPaidElsewhereLocation(event.target.value)}
                  placeholder="e.g. COFILANG Treasurer, officer booth, external list"
                />
                <p className="text-xs text-muted-foreground">
                  This location will be shown in the app and included in the update email.
                </p>
              </div>
            ) : null}

            <div className="space-y-4 rounded-lg border border-border/50 bg-muted/10 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label className="text-sm">
                    {onlySpecialSelections && declinedContributionIds.length > 0 && paidElsewhereContributionIds.length === 0
                      ? "Email Update"
                      : "Receipt Email"}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {onlySpecialSelections
                      ? paidElsewhereContributionIds.length > 0
                        ? "Send one receipt-style update that includes the paid-elsewhere items and their reported location."
                        : "Send update emails for declined optional contributions."
                      : selectedDirectPaymentCount > 0 && declinedContributionIds.length > 0
                      ? "Send one receipt for recorded payments. Declined optional items will still be sent as a separate update."
                      : selectedDirectPaymentCount > 0 && paidElsewhereContributionIds.length > 0
                      ? "Send one receipt that includes both treasurer-recorded payments and paid-elsewhere items."
                      : "Send one receipt containing all selected contributions."}
                  </p>
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
                          <div className="min-w-0">
                            <span className="truncate">{row.title}</span>
                            <span className="ml-2 text-[11px] text-muted-foreground">
                              {row.status === "paid_elsewhere"
                                ? "Paid elsewhere"
                                : row.status === "declined"
                                ? "Declined"
                                : "Paid"}
                            </span>
                          </div>
                          <span>₱{Math.max(0, row.amount).toFixed(2)}</span>
                        </div>
                      ))}
                      <div className="mt-2 border-t pt-2 text-sm font-semibold">
                        {paidElsewhereContributionIds.length > 0 ? (
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <span>Paid to Treasurer</span>
                              <span>₱{amount.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Paid Elsewhere</span>
                              <span>
                                ₱
                                {previewRows
                                  .filter((row) => row.status === "paid_elsewhere")
                                  .reduce((sum, row) => sum + Math.max(0, row.amount), 0)
                                  .toFixed(2)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Total Covered</span>
                              <span>
                                ₱
                                {previewRows
                                  .reduce((sum, row) => sum + Math.max(0, row.amount), 0)
                                  .toFixed(2)}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-between">
                            <span>Total</span>
                            <span>₱{amount.toFixed(2)}</span>
                          </div>
                        )}
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

      <Dialog
        open={settledContributionWarningOpen}
        onOpenChange={(open) => {
          setSettledContributionWarningOpen(open);
          if (!open) {
            setPendingSettledContribution(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md bg-white/95 dark:bg-card/95 backdrop-blur-xl border-muted/50 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-amber-600 dark:text-amber-500">
              Contribution Already Settled
            </DialogTitle>
            <DialogDescription className="text-sm">
              {pendingSettledContribution?.title ?? "This contribution"} is already fully paid for this occupant.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-4 text-amber-800 dark:text-amber-200">
            <p className="text-sm">
              {pendingSettledContribution?.isStore
                ? "Continue only if you intentionally want to record another store payment, such as an additional merch purchase or a duplicate payment."
                : "Continue only if you intentionally want to record another payment for this already settled contribution."}
            </p>
            <p className="text-sm">
              Extra payments stay recorded and do not reduce the remaining balance below zero.
            </p>
          </div>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSettledContributionWarningOpen(false);
                setPendingSettledContribution(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => {
                if (pendingSettledContribution) {
                  setConfirmedSettledContributionIds((current) =>
                    Array.from(new Set([...current, pendingSettledContribution.id]))
                  );
                  applyContributionSelection(pendingSettledContribution.id, true);
                }
                setSettledContributionWarningOpen(false);
                setPendingSettledContribution(null);
              }}
            >
              Continue
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
