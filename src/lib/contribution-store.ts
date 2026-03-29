import { normalizeAndPriceCartItems } from "@/lib/store-pricing";

type ContributionCartSnapshot = {
  entryType?: string | null;
  cartItems?: unknown;
};

export function getCanonicalContributionCartItems(
  snapshots: ContributionCartSnapshot[],
  storeItemsInput: unknown
) {
  const candidates = snapshots.filter((snapshot) => Array.isArray(snapshot.cartItems) && snapshot.cartItems.length > 0);
  const preferredSnapshot =
    candidates.find((snapshot) => snapshot.entryType !== "payment") ?? candidates[0] ?? null;

  return preferredSnapshot
    ? normalizeAndPriceCartItems(preferredSnapshot.cartItems, storeItemsInput)
    : [];
}
