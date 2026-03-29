"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getActiveRole } from "@/lib/roles-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureActiveSemesterId } from "@/lib/semesters";
import { TREASURER_MANUAL_EXPENSE_MARKER } from "@/lib/finance/constants";
import { z } from "zod";
import { logAuditEvent } from "@/lib/audit/log";
import { optimizeImage } from "@/lib/images";
import {
  type CartItem,
  type StoreItem,
  formatChoiceLabel,
  formatSelectedOption,
  getStoreContributionPriceRange,
  normalizeAndPriceCartItems,
  normalizeStoreItems,
} from "@/lib/store-pricing";
import {
  getContributionChargeAmount,
  getContributionCollectedAmount,
  isContributionPaymentEntry,
} from "@/lib/contribution-ledger";

const transactionSchema = z.object({
  occupant_id: z.string().uuid(),
  category: z.enum(['maintenance_fee', 'sa_fines', 'contributions', 'gadgets'] as const),
  amount: z.number().positive(),
  entry_type: z.enum(['charge', 'payment', 'adjustment', 'refund'] as const),
  method: z.string().optional(),
  note: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  event_id: z.string().uuid().optional(),
  fine_id: z.string().uuid().optional(),
  receipt_email: z
    .object({
      enabled: z.boolean().default(true),
      subject: z.string().trim().min(1).max(140).optional(),
      message: z.string().trim().max(2000).optional(),
      signature: z.string().trim().max(3000).optional(),
      logo_url: z.string().url().trim().max(3000).optional(),
    })
    .optional(),
});

type TransactionData = z.infer<typeof transactionSchema>;
export type LedgerCategory = 'maintenance_fee' | 'sa_fines' | 'contributions' | 'gadgets';
type ServerSupabaseClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

const allowedRolesByLedger: Record<LedgerCategory, string[]> = {
  maintenance_fee: ["admin", "adviser"],
  sa_fines: ["admin", "student_assistant", "adviser"],
  contributions: ["admin", "treasurer"],
  gadgets: ["admin", "student_assistant"],
};

const storeChoiceSchema = z.union([
  z.string().trim().min(1, "Choice cannot be empty"),
  z.object({
    label: z.string().trim().min(1, "Choice label cannot be empty"),
    price_adjustment: z.number().finite().optional(),
  }),
]);

const storeOptionSchema = z.object({
  name: z.string().trim().min(1, "Option name is required (e.g., Size)"),
  choices: z.array(storeChoiceSchema).min(1, "At least one choice is required"),
});

const storeItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, "Item name is required"),
  price: z.number().min(0, "Price must be positive"),
  options: z.array(storeOptionSchema).default([]),
});

const storeCartItemOptionSchema = z.object({
  name: z.string().trim().max(120).optional(),
  value: z.string().trim().max(120),
  price_adjustment: z.number().finite().optional(),
});

const storeCartItemSchema = z.object({
  contribution_id: z.string().uuid(),
  item_id: z.string().uuid(),
  quantity: z.number().int().positive(),
  options: z.array(storeCartItemOptionSchema).default([]),
  subtotal: z.number().min(0),
});

const contributionBatchSchema = z.object({
  amount: z.number().min(0),
  title: z.string().trim().min(2).max(120),
  details: z.string().trim().max(1200).optional().nullable(),
  description: z.string().trim().min(2).max(200).optional().nullable(),
  deadline: z.string().datetime().nullable(),
  event_id: z.string().uuid().optional().nullable(),
  event_title: z.string().trim().max(200).optional().nullable(),
  include_already_charged: z.boolean().default(false),
  is_store: z.boolean().default(false),
  is_optional: z.boolean().default(false),
  store_items: z.array(storeItemSchema).optional(),
});

const contributionBatchPaymentSchema = z.object({
  occupant_id: z.string().uuid(),
  contribution_ids: z.array(z.string().uuid()).default([]),
  declined_contribution_ids: z.array(z.string().uuid()).default([]),
  allow_overpayment_contribution_ids: z.array(z.string().uuid()).default([]),
  amount: z.number().min(0),
  method: z.enum(["cash", "gcash"]),
  paid_at_iso: z.string().datetime(),
  allocation_target_id: z.string().uuid().optional().nullable(),
  send_receipt_email: z.boolean().default(true),
  receipt_email_override: z.string().email().optional().nullable(),
  receipt_subject: z.string().trim().max(140).optional().nullable(),
  receipt_message: z.string().trim().max(2000).optional().nullable(),
  receipt_signature: z.string().trim().max(3000).optional().nullable(),
  receipt_logo_url: z.string().url().optional().nullable(),
  cart_items: z.array(storeCartItemSchema).optional(),
});

const resendContributionReceiptSchema = z.object({
  contribution_ids: z.array(z.string().uuid()).min(1),
  occupant_id: z.string().uuid(),
  receipt_email_override: z.string().email().optional().nullable(),
});

const contributionReminderSchema = z.object({
  semester_ids: z.array(z.string().uuid()).optional(),
});

const contributionReceiptSignatureSchema = z.object({
  contribution_id: z.string().uuid(),
  signature: z.string().trim().min(2).max(3000),
});

const contributionReceiptTemplateSchema = z.object({
  contribution_id: z.string().uuid(),
  subject: z.string().trim().max(140).optional().nullable(),
  message: z.string().trim().max(2000).optional().nullable(),
  logo_url: z.string().url().optional().nullable(),
});

const contributionReceiptTemplatePreviewSchema = z.object({
  contribution_id: z.string().uuid(),
  occupant_id: z.string().uuid(),
  amount: z.number().positive(),
  method: z.enum(["cash", "gcash", "bank_transfer"]).optional().nullable(),
  paid_at_iso: z.string().datetime().optional().nullable(),
  subject: z.string().trim().max(140).optional().nullable(),
  message: z.string().trim().max(2000).optional().nullable(),
  logo_url: z.string().url().trim().max(3000).optional().nullable(),
  signature: z.string().trim().max(3000).optional().nullable(),
});

const contributionReceiptAssetUploadSchema = z.object({
  contribution_id: z.string().uuid(),
  asset_type: z.enum(["logo", "signature"]),
});

const contributionPayableOverrideSchema = z.object({
  contribution_id: z.string().uuid(),
  occupant_id: z.string().uuid(),
  new_payable: z.number().min(0),
  reason: z.string().trim().min(3).max(300),
});

const optionalContributionDeclineSchema = z.object({
  occupant_id: z.string().uuid(),
  contribution_ids: z.array(z.string().uuid()).min(1),
  send_email: z.boolean().default(true),
  email_override: z.string().email().optional().nullable(),
});

const treasurerFinanceManualEntrySchema = z.object({
  entry_kind: z.enum(["inflow", "expense"]),
  title: z.string().trim().min(2).max(160),
  amount: z.number().positive(),
  happened_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  counterparty: z.string().trim().max(160).optional().nullable(),
  note: z.string().trim().max(2000).optional().nullable(),
});

const overwriteLedgerSchema = z.object({
  entry_id: z.string().uuid(),
  amount: z.number().positive(),
  note: z.string().trim().min(2).max(300),
  reason: z.string().trim().min(2).max(300),
  method: z.string().trim().max(60).optional(),
});

type ContributionMetadata = {
  contribution_id: string;
  contribution_title: string;
  contribution_details: string | null;
  contribution_event_title: string | null;
  is_optional: boolean;
  optional_declined: boolean;
  payable_deadline: string | null;
  contribution_receipt_signature: string | null;
  contribution_receipt_subject: string | null;
  contribution_receipt_message: string | null;
  contribution_receipt_logo_url: string | null;
  store_items: StoreItem[];
  cart_items: CartItem[];
};

type ContributionBalanceRow = {
  entry_type?: string | null;
  amount_pesos?: number | string | null;
  event_id?: string | null;
  metadata?: unknown;
};

function asMetadataRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function parseContributionMetadata(
  metadataInput: unknown,
  fallback: {
    eventId?: string | null;
    note?: string | null;
  } = {}
): ContributionMetadata {
  const metadata = asMetadataRecord(metadataInput);
  const contributionIdRaw =
    metadata.contribution_id ??
    metadata.payable_batch_id ??
    fallback.eventId ??
    null;
  const contributionTitleRaw =
    metadata.contribution_title ??
    metadata.payable_label ??
    fallback.note ??
    "Contribution";
  const detailsRaw = metadata.contribution_details;
  const eventTitleRaw = metadata.contribution_event_title;
  const isOptionalRaw = metadata.is_optional;
  const optionalDeclinedRaw = metadata.optional_declined;
  const deadlineRaw = metadata.payable_deadline;
  const signatureRaw = metadata.contribution_receipt_signature;
  const subjectRaw = metadata.contribution_receipt_subject;
  const messageRaw = metadata.contribution_receipt_message;
  const logoRaw = metadata.contribution_receipt_logo_url;

  const store_items = normalizeStoreItems(metadata.store_items);
  const cart_items = normalizeAndPriceCartItems(metadata.cart_items, store_items);

  return {
    contribution_id:
      typeof contributionIdRaw === "string" && contributionIdRaw.trim().length > 0
        ? contributionIdRaw
        : crypto.randomUUID(),
    contribution_title:
      typeof contributionTitleRaw === "string" && contributionTitleRaw.trim().length > 0
        ? contributionTitleRaw.trim()
        : "Contribution",
    contribution_details:
      typeof detailsRaw === "string" && detailsRaw.trim().length > 0
        ? detailsRaw.trim()
        : null,
    contribution_event_title:
      typeof eventTitleRaw === "string" && eventTitleRaw.trim().length > 0
        ? eventTitleRaw.trim()
        : null,
    is_optional: isOptionalRaw === true,
    optional_declined: optionalDeclinedRaw === true,
    payable_deadline:
      typeof deadlineRaw === "string" && deadlineRaw.trim().length > 0
        ? deadlineRaw
        : null,
    contribution_receipt_signature:
      typeof signatureRaw === "string" && signatureRaw.trim().length > 0
        ? signatureRaw.trim()
        : null,
    contribution_receipt_subject:
      typeof subjectRaw === "string" && subjectRaw.trim().length > 0
        ? subjectRaw.trim()
        : null,
    contribution_receipt_message:
      typeof messageRaw === "string" && messageRaw.trim().length > 0
        ? messageRaw.trim()
        : null,
    contribution_receipt_logo_url:
      typeof logoRaw === "string" && logoRaw.trim().length > 0
        ? logoRaw.trim()
        : null,
    store_items,
    cart_items,
  };
}

function parseGlobalReceiptTemplate(value: unknown) {
  const template = asMetadataRecord(value);

  return {
    signature:
      typeof template.signature === "string" && template.signature.trim().length > 0
        ? template.signature.trim()
        : null,
    subject:
      typeof template.subject === "string" && template.subject.trim().length > 0
        ? template.subject.trim()
        : null,
    message:
      typeof template.message === "string" && template.message.trim().length > 0
        ? template.message.trim()
        : null,
    logoUrl:
      typeof template.logo_url === "string" && template.logo_url.trim().length > 0
        ? template.logo_url.trim()
        : typeof template.logoUrl === "string" && template.logoUrl.trim().length > 0
          ? template.logoUrl.trim()
          : null,
  };
}

function normalizeOrderOptionLabel(option: unknown) {
  if (typeof option === "string") {
    const value = option.trim();
    return value.length > 0 ? value : null;
  }
  if (!option || typeof option !== "object") {
    return null;
  }

  const record = option as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const value = typeof record.value === "string" ? record.value.trim() : "";
  const priceAdjustment =
    typeof record.price_adjustment === "number"
      ? record.price_adjustment
      : typeof record.priceAdjustment === "number"
        ? record.priceAdjustment
        : 0;

  if (!value) {
    return null;
  }
  return formatSelectedOption({
    name,
    value,
    price_adjustment: priceAdjustment,
  });
}

function normalizeCartItemsForContribution(
  cartItems: unknown,
  storeItems: ContributionMetadata["store_items"] | undefined
) {
  return normalizeAndPriceCartItems(
    cartItems,
    Array.isArray(storeItems) ? storeItems : []
  );
}

function sumCartSubtotal(
  cartItems: ContributionMetadata["cart_items"] | undefined,
  storeItems: ContributionMetadata["store_items"] | undefined
) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    return 0;
  }

  const normalized = normalizeCartItemsForContribution(cartItems, storeItems);
  return Number(
    normalized
      .reduce((sum, item) => sum + Math.max(0, Number(item.subtotal ?? 0)), 0)
      .toFixed(2)
  );
}

function buildOrderItemsFromCart(
  cartItems: ContributionMetadata["cart_items"] | undefined,
  storeItems: ContributionMetadata["store_items"] | undefined
) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    return undefined;
  }

  const catalog = Array.isArray(storeItems) ? storeItems : [];
  const normalizedCartItems = normalizeCartItemsForContribution(cartItems, catalog);
  const rows = normalizedCartItems
    .map((cartItem) => {
      const catalogItem = catalog.find((item) => item.id === cartItem.item_id);
      const fallbackItem = cartItem as unknown as { item?: { name?: string } };
      const options = Array.isArray(cartItem.options)
        ? cartItem.options
            .map(normalizeOrderOptionLabel)
            .filter((value): value is string => Boolean(value))
        : [];

      return {
        itemName: catalogItem?.name ?? fallbackItem.item?.name ?? "Item",
        options,
        quantity: Math.max(1, Number(cartItem.quantity ?? 1)),
        subtotal: Math.max(0, Number(cartItem.subtotal ?? 0)),
      };
    })
    .filter((item) => item.quantity > 0);

  return rows.length > 0 ? rows : undefined;
}

function buildStoreSpecsFromStoreItems(
  storeItems: ContributionMetadata["store_items"] | undefined
) {
  const items = Array.isArray(storeItems) ? storeItems : [];
  if (items.length === 0) {
    return undefined;
  }

  const rows = items
    .map((item) => {
      const optionSpecs = (item.options ?? [])
        .map((option) => {
          const name = option.name?.trim() ?? "";
          const choices = (option.choices ?? [])
            .map((choice) => formatChoiceLabel(choice))
            .filter((choice) => choice.trim().length > 0);
          if (!name && choices.length === 0) {
            return "";
          }
          if (!name) {
            return choices.join(" | ");
          }
          if (choices.length === 0) {
            return name;
          }
          return `${name}: ${choices.join(" | ")}`;
        })
        .filter((value) => value.length > 0);

      const itemName = item.name?.trim() || "Item";
      if (optionSpecs.length === 0) {
        return `${itemName} (Base: ₱${Number(item.price ?? 0).toFixed(2)})`;
      }
      return `${itemName} (${optionSpecs.join(" · ")})`;
    })
    .filter((value) => value.length > 0);

  return rows.length > 0 ? rows : undefined;
}

function mapInputCartItemsByContribution(
  inputItems: z.infer<typeof storeCartItemSchema>[] | undefined,
  storeItemsByContribution: Map<string, ContributionMetadata["store_items"]> = new Map()
) {
  const mapped = new Map<string, ContributionMetadata["cart_items"]>();
  if (!Array.isArray(inputItems) || inputItems.length === 0) {
    return mapped;
  }

  for (const item of inputItems) {
    const normalized = normalizeCartItemsForContribution(
      [
        {
          item_id: item.item_id,
          quantity: Math.max(1, Number(item.quantity ?? 1)),
          options: (item.options ?? []).map((option) => ({
            name: typeof option.name === "string" ? option.name.trim() : "",
            value: option.value.trim(),
            price_adjustment: option.price_adjustment,
          })),
          subtotal: Math.max(0, Number(item.subtotal ?? 0)),
        },
      ],
      storeItemsByContribution.get(item.contribution_id) ?? []
    )[0];

    if (!normalized) {
      continue;
    }
    const list = mapped.get(item.contribution_id) ?? [];
    list.push(normalized);
    mapped.set(item.contribution_id, list);
  }

  return mapped;
}

function getContributionLedgerBalance(
  rows: ContributionBalanceRow[],
  contributionId: string
) {
  const matchingRows = rows.filter((row) => {
    const metadata = parseContributionMetadata(row.metadata, {
      eventId: row.event_id ?? null,
      note: null,
    });
    return metadata.contribution_id === contributionId;
  });

  if (matchingRows.length === 0) {
    return null;
  }

  const payable = Number(
    matchingRows
      .reduce((sum, row) => sum + getContributionChargeAmount(row.entry_type, row.amount_pesos), 0)
      .toFixed(2)
  );
  const paid = Number(
    matchingRows
      .reduce((sum, row) => sum + getContributionCollectedAmount(row.entry_type, row.amount_pesos), 0)
      .toFixed(2)
  );
  const parsedRows = matchingRows.map((row) =>
    parseContributionMetadata(row.metadata, {
      eventId: row.event_id ?? null,
      note: null,
    })
  );

  return {
    payable,
    paid,
    outstanding: Number((payable - paid).toFixed(2)),
    isStore: parsedRows.some((row) => row.store_items.length > 0),
    title: parsedRows.find((row) => row.contribution_title)?.contribution_title ?? "Contribution",
  };
}

function mergeContributionCartItems(
  existingCartItems: unknown,
  newCartItems: unknown,
  storeItems: ContributionMetadata["store_items"] | undefined
) {
  return normalizeCartItemsForContribution(
    [
      ...normalizeCartItemsForContribution(existingCartItems, storeItems),
      ...normalizeCartItemsForContribution(newCartItems, storeItems),
    ],
    storeItems
  );
}

export async function createTreasurerFinanceManualEntry(
  dormId: string,
  payload: z.infer<typeof treasurerFinanceManualEntrySchema>
) {
  const parsed = treasurerFinanceManualEntrySchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid finance entry payload." };
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Unauthorized" };
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  if (membershipError || !memberships?.length) {
    return { error: "Forbidden" };
  }

  if (!memberships.some((membership) => membership.role === "treasurer")) {
    return { error: "Only the dorm treasurer can add finance entries here." };
  }

  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  if ("error" in semesterResult) {
    return { error: semesterResult.error ?? "No active semester." };
  }

  const noteText = input.note?.trim() || "";
  const counterpartyText = input.counterparty?.trim() || "";
  const amount = Number(input.amount.toFixed(2));
  let writeClient: typeof supabase = supabase;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = await import("@supabase/supabase-js");
    writeClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    ) as typeof supabase;
  }

  if (input.entry_kind === "inflow") {
    const { error: insertError } = await writeClient.from("ledger_entries").insert({
      dorm_id: dormId,
      semester_id: semesterResult.semesterId,
      ledger: "contributions",
      entry_type: "payment",
      occupant_id: null,
      event_id: null,
      fine_id: null,
      posted_at: `${input.happened_on}T12:00:00.000Z`,
      amount_pesos: -Math.abs(amount),
      method: "manual_finance",
      note: input.title.trim(),
      metadata: {
        finance_manual_inflow: true,
        finance_counterparty: counterpartyText || null,
        finance_note: noteText || null,
        finance_source: "treasurer_finance_page",
      },
      created_by: user.id,
    });

    if (insertError) {
      return { error: insertError.message };
    }
  } else {
    const combinedNote = [TREASURER_MANUAL_EXPENSE_MARKER, noteText].filter(Boolean).join("\n");
    const { error: insertError } = await writeClient.from("expenses").insert({
      dorm_id: dormId,
      semester_id: semesterResult.semesterId,
      committee_id: null,
      submitted_by: user.id,
      title: input.title.trim(),
      description: noteText || null,
      amount_pesos: amount,
      purchased_at: input.happened_on,
      receipt_storage_path: null,
      status: "approved",
      approved_by: user.id,
      approval_comment: "Treasurer finance manual entry",
      approved_at: new Date().toISOString(),
      category: "contributions",
      expense_group_title: input.title.trim(),
      contribution_reference_title: null,
      vendor_name: counterpartyText || null,
      official_receipt_no: null,
      quantity: null,
      unit_cost_pesos: null,
      payment_method: "manual_finance",
      purchased_by: counterpartyText || null,
      transparency_notes: combinedNote || TREASURER_MANUAL_EXPENSE_MARKER,
    });

    if (insertError) {
      return { error: insertError.message };
    }
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "finance.manual_entry_created",
      entityType: "finance",
      metadata: {
        entry_kind: input.entry_kind,
        title: input.title,
        amount_pesos: amount,
        happened_on: input.happened_on,
        counterparty: counterpartyText || null,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for treasurer manual finance entry:", auditError);
  }

  const activeRole = (await getActiveRole()) || "occupant";
  revalidatePath(`/${activeRole}/finance`);
  revalidatePath(`/${activeRole}/contributions`);
  revalidatePath(`/${activeRole}/contribution-expenses`);
  revalidatePath(`/${activeRole}/reporting`);

  return { success: true };
}

// --- Actions ---

export async function recordTransaction(dormId: string, data: TransactionData) {
  const parsed = transactionSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.message };
  }
  const tx = parsed.data;

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: memberships, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  if (membershipError || !memberships?.length) {
    return { error: "Forbidden" };
  }

  const allowed = memberships.some(m => allowedRolesByLedger[tx.category].includes(m.role));
  if (!allowed) {
    return { error: "You do not have permission to record this transaction." };
  }

  // Calculate signed amount based on entry type
  let finalAmount = tx.entry_type === 'payment'
    ? -Math.abs(tx.amount)
    : Math.abs(tx.amount);

  const metadataRecord =
    tx.metadata && typeof tx.metadata === "object"
      ? (tx.metadata as Record<string, unknown>)
      : {};
  let metadataForInsert: Record<string, unknown> = metadataRecord;

  if (
    tx.entry_type === "payment" &&
    tx.category === "contributions" &&
    metadataRecord.is_store === true
  ) {
    const storeItems = normalizeStoreItems(metadataRecord.store_items);
    const cartItems = normalizeAndPriceCartItems(metadataRecord.cart_items, storeItems);
    const computedTotal = sumCartSubtotal(cartItems, storeItems);

    metadataForInsert = {
      ...metadataRecord,
      is_store: true,
      store_items: storeItems,
      cart_items: cartItems,
    };

    if (computedTotal > 0) {
      finalAmount = -Math.abs(computedTotal);
    }
  }

  // Ensure we have the active semester for this transaction
  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  const semesterId = "semesterId" in semesterResult ? semesterResult.semesterId : null;

  let writeClient: typeof supabase = supabase;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = await import("@supabase/supabase-js");
    writeClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    ) as typeof supabase;
  }

  // Intercept store contribution payments to update the base charge
  if (
    tx.entry_type === "payment" &&
    tx.category === "contributions" &&
    metadataForInsert.is_store === true &&
    typeof metadataForInsert.contribution_id === "string" &&
    metadataForInsert.contribution_id.trim().length > 0
  ) {
    const storeItems = normalizeStoreItems(metadataForInsert.store_items);
    const cartItems = normalizeAndPriceCartItems(metadataForInsert.cart_items, storeItems);
    const computedTotal = sumCartSubtotal(cartItems, storeItems);
    const allowSettledOverpayment = metadataForInsert.allow_settled_overpayment === true;

    const { data: chargeEntries } = await writeClient
      .from("ledger_entries")
      .select("id, metadata, amount_pesos")
      .eq("dorm_id", dormId)
      .eq("occupant_id", tx.occupant_id)
      .eq("entry_type", "charge")
      .eq("ledger", "contributions")
      .is("voided_at", null);

    const chargeEntry = chargeEntries?.find((e) => {
      const meta = typeof e.metadata === "object" && e.metadata !== null ? (e.metadata as Record<string, unknown>) : {};
      return meta.contribution_id === metadataForInsert.contribution_id;
    });

    if (chargeEntry) {
      const existingMetadata =
        typeof chargeEntry.metadata === "object" && chargeEntry.metadata !== null
          ? (chargeEntry.metadata as Record<string, unknown>)
          : {};
      const mergedCartItems =
        allowSettledOverpayment && cartItems.length > 0
          ? mergeContributionCartItems(existingMetadata.cart_items, cartItems, storeItems)
          : cartItems;
      const newChargeAmount =
        allowSettledOverpayment && cartItems.length > 0
          ? Number((Math.max(0, Number(chargeEntry.amount_pesos ?? 0)) + computedTotal).toFixed(2))
          : computedTotal > 0
            ? computedTotal
            : Math.abs(finalAmount);
      const updatedMetadata = {
        ...existingMetadata,
        is_store: true,
        store_items: storeItems,
        cart_items: mergedCartItems,
      };

      const { error: updateError } = await writeClient
        .from("ledger_entries")
        .update({
          amount_pesos: newChargeAmount,
          metadata: updatedMetadata,
        })
        .eq("id", chargeEntry.id);

      if (updateError) {
        console.error("Store charge update error:", updateError);
        return { error: "Failed to process store order." };
      }
    }
  }

  if (tx.entry_type === "payment") {
    const { data: ledgerRows, error: ledgerRowsError } = await writeClient
      .from("ledger_entries")
      .select("entry_type, amount_pesos, event_id, metadata")
      .eq("dorm_id", dormId)
      .eq("occupant_id", tx.occupant_id)
      .eq("ledger", tx.category)
      .is("voided_at", null);

    if (ledgerRowsError) {
      return { error: ledgerRowsError.message };
    }

    const paymentAmount = Number(Math.abs(finalAmount).toFixed(2));
    const contributionId =
      tx.category === "contributions" && typeof metadataForInsert.contribution_id === "string"
        ? metadataForInsert.contribution_id.trim()
        : "";
    const allowSettledOverpayment =
      tx.category === "contributions" && metadataForInsert.allow_settled_overpayment === true;

    if (tx.category === "contributions" && contributionId) {
      const contributionBalance = getContributionLedgerBalance(
        (ledgerRows ?? []) as ContributionBalanceRow[],
        contributionId
      );

      if (!contributionBalance) {
        return { error: "Contribution balance could not be resolved for this occupant." };
      }

      if (contributionBalance.outstanding <= 0.009 && !allowSettledOverpayment) {
        return {
          error: contributionBalance.isStore
            ? "This store contribution is already settled for this occupant."
            : "This contribution is already settled for this occupant.",
        };
      }

      if (paymentAmount - contributionBalance.outstanding > 0.009 && !allowSettledOverpayment) {
        return {
          error: `Payment exceeds this contribution's remaining balance (available: ₱${contributionBalance.outstanding.toFixed(2)}).`,
        };
      }
    } else {
      const outstandingBalance = Number(
        (ledgerRows ?? [])
          .reduce((sum, row) => sum + Number(row.amount_pesos), 0)
          .toFixed(2)
      );

      if (outstandingBalance <= 0.009) {
        return { error: "No outstanding balance available for this account." };
      }

      if (paymentAmount - outstandingBalance > 0.009) {
        return {
          error: `Payment exceeds outstanding balance (available: ₱${outstandingBalance.toFixed(2)}).`,
        };
      }
    }
  }

  const { error } = await writeClient.from("ledger_entries").insert({
    dorm_id: dormId,
    semester_id: semesterId,
    ledger: tx.category,
    entry_type: tx.entry_type,
    occupant_id: tx.occupant_id,
    amount_pesos: finalAmount,
    method: tx.method,
    note: tx.note,
    metadata: metadataForInsert,
    event_id: tx.event_id,
    fine_id: tx.fine_id,
    created_by: user.id
  });

  if (error) {
    console.error("Ledger error:", error);
    return { error: error.message };
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "finance.transaction_recorded",
      entityType: "ledger_entry",
      metadata: {
        ledger: tx.category,
        entry_type: tx.entry_type,
        occupant_id: tx.occupant_id,
        event_id: tx.event_id ?? null,
        fine_id: tx.fine_id ?? null,
        amount_pesos: finalAmount,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for finance transaction:", auditError);
  }

  const receiptConfig = tx.receipt_email ?? null;
  const shouldSendReceiptEmail = finalAmount < 0 && (receiptConfig?.enabled ?? true);

  if (shouldSendReceiptEmail) {
    try {
      const { sendEmail, renderPaymentReceiptEmail } = await import("@/lib/email");

      const { data: occupant } = await supabase
        .from("occupants")
        .select("id, user_id, full_name, contact_email")
        .eq("dorm_id", dormId)
        .eq("id", tx.occupant_id)
        .maybeSingle();

      if (!occupant) {
        throw new Error("Occupant not found for receipt email.");
      }

      let recipientEmail: string | null = occupant.contact_email?.trim() || null;

      if (!recipientEmail && occupant.user_id && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const { createClient } = await import("@supabase/supabase-js");
        const adminClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          {
            auth: {
              autoRefreshToken: false,
              persistSession: false,
            },
          }
        );

        const { data: authUserResult } = await adminClient.auth.admin.getUserById(occupant.user_id);
        recipientEmail = authUserResult.user?.email?.trim() || null;
      }

      if (!recipientEmail) {
        throw new Error("No email address is available for this occupant.");
      }

      const ledgerLabel =
        tx.category === "maintenance_fee"
          ? "Maintenance"
          : tx.category === "sa_fines"
            ? "Fines"
            : tx.category === "gadgets"
              ? "Gadgets"
              : "Contributions";

      let eventTitle: string | null = null;
      if (tx.event_id) {
        const { data: event } = await supabase
          .from("events")
          .select("title")
          .eq("dorm_id", dormId)
          .eq("id", tx.event_id)
          .maybeSingle();

        eventTitle = event?.title?.trim() || null;
      }

      let mergedMetadata = metadataForInsert;
      if (tx.category === "contributions" && mergedMetadata.contribution_id) {
        const { data: origEntry } = await supabase
          .from("ledger_entries")
          .select("metadata")
          .eq("id", mergedMetadata.contribution_id)
          .single();
        if (origEntry?.metadata) {
          mergedMetadata = { ...mergedMetadata, ...(origEntry.metadata as Record<string, unknown>) };
        }
      }

      const { data: dorm } = await supabase
        .from("dorms")
        .select("attributes")
        .eq("id", dormId)
        .single();
      const globalTemplate = parseGlobalReceiptTemplate(
        asMetadataRecord(dorm?.attributes).global_receipt_template
      );

      const contributionMetadata =
        tx.category === "contributions"
          ? parseContributionMetadata(mergedMetadata, {
            eventId: tx.event_id ?? null,
            note: tx.note ?? null,
          })
          : null;
      const resolvedSignature =
        receiptConfig?.signature?.trim() ||
        contributionMetadata?.contribution_receipt_signature ||
        globalTemplate.signature ||
        null;
      const resolvedSubject =
        receiptConfig?.subject?.trim() ||
        contributionMetadata?.contribution_receipt_subject ||
        globalTemplate.subject ||
        null;
      const resolvedMessage =
        receiptConfig?.message?.trim() ||
        contributionMetadata?.contribution_receipt_message ||
        globalTemplate.message ||
        null;
      const resolvedLogoUrl =
        receiptConfig?.logo_url?.trim() ||
        contributionMetadata?.contribution_receipt_logo_url ||
        globalTemplate.logoUrl ||
        null;

      const orderItems = buildOrderItemsFromCart(
        contributionMetadata?.cart_items,
        contributionMetadata?.store_items
      );

      const rendered = renderPaymentReceiptEmail({
        treasurerNameOverride: user.user_metadata?.full_name || user.email || null,
        recipientName: occupant.full_name ?? null,
        amountPesos: Math.abs(finalAmount),
        paidAtIso: new Date().toISOString(),
        ledgerLabel,
        method: tx.method?.trim() || null,
        note: tx.note?.trim() || null,
        eventTitle,
        orderItems,
        customMessage: resolvedMessage,
        subjectOverride: resolvedSubject,
        signatureOverride: resolvedSignature,
        logoUrl: resolvedLogoUrl,
      });

      const result = await sendEmail({
        to: recipientEmail,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      if (!result.success) {
        console.warn("Receipt email could not be sent:", result.error);
      }
    } catch (emailError) {
      console.error("Failed to send receipt email:", emailError);
    }
  }

  const { getActiveRole } = await import("@/lib/roles-server");
  const activeRole = await getActiveRole() || "occupant";

  revalidatePath(`/${activeRole}/finance`);
  revalidatePath(`/${activeRole}/payments`); // Occupant view
  if (tx.category === "gadgets") {
    revalidatePath(`/${activeRole}/finance/gadgets`);
  }
  return { success: true };
}

export async function previewTransactionReceiptEmail(
  dormId: string,
  data: TransactionData
) {
  const parsed = transactionSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid payment preview payload." };
  }

  const tx = parsed.data;
  if (tx.entry_type !== "payment") {
    return { error: "Only payment receipts can be previewed." };
  }

  const receiptConfig = tx.receipt_email ?? null;
  if (receiptConfig?.enabled === false) {
    return { error: "Receipt email is disabled for this payment." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Unauthorized" };
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  if (membershipError || !memberships?.length) {
    return { error: "Forbidden" };
  }

  const allowed = memberships.some(m => allowedRolesByLedger[tx.category].includes(m.role));
  if (!allowed) {
    return { error: "You do not have permission to preview this receipt email." };
  }

  const { data: occupant } = await supabase
    .from("occupants")
    .select("id, user_id, full_name, contact_email")
    .eq("dorm_id", dormId)
    .eq("id", tx.occupant_id)
    .maybeSingle();

  if (!occupant) {
    return { error: "Occupant not found for receipt email." };
  }

  let recipientEmail: string | null = occupant.contact_email?.trim() || null;
  if (!recipientEmail && occupant.user_id && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = await import("@supabase/supabase-js");
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { data: authUserResult } = await adminClient.auth.admin.getUserById(occupant.user_id);
    recipientEmail = authUserResult.user?.email?.trim() || null;
  }

  if (!recipientEmail) {
    return { error: "No email address is available for this occupant." };
  }

  const ledgerLabel =
    tx.category === "maintenance_fee"
      ? "Maintenance"
      : tx.category === "sa_fines"
        ? "Fines"
        : tx.category === "gadgets"
          ? "Gadgets"
          : "Contributions";

  let eventTitle: string | null = null;
  if (tx.event_id) {
    const { data: event } = await supabase
      .from("events")
      .select("title")
      .eq("dorm_id", dormId)
      .eq("id", tx.event_id)
      .maybeSingle();

    eventTitle = event?.title?.trim() || null;
  }

  let mergedMetadata = tx.metadata ?? {};
  if (tx.category === "contributions" && mergedMetadata.contribution_id) {
    const { data: origEntry } = await supabase
      .from("ledger_entries")
      .select("metadata")
      .eq("id", mergedMetadata.contribution_id)
      .single();
    if (origEntry?.metadata) {
      mergedMetadata = { ...mergedMetadata, ...(origEntry.metadata as Record<string, unknown>) };
    }
  }

  const { data: dormDoc } = await supabase
    .from("dorms")
    .select("attributes")
    .eq("id", dormId)
    .single();
  const globalTemplate = parseGlobalReceiptTemplate(
    asMetadataRecord(dormDoc?.attributes).global_receipt_template
  );

  const contributionMetadata =
    tx.category === "contributions"
      ? parseContributionMetadata(mergedMetadata, {
        eventId: tx.event_id ?? null,
        note: tx.note ?? null,
      })
      : null;
  const resolvedSignature =
    receiptConfig?.signature?.trim() ||
    contributionMetadata?.contribution_receipt_signature ||
    globalTemplate.signature ||
    null;
  const resolvedSubject =
    receiptConfig?.subject?.trim() ||
    contributionMetadata?.contribution_receipt_subject ||
    globalTemplate.subject ||
    null;
  const resolvedMessage =
    receiptConfig?.message?.trim() ||
    contributionMetadata?.contribution_receipt_message ||
    globalTemplate.message ||
    null;
  const resolvedLogoUrl =
    receiptConfig?.logo_url?.trim() ||
    contributionMetadata?.contribution_receipt_logo_url ||
    globalTemplate.logoUrl ||
    null;

  const orderItems = buildOrderItemsFromCart(
    contributionMetadata?.cart_items,
    contributionMetadata?.store_items
  );

  const { renderPaymentReceiptEmail } = await import("@/lib/email");
  const rendered = renderPaymentReceiptEmail({
    treasurerNameOverride: user.user_metadata?.full_name || user.email || null,
    recipientName: occupant.full_name ?? null,
    amountPesos: tx.amount,
    paidAtIso: new Date().toISOString(),
    ledgerLabel,
    method: tx.method?.trim() || null,
    note: tx.note?.trim() || null,
    eventTitle,
    orderItems,
    customMessage: resolvedMessage,
    subjectOverride: resolvedSubject,
    signatureOverride: resolvedSignature,
    logoUrl: resolvedLogoUrl,
  });

  return {
    success: true,
    recipient_email: recipientEmail,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
  };
}

export async function overwriteLedgerEntry(
  dormId: string,
  payload: {
    entry_id: string;
    amount: number;
    note: string;
    reason: string;
    method?: string;
  }
) {
  const parsed = overwriteLedgerSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid overwrite payload." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Unauthorized" };
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  if (membershipError || !memberships?.length) {
    return { error: "Forbidden" };
  }

  const { data: originalEntry, error: originalError } = await supabase
    .from("ledger_entries")
    .select(
      "id, ledger, entry_type, occupant_id, event_id, fine_id, amount_pesos, method, note, metadata, voided_at"
    )
    .eq("dorm_id", dormId)
    .eq("id", parsed.data.entry_id)
    .maybeSingle();

  if (originalError || !originalEntry) {
    return { error: originalError?.message ?? "Ledger entry not found." };
  }

  if (originalEntry.voided_at) {
    return { error: "This ledger entry is already voided." };
  }

  const ledger = originalEntry.ledger as LedgerCategory;
  if (!memberships.some(m => allowedRolesByLedger[ledger]?.includes(m.role))) {
    return { error: "You do not have permission to overwrite this ledger entry." };
  }

  const finalAmount =
    originalEntry.entry_type === "payment"
      ? -Math.abs(parsed.data.amount)
      : Math.abs(parsed.data.amount);

  const nowIso = new Date().toISOString();
  const voidReason = `Overwritten: ${parsed.data.reason}`;

  const { error: voidError } = await supabase
    .from("ledger_entries")
    .update({
      voided_at: nowIso,
      voided_by: user.id,
      void_reason: voidReason,
      updated_at: nowIso,
    })
    .eq("dorm_id", dormId)
    .eq("id", originalEntry.id)
    .is("voided_at", null);

  if (voidError) {
    return { error: voidError.message };
  }

  const originalMetadata =
    originalEntry.metadata && typeof originalEntry.metadata === "object"
      ? (originalEntry.metadata as Record<string, unknown>)
      : {};

  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  const semesterId = "semesterId" in semesterResult ? semesterResult.semesterId : null;

  const { data: replacementEntry, error: replacementError } = await supabase
    .from("ledger_entries")
    .insert({
      dorm_id: dormId,
      semester_id: semesterId,
      ledger,
      entry_type: originalEntry.entry_type,
      occupant_id: originalEntry.occupant_id,
      event_id: originalEntry.event_id,
      fine_id: originalEntry.fine_id,
      amount_pesos: finalAmount,
      method: parsed.data.method?.trim() || originalEntry.method || "manual_overwrite",
      note: parsed.data.note,
      metadata: {
        ...originalMetadata,
        overwritten_from_entry_id: originalEntry.id,
        overwrite_reason: parsed.data.reason,
      },
      created_by: user.id,
    })
    .select("id")
    .single();

  if (replacementError || !replacementEntry) {
    await supabase
      .from("ledger_entries")
      .update({
        voided_at: null,
        voided_by: null,
        void_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("dorm_id", dormId)
      .eq("id", originalEntry.id);

    return { error: replacementError?.message ?? "Failed to create replacement entry." };
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "finance.transaction_overwritten",
      entityType: "ledger_entry",
      entityId: originalEntry.id,
      metadata: {
        replacement_entry_id: replacementEntry.id,
        ledger,
        entry_type: originalEntry.entry_type,
        old_amount_pesos: Number(originalEntry.amount_pesos ?? 0),
        new_amount_pesos: finalAmount,
        reason: parsed.data.reason,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for ledger overwrite:", auditError);
  }

  const activeRole = (await getActiveRole()) || "occupant";
  revalidatePath(`/${activeRole}/payments`);
  revalidatePath(`/${activeRole}/finance/maintenance`);
  revalidatePath(`/${activeRole}/contributions`);
  if (originalEntry.event_id) {
    revalidatePath(`/${activeRole}/contributions/${originalEntry.event_id}`);
  }

  return {
    success: true,
    replacement_entry_id: replacementEntry.id,
  };
}

export async function createContributionBatch(
  dormId: string,
  payload: {
    amount: number;
    title: string;
    details?: string | null;
    description?: string | null;
    deadline?: string | null;
    event_id?: string | null;
    event_title?: string | null;
    include_already_charged?: boolean;
    is_store?: boolean;
    is_optional?: boolean;
    store_items?: {
      id: string;
      name: string;
      price: number;
      options: {
        name: string;
        choices: Array<string | { label: string; price_adjustment?: number }>;
      }[];
    }[];
  }
) {
  const parsed = contributionBatchSchema.safeParse({
    amount: payload.amount,
    title: payload.title,
    details: payload.details ?? null,
    description: payload.description ?? null,
    deadline: payload.deadline ?? null,
    event_id: payload.event_id ?? null,
    event_title: payload.event_title ?? null,
    include_already_charged: payload.include_already_charged ?? false,
    is_store: payload.is_store ?? false,
    is_optional: payload.is_optional ?? false,
    store_items: payload.store_items ?? [],
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid payable event input." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: memberships, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  if (membershipError || !memberships?.length) {
    return { error: "Forbidden" };
  }

  if (!memberships.some(m => new Set(["admin", "treasurer"]).has(m.role))) {
    return { error: "Only treasurer and admin can create payable events." };
  }

  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  if ("error" in semesterResult) {
    return { error: semesterResult.error ?? "Failed to resolve active semester." };
  }

  let eventTitle: string | null = parsed.data.event_title?.trim() || null;
  if (parsed.data.event_id) {
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, title")
      .eq("id", parsed.data.event_id)
      .eq("dorm_id", dormId)
      .eq("semester_id", semesterResult.semesterId)
      .maybeSingle();

    if (eventError || !event) {
      return { error: "Event not found for this dorm." };
    }
    eventTitle = event.title?.trim() || eventTitle;
  }

  const { data: occupants, error: occupantsError } = await supabase
    .from("occupants")
    .select("id")
    .eq("dorm_id", dormId)
    .eq("status", "active");

  if (occupantsError) {
    return { error: occupantsError.message };
  }

  if (!occupants?.length) {
    return { error: "No active occupants found to charge." };
  }

  const activeOccupantIds = occupants.map((occupant) => occupant.id);
  let targetOccupantIds = activeOccupantIds;

  if (!parsed.data.include_already_charged && parsed.data.event_id) {
    const { data: existingCharges, error: chargesError } = await supabase
      .from("ledger_entries")
      .select("occupant_id")
      .eq("dorm_id", dormId)
      .eq("ledger", "contributions")
      .eq("entry_type", "charge")
      .eq("event_id", parsed.data.event_id)
      .is("voided_at", null)
      .gt("amount_pesos", 0);

    if (chargesError) {
      return { error: chargesError.message };
    }

    const chargedSet = new Set(
      (existingCharges ?? [])
        .map((entry) => entry.occupant_id)
        .filter((value): value is string => Boolean(value))
    );

    targetOccupantIds = activeOccupantIds.filter((occupantId) => !chargedSet.has(occupantId));
  }

  if (!targetOccupantIds.length) {
    return {
      error:
        "All active occupants already have payable charges for this event. Enable re-charge to create another batch.",
    };
  }

  const batchId = crypto.randomUUID();
  const deadlineIso = parsed.data.deadline
    ? new Date(parsed.data.deadline).toISOString()
    : null;
  const contributionTitle = parsed.data.title.trim();
  const contributionDetails = parsed.data.details?.trim() || parsed.data.description?.trim() || null;
  const normalizedStoreItems = parsed.data.is_store
    ? normalizeStoreItems(parsed.data.store_items ?? [])
    : [];
  const storePriceRange = parsed.data.is_store
    ? getStoreContributionPriceRange(normalizedStoreItems)
    : null;

  if (parsed.data.is_store && normalizedStoreItems.length === 0) {
    return { error: "Add at least one store item before creating a store contribution." };
  }

  if (parsed.data.is_store && (!storePriceRange || storePriceRange.max <= 0)) {
    return { error: "Store contribution items must have a price greater than zero." };
  }

  const perOccupantAmount = parsed.data.is_store
    ? Number((storePriceRange?.min ?? 0).toFixed(2))
    : Math.abs(parsed.data.amount);

  let writeClient: typeof supabase = supabase;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = await import("@supabase/supabase-js");
    writeClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    ) as typeof supabase;
  }

  const { error: insertError } = await writeClient.from("ledger_entries").insert(
    targetOccupantIds.map((occupantId) => ({
      dorm_id: dormId,
      semester_id: semesterResult.semesterId,
      ledger: "contributions",
      entry_type: "charge",
      occupant_id: occupantId,
      event_id: parsed.data.event_id || null,
      amount_pesos: perOccupantAmount,
      method: "manual_charge",
      note: contributionTitle,
      metadata: {
        contribution_id: batchId,
        contribution_title: contributionTitle,
        contribution_details: contributionDetails,
        contribution_event_title: eventTitle,
        contribution_receipt_signature: null,
        contribution_receipt_subject: null,
        contribution_receipt_message: null,
        contribution_receipt_logo_url: null,
        payable_batch_id: batchId,
        payable_deadline: deadlineIso,
        payable_label: contributionTitle,
        is_store: parsed.data.is_store,
        is_optional: parsed.data.is_optional,
        store_items: normalizedStoreItems,
        store_price_min_pesos: storePriceRange?.min ?? null,
        store_price_max_pesos: storePriceRange?.max ?? null,
      },
      created_by: user.id,
    }))
  );

  if (insertError) {
    return { error: insertError.message };
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "finance.contribution_batch_created",
      entityType: "finance",
      entityId: batchId,
      metadata: {
        event_id: parsed.data.event_id || null,
        event_title: eventTitle,
        contribution_title: contributionTitle,
        contribution_details: contributionDetails,
        amount_pesos: perOccupantAmount,
        deadline: deadlineIso,
        charged_count: targetOccupantIds.length,
        include_already_charged: parsed.data.include_already_charged,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for contribution batch creation:", auditError);
  }

  const activeRole = (await getActiveRole()) || "occupant";
  revalidatePath(`/${activeRole}/contributions`);
  revalidatePath(`/${activeRole}/contributions/${batchId}`);
  revalidatePath(`/${activeRole}/payments`);

  return {
    success: true,
    contributionId: batchId,
    chargedCount: targetOccupantIds.length,
  };
}

type ContributionGroupEntry = {
  contributionId: string;
  title: string;
  details: string | null;
  eventTitle: string | null;
  isOptional: boolean;
  declined: boolean;
  receiptSignature: string | null;
  receiptSubject: string | null;
  receiptMessage: string | null;
  receiptLogoUrl: string | null;
  semesterId: string | null;
  eventId: string | null;
  deadline: string | null;
  storeItems: ContributionMetadata["store_items"];
  cartItems: ContributionMetadata["cart_items"];
  payable: number;
  paid: number;
  outstanding: number;
};

type OptionalContributionDeclineEntry = {
  contributionId: string;
  title: string;
  eventTitle: string | null;
  isStore: boolean;
  amount: number;
};

async function resolveOccupantRecipientEmail(
  supabase: ServerSupabaseClient,
  dormId: string,
  occupantId: string,
  emailOverride?: string | null
) {
  const { data: occupant } = await supabase
    .from("occupants")
    .select("id, user_id, full_name, contact_email")
    .eq("dorm_id", dormId)
    .eq("id", occupantId)
    .maybeSingle();

  if (!occupant) {
    throw new Error("Occupant not found.");
  }

  let recipientEmail = emailOverride?.trim() || occupant.contact_email?.trim() || "";

  if (!recipientEmail && occupant.user_id && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = await import("@supabase/supabase-js");
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
    const { data: authUser } = await adminClient.auth.admin.getUserById(occupant.user_id);
    recipientEmail = authUser.user?.email?.trim() || "";
  }

  return {
    occupant,
    recipientEmail: recipientEmail || null,
  };
}

async function sendOptionalContributionDeclineEmail(input: {
  supabase: ServerSupabaseClient;
  dormId: string;
  occupantId: string;
  actorName: string | null;
  contributions: OptionalContributionDeclineEntry[];
  emailOverride?: string | null;
}) {
  if (input.contributions.length === 0) {
    return;
  }

  const { occupant, recipientEmail } = await resolveOccupantRecipientEmail(
    input.supabase,
    input.dormId,
    input.occupantId,
    input.emailOverride
  );

  if (!recipientEmail) {
    return;
  }

  const { sendEmail, renderOptionalContributionDeclineEmail } = await import("@/lib/email");
  const rendered = renderOptionalContributionDeclineEmail({
    recipientName: occupant.full_name ?? null,
    contributions: input.contributions.map((contribution) => ({
      title: contribution.title,
      eventTitle: contribution.eventTitle,
      isStore: contribution.isStore,
      amountPesos: contribution.amount,
    })),
    treasurerNameOverride: input.actorName,
  });

  const result = await sendEmail({
    to: recipientEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  if (!result.success) {
    console.warn("Failed to send optional contribution decline email:", result.error);
  }
}



export async function recordContributionBatchPayment(
  dormId: string,
  payload: z.infer<typeof contributionBatchPaymentSchema>
) {
  const parsed = contributionBatchPaymentSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid batch payment request." };
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Unauthorized" };
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  if (membershipError || !memberships?.length) {
    return { error: "Forbidden" };
  }

  if (!memberships.some(m => new Set(["admin", "treasurer"]).has(m.role))) {
    return { error: "Only admins and treasurers can record contribution payments." };
  }

  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  if ("error" in semesterResult) {
    return { error: semesterResult.error ?? "Failed to resolve active semester." };
  }

  const { data: rawEntries, error: rawEntriesError } = await supabase
    .from("ledger_entries")
    .select("id, semester_id, event_id, entry_type, amount_pesos, metadata")
    .eq("dorm_id", dormId)
    .eq("ledger", "contributions")
    .eq("occupant_id", input.occupant_id)
    .is("voided_at", null);

  if (rawEntriesError) {
    return { error: rawEntriesError.message };
  }

  const paymentContributionIds = Array.from(new Set(input.contribution_ids));
  const declinedContributionIds = Array.from(new Set(input.declined_contribution_ids));
  const allowOverpaymentContributionIds = new Set(input.allow_overpayment_contribution_ids);
  const selectedIds = new Set([...paymentContributionIds, ...declinedContributionIds]);
  const contributionMap = new Map<string, ContributionGroupEntry>();

  for (const row of rawEntries ?? []) {
    const metadata = parseContributionMetadata(row.metadata, {
      eventId: row.event_id,
      note: null,
    });

    if (!selectedIds.has(metadata.contribution_id)) {
      continue;
    }

    const existing = contributionMap.get(metadata.contribution_id) ?? {
      contributionId: metadata.contribution_id,
      title: metadata.contribution_title,
      details: metadata.contribution_details,
      eventTitle: metadata.contribution_event_title,
      isOptional: metadata.is_optional,
      declined: metadata.optional_declined,
      receiptSignature: metadata.contribution_receipt_signature,
      receiptSubject: metadata.contribution_receipt_subject,
      receiptMessage: metadata.contribution_receipt_message,
      receiptLogoUrl: metadata.contribution_receipt_logo_url,
      semesterId: row.semester_id ?? null,
      eventId: row.event_id ?? null,
      deadline: metadata.payable_deadline,
      storeItems: metadata.store_items,
      cartItems: metadata.cart_items,
      payable: 0,
      paid: 0,
      outstanding: 0,
    };

    existing.paid += getContributionCollectedAmount(row.entry_type, row.amount_pesos);
    existing.payable += getContributionChargeAmount(row.entry_type, row.amount_pesos);
    existing.outstanding = Number((existing.payable - existing.paid).toFixed(2));

    if (!existing.semesterId && row.semester_id) {
      existing.semesterId = row.semester_id;
    }
    if (!existing.eventId && row.event_id) {
      existing.eventId = row.event_id;
    }
    if (!existing.deadline && metadata.payable_deadline) {
      existing.deadline = metadata.payable_deadline;
    }
    if (!existing.eventTitle && metadata.contribution_event_title) {
      existing.eventTitle = metadata.contribution_event_title;
    }
    if (!existing.details && metadata.contribution_details) {
      existing.details = metadata.contribution_details;
    }
    if (!existing.isOptional && metadata.is_optional) {
      existing.isOptional = true;
    }
    if (!existing.declined && metadata.optional_declined) {
      existing.declined = true;
    }
    if (!existing.receiptSignature && metadata.contribution_receipt_signature) {
      existing.receiptSignature = metadata.contribution_receipt_signature;
    }
    if (!existing.receiptSubject && metadata.contribution_receipt_subject) {
      existing.receiptSubject = metadata.contribution_receipt_subject;
    }
    if (!existing.receiptMessage && metadata.contribution_receipt_message) {
      existing.receiptMessage = metadata.contribution_receipt_message;
    }
    if (!existing.receiptLogoUrl && metadata.contribution_receipt_logo_url) {
      existing.receiptLogoUrl = metadata.contribution_receipt_logo_url;
    }

    contributionMap.set(metadata.contribution_id, existing);
  }

  const contributionRows = Array.from(contributionMap.values());
  if (!contributionRows.length) {
    return { error: "No selected contributions found for this occupant." };
  }

  const declinedRows = contributionRows.filter((row) =>
    declinedContributionIds.includes(row.contributionId)
  );

  for (const row of declinedRows) {
    if (!row.isOptional) {
      return { error: `${row.title} is not marked as an optional contribution.` };
    }
    if (row.paid > 0.009) {
      return { error: `${row.title} already has recorded payments and cannot be marked as declined.` };
    }
    if (row.outstanding <= 0.009 || row.declined) {
      return { error: `${row.title} is already settled for this occupant.` };
    }
  }

  for (const row of contributionRows) {
    if (!paymentContributionIds.includes(row.contributionId)) {
      continue;
    }

    if (row.outstanding <= 0.009 && !allowOverpaymentContributionIds.has(row.contributionId)) {
      return { error: `${row.title} is already settled for this occupant.` };
    }
  }

  const storeItemsByContribution = new Map(
    contributionRows.map((row) => [row.contributionId, row.storeItems] as const)
  );
  const inputCartItemsByContribution = mapInputCartItemsByContribution(
    input.cart_items,
    storeItemsByContribution
  );
  const dueByContribution = new Map<string, number>();
  for (const row of contributionRows) {
    if (declinedContributionIds.includes(row.contributionId)) {
      continue;
    }
    const suppliedCartItems = inputCartItemsByContribution.get(row.contributionId);
    const effectiveCartItems =
      suppliedCartItems && suppliedCartItems.length > 0 ? suppliedCartItems : row.cartItems;
    const storeSubtotal =
      row.storeItems.length > 0 ? sumCartSubtotal(effectiveCartItems, row.storeItems) : 0;
    dueByContribution.set(
      row.contributionId,
      storeSubtotal > 0 ? storeSubtotal : Math.max(0, row.outstanding)
    );
  }

  const totalDue = Array.from(dueByContribution.values()).reduce((sum, value) => sum + value, 0);

  const allocations = new Map(dueByContribution);
  const difference = Number((input.amount - totalDue).toFixed(2));
  if (Math.abs(difference) >= 0.01 && paymentContributionIds.length > 0) {
    if (!input.allocation_target_id) {
      return {
        error: "Select where to apply the payment difference when amount is not exact.",
      };
    }
    const existingTarget = allocations.get(input.allocation_target_id);
    if (existingTarget === undefined) {
      return { error: "Allocation target must be one of the selected contributions." };
    }
    const adjusted = Number((existingTarget + difference).toFixed(2));
    if (adjusted < 0) {
      return { error: "Difference is too large for the selected allocation target." };
    }
    allocations.set(input.allocation_target_id, adjusted);
  }

  const allocRows = contributionRows
    .filter((row) => paymentContributionIds.includes(row.contributionId))
    .map((row) => {
      const suppliedCartItems = inputCartItemsByContribution.get(row.contributionId);
      const effectiveCartItems =
        suppliedCartItems && suppliedCartItems.length > 0 ? suppliedCartItems : row.cartItems;
      const normalizedCartItems = normalizeCartItemsForContribution(
        effectiveCartItems,
        row.storeItems
      );
      return {
        ...row,
        cartItems: normalizedCartItems,
        allocation: Number((allocations.get(row.contributionId) ?? 0).toFixed(2)),
      };
    })
    .filter((row) => row.allocation > 0);

  if (!allocRows.length && declinedRows.length === 0) {
    return { error: "Nothing to record after allocation." };
  }

  let globalTemplate = {
    signature: null as string | null,
    subject: null as string | null,
    message: null as string | null,
    logoUrl: null as string | null,
  };

  if (paymentContributionIds.length === 0 && input.amount > 0.009) {
    return { error: "Payment amount must be zero when all selected contributions are declined." };
  }

  if (input.send_receipt_email && allocRows.length > 0) {
    const { data: dorm } = await supabase
      .from("dorms")
      .select("attributes")
      .eq("id", dormId)
      .single();

    globalTemplate = parseGlobalReceiptTemplate(
      asMetadataRecord(dorm?.attributes).global_receipt_template
    );

    if (!globalTemplate.signature) {
      return { error: "Set a global receipt signature in Settings -> Receipt before sending email." };
    }
  }

  const resolvedReceiptSignature = input.receipt_signature?.trim() || globalTemplate.signature;
  const resolvedReceiptSubject = input.receipt_subject?.trim() || globalTemplate.subject;
  const resolvedReceiptMessage = input.receipt_message?.trim() || globalTemplate.message;
  const resolvedReceiptLogoUrl = input.receipt_logo_url?.trim() || globalTemplate.logoUrl;

  const batchPaymentId = crypto.randomUUID();
  let writeClient: typeof supabase = supabase;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = await import("@supabase/supabase-js");
    writeClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    ) as typeof supabase;
  }

  const storeRowsToUpdate = allocRows.filter(
    (row) => row.storeItems.length > 0 && row.cartItems.length > 0
  );

  if (storeRowsToUpdate.length > 0) {
    const { data: chargeEntries, error: chargeLookupError } = await writeClient
      .from("ledger_entries")
      .select("id, metadata, amount_pesos")
      .eq("dorm_id", dormId)
      .eq("occupant_id", input.occupant_id)
      .eq("entry_type", "charge")
      .eq("ledger", "contributions")
      .is("voided_at", null);

    if (chargeLookupError) {
      return { error: chargeLookupError.message };
    }

    for (const row of storeRowsToUpdate) {
      const chargeEntry = (chargeEntries ?? []).find((entry) => {
        const metadata =
          typeof entry.metadata === "object" && entry.metadata !== null
            ? (entry.metadata as Record<string, unknown>)
            : {};
        return metadata.contribution_id === row.contributionId;
      });

      if (!chargeEntry) {
        continue;
      }

      const existingMetadata =
        typeof chargeEntry.metadata === "object" && chargeEntry.metadata !== null
          ? (chargeEntry.metadata as Record<string, unknown>)
          : {};
      const isAdditionalStorePurchase =
        allowOverpaymentContributionIds.has(row.contributionId) && row.cartItems.length > 0;
      const updatedCartItems = isAdditionalStorePurchase
        ? mergeContributionCartItems(existingMetadata.cart_items, row.cartItems, row.storeItems)
        : row.cartItems;
      const updatedMetadata = {
        ...existingMetadata,
        is_store: true,
        store_items: row.storeItems,
        cart_items: updatedCartItems,
      };

      const addedStoreSubtotal = sumCartSubtotal(row.cartItems, row.storeItems);
      const chargeAmount = isAdditionalStorePurchase
        ? Number((Math.max(0, Number(chargeEntry.amount_pesos ?? 0)) + addedStoreSubtotal).toFixed(2))
        : addedStoreSubtotal || Math.abs(row.allocation);
      const { error: updateError } = await writeClient
        .from("ledger_entries")
        .update({
          amount_pesos: chargeAmount,
          metadata: updatedMetadata,
        })
        .eq("id", chargeEntry.id);

      if (updateError) {
        return { error: updateError.message };
      }
    }
  }

  if (declinedRows.length > 0) {
    const { error: declineInsertError } = await writeClient.from("ledger_entries").insert(
      declinedRows.map((row) => ({
        dorm_id: dormId,
        semester_id: row.semesterId ?? semesterResult.semesterId,
        ledger: "contributions",
        entry_type: "adjustment",
        occupant_id: input.occupant_id,
        event_id: row.eventId,
        amount_pesos: -Math.abs(row.outstanding),
        method: "optional_decline",
        note: row.storeItems.length > 0 ? `Optional item not availed • ${row.title}` : `Optional contribution declined • ${row.title}`,
        metadata: {
          contribution_id: row.contributionId,
          contribution_title: row.title,
          contribution_details: row.details,
          contribution_event_title: row.eventTitle,
          payable_deadline: row.deadline,
          contribution_receipt_signature: row.receiptSignature,
          contribution_receipt_subject: row.receiptSubject,
          contribution_receipt_message: row.receiptMessage,
          contribution_receipt_logo_url: row.receiptLogoUrl,
          is_store: row.storeItems.length > 0,
          is_optional: true,
          optional_declined: true,
          optional_declined_at: new Date().toISOString(),
          optional_declined_by: user.id,
          optional_declined_amount_pesos: row.outstanding,
          store_items: row.storeItems,
        },
        created_by: user.id,
      }))
    );

    if (declineInsertError) {
      return { error: declineInsertError.message };
    }
  }

  if (allocRows.length > 0) {
    const { error: insertError } = await writeClient.from("ledger_entries").insert(
      allocRows.map((row) => ({
      dorm_id: dormId,
      semester_id: row.semesterId ?? semesterResult.semesterId,
      ledger: "contributions",
      entry_type: "payment",
      occupant_id: input.occupant_id,
      event_id: row.eventId,
      amount_pesos: -Math.abs(row.allocation),
      method: input.method,
      note: `Batch payment • ${row.title}`,
      posted_at: input.paid_at_iso,
      metadata: {
        contribution_id: row.contributionId,
        contribution_title: row.title,
        contribution_details: row.details,
        contribution_event_title: row.eventTitle,
        payable_deadline: row.deadline,
        contribution_receipt_signature: row.receiptSignature,
        contribution_receipt_subject: row.receiptSubject,
        contribution_receipt_message: row.receiptMessage,
        contribution_receipt_logo_url: row.receiptLogoUrl,
        is_store: row.storeItems.length > 0,
        store_items: row.storeItems,
        cart_items: row.cartItems,
        payment_batch_id: batchPaymentId,
        payment_allocation_pesos: row.allocation,
      },
      created_by: user.id,
    }))
    );

    if (insertError) {
      return { error: insertError.message };
    }
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "finance.contribution_batch_payment_recorded",
      entityType: "finance",
      entityId: batchPaymentId,
      metadata: {
        occupant_id: input.occupant_id,
        contribution_ids: input.contribution_ids,
        declined_contribution_ids: declinedContributionIds,
        total_paid: input.amount,
        method: input.method,
        paid_at_iso: input.paid_at_iso,
        allocation_target_id: input.allocation_target_id ?? null,
        allow_overpayment_contribution_ids: Array.from(allowOverpaymentContributionIds),
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for contribution batch payment:", auditError);
  }

  if (input.send_receipt_email && allocRows.length > 0) {
    try {
      const { sendEmail, renderContributionBatchReceiptEmail } = await import("@/lib/email");

      const { data: occupant } = await supabase
        .from("occupants")
        .select("id, user_id, full_name, contact_email")
        .eq("dorm_id", dormId)
        .eq("id", input.occupant_id)
        .maybeSingle();

      if (!occupant) {
        throw new Error("Occupant not found for receipt.");
      }

      let recipientEmail = input.receipt_email_override?.trim() || occupant.contact_email?.trim() || "";

      if (!recipientEmail && occupant.user_id && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const { createClient } = await import("@supabase/supabase-js");
        const adminClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          {
            auth: {
              autoRefreshToken: false,
              persistSession: false,
            },
          }
        );
        const { data: authUser } = await adminClient.auth.admin.getUserById(occupant.user_id);
        recipientEmail = authUser.user?.email?.trim() || "";
      }

      if (recipientEmail) {
        const rendered = renderContributionBatchReceiptEmail({
          treasurerNameOverride: user.user_metadata?.full_name || user.email || null,
          recipientName: occupant.full_name ?? null,
          paidAtIso: input.paid_at_iso,
          method: input.method,
          contributions: allocRows.map((row) => {
            const orderItems = buildOrderItemsFromCart(row.cartItems, row.storeItems);
            return {
              title: row.title,
              amountPesos: row.allocation,
              orderItems,
              storeSpecs: !orderItems ? buildStoreSpecsFromStoreItems(row.storeItems) : undefined,
            };
          }),
          totalAmountPesos: allocRows.reduce((sum, row) => sum + row.allocation, 0),
          customMessage: resolvedReceiptMessage,
          subjectOverride: resolvedReceiptSubject,
          signatureOverride: resolvedReceiptSignature,
          logoUrl: resolvedReceiptLogoUrl,
        });

        const emailResult = await sendEmail({
          to: recipientEmail,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        });

        if (!emailResult.success) {
          console.warn("Failed to send contribution batch receipt email:", emailResult.error);
        }
      }
    } catch (emailError) {
      console.error("Contribution batch receipt email error:", emailError);
    }
  }

  if (input.send_receipt_email && declinedRows.length > 0) {
    try {
      await sendOptionalContributionDeclineEmail({
        supabase,
        dormId,
        occupantId: input.occupant_id,
        actorName: (user.user_metadata?.full_name as string | undefined)?.trim() || user.email || null,
        contributions: declinedRows.map((row) => ({
          contributionId: row.contributionId,
          title: row.title,
          eventTitle: row.eventTitle,
          isStore: row.storeItems.length > 0,
          amount: row.outstanding,
        })),
        emailOverride: input.receipt_email_override,
      });
    } catch (emailError) {
      console.error("Optional contribution decline email error:", emailError);
    }
  }

  const activeRole = (await getActiveRole()) || "occupant";
  revalidatePath(`/${activeRole}/contributions`);
  for (const row of allocRows) {
    revalidatePath(`/${activeRole}/contributions/${row.contributionId}`);
  }
  revalidatePath(`/${activeRole}/occupants`);
  revalidatePath(`/${activeRole}/payments`);

  return {
    success: true,
    paidCount: allocRows.length,
    declinedCount: declinedRows.length,
    totalPaid: allocRows.reduce((sum, row) => sum + row.allocation, 0),
  };
}

export async function recordOptionalContributionDecline(
  dormId: string,
  payload: z.infer<typeof optionalContributionDeclineSchema>
) {
  const parsed = optionalContributionDeclineSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid optional contribution decline request." };
  }

  const input = parsed.data;
  const result = await recordContributionBatchPayment(dormId, {
    occupant_id: input.occupant_id,
    contribution_ids: [],
    declined_contribution_ids: input.contribution_ids,
    allow_overpayment_contribution_ids: [],
    amount: 0,
    method: "cash",
    paid_at_iso: new Date().toISOString(),
    allocation_target_id: null,
    send_receipt_email: input.send_email,
    receipt_email_override: input.email_override ?? null,
    receipt_subject: null,
    receipt_message: null,
    receipt_signature: null,
    receipt_logo_url: null,
    cart_items: [],
  });

  if (result && "error" in result) {
    return result;
  }

  return {
    success: true,
    declinedCount: "declinedCount" in result ? result.declinedCount : input.contribution_ids.length,
  };
}

export async function resendContributionReceipt(
  dormId: string,
  payload: z.infer<typeof resendContributionReceiptSchema>
) {
  const parsed = resendContributionReceiptSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid resend request." };
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Unauthorized" };
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  if (membershipError || !memberships?.length) {
    return { error: "Forbidden" };
  }

  if (!memberships.some((membership) => new Set(["admin", "treasurer"]).has(membership.role))) {
    return { error: "Only admins and treasurers can resend contribution receipts." };
  }

  const selectedContributionIds = Array.from(new Set(input.contribution_ids));
  const selectedContributionIdSet = new Set(selectedContributionIds);

  const { data: paymentEntries, error: paymentLookupError } = await supabase
    .from("ledger_entries")
    .select("id, event_id, amount_pesos, method, posted_at, metadata")
    .eq("dorm_id", dormId)
    .eq("ledger", "contributions")
    .eq("entry_type", "payment")
    .eq("occupant_id", input.occupant_id)
    .is("voided_at", null)
    .order("posted_at", { ascending: false });

  if (paymentLookupError) {
    return { error: paymentLookupError.message };
  }

  const latestEntryByContribution = new Map<
    string,
    {
      id: string;
      event_id: string | null;
      amount_pesos: number | string | null;
      method: string | null;
      posted_at: string;
      metadata: unknown;
    }
  >();

  for (const entry of paymentEntries ?? []) {
    const contributionMetadata = parseContributionMetadata(entry.metadata, {
      eventId: entry.event_id,
      note: null,
    });

    if (!selectedContributionIdSet.has(contributionMetadata.contribution_id)) {
      continue;
    }

    const amountPesos = Math.abs(Number(entry.amount_pesos ?? 0));
    if (!(amountPesos > 0)) {
      continue;
    }

    if (!latestEntryByContribution.has(contributionMetadata.contribution_id)) {
      latestEntryByContribution.set(contributionMetadata.contribution_id, entry);
    }
  }

  const matchedEntries = selectedContributionIds
    .map((contributionId) => {
      const entry = latestEntryByContribution.get(contributionId);
      if (!entry) {
        return null;
      }
      const contributionMetadata = parseContributionMetadata(entry.metadata, {
        eventId: entry.event_id,
        note: null,
      });
      return {
        entry,
        contributionMetadata,
        amountPesos: Math.abs(Number(entry.amount_pesos ?? 0)),
      };
    })
    .filter(
      (
        item
      ): item is {
        entry: {
          id: string;
          event_id: string | null;
          amount_pesos: number | string | null;
          method: string | null;
          posted_at: string;
          metadata: unknown;
        };
        contributionMetadata: ContributionMetadata;
        amountPesos: number;
      } => Boolean(item)
    );

  if (matchedEntries.length === 0) {
    return { error: "No recorded payment found for the selected contributions." };
  }

  const { data: occupant, error: occupantError } = await supabase
    .from("occupants")
    .select("id, user_id, full_name, contact_email")
    .eq("dorm_id", dormId)
    .eq("id", input.occupant_id)
    .maybeSingle();

  if (occupantError) {
    return { error: occupantError.message };
  }

  if (!occupant) {
    return { error: "Occupant not found for receipt resend." };
  }

  let recipientEmail = input.receipt_email_override?.trim() || occupant.contact_email?.trim() || "";
  if (!recipientEmail && occupant.user_id && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = await import("@supabase/supabase-js");
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { data: authUserResult } = await adminClient.auth.admin.getUserById(occupant.user_id);
    recipientEmail = authUserResult.user?.email?.trim() || "";
  }

  if (!recipientEmail) {
    return { error: "No recipient email found for this occupant." };
  }

  const { data: dormRow } = await supabase
    .from("dorms")
    .select("attributes")
    .eq("id", dormId)
    .single();

  const dormAttributes =
    typeof dormRow?.attributes === "object" && dormRow.attributes !== null
      ? (dormRow.attributes as Record<string, unknown>)
      : {};
  const globalTemplateRaw =
    typeof dormAttributes.global_receipt_template === "object" &&
    dormAttributes.global_receipt_template !== null
      ? (dormAttributes.global_receipt_template as Record<string, unknown>)
      : {};

  const globalSubject =
    typeof globalTemplateRaw.subject === "string" && globalTemplateRaw.subject.trim().length > 0
      ? globalTemplateRaw.subject.trim()
      : null;
  const globalMessage =
    typeof globalTemplateRaw.message === "string" && globalTemplateRaw.message.trim().length > 0
      ? globalTemplateRaw.message.trim()
      : null;
  const globalSignature =
    typeof globalTemplateRaw.signature === "string" && globalTemplateRaw.signature.trim().length > 0
      ? globalTemplateRaw.signature.trim()
      : null;
  const logoCandidate = globalTemplateRaw.logo_url ?? globalTemplateRaw.logoUrl;
  const globalLogoUrl =
    typeof logoCandidate === "string" && logoCandidate.trim().length > 0
      ? logoCandidate.trim()
      : null;

  const resolvedSubject =
    matchedEntries
      .map((item) => item.contributionMetadata.contribution_receipt_subject)
      .find((value): value is string => Boolean(value)) || globalSubject;
  const resolvedMessage =
    matchedEntries
      .map((item) => item.contributionMetadata.contribution_receipt_message)
      .find((value): value is string => Boolean(value)) || globalMessage;
  const resolvedSignature =
    matchedEntries
      .map((item) => item.contributionMetadata.contribution_receipt_signature)
      .find((value): value is string => Boolean(value)) || globalSignature;
  const resolvedLogoUrl =
    matchedEntries
      .map((item) => item.contributionMetadata.contribution_receipt_logo_url)
      .find((value): value is string => Boolean(value)) || globalLogoUrl;

  const paidAtIso =
    matchedEntries
      .map((item) => item.entry.posted_at)
      .sort((a, b) => (a > b ? -1 : 1))[0] || new Date().toISOString();
  const methodValues = Array.from(
    new Set(
      matchedEntries
        .map((item) => item.entry.method?.trim() || "")
        .filter((value) => value.length > 0)
    )
  );
  const resolvedMethod = methodValues.length === 1 ? methodValues[0] : null;
  const totalAmountPesos = Number(
    matchedEntries.reduce((sum, item) => sum + item.amountPesos, 0).toFixed(2)
  );

  const { sendEmail, renderContributionBatchReceiptEmail } = await import("@/lib/email");
  const rendered = renderContributionBatchReceiptEmail({
    treasurerNameOverride: user.user_metadata?.full_name || user.email || null,
    recipientName: occupant.full_name ?? null,
    paidAtIso,
    method: resolvedMethod,
    contributions: matchedEntries.map((item) => {
      const orderItems = buildOrderItemsFromCart(
        item.contributionMetadata.cart_items,
        item.contributionMetadata.store_items
      );
      return {
        title: item.contributionMetadata.contribution_title,
        amountPesos: item.amountPesos,
        orderItems,
        storeSpecs: !orderItems
          ? buildStoreSpecsFromStoreItems(item.contributionMetadata.store_items)
          : undefined,
      };
    }),
    totalAmountPesos,
    customMessage: resolvedMessage,
    subjectOverride: resolvedSubject,
    signatureOverride: resolvedSignature,
    logoUrl: resolvedLogoUrl,
  });

  const emailResult = await sendEmail({
    to: recipientEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  if (!emailResult.success) {
    return { error: emailResult.error || "Failed to send receipt email." };
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "finance.contribution_receipt_resent",
      entityType: "ledger_entry",
      entityId: matchedEntries[0]?.entry.id ?? null,
      metadata: {
        occupant_id: input.occupant_id,
        contribution_ids: selectedContributionIds,
        payment_entry_ids: matchedEntries.map((item) => item.entry.id),
        recipient_email: recipientEmail,
        amount_pesos: totalAmountPesos,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for contribution receipt resend:", auditError);
  }

  return {
    success: true,
    recipient_email: recipientEmail,
  };
}

export async function sendContributionPayableReminders(
  dormId: string,
  payload?: z.infer<typeof contributionReminderSchema>
) {
  const parsed = contributionReminderSchema.safeParse(payload ?? {});
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid reminder request." };
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Unauthorized" };
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  if (membershipError || !memberships?.length) {
    return { error: "Forbidden" };
  }

  if (!memberships.some((membership) => new Set(["admin", "treasurer"]).has(membership.role))) {
    return { error: "Only admins and treasurers can send contribution reminders." };
  }

  const {
    sendEmail,
    renderContributionPayableReminderEmail,
    renderContributionReminderDispatchReportEmail,
  } = await import("@/lib/email");
  const actorEmail = user.email?.trim() || "";
  const actorName =
    typeof user.user_metadata?.full_name === "string" &&
    user.user_metadata.full_name.trim().length > 0
      ? user.user_metadata.full_name.trim()
      : user.email || null;

  const sendDispatchReport = async (input: {
    targetCount: number;
    sentCount: number;
    skippedCount: number;
    failedCount: number;
    details: Array<{
      occupantName: string;
      recipientEmail: string | null;
      status: "sent" | "skipped" | "failed";
      reason?: string | null;
    }>;
  }) => {
    if (!actorEmail) {
      return;
    }

    try {
      const rendered = renderContributionReminderDispatchReportEmail({
        actorName,
        targetCount: input.targetCount,
        sentCount: input.sentCount,
        skippedCount: input.skippedCount,
        failedCount: input.failedCount,
        details: input.details,
        generatedAtIso: new Date().toISOString(),
      });

      const reportResult = await sendEmail({
        to: actorEmail,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      if (!reportResult.success) {
        console.warn("Failed to send contribution reminder report email:", reportResult.error);
      }
    } catch (reportError) {
      console.error("Contribution reminder report email error:", reportError);
    }
  };

  let entriesQuery = supabase
    .from("ledger_entries")
    .select("occupant_id, event_id, entry_type, amount_pesos, metadata, semester_id")
    .eq("dorm_id", dormId)
    .eq("ledger", "contributions")
    .is("voided_at", null);

  if (input.semester_ids && input.semester_ids.length > 0) {
    entriesQuery = entriesQuery.in("semester_id", input.semester_ids);
  }

  const { data: rawEntries, error: entriesError } = await entriesQuery;
  if (entriesError) {
    return { error: entriesError.message };
  }

  const outstandingByOccupant = new Map<
    string,
    Map<
      string,
      {
        title: string;
        deadline: string | null;
        outstanding: number;
      }
    >
  >();

  for (const row of rawEntries ?? []) {
    if (!row.occupant_id) {
      continue;
    }

    const metadata = asMetadataRecord(row.metadata);
    if (metadata.finance_manual_inflow === true) {
      continue;
    }

    const contributionMetadata = parseContributionMetadata(row.metadata, {
      eventId: row.event_id,
      note: null,
    });
    const contributionId = contributionMetadata.contribution_id;

    const occupantMap = outstandingByOccupant.get(row.occupant_id) ?? new Map();
    const existing =
      occupantMap.get(contributionId) ?? {
        title: contributionMetadata.contribution_title,
        deadline: contributionMetadata.payable_deadline,
        outstanding: 0,
      };

    existing.outstanding += getContributionChargeAmount(row.entry_type, row.amount_pesos);
    existing.outstanding -= getContributionCollectedAmount(row.entry_type, row.amount_pesos);

    if (!existing.title && contributionMetadata.contribution_title) {
      existing.title = contributionMetadata.contribution_title;
    }
    if (!existing.deadline && contributionMetadata.payable_deadline) {
      existing.deadline = contributionMetadata.payable_deadline;
    }

    occupantMap.set(contributionId, existing);
    outstandingByOccupant.set(row.occupant_id, occupantMap);
  }

  const reminderPayloadByOccupant = new Map<
    string,
    {
      contributions: Array<{
        title: string;
        amountPesos: number;
        deadlineIso: string | null;
      }>;
      totalAmountPesos: number;
    }
  >();

  for (const [occupantId, contributionMap] of outstandingByOccupant.entries()) {
    const contributions = Array.from(contributionMap.values())
      .filter((item) => item.outstanding > 0.009)
      .map((item) => ({
        title: item.title,
        amountPesos: Number(item.outstanding.toFixed(2)),
        deadlineIso: item.deadline,
      }))
      .sort((a, b) => (a.title < b.title ? -1 : 1));

    if (!contributions.length) {
      continue;
    }

    const totalAmountPesos = Number(
      contributions.reduce((sum, item) => sum + item.amountPesos, 0).toFixed(2)
    );
    reminderPayloadByOccupant.set(occupantId, { contributions, totalAmountPesos });
  }

  if (reminderPayloadByOccupant.size === 0) {
    await sendDispatchReport({
      targetCount: 0,
      sentCount: 0,
      skippedCount: 0,
      failedCount: 0,
      details: [
        {
          occupantName: "All occupants",
          recipientEmail: null,
          status: "skipped",
          reason: "No remaining payable contributions for the selected semesters.",
        },
      ],
    });

    return {
      success: true,
      sent_count: 0,
      skipped_count: 0,
      failed_count: 0,
      target_count: 0,
    };
  }

  const occupantIds = Array.from(reminderPayloadByOccupant.keys());
  const { data: occupantRows, error: occupantsError } = await supabase
    .from("occupants")
    .select("id, user_id, full_name, contact_email")
    .eq("dorm_id", dormId)
    .in("id", occupantIds);

  if (occupantsError) {
    return { error: occupantsError.message };
  }

  const occupantById = new Map(
    (occupantRows ?? []).map((occupant) => [occupant.id, occupant] as const)
  );

  let adminClient: SupabaseClient | null = null;

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = await import("@supabase/supabase-js");
    adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }

  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const deliveryDetails: Array<{
    occupantName: string;
    recipientEmail: string | null;
    status: "sent" | "skipped" | "failed";
    reason?: string | null;
  }> = [];

  for (const occupantId of occupantIds) {
    const occupant = occupantById.get(occupantId);
    const reminderPayload = reminderPayloadByOccupant.get(occupantId);
    const occupantName = occupant?.full_name?.trim() || occupantId;
    if (!occupant || !reminderPayload) {
      skippedCount += 1;
      deliveryDetails.push({
        occupantName,
        recipientEmail: null,
        status: "skipped",
        reason: "Occupant record not found.",
      });
      continue;
    }

    let recipientEmail = occupant.contact_email?.trim() || "";
    if (!recipientEmail && occupant.user_id && adminClient) {
      const authUser = await adminClient.auth.admin.getUserById(occupant.user_id);
      recipientEmail = authUser.data.user?.email?.trim() || "";
    }

    if (!recipientEmail) {
      skippedCount += 1;
      deliveryDetails.push({
        occupantName,
        recipientEmail: null,
        status: "skipped",
        reason: "No recipient email found.",
      });
      continue;
    }

    const rendered = renderContributionPayableReminderEmail({
      recipientName: occupant.full_name ?? null,
      contributions: reminderPayload.contributions,
      totalAmountPesos: reminderPayload.totalAmountPesos,
      treasurerNameOverride: user.user_metadata?.full_name || user.email || null,
    });

    const emailResult = await sendEmail({
      to: recipientEmail,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    if (emailResult.success) {
      sentCount += 1;
      deliveryDetails.push({
        occupantName,
        recipientEmail,
        status: "sent",
        reason: null,
      });
    } else {
      failedCount += 1;
      const reason =
        typeof emailResult.error === "string"
          ? emailResult.error
          : emailResult.error instanceof Error
            ? emailResult.error.message
            : "Unknown delivery error.";
      deliveryDetails.push({
        occupantName,
        recipientEmail,
        status: "failed",
        reason,
      });
      console.warn("Failed to send contribution reminder email:", emailResult.error);
    }
  }

  await sendDispatchReport({
    targetCount: occupantIds.length,
    sentCount,
    skippedCount,
    failedCount,
    details: deliveryDetails,
  });

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "finance.contribution_reminders_sent",
      entityType: "finance",
      metadata: {
        semester_ids: input.semester_ids ?? [],
        target_count: occupantIds.length,
        sent_count: sentCount,
        skipped_count: skippedCount,
        failed_count: failedCount,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for contribution reminders:", auditError);
  }

  return {
    success: true,
    sent_count: sentCount,
    skipped_count: skippedCount,
    failed_count: failedCount,
    target_count: occupantIds.length,
  };
}

export async function previewContributionBatchPaymentEmail(
  dormId: string,
  payload: z.infer<typeof contributionBatchPaymentSchema>
) {
  const parsed = contributionBatchPaymentSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid batch payment request." };
  }

  const input = parsed.data;
  if (!input.send_receipt_email) {
    return { error: "Receipt email is disabled for this payment." };
  }
  if (input.contribution_ids.length === 0) {
    return { error: "No payable contributions selected for receipt preview." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Unauthorized" };
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  if (membershipError || !memberships?.length) {
    return { error: "Forbidden" };
  }

  if (!memberships.some(m => new Set(["admin", "treasurer"]).has(m.role))) {
    return { error: "Only admins and treasurers can preview contribution payment emails." };
  }

  const { data: rawEntries, error: rawEntriesError } = await supabase
    .from("ledger_entries")
    .select("id, semester_id, event_id, entry_type, amount_pesos, metadata")
    .eq("dorm_id", dormId)
    .eq("ledger", "contributions")
    .eq("occupant_id", input.occupant_id)
    .is("voided_at", null);

  if (rawEntriesError) {
    return { error: rawEntriesError.message };
  }

  const selectedIds = new Set(input.contribution_ids);
  const contributionMap = new Map<string, ContributionGroupEntry>();

  for (const row of rawEntries ?? []) {
    const metadata = parseContributionMetadata(row.metadata, {
      eventId: row.event_id,
      note: null,
    });

    if (!selectedIds.has(metadata.contribution_id)) {
      continue;
    }

    const existing = contributionMap.get(metadata.contribution_id) ?? {
      contributionId: metadata.contribution_id,
      title: metadata.contribution_title,
      details: metadata.contribution_details,
      eventTitle: metadata.contribution_event_title,
      isOptional: metadata.is_optional,
      declined: metadata.optional_declined,
      receiptSignature: metadata.contribution_receipt_signature,
      receiptSubject: metadata.contribution_receipt_subject,
      receiptMessage: metadata.contribution_receipt_message,
      receiptLogoUrl: metadata.contribution_receipt_logo_url,
      semesterId: row.semester_id ?? null,
      eventId: row.event_id ?? null,
      deadline: metadata.payable_deadline,
      storeItems: metadata.store_items,
      cartItems: metadata.cart_items,
      payable: 0,
      paid: 0,
      outstanding: 0,
    };

    existing.paid += getContributionCollectedAmount(row.entry_type, row.amount_pesos);
    existing.payable += getContributionChargeAmount(row.entry_type, row.amount_pesos);
    existing.outstanding = Number((existing.payable - existing.paid).toFixed(2));

    if (!existing.semesterId && row.semester_id) {
      existing.semesterId = row.semester_id;
    }
    if (!existing.eventId && row.event_id) {
      existing.eventId = row.event_id;
    }
    if (!existing.deadline && metadata.payable_deadline) {
      existing.deadline = metadata.payable_deadline;
    }
    if (!existing.eventTitle && metadata.contribution_event_title) {
      existing.eventTitle = metadata.contribution_event_title;
    }
    if (!existing.details && metadata.contribution_details) {
      existing.details = metadata.contribution_details;
    }
    if (!existing.isOptional && metadata.is_optional) {
      existing.isOptional = true;
    }
    if (!existing.declined && metadata.optional_declined) {
      existing.declined = true;
    }
    if (!existing.receiptSignature && metadata.contribution_receipt_signature) {
      existing.receiptSignature = metadata.contribution_receipt_signature;
    }
    if (!existing.receiptSubject && metadata.contribution_receipt_subject) {
      existing.receiptSubject = metadata.contribution_receipt_subject;
    }
    if (!existing.receiptMessage && metadata.contribution_receipt_message) {
      existing.receiptMessage = metadata.contribution_receipt_message;
    }
    if (!existing.receiptLogoUrl && metadata.contribution_receipt_logo_url) {
      existing.receiptLogoUrl = metadata.contribution_receipt_logo_url;
    }

    contributionMap.set(metadata.contribution_id, existing);
  }

  const contributionRows = Array.from(contributionMap.values());
  if (!contributionRows.length) {
    return { error: "No selected contributions found for this occupant." };
  }

  const storeItemsByContribution = new Map(
    contributionRows.map((row) => [row.contributionId, row.storeItems] as const)
  );
  const inputCartItemsByContribution = mapInputCartItemsByContribution(
    input.cart_items,
    storeItemsByContribution
  );
  const dueByContribution = new Map<string, number>();
  for (const row of contributionRows) {
    const suppliedCartItems = inputCartItemsByContribution.get(row.contributionId);
    const effectiveCartItems =
      suppliedCartItems && suppliedCartItems.length > 0 ? suppliedCartItems : row.cartItems;
    const storeSubtotal =
      row.storeItems.length > 0 ? sumCartSubtotal(effectiveCartItems, row.storeItems) : 0;
    dueByContribution.set(
      row.contributionId,
      storeSubtotal > 0 ? storeSubtotal : Math.max(0, row.outstanding)
    );
  }

  const totalDue = Array.from(dueByContribution.values()).reduce((sum, value) => sum + value, 0);

  const allocations = new Map(dueByContribution);
  const difference = Number((input.amount - totalDue).toFixed(2));
  if (Math.abs(difference) >= 0.01) {
    if (!input.allocation_target_id) {
      return { error: "Select where to apply the payment difference when amount is not exact." };
    }
    const existingTarget = allocations.get(input.allocation_target_id);
    if (existingTarget === undefined) {
      return { error: "Allocation target must be one of the selected contributions." };
    }
    const adjusted = Number((existingTarget + difference).toFixed(2));
    if (adjusted < 0) {
      return { error: "Difference is too large for the selected allocation target." };
    }
    allocations.set(input.allocation_target_id, adjusted);
  }

  const allocRows = contributionRows
    .map((row) => {
      const suppliedCartItems = inputCartItemsByContribution.get(row.contributionId);
      const effectiveCartItems =
        suppliedCartItems && suppliedCartItems.length > 0 ? suppliedCartItems : row.cartItems;
      const normalizedCartItems = normalizeCartItemsForContribution(
        effectiveCartItems,
        row.storeItems
      );
      return {
        ...row,
        cartItems: normalizedCartItems,
        allocation: Number((allocations.get(row.contributionId) ?? 0).toFixed(2)),
      };
    })
    .filter((row) => row.allocation > 0);

  if (!allocRows.length) {
    return { error: "Nothing to preview after allocation." };
  }

  let globalTemplate = {
    signature: null as string | null,
    subject: null as string | null,
    message: null as string | null,
    logoUrl: null as string | null,
  };

  const { data: dorm } = await supabase
    .from("dorms")
    .select("attributes")
    .eq("id", dormId)
    .single();

  globalTemplate = parseGlobalReceiptTemplate(
    asMetadataRecord(dorm?.attributes).global_receipt_template
  );

  if (!globalTemplate.signature) {
    return { error: "Set a global receipt signature in Settings -> Receipt before sending email." };
  }

  const resolvedReceiptSubject = input.receipt_subject?.trim() || globalTemplate.subject;
  const resolvedReceiptMessage = input.receipt_message?.trim() || globalTemplate.message;
  const resolvedReceiptLogoUrl = input.receipt_logo_url?.trim() || globalTemplate.logoUrl;
  const resolvedReceiptSignature = input.receipt_signature?.trim() || globalTemplate.signature;

  const { data: occupant } = await supabase
    .from("occupants")
    .select("id, user_id, full_name, contact_email")
    .eq("dorm_id", dormId)
    .eq("id", input.occupant_id)
    .maybeSingle();

  if (!occupant) {
    return { error: "Occupant not found for receipt." };
  }

  let recipientEmail = input.receipt_email_override?.trim() || occupant.contact_email?.trim() || "";

  if (!recipientEmail && occupant.user_id && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = await import("@supabase/supabase-js");
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
    const { data: authUser } = await adminClient.auth.admin.getUserById(occupant.user_id);
    recipientEmail = authUser.user?.email?.trim() || "";
  }

  if (!recipientEmail) {
    return { error: "No recipient email found for this occupant." };
  }

  const { renderContributionBatchReceiptEmail } = await import("@/lib/email");
  const rendered = renderContributionBatchReceiptEmail({
    treasurerNameOverride: user.user_metadata?.full_name || user.email || null,
    recipientName: occupant.full_name ?? null,
    paidAtIso: input.paid_at_iso,
    method: input.method,
    contributions: allocRows.map((row) => {
      const orderItems = buildOrderItemsFromCart(row.cartItems, row.storeItems);
      return {
        title: row.title,
        amountPesos: row.allocation,
        orderItems,
        storeSpecs: !orderItems ? buildStoreSpecsFromStoreItems(row.storeItems) : undefined,
      };
    }),
    totalAmountPesos: allocRows.reduce((sum, row) => sum + row.allocation, 0),
    customMessage: resolvedReceiptMessage,
    subjectOverride: resolvedReceiptSubject,
    signatureOverride: resolvedReceiptSignature,
    logoUrl: resolvedReceiptLogoUrl,
  });

  return {
    success: true,
    recipient_email: recipientEmail,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
  };
}

export async function uploadContributionReceiptAsset(dormId: string, formData: FormData) {
  const parsed = contributionReceiptAssetUploadSchema.safeParse({
    contribution_id: formData.get("contribution_id"),
    asset_type: formData.get("asset_type"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid receipt asset upload payload." };
  }

  const fileInput = formData.get("file");
  if (!(fileInput instanceof File) || fileInput.size <= 0) {
    return { error: "Select an image file to upload." };
  }

  if (!fileInput.type.startsWith("image/")) {
    return { error: "Only image files are allowed." };
  }

  if (fileInput.size > 8 * 1024 * 1024) {
    return { error: "Image is too large. Upload an image up to 8 MB." };
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Unauthorized" };
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  if (membershipError || !memberships?.length) {
    return { error: "Forbidden" };
  }

  if (!memberships.some(m => new Set(["admin", "treasurer"]).has(m.role))) {
    return { error: "Only admins and treasurers can upload contribution receipt assets." };
  }

  const { data: rows, error: rowsError } = await supabase
    .from("ledger_entries")
    .select("id, event_id, metadata")
    .eq("dorm_id", dormId)
    .eq("ledger", "contributions")
    .is("voided_at", null);

  if (rowsError) {
    return { error: rowsError.message };
  }

  const hasContribution = (rows ?? []).some((row) => {
    const metadata = parseContributionMetadata(row.metadata, {
      eventId: row.event_id,
      note: null,
    });
    return metadata.contribution_id === input.contribution_id;
  });

  if (!hasContribution) {
    return { error: "Contribution not found." };
  }

  const optimized = await optimizeImage(fileInput);
  const storagePath = `expenses/${dormId}/contribution-receipts/${input.contribution_id}/${input.asset_type}-${Date.now()}-${crypto.randomUUID()}.${optimized.extension}`;

  let uploadClient: typeof supabase = supabase;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = await import("@supabase/supabase-js");
    uploadClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    ) as typeof supabase;
  }

  const { error: uploadError } = await uploadClient.storage
    .from("dormy-uploads")
    .upload(storagePath, optimized.buffer, {
      contentType: optimized.contentType,
      upsert: false,
    });

  if (uploadError) {
    return { error: `Upload failed: ${uploadError.message}` };
  }

  const { data: signedData, error: signedError } = await uploadClient.storage
    .from("dormy-uploads")
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365);

  if (signedError || !signedData?.signedUrl) {
    return { error: signedError?.message ?? "Failed to generate asset URL." };
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "finance.contribution_receipt_asset_uploaded",
      entityType: "finance",
      entityId: input.contribution_id,
      metadata: {
        asset_type: input.asset_type,
        storage_path: storagePath,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for contribution receipt asset upload:", auditError);
  }

  return {
    success: true,
    asset_url: signedData.signedUrl,
    storage_path: storagePath,
  };
}

export async function updateContributionReceiptTemplate(
  dormId: string,
  payload: z.infer<typeof contributionReceiptTemplateSchema>
) {
  const parsed = contributionReceiptTemplateSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid receipt template payload." };
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Unauthorized" };
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  if (membershipError || !memberships?.length) {
    return { error: "Forbidden" };
  }

  if (!memberships.some(m => new Set(["admin", "treasurer"]).has(m.role))) {
    return { error: "Only admins and treasurers can update contribution receipt templates." };
  }

  const { data: rows, error: rowsError } = await supabase
    .from("ledger_entries")
    .select("id, event_id, metadata")
    .eq("dorm_id", dormId)
    .eq("ledger", "contributions")
    .is("voided_at", null);

  if (rowsError) {
    return { error: rowsError.message };
  }

  const matchingRows = (rows ?? []).filter((row) => {
    const metadata = parseContributionMetadata(row.metadata, {
      eventId: row.event_id,
      note: null,
    });
    return metadata.contribution_id === input.contribution_id;
  });

  if (!matchingRows.length) {
    return { error: "Contribution not found." };
  }

  const normalizedSubject = input.subject?.trim() || null;
  const normalizedMessage = input.message?.trim() || null;
  const normalizedLogoUrl = input.logo_url?.trim() || null;

  let updateClient: typeof supabase = supabase;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = await import("@supabase/supabase-js");
    updateClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    ) as typeof supabase;
  }

  for (const row of matchingRows) {
    const currentMetadata = asMetadataRecord(row.metadata);
    const nextMetadata = {
      ...currentMetadata,
      contribution_receipt_subject: normalizedSubject,
      contribution_receipt_message: normalizedMessage,
      contribution_receipt_logo_url: normalizedLogoUrl,
    };

    const { error: updateError } = await updateClient
      .from("ledger_entries")
      .update({ metadata: nextMetadata })
      .eq("id", row.id);

    if (updateError) {
      return { error: updateError.message };
    }
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "finance.contribution_receipt_template_updated",
      entityType: "finance",
      entityId: input.contribution_id,
      metadata: {
        subject_length: normalizedSubject?.length ?? 0,
        message_length: normalizedMessage?.length ?? 0,
        has_logo: Boolean(normalizedLogoUrl),
        updated_rows: matchingRows.length,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for receipt template update:", auditError);
  }

  const activeRole = (await getActiveRole()) || "occupant";
  revalidatePath(`/${activeRole}/contributions/${input.contribution_id}`);
  revalidatePath(`/${activeRole}/contributions/${input.contribution_id}/receipt`);
  revalidatePath(`/${activeRole}/contributions`);

  return {
    success: true,
    updatedCount: matchingRows.length,
  };
}

export async function previewContributionReceiptTemplateEmail(
  dormId: string,
  payload: z.infer<typeof contributionReceiptTemplatePreviewSchema>
) {
  const parsed = contributionReceiptTemplatePreviewSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid receipt preview payload." };
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Unauthorized" };
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  if (membershipError || !memberships?.length) {
    return { error: "Forbidden" };
  }

  if (!memberships.some(m => new Set(["admin", "treasurer"]).has(m.role))) {
    return { error: "Only admins and treasurers can preview contribution receipt templates." };
  }

  const { data: rows, error: rowsError } = await supabase
    .from("ledger_entries")
    .select("id, occupant_id, posted_at, event_id, metadata")
    .eq("dorm_id", dormId)
    .eq("ledger", "contributions")
    .is("voided_at", null);

  if (rowsError) {
    return { error: rowsError.message };
  }

  const contributionRows = (rows ?? []).filter((row) => {
    const metadata = parseContributionMetadata(row.metadata, {
      eventId: row.event_id,
      note: null,
    });
    return metadata.contribution_id === input.contribution_id;
  });

  if (!contributionRows.length) {
    return { error: "Contribution not found." };
  }

  const normalizedEntries = contributionRows.map((row) => ({
    row,
    contributionMetadata: parseContributionMetadata(row.metadata, {
      eventId: row.event_id,
      note: null,
    }),
  }));
  const normalizedMetadata = normalizedEntries.map((entry) => entry.contributionMetadata);

  const contributionTitle =
    normalizedMetadata.find((item) => item.contribution_title.trim().length > 0)?.contribution_title ??
    "Contribution";
  const savedSubject =
    normalizedMetadata.find((item) => Boolean(item.contribution_receipt_subject))?.contribution_receipt_subject ??
    null;
  const savedMessage =
    normalizedMetadata.find((item) => Boolean(item.contribution_receipt_message))?.contribution_receipt_message ??
    null;
  const savedLogoUrl =
    normalizedMetadata.find((item) => Boolean(item.contribution_receipt_logo_url))?.contribution_receipt_logo_url ??
    null;
  const savedSignature =
    normalizedMetadata.find((item) => Boolean(item.contribution_receipt_signature))?.contribution_receipt_signature ??
    null;

  const { data: occupant } = await supabase
    .from("occupants")
    .select("id, user_id, full_name, contact_email")
    .eq("dorm_id", dormId)
    .eq("id", input.occupant_id)
    .maybeSingle();

  if (!occupant) {
    return { error: "Occupant not found for preview." };
  }

  let recipientEmail = occupant.contact_email?.trim() || "";
  if (!recipientEmail && occupant.user_id && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = await import("@supabase/supabase-js");
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
    const { data: authUserResult } = await adminClient.auth.admin.getUserById(occupant.user_id);
    recipientEmail = authUserResult.user?.email?.trim() || "";
  }

  if (!recipientEmail) {
    return { error: "No recipient email found for this occupant." };
  }

  const resolvedPaidAtIso = input.paid_at_iso ?? new Date().toISOString();
  const resolvedSubject = input.subject?.trim() || savedSubject;
  const resolvedMessage = input.message?.trim() || savedMessage;
  const resolvedLogoUrl = input.logo_url?.trim() || savedLogoUrl;
  const resolvedSignature = input.signature?.trim() || savedSignature;

  const sortByLatest = <T extends { row: { posted_at: string | null } }>(entries: T[]) =>
    [...entries].sort((left, right) => {
      const leftTs = left.row.posted_at ?? "";
      const rightTs = right.row.posted_at ?? "";
      if (leftTs === rightTs) {
        return 0;
      }
      return leftTs > rightTs ? -1 : 1;
    });

  const entryWithCartForOccupant = sortByLatest(
    normalizedEntries.filter(
      (entry) =>
        entry.row.occupant_id === input.occupant_id &&
        entry.contributionMetadata.cart_items.length > 0
    )
  )[0];
  const latestEntryWithCart = sortByLatest(
    normalizedEntries.filter((entry) => entry.contributionMetadata.cart_items.length > 0)
  )[0];
  const occupantEntry = sortByLatest(
    normalizedEntries.filter((entry) => entry.row.occupant_id === input.occupant_id)
  )[0];
  const fallbackEntry = normalizedEntries[0];
  const previewSourceEntry =
    entryWithCartForOccupant ?? latestEntryWithCart ?? occupantEntry ?? fallbackEntry;
  const previewStoreItems =
    previewSourceEntry?.contributionMetadata.store_items ??
    normalizedMetadata.find((item) => item.store_items.length > 0)?.store_items ??
    [];
  const previewOrderItems = buildOrderItemsFromCart(
    previewSourceEntry?.contributionMetadata.cart_items,
    previewStoreItems
  );

  const { renderContributionBatchReceiptEmail } = await import("@/lib/email");
  const rendered = renderContributionBatchReceiptEmail({
    recipientName: occupant.full_name ?? null,
    paidAtIso: resolvedPaidAtIso,
    method: input.method ?? "cash",
    contributions: [
      {
        title: contributionTitle,
        amountPesos: input.amount,
        orderItems: previewOrderItems,
        storeSpecs: !previewOrderItems
          ? buildStoreSpecsFromStoreItems(previewStoreItems)
          : undefined,
      },
    ],
    totalAmountPesos: input.amount,
    customMessage: resolvedMessage,
    subjectOverride: resolvedSubject,
    signatureOverride: resolvedSignature,
    logoUrl: resolvedLogoUrl,
  });

  return {
    success: true,
    recipient_email: recipientEmail,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
  };
}

export async function updateContributionReceiptSignature(
  dormId: string,
  payload: z.infer<typeof contributionReceiptSignatureSchema>
) {
  const parsed = contributionReceiptSignatureSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid receipt signature payload." };
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Unauthorized" };
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  if (membershipError || !memberships?.length) {
    return { error: "Forbidden" };
  }

  if (!memberships.some(m => new Set(["admin", "treasurer"]).has(m.role))) {
    return { error: "Only admins and treasurers can update contribution receipt signatures." };
  }

  const { data: rows, error: rowsError } = await supabase
    .from("ledger_entries")
    .select("id, event_id, metadata")
    .eq("dorm_id", dormId)
    .eq("ledger", "contributions")
    .is("voided_at", null);

  if (rowsError) {
    return { error: rowsError.message };
  }

  const matchingRows = (rows ?? []).filter((row) => {
    const metadata = parseContributionMetadata(row.metadata, {
      eventId: row.event_id,
      note: null,
    });
    return metadata.contribution_id === input.contribution_id;
  });

  if (!matchingRows.length) {
    return { error: "Contribution not found." };
  }

  let updateClient: typeof supabase = supabase;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = await import("@supabase/supabase-js");
    updateClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    ) as typeof supabase;
  }

  for (const row of matchingRows) {
    const currentMetadata = asMetadataRecord(row.metadata);
    const nextMetadata = {
      ...currentMetadata,
      contribution_receipt_signature: input.signature,
    };

    const { error: updateError } = await updateClient
      .from("ledger_entries")
      .update({ metadata: nextMetadata })
      .eq("id", row.id);

    if (updateError) {
      return { error: updateError.message };
    }
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "finance.contribution_receipt_signature_updated",
      entityType: "finance",
      entityId: input.contribution_id,
      metadata: {
        signature_length: input.signature.length,
        updated_rows: matchingRows.length,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for receipt signature update:", auditError);
  }

  const activeRole = (await getActiveRole()) || "occupant";
  revalidatePath(`/${activeRole}/contributions/${input.contribution_id}`);
  revalidatePath(`/${activeRole}/contributions/${input.contribution_id}/receipt`);
  revalidatePath(`/${activeRole}/contributions`);

  return {
    success: true,
    updatedCount: matchingRows.length,
  };
}

export async function overrideContributionPayable(
  dormId: string,
  payload: z.infer<typeof contributionPayableOverrideSchema>
) {
  const parsed = contributionPayableOverrideSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid payable override payload." };
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Unauthorized" };
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  if (membershipError || !memberships?.length) {
    return { error: "Forbidden" };
  }

  if (!memberships.some(m => new Set(["admin", "treasurer"]).has(m.role))) {
    return { error: "Only admins and treasurers can update payable amounts." };
  }

  const { data: entries, error: entriesError } = await supabase
    .from("ledger_entries")
    .select("id, semester_id, event_id, amount_pesos, entry_type, metadata")
    .eq("dorm_id", dormId)
    .eq("ledger", "contributions")
    .eq("occupant_id", input.occupant_id)
    .is("voided_at", null);

  if (entriesError) {
    return { error: entriesError.message };
  }

  const contributionEntries = (entries ?? []).filter((entry) => {
    const metadata = parseContributionMetadata(entry.metadata, {
      eventId: entry.event_id,
      note: null,
    });
    return metadata.contribution_id === input.contribution_id;
  });

  if (!contributionEntries.length) {
    return { error: "Contribution record not found for this occupant." };
  }

  const currentPayable = contributionEntries.reduce((sum, entry) => {
    const amount = Number(entry.amount_pesos ?? 0);
    if (entry.entry_type === "payment") {
      return sum;
    }
    return sum + amount;
  }, 0);

  const delta = Number((input.new_payable - currentPayable).toFixed(2));
  if (Math.abs(delta) < 0.01) {
    return { success: true, payable: input.new_payable };
  }

  const referenceRow = contributionEntries[0];
  const referenceMetadata = parseContributionMetadata(referenceRow.metadata, {
    eventId: referenceRow.event_id,
    note: null,
  });
  const semesterId =
    contributionEntries.find((entry) => entry.semester_id)?.semester_id ?? referenceRow.semester_id ?? null;

  let writeClient: typeof supabase = supabase;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = await import("@supabase/supabase-js");
    writeClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    ) as typeof supabase;
  }

  const { error: insertError } = await writeClient.from("ledger_entries").insert({
    dorm_id: dormId,
    semester_id: semesterId,
    ledger: "contributions",
    entry_type: "adjustment",
    occupant_id: input.occupant_id,
    event_id: referenceRow.event_id,
    amount_pesos: delta,
    method: "payable_override",
    note: `Payable override: ${input.reason}`,
    metadata: {
      contribution_id: input.contribution_id,
      contribution_title: referenceMetadata.contribution_title,
      contribution_details: referenceMetadata.contribution_details,
      contribution_event_title: referenceMetadata.contribution_event_title,
      payable_deadline: referenceMetadata.payable_deadline,
      contribution_receipt_signature: referenceMetadata.contribution_receipt_signature,
      contribution_receipt_subject: referenceMetadata.contribution_receipt_subject,
      contribution_receipt_message: referenceMetadata.contribution_receipt_message,
      contribution_receipt_logo_url: referenceMetadata.contribution_receipt_logo_url,
      override_reason: input.reason,
      override_previous_payable: currentPayable,
      override_new_payable: input.new_payable,
    },
    created_by: user.id,
  });

  if (insertError) {
    return { error: insertError.message };
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "finance.contribution_payable_overridden",
      entityType: "finance",
      entityId: input.contribution_id,
      metadata: {
        occupant_id: input.occupant_id,
        reason: input.reason,
        old_payable: currentPayable,
        new_payable: input.new_payable,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for payable override:", auditError);
  }

  const activeRole = (await getActiveRole()) || "occupant";
  revalidatePath(`/${activeRole}/contributions/${input.contribution_id}`);
  revalidatePath(`/${activeRole}/contributions`);
  revalidatePath(`/${activeRole}/occupants`);
  revalidatePath(`/${activeRole}/payments`);

  return { success: true, payable: input.new_payable };
}

export async function createMaintenanceBatch(
  dormId: string,
  payload: {
    amount: number;
    description: string;
    deadline?: string | null;
  }
) {
  // We can reuse the same schema logic as contribution
  const parsed = contributionBatchSchema.safeParse({
    amount: payload.amount,
    title: payload.description,
    details: payload.description,
    deadline: payload.deadline ?? null,
    include_already_charged: false,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid maintenance charge input." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: memberships, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  if (membershipError || !memberships?.length) {
    return { error: "Forbidden" };
  }

  // Allowed roles for maintenance fee bulk charge
  if (!memberships.some(m => new Set(["admin", "adviser"]).has(m.role))) {
    return { error: "Only admins and advisers can create maintenance charges." };
  }

  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  if ("error" in semesterResult) {
    return { error: semesterResult.error ?? "Failed to resolve active semester." };
  }

  const { data: occupants, error: occupantsError } = await supabase
    .from("occupants")
    .select("id")
    .eq("dorm_id", dormId)
    .eq("status", "active");

  if (occupantsError) {
    return { error: occupantsError.message };
  }

  if (!occupants?.length) {
    return { error: "No active occupants found to charge." };
  }

  const targetOccupantIds = occupants.map((occupant) => occupant.id);

  const batchId = crypto.randomUUID();
  const deadlineIso = parsed.data.deadline
    ? new Date(parsed.data.deadline).toISOString()
    : null;

  const { error: insertError } = await supabase.from("ledger_entries").insert(
    targetOccupantIds.map((occupantId) => ({
      dorm_id: dormId,
      semester_id: semesterResult.semesterId,
      ledger: "maintenance_fee",
      entry_type: "charge",
      occupant_id: occupantId,
      amount_pesos: Math.abs(parsed.data.amount),
      method: "manual_charge",
      note: parsed.data.title,
      metadata: {
        payable_batch_id: batchId,
        payable_deadline: deadlineIso,
        payable_label: parsed.data.title,
      },
      created_by: user.id,
    }))
  );

  if (insertError) {
    return { error: insertError.message };
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "finance.maintenance_batch_created",
      entityType: "finance",
      entityId: batchId,
      metadata: {
        amount_pesos: Math.abs(parsed.data.amount),
        description: parsed.data.title,
        deadline: deadlineIso,
        charged_count: targetOccupantIds.length,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for maintenance batch creation:", auditError);
  }

  const activeRole = (await getActiveRole()) || "occupant";
  revalidatePath(`/${activeRole}/finance/maintenance`);
  revalidatePath(`/${activeRole}/payments`);

  return {
    success: true,
    chargedCount: targetOccupantIds.length,
  };
}

export async function getLedgerBalance(dormId: string, occupantId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const { data, error } = await supabase
    .from("ledger_entries")
    .select("ledger, amount_pesos, voided_at")
    .eq("dorm_id", dormId)
    .eq("occupant_id", occupantId)
    .is("voided_at", null);

  if (error) {
    console.error(error);
    return null;
  }

  const balances = {
    maintenance: 0,
    fines: 0,
    events: 0,
    gadgets: 0,
    total: 0
  };

  data.forEach(entry => {
    const amount = Number(entry.amount_pesos);
    if (entry.ledger === 'maintenance_fee') balances.maintenance += amount;
    if (entry.ledger === 'sa_fines') balances.fines += amount;
    if (entry.ledger === 'contributions') balances.events += amount;
    if (entry.ledger === 'gadgets') balances.gadgets += amount;
    balances.total += amount;
  });

  return balances;
}

export async function getLedgerEntries(dormId: string, occupantId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }
  const { data, error } = await supabase
    .from("ledger_entries")
    .select(`
      *,
      event:events(title),
      fine:fines(rule:fine_rules(title))
    `)
    .eq("dorm_id", dormId)
    .eq("occupant_id", occupantId)
    .order("posted_at", { ascending: false });

  if (error) {
    console.error("Error fetching ledger entries:", error);
    return [];
  }

  return data;
}

export async function getClearanceStatus(dormId: string, occupantId: string) {
  const balances = await getLedgerBalance(dormId, occupantId);
  if (!balances) return false;
  // Strictly separate: must be cleared in EACH ledger category.
  // Assuming positive balance = debt.
  return (
    balances.maintenance <= 0 &&
    balances.fines <= 0 &&
    balances.events <= 0 &&
    balances.gadgets <= 0
  );
}

export type DormFinanceOverview = {
  maintenance_fee: {
    charged: number;
    collected: number;
    approved_expenses: number;
    outstanding: number;
  };
  contributions: {
    charged: number;
    collected: number;
    approved_expenses: number;
    outstanding: number;
  };
  gadgets: {
    charged: number;
    collected: number;
    outstanding: number;
  };
  committee_funds: {
    approved_expenses: number;
    pending_expenses: number;
    committee_count: number;
  };
  totals: {
    charged: number;
    collected: number;
    approved_expenses: number;
    outstanding: number;
  };
};

export async function getDormFinanceOverview(dormId: string): Promise<DormFinanceOverview | { error: string }> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { error: "Supabase is not configured for this environment." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized" };
  }

  const { data: memberships } = await supabase
    .from("dorm_memberships")
    .select("id")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .limit(1);

  if (!memberships?.length) {
    return { error: "Forbidden" };
  }

  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  if ("error" in semesterResult) {
    return { error: semesterResult.error ?? "No active semester found." };
  }

  const [{ data: ledgerEntries, error: ledgerError }, { data: expenses, error: expensesError }, { count: committeeCount }] =
    await Promise.all([
      supabase
        .from("ledger_entries")
        .select("ledger, amount_pesos, voided_at, semester_id, entry_type")
        .eq("dorm_id", dormId)
        .eq("semester_id", semesterResult.semesterId)
        .is("voided_at", null),
      supabase
        .from("expenses")
        .select("amount_pesos, status, category, committee_id, semester_id")
        .eq("dorm_id", dormId)
        .eq("semester_id", semesterResult.semesterId),
      supabase
        .from("committees")
        .select("id", { count: "exact", head: true })
        .eq("dorm_id", dormId),
    ]);

  if (ledgerError) {
    return { error: ledgerError.message };
  }
  if (expensesError) {
    return { error: expensesError.message };
  }

  let maintenanceCharged = 0;
  let maintenanceCollected = 0;
  let contributionsCharged = 0;
  let contributionsCollected = 0;
  let gadgetsCharged = 0;
  let gadgetsCollected = 0;

  for (const entry of ledgerEntries ?? []) {
    const amount = Number(entry.amount_pesos ?? 0);
    if (entry.ledger === "maintenance_fee") {
      if (amount >= 0) maintenanceCharged += amount;
      else maintenanceCollected += Math.abs(amount);
    }
    if (entry.ledger === "contributions") {
      if (isContributionPaymentEntry(entry.entry_type)) {
        contributionsCollected += Math.abs(amount);
      } else {
        contributionsCharged += amount;
      }
    }
    if (entry.ledger === "gadgets") {
      if (amount >= 0) gadgetsCharged += amount;
      else gadgetsCollected += Math.abs(amount);
    }
  }

  let maintenanceApprovedExpenses = 0;
  let contributionsApprovedExpenses = 0;
  let committeeApprovedExpenses = 0;
  let committeePendingExpenses = 0;

  for (const expense of expenses ?? []) {
    const amount = Number(expense.amount_pesos ?? 0);
    const isApproved = expense.status === "approved";
    const isPending = expense.status === "pending";

    if (expense.category === "maintenance_fee" && isApproved) {
      maintenanceApprovedExpenses += amount;
    }

    if (expense.category === "contributions" && isApproved) {
      contributionsApprovedExpenses += amount;
    }

    if (expense.committee_id) {
      if (isApproved) committeeApprovedExpenses += amount;
      if (isPending) committeePendingExpenses += amount;
    }
  }

  const maintenanceOutstanding = Math.max(0, maintenanceCharged - maintenanceCollected);
  const contributionsOutstanding = Math.max(0, contributionsCharged - contributionsCollected);
  const gadgetsOutstanding = Math.max(0, gadgetsCharged - gadgetsCollected);

  const totalCharged = maintenanceCharged + contributionsCharged + gadgetsCharged;
  const totalCollected = maintenanceCollected + contributionsCollected + gadgetsCollected;
  const totalApprovedExpenses = maintenanceApprovedExpenses + contributionsApprovedExpenses;
  const totalOutstanding = Math.max(0, totalCharged - totalCollected);

  return {
    maintenance_fee: {
      charged: maintenanceCharged,
      collected: maintenanceCollected,
      approved_expenses: maintenanceApprovedExpenses,
      outstanding: maintenanceOutstanding,
    },
    contributions: {
      charged: contributionsCharged,
      collected: contributionsCollected,
      approved_expenses: contributionsApprovedExpenses,
      outstanding: contributionsOutstanding,
    },
    gadgets: {
      charged: gadgetsCharged,
      collected: gadgetsCollected,
      outstanding: gadgetsOutstanding,
    },
    committee_funds: {
      approved_expenses: committeeApprovedExpenses,
      pending_expenses: committeePendingExpenses,
      committee_count: committeeCount ?? 0,
    },
    totals: {
      charged: totalCharged,
      collected: totalCollected,
      approved_expenses: totalApprovedExpenses,
      outstanding: totalOutstanding,
    },
  };
}

export async function createPublicViewToken(
  dormId: string,
  entityType: 'event' | 'finance_ledger',
  entityId: string,
  expiresInDays?: number
) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // Permission check
  const { data: memberships } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  if (!memberships?.length || !memberships.some(m => ['admin', 'treasurer', 'adviser', 'assistant_adviser'].includes(m.role))) {
    return { error: "Forbidden" };
  }

  const expires_at = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { data, error } = await supabase
    .from("public_view_tokens")
    .insert({
      dorm_id: dormId,
      entity_type: entityType,
      entity_id: entityId,
      expires_at,
      created_by: user.id
    })
    .select("token")
    .single();

  if (error) return { error: error.message };

  const activeRole = (await getActiveRole()) || "occupant";
  revalidatePath(`/${activeRole}/contributions/${entityId}`);
  return { success: true, token: data.token };
}

export async function getPublicContributionSummaryAction(token: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  // Use the RPC/Function we created in migration
  const { data, error } = await supabase.rpc('get_public_contribution_summary', {
    token_uuid: token
  });

  if (error) {
    console.error("Public summary error:", error);
    return { error: "Link is invalid or expired." };
  }

  if (!data || data.length === 0) {
    return { error: "No data found for this link." };
  }

  return { success: true, summary: data[0] };
}

export async function getEntityPublicTokens(dormId: string, entityId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase
    .from("public_view_tokens")
    .select("*")
    .eq("dorm_id", dormId)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });

  if (error) return [];
  return data;
}

export async function togglePublicViewToken(dormId: string, tokenId: string, active: boolean) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("public_view_tokens")
    .update({ is_active: active })
    .eq("dorm_id", dormId)
    .eq("id", tokenId);

  if (error) return { error: error.message };

  const activeRole = (await getActiveRole()) || "occupant";
  revalidatePath(`/${activeRole}/finance`);
  return { success: true };
}

export async function previewGlobalReceiptTemplateEmail(
  dormId: string,
  payload: {
    subject: string | null;
    message: string | null;
    signature: string | null;
    logo_url: string | null;
  }
) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Unauthorized" };
  }

  const { data: memberships } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("dorm_id", dormId);

  if (!memberships || !memberships.some((m) => ["admin", "adviser", "treasurer"].includes(m.role))) {
    return { error: "Forbidden" };
  }

  const { renderContributionBatchReceiptEmail } = await import("@/lib/email");

  const rendered = renderContributionBatchReceiptEmail({
    treasurerNameOverride: user.user_metadata?.full_name || user.email || null,
    recipientName: "John Doe",
    paidAtIso: new Date().toISOString(),
    method: "cash",
    contributions: [
      {
        title: "COFILANG Faction Shirt",
        amountPesos: 350.0,
        orderItems: [
          {
            itemName: "Faction Shirt",
            options: ["Size: XL", "Color: Blue"],
            quantity: 1,
            subtotal: 350.0,
          },
        ],
      },
      {
        title: "Sample Contribution A",
        amountPesos: 50.0,
      },
    ],
    totalAmountPesos: 400.0,
    customMessage: payload.message || null,
    subjectOverride: payload.subject || null,
    signatureOverride: payload.signature || null,
    logoUrl: payload.logo_url || null,
  });

  return {
    success: true,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    recipient_email: "john.doe@example.com",
  };
}
