import {
  getStoreItemUnitPriceRange,
  normalizeAndPriceCartItems,
  normalizeStoreItems,
  type CartItem,
  type StoreItem,
} from "@/lib/store-pricing";

type ContributionCartSnapshot = {
  entryType?: string | null;
  cartItems?: unknown;
  amountPesos?: number | string | null;
};

function round2(value: number) {
  return Number(value.toFixed(2));
}

function normalizeSubmittedElsewhereLabel(item: StoreItem, cartItem: CartItem): CartItem {
  const normalizedOptions = cartItem.options.map((option) => {
    const matchingOption = item.options.find(
      (candidate) => candidate.name.trim().toLowerCase() === option.name.trim().toLowerCase()
    );

    if (!matchingOption) {
      return option;
    }

    const hasSubmittedElsewhere = matchingOption.choices.some(
      (choice) => choice.label.trim().toLowerCase() === "submitted elsewhere"
    );

    if (!hasSubmittedElsewhere || option.value.trim().toLowerCase() !== "default size") {
      return option;
    }

    return {
      ...option,
      value: "Submitted elsewhere",
    };
  });

  return {
    ...cartItem,
    options: normalizedOptions,
  };
}

function normalizeDisplayCartItems(items: CartItem[], storeItems: StoreItem[]) {
  return items.map((cartItem) => {
    const matchingItem = storeItems.find((storeItem) => storeItem.id === cartItem.item_id);
    if (!matchingItem) {
      return cartItem;
    }
    return normalizeSubmittedElsewhereLabel(matchingItem, cartItem);
  });
}

function buildFallbackOptions(item: StoreItem) {
  return item.options.flatMap((option) => {
    const submittedElsewhereChoice = option.choices.find(
      (choice) => choice.label.trim().toLowerCase() === "submitted elsewhere"
    );

    if (submittedElsewhereChoice) {
      return [
        {
          name: option.name,
          value: submittedElsewhereChoice.label,
          price_adjustment: submittedElsewhereChoice.priceAdjustment,
        },
      ];
    }

    if (option.choices.length === 1) {
      return [
        {
          name: option.name,
          value: option.choices[0].label,
          price_adjustment: option.choices[0].priceAdjustment,
        },
      ];
    }

    return [];
  });
}

function inferFallbackCartItems(
  snapshots: ContributionCartSnapshot[],
  storeItems: StoreItem[]
) {
  const preferredAmounts = snapshots
    .map((snapshot) => ({
      entryType: snapshot.entryType ?? null,
      amount: round2(Math.abs(Number(snapshot.amountPesos ?? 0))),
    }))
    .filter((snapshot) => snapshot.amount > 0);

  const candidateAmounts = [
    ...preferredAmounts.filter((snapshot) => snapshot.entryType === "payment"),
    ...preferredAmounts.filter((snapshot) => snapshot.entryType !== "payment"),
  ];

  for (const snapshot of candidateAmounts) {
    const exactMatches = storeItems.filter((item) => {
      const range = getStoreItemUnitPriceRange(item);
      return range.min === range.max && Math.abs(range.min - snapshot.amount) <= 0.009;
    });

    if (exactMatches.length !== 1) {
      continue;
    }

    const matchedItem = exactMatches[0];
    return normalizeDisplayCartItems(
      normalizeAndPriceCartItems(
        [
          {
            item_id: matchedItem.id,
            quantity: 1,
            options: buildFallbackOptions(matchedItem),
            subtotal: snapshot.amount,
          },
        ],
        storeItems
      ),
      storeItems
    );
  }

  return [];
}

export function getCanonicalContributionCartItems(
  snapshots: ContributionCartSnapshot[],
  storeItemsInput: unknown
) {
  const storeItems = normalizeStoreItems(storeItemsInput);
  const candidates = snapshots.filter((snapshot) => Array.isArray(snapshot.cartItems) && snapshot.cartItems.length > 0);
  const preferredSnapshot =
    candidates.find((snapshot) => snapshot.entryType !== "payment") ?? candidates[0] ?? null;

  if (preferredSnapshot) {
    return normalizeDisplayCartItems(
      normalizeAndPriceCartItems(preferredSnapshot.cartItems, storeItems),
      storeItems
    );
  }

  return inferFallbackCartItems(snapshots, storeItems);
}
