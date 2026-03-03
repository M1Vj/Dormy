type UnknownRecord = Record<string, unknown>;

export type StoreChoice = {
  label: string;
  priceAdjustment: number;
};

export type StoreOption = {
  name: string;
  choices: StoreChoice[];
};

export type StoreItem = {
  id: string;
  name: string;
  price: number;
  options: StoreOption[];
};

export type CartOption = {
  name: string;
  value: string;
  price_adjustment: number;
};

export type CartItem = {
  item_id: string;
  quantity: number;
  options: CartOption[];
  subtotal: number;
};

export type PriceRange = {
  min: number;
  max: number;
};

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as UnknownRecord;
}

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function round2(value: number) {
  return Number(value.toFixed(2));
}

function keyify(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeChoices(input: unknown): StoreChoice[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const output: StoreChoice[] = [];
  for (const raw of input) {
    if (typeof raw === "string") {
      const label = raw.trim();
      if (label.length > 0) {
        output.push({ label, priceAdjustment: 0 });
      }
      continue;
    }

    const record = asRecord(raw);
    if (!record) {
      continue;
    }

    const label =
      toText(record.label) ||
      toText(record.value) ||
      toText(record.name);
    if (!label) {
      continue;
    }

    const priceAdjustment = toNumber(
      record.price_adjustment ?? record.priceAdjustment ?? record.price_diff ?? record.priceDiff
    );

    output.push({ label, priceAdjustment: round2(priceAdjustment) });
  }

  return output;
}

export function normalizeStoreItems(input: unknown): StoreItem[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const items: StoreItem[] = [];
  for (const raw of input) {
    const record = asRecord(raw);
    if (!record) {
      continue;
    }

    const id = toText(record.id);
    const name = toText(record.name);
    if (!id || !name) {
      continue;
    }

    const price = round2(Math.max(0, toNumber(record.price)));
    const optionsRaw = Array.isArray(record.options) ? record.options : [];
    const options: StoreOption[] = [];

    for (const optionRaw of optionsRaw) {
      const optionRecord = asRecord(optionRaw);
      if (!optionRecord) {
        continue;
      }

      const optionName = toText(optionRecord.name);
      const choices = normalizeChoices(optionRecord.choices);
      if (!optionName || choices.length === 0) {
        continue;
      }

      options.push({
        name: optionName,
        choices,
      });
    }

    items.push({
      id,
      name,
      price,
      options,
    });
  }

  return items;
}

export function findChoicePriceAdjustment(
  item: StoreItem | null | undefined,
  optionName: string,
  selectedValue: string
) {
  if (!item) {
    return 0;
  }

  const optionNameKey = keyify(optionName);
  const selectedKey = keyify(selectedValue);
  if (!selectedKey) {
    return 0;
  }

  const byNamedOption = item.options.find((option) => keyify(option.name) === optionNameKey);
  if (byNamedOption) {
    const match = byNamedOption.choices.find((choice) => keyify(choice.label) === selectedKey);
    if (match) {
      return round2(match.priceAdjustment);
    }
  }

  for (const option of item.options) {
    const match = option.choices.find((choice) => keyify(choice.label) === selectedKey);
    if (match) {
      return round2(match.priceAdjustment);
    }
  }

  return 0;
}

export function normalizeCartOptions(
  optionsInput: unknown,
  item: StoreItem | null | undefined
): CartOption[] {
  if (!Array.isArray(optionsInput)) {
    return [];
  }

  const options: CartOption[] = [];
  for (const raw of optionsInput) {
    if (typeof raw === "string") {
      const value = raw.trim();
      if (!value) {
        continue;
      }
      options.push({
        name: "",
        value,
        price_adjustment: round2(findChoicePriceAdjustment(item, "", value)),
      });
      continue;
    }

    const record = asRecord(raw);
    if (!record) {
      continue;
    }

    const name = toText(record.name);
    const value =
      toText(record.value) ||
      toText(record.label);
    if (!value) {
      continue;
    }

    const explicitAdjustmentRaw =
      record.price_adjustment ?? record.priceAdjustment ?? record.price_diff ?? record.priceDiff;

    const explicitAdjustment =
      explicitAdjustmentRaw === null || explicitAdjustmentRaw === undefined
        ? null
        : toNumber(explicitAdjustmentRaw);

    const priceAdjustment = round2(
      explicitAdjustment !== null
        ? explicitAdjustment
        : findChoicePriceAdjustment(item, name, value)
    );

    options.push({
      name,
      value,
      price_adjustment: priceAdjustment,
    });
  }

  return options;
}

export function calculateCartSubtotal(input: {
  item: StoreItem | null | undefined;
  quantity: number;
  options: unknown;
  fallbackSubtotal?: number;
}) {
  const quantity = Math.max(1, Number(input.quantity || 1));
  if (!input.item) {
    return round2(Math.max(0, Number(input.fallbackSubtotal || 0)));
  }

  const normalizedOptions = normalizeCartOptions(input.options, input.item);
  const optionAdjustment = normalizedOptions.reduce(
    (sum, option) => sum + Number(option.price_adjustment || 0),
    0
  );
  const unitPrice = Math.max(0, Number(input.item.price) + optionAdjustment);
  return round2(unitPrice * quantity);
}

export function getStoreItemUnitPriceRange(item: StoreItem | null | undefined): PriceRange {
  if (!item) {
    return { min: 0, max: 0 };
  }

  const basePrice = round2(Math.max(0, Number(item.price || 0)));
  let minAdjustment = 0;
  let maxAdjustment = 0;

  for (const option of item.options || []) {
    if (!Array.isArray(option.choices) || option.choices.length === 0) {
      continue;
    }
    const adjustments = option.choices
      .map((choice) => Number(choice.priceAdjustment || 0))
      .filter((value) => Number.isFinite(value));
    if (!adjustments.length) {
      continue;
    }
    minAdjustment += Math.min(...adjustments);
    maxAdjustment += Math.max(...adjustments);
  }

  const min = round2(Math.max(0, basePrice + minAdjustment));
  const max = round2(Math.max(0, basePrice + maxAdjustment));
  return min <= max ? { min, max } : { min: max, max: min };
}

export function getStoreContributionPriceRange(storeItemsInput: unknown): PriceRange | null {
  const items = normalizeStoreItems(storeItemsInput);
  if (!items.length) {
    return null;
  }

  const ranges = items.map((item) => getStoreItemUnitPriceRange(item));
  return {
    min: round2(Math.min(...ranges.map((range) => range.min))),
    max: round2(Math.max(...ranges.map((range) => range.max))),
  };
}

export function normalizeAndPriceCartItems(
  cartItemsInput: unknown,
  storeItemsInput: unknown
): CartItem[] {
  if (!Array.isArray(cartItemsInput)) {
    return [];
  }

  const storeItems = normalizeStoreItems(storeItemsInput);
  const catalogById = new Map(storeItems.map((item) => [item.id, item]));
  const items: CartItem[] = [];

  for (const raw of cartItemsInput) {
    const record = asRecord(raw);
    if (!record) {
      continue;
    }

    const itemId = toText(record.item_id);
    if (!itemId) {
      continue;
    }

    const quantity = Math.max(1, Math.trunc(toNumber(record.quantity) || 1));
    const storeItem = catalogById.get(itemId) ?? null;
    const options = normalizeCartOptions(record.options, storeItem);
    const subtotal = calculateCartSubtotal({
      item: storeItem,
      quantity,
      options,
      fallbackSubtotal: toNumber(record.subtotal),
    });

    items.push({
      item_id: itemId,
      quantity,
      options,
      subtotal,
    });
  }

  return items;
}

function formatPeso(value: number) {
  return `₱${Math.abs(value).toFixed(2)}`;
}

export function formatChoiceLabel(choice: StoreChoice) {
  const adjustment = round2(Number(choice.priceAdjustment || 0));
  if (adjustment === 0) {
    return choice.label;
  }
  const sign = adjustment > 0 ? "+" : "-";
  return `${choice.label} (${sign}${formatPeso(adjustment)})`;
}

export function formatSelectedOption(option: {
  name?: string;
  value: string;
  price_adjustment?: number;
}) {
  const name = toText(option.name);
  const value = toText(option.value);
  if (!value) {
    return "";
  }
  const adjustment = round2(Number(option.price_adjustment || 0));
  if (adjustment === 0) {
    return name ? `${name}: ${value}` : value;
  }
  const sign = adjustment > 0 ? "+" : "-";
  const suffix = ` (${sign}${formatPeso(adjustment)})`;
  return name ? `${name}: ${value}${suffix}` : `${value}${suffix}`;
}

export function formatCartItemSpecs(optionsInput: unknown) {
  if (!Array.isArray(optionsInput)) {
    return "";
  }
  return optionsInput
    .map((option) => {
      const record = asRecord(option);
      if (!record) {
        return "";
      }
      return formatSelectedOption({
        name: toText(record.name),
        value: toText(record.value),
        price_adjustment: toNumber(
          record.price_adjustment ?? record.priceAdjustment ?? record.price_diff ?? record.priceDiff
        ),
      });
    })
    .filter((entry) => entry.length > 0)
    .join(" · ");
}
