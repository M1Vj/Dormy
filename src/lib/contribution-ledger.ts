function asMetadataRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeAmount(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function isExcludedFromTreasurerCollected(metadataInput: unknown) {
  const metadata = asMetadataRecord(metadataInput);

  const paidElsewhereFlag =
    metadata.paid_elsewhere === true ||
    (typeof metadata.status === "string" && metadata.status.trim().toLowerCase() === "paid_elsewhere");

  const declinedFlag =
    metadata.optional_declined === true ||
    (typeof metadata.status === "string" && metadata.status.trim().toLowerCase() === "declined");

  return paidElsewhereFlag || declinedFlag;
}

export function isContributionPaymentEntry(entryType: string | null | undefined) {
  return entryType === "payment";
}

export function getContributionChargeAmount(
  entryType: string | null | undefined,
  amountInput: number | string | null | undefined
) {
  const amount = normalizeAmount(amountInput);
  return isContributionPaymentEntry(entryType) ? 0 : amount;
}

export function getContributionCollectedAmount(
  entryType: string | null | undefined,
  amountInput: number | string | null | undefined,
  metadataInput?: unknown
) {
  const amount = normalizeAmount(amountInput);

  if (!isContributionPaymentEntry(entryType)) {
    return 0;
  }

  if (metadataInput !== undefined && isExcludedFromTreasurerCollected(metadataInput)) {
    return 0;
  }

  return Math.abs(amount);
}

export function isOptionalContribution(metadataInput: unknown) {
  return asMetadataRecord(metadataInput).is_optional === true;
}

export function isOptionalContributionDeclined(metadataInput: unknown) {
  return asMetadataRecord(metadataInput).optional_declined === true;
}

export function isContributionPaidElsewhere(metadataInput: unknown) {
  return asMetadataRecord(metadataInput).paid_elsewhere === true;
}

export function getOptionalContributionDecisionLabel(input: {
  isStore: boolean;
  count?: number;
}) {
  const count = input.count ?? 1;
  const noun = count === 1 ? "contribution" : "contributions";

  if (input.isStore) {
    return count === 1 ? "will not avail this optional item" : "will not avail these optional items";
  }

  return count === 1
    ? "will not pay this optional contribution"
    : `will not pay these optional ${noun}`;
}

export function getContributionSettlementStatus(input: {
  payable: number;
  paid: number;
  remaining: number;
  declined: boolean;
  paidElsewhere?: boolean;
}) {
  if (input.paidElsewhere) {
    return "paid_elsewhere" as const;
  }

  if (input.declined) {
    return "declined" as const;
  }

  if (input.paid > 0 && input.remaining > 0.009) {
    return "partial" as const;
  }

  if (input.remaining <= 0.009 && (input.payable > 0.009 || input.paid > 0.009)) {
    return "paid" as const;
  }

  return "unpaid" as const;
}
