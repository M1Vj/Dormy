"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logAuditEvent } from "@/lib/audit/log";
import { ensureActiveSemesterId } from "@/lib/semesters";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  DORM_GADGET_FEE_ATTRIBUTE_KEY,
  getGadgetDisplayName,
  normalizeDormGadgetFee,
  resolveOccupantGadgetFee,
  type OccupantGadget,
} from "@/lib/gadgets";

const gadgetInputSchema = z.object({
  occupant_id: z.string().uuid(),
  gadget_type: z.string().trim().min(2).max(80),
  gadget_label: z.string().trim().min(1).max(140),
});

const gadgetUpdateSchema = gadgetInputSchema.extend({
  gadget_id: z.string().uuid(),
  is_active: z.boolean().optional(),
});

const gadgetFeeSchema = z.object({
  fee_pesos: z.coerce.number().min(0).max(999999),
});

type GadgetLedgerEntry = {
  id: string;
  occupant_id: string | null;
  amount_pesos: number | string | null;
  entry_type: string | null;
  posted_at: string;
  method: string | null;
  note: string | null;
  semester_id: string | null;
  metadata: Record<string, unknown> | null;
};

type GadgetWorkspaceRow = {
  id: string;
  full_name: string;
  student_id: string | null;
  roomCode: string | null;
  gadgets: Array<
    OccupantGadget & {
      effective_fee_pesos: number;
      current_semester_balance: number;
      total_balance: number;
    }
  >;
  current_semester_balance: number;
  total_balance: number;
};

type OccupantRoomRef = {
  code?: string | null;
};

type GadgetSyncResult =
  | {
      success: true;
      syncedCount: number;
    }
  | {
      error: string;
    };

type GadgetWorkspaceResult =
  | {
      data: GadgetWorkspaceRow[];
      migrationRequired?: boolean;
      warning?: string;
    }
  | {
      error: string;
    };

const GADGET_MANAGER_ROLES = new Set(["admin", "student_assistant"]);
const GADGET_VIEWER_ROLES = new Set(["admin", "student_assistant", "adviser", "assistant_adviser"]);
const GADGET_SCHEMA_WARNING =
  "Gadget finance is enabled in code, but the Supabase gadgets migration has not been applied yet.";

function asMetadataRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function getDormAttributesRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function extractDormGadgetFee(attributes: unknown) {
  return normalizeDormGadgetFee(getDormAttributesRecord(attributes)[DORM_GADGET_FEE_ATTRIBUTE_KEY]);
}

function getGadgetSchemaWarning(error: { code?: string | null; message?: string | null } | null | undefined) {
  if (!error) {
    return null;
  }

  const message = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  if (
    error.code === "PGRST205" ||
    error.code === "22P02" ||
    message.includes("occupant_gadgets") ||
    message.includes("ledger_category") ||
    message.includes("gadgets migration")
  ) {
    return `${GADGET_SCHEMA_WARNING} Apply migrations \`20260307125000_gadgets_finance.sql\` and \`20260313123000_occupant_gadgets_and_finance_permissions.sql\` to the linked project.`;
  }

  return null;
}

function isGadgetSchemaWarning(error: string) {
  return error.startsWith(GADGET_SCHEMA_WARNING);
}

async function getWriteClient(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>
) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return supabase;
  }

  const { createClient } = await import("@supabase/supabase-js");
  return createClient(
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

async function getActorContext(dormId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, roles: [] as string[] };
  }

  const { data: memberships, error } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  const roles = (memberships ?? []).map((membership) => membership.role);
  if (roles.includes("admin")) {
    return { supabase, user, roles };
  }

  const { data: adminMemberships } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .limit(1);

  if (error) {
    return {
      supabase,
      user,
      roles: adminMemberships?.length ? ["admin"] : ([] as string[]),
    };
  }

  return {
    supabase,
    user,
    roles: adminMemberships?.length ? [...roles, "admin"] : roles,
  };
}

async function getDormGadgetFeeValue(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  dormId: string
) {
  const { data: dorm, error } = await supabase
    .from("dorms")
    .select("attributes")
    .eq("id", dormId)
    .maybeSingle();

  if (error || !dorm) {
    return {
      error: error?.message ?? "Dorm settings not found.",
    } as const;
  }

  return {
    fee_pesos: extractDormGadgetFee(dorm.attributes),
    attributes: getDormAttributesRecord(dorm.attributes),
  } as const;
}

function getPathsForGadgetRevalidation(occupantId: string) {
  return [
    `/student_assistant/finance/gadgets`,
    `/student_assistant/occupants/${occupantId}`,
    `/student_assistant/payments`,
    `/student_assistant/reporting`,
    `/adviser/occupants/${occupantId}`,
    `/adviser/payments`,
    `/adviser/reporting`,
    `/admin/occupants/${occupantId}`,
  ];
}

function buildGadgetMetadata(gadget: OccupantGadget, amount: number) {
  return {
    gadget_id: gadget.id,
    gadget_type: gadget.gadget_type,
    gadget_label: gadget.gadget_label,
    gadget_display_name: getGadgetDisplayName(gadget),
    gadget_fee_pesos: amount,
  };
}

async function insertGadgetLedgerAdjustment(input: {
  writeClient: Awaited<ReturnType<typeof getWriteClient>>;
  dormId: string;
  semesterId: string;
  occupantId: string;
  gadget: OccupantGadget;
  amount: number;
  userId: string;
  note: string;
}) {
  const effectiveAmount = Number(input.amount.toFixed(2));
  if (Math.abs(effectiveAmount) < 0.01) {
    return;
  }

  const entryType = effectiveAmount >= 0 ? "charge" : "adjustment";
  const method = effectiveAmount >= 0 ? "gadget_semester_charge" : "gadget_fee_adjustment";

  const { error } = await input.writeClient.from("ledger_entries").insert({
    dorm_id: input.dormId,
    semester_id: input.semesterId,
    ledger: "gadgets",
    entry_type: entryType,
    occupant_id: input.occupantId,
    amount_pesos: effectiveAmount,
    method,
    note: input.note,
    metadata: buildGadgetMetadata(input.gadget, Math.abs(effectiveAmount)),
    created_by: input.userId,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function syncActiveSemesterGadgetCharges(
  dormId: string,
  options: {
    occupantId?: string;
    gadgetIds?: string[];
  } = {}
): Promise<GadgetSyncResult> {
  const { supabase, user, roles } = await getActorContext(dormId);
  if (!user) {
    return { error: "Unauthorized" };
  }

  const canManage = roles.some((role) => GADGET_MANAGER_ROLES.has(role));
  if (!canManage) {
    return { error: "Forbidden" };
  }

  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  if ("error" in semesterResult) {
    return { error: semesterResult.error ?? "No active semester." };
  }

  let gadgetsQuery = supabase
    .from("occupant_gadgets")
    .select("*")
    .eq("dorm_id", dormId)
    .eq("is_active", true);

  if (options.occupantId) {
    gadgetsQuery = gadgetsQuery.eq("occupant_id", options.occupantId);
  }

  const { data: gadgetRows, error: gadgetError } = await gadgetsQuery.order("assigned_at", {
    ascending: false,
  });

  if (gadgetError) {
    return { error: getGadgetSchemaWarning(gadgetError) ?? gadgetError.message };
  }

  const filteredGadgets = ((gadgetRows ?? []) as OccupantGadget[]).filter((gadget) =>
    options.gadgetIds?.length ? options.gadgetIds.includes(gadget.id) : true
  );

  if (filteredGadgets.length === 0) {
    return { success: true, syncedCount: 0 };
  }

  const occupantIds = Array.from(new Set(filteredGadgets.map((gadget) => gadget.occupant_id)));
  const { data: ledgerRows, error: ledgerError } = await supabase
    .from("ledger_entries")
    .select("id, occupant_id, amount_pesos, entry_type, posted_at, method, note, semester_id, metadata")
    .eq("dorm_id", dormId)
    .eq("ledger", "gadgets")
    .in("occupant_id", occupantIds)
    .eq("semester_id", semesterResult.semesterId)
    .is("voided_at", null);

  if (ledgerError) {
    return { error: getGadgetSchemaWarning(ledgerError) ?? ledgerError.message };
  }

  const writeClient = await getWriteClient(supabase);
  let syncedCount = 0;

  for (const gadget of filteredGadgets) {
    const effectiveFee = resolveOccupantGadgetFee(gadget);
    const currentSemesterChargeTotal = ((ledgerRows ?? []) as GadgetLedgerEntry[])
      .filter((entry) => {
        const metadata = asMetadataRecord(entry.metadata);
        return (
          entry.occupant_id === gadget.occupant_id &&
          metadata.gadget_id === gadget.id &&
          entry.entry_type !== "payment"
        );
      })
      .reduce((sum, entry) => sum + Number(entry.amount_pesos ?? 0), 0);

    const delta = Number((effectiveFee - currentSemesterChargeTotal).toFixed(2));
    if (Math.abs(delta) < 0.01) {
      continue;
    }

    await insertGadgetLedgerAdjustment({
      writeClient,
      dormId,
      semesterId: semesterResult.semesterId,
      occupantId: gadget.occupant_id,
      gadget,
      amount: delta,
      userId: user.id,
      note:
        currentSemesterChargeTotal === 0
          ? `Gadget semester charge • ${getGadgetDisplayName(gadget)}`
          : `Gadget fee adjustment • ${getGadgetDisplayName(gadget)}`,
    });

    syncedCount += 1;
  }

  if (syncedCount > 0) {
    for (const occupantId of occupantIds) {
      getPathsForGadgetRevalidation(occupantId).forEach((path) => revalidatePath(path));
    }
  }

  return { success: true, syncedCount };
}

export async function getGadgetWorkspaceData(
  dormId: string,
  search = ""
): Promise<GadgetWorkspaceResult> {
  const { supabase, user, roles } = await getActorContext(dormId);
  if (!user) {
    return { error: "Unauthorized" };
  }

  const canView = roles.some((role) => GADGET_VIEWER_ROLES.has(role));
  const canManage = roles.some((role) => GADGET_MANAGER_ROLES.has(role));
  if (!canView) {
    return { error: "Forbidden" };
  }

  if (canManage) {
    const syncResult = await syncActiveSemesterGadgetCharges(dormId);
    if ("error" in syncResult) {
      if (isGadgetSchemaWarning(syncResult.error)) {
        return {
          data: [],
          migrationRequired: true,
          warning: syncResult.error,
        };
      }
      return { error: syncResult.error };
    }
  }

  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  if ("error" in semesterResult) {
    return { error: semesterResult.error ?? "No active semester." };
  }

  const { data: occupantRows, error: occupantError } = await supabase
    .from("occupants")
    .select(`
      id,
      full_name,
      student_id,
      room_assignments(room:rooms(code))
    `)
    .eq("dorm_id", dormId)
    .eq("status", "active")
    .order("full_name");

  if (occupantError) {
    return { error: occupantError.message };
  }

  const occupants = (occupantRows ?? []) as Array<{
    id: string;
    full_name: string | null;
    student_id: string | null;
    room_assignments?: Array<{ room?: OccupantRoomRef[] | OccupantRoomRef | null }> | null;
  }>;

  const occupantIds = occupants.map((occupant) => occupant.id);
  const [{ data: gadgetRows, error: gadgetError }, { data: ledgerRows, error: ledgerError }] =
    await Promise.all([
      supabase
        .from("occupant_gadgets")
        .select("*")
        .eq("dorm_id", dormId)
        .in("occupant_id", occupantIds)
        .order("assigned_at", { ascending: false }),
      supabase
        .from("ledger_entries")
        .select("id, occupant_id, amount_pesos, entry_type, posted_at, method, note, semester_id, metadata")
        .eq("dorm_id", dormId)
        .eq("ledger", "gadgets")
        .in("occupant_id", occupantIds)
        .is("voided_at", null)
        .order("posted_at", { ascending: false }),
    ]);

  if (gadgetError) {
    const schemaWarning = getGadgetSchemaWarning(gadgetError);
    if (schemaWarning) {
      return {
        data: [],
        migrationRequired: true,
        warning: schemaWarning,
      };
    }
    return { error: gadgetError.message };
  }
  if (ledgerError) {
    const schemaWarning = getGadgetSchemaWarning(ledgerError);
    if (schemaWarning) {
      return {
        data: [],
        migrationRequired: true,
        warning: schemaWarning,
      };
    }
    return { error: ledgerError.message };
  }

  const normalizedSearch = search.trim().toLowerCase();
  const gadgetsByOccupant = new Map<string, OccupantGadget[]>();
  for (const gadget of (gadgetRows ?? []) as OccupantGadget[]) {
    const list = gadgetsByOccupant.get(gadget.occupant_id) ?? [];
    list.push(gadget);
    gadgetsByOccupant.set(gadget.occupant_id, list);
  }

  const rows: GadgetWorkspaceRow[] = occupants
    .map((occupant) => {
      const roomAssignment = Array.isArray(occupant.room_assignments)
        ? occupant.room_assignments[0]
        : null;
      const roomSource = roomAssignment?.room ?? null;
      const room: OccupantRoomRef | null = Array.isArray(roomSource)
        ? roomSource[0] ?? null
        : roomSource;
      const occupantGadgets = (gadgetsByOccupant.get(occupant.id) ?? []).map((gadget) => {
        const effectiveFee = resolveOccupantGadgetFee(gadget);
        const relatedEntries = ((ledgerRows ?? []) as GadgetLedgerEntry[]).filter((entry) => {
          const metadata = asMetadataRecord(entry.metadata);
          return entry.occupant_id === occupant.id && metadata.gadget_id === gadget.id;
        });

        const totalBalance = relatedEntries.reduce(
          (sum, entry) => sum + Number(entry.amount_pesos ?? 0),
          0
        );
        const currentSemesterBalance = relatedEntries
          .filter((entry) => entry.semester_id === semesterResult.semesterId)
          .reduce((sum, entry) => sum + Number(entry.amount_pesos ?? 0), 0);

        return {
          ...gadget,
          effective_fee_pesos: effectiveFee,
          current_semester_balance: Number(currentSemesterBalance.toFixed(2)),
          total_balance: Number(totalBalance.toFixed(2)),
        };
      });

      const currentSemesterBalance = occupantGadgets.reduce(
        (sum, gadget) => sum + gadget.current_semester_balance,
        0
      );
      const totalBalance = occupantGadgets.reduce((sum, gadget) => sum + gadget.total_balance, 0);

      return {
        id: occupant.id,
        full_name: occupant.full_name?.trim() || "Unnamed occupant",
        student_id: occupant.student_id ?? null,
        roomCode: room?.code ?? null,
        gadgets: occupantGadgets,
        current_semester_balance: Number(currentSemesterBalance.toFixed(2)),
        total_balance: Number(totalBalance.toFixed(2)),
      };
    })
    .filter((row) => {
      if (!normalizedSearch) {
        return true;
      }

      const gadgetText = row.gadgets
        .map((gadget) => `${gadget.gadget_type} ${gadget.gadget_label}`)
        .join(" ")
        .toLowerCase();
      return (
        row.full_name.toLowerCase().includes(normalizedSearch) ||
        (row.student_id ?? "").toLowerCase().includes(normalizedSearch) ||
        (row.roomCode ?? "").toLowerCase().includes(normalizedSearch) ||
        gadgetText.includes(normalizedSearch)
      );
    });

  return { data: rows };
}

export async function getDormGadgetFee(dormId: string) {
  const { supabase, user, roles } = await getActorContext(dormId);
  if (!user) {
    return { error: "Unauthorized" };
  }

  const canView = roles.some((role) => GADGET_VIEWER_ROLES.has(role));
  if (!canView) {
    return { error: "Forbidden" };
  }

  const feeResult = await getDormGadgetFeeValue(supabase, dormId);
  if ("error" in feeResult) {
    return feeResult;
  }

  return { fee_pesos: feeResult.fee_pesos };
}

export async function updateDormGadgetFee(dormId: string, payload: unknown) {
  const parsed = gadgetFeeSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid gadget fee." };
  }

  const { supabase, user, roles } = await getActorContext(dormId);
  if (!user) {
    return { error: "Unauthorized" };
  }
  if (!roles.some((role) => GADGET_MANAGER_ROLES.has(role))) {
    return { error: "You do not have permission to manage gadget fees." };
  }

  const writeClient = await getWriteClient(supabase);
  const feeResult = await getDormGadgetFeeValue(supabase, dormId);
  if ("error" in feeResult) {
    return feeResult;
  }

  const nextFee = normalizeDormGadgetFee(parsed.data.fee_pesos);
  const nextAttributes = {
    ...feeResult.attributes,
    [DORM_GADGET_FEE_ATTRIBUTE_KEY]: nextFee,
  };

  const { error: dormUpdateError } = await writeClient
    .from("dorms")
    .update({
      attributes: nextAttributes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", dormId);

  if (dormUpdateError) {
    return { error: dormUpdateError.message };
  }

  const { data: updatedGadgets, error: gadgetUpdateError } = await writeClient
    .from("occupant_gadgets")
    .update({
      default_fee_pesos: nextFee,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("dorm_id", dormId)
    .eq("is_active", true)
    .select("id, occupant_id");

  if (gadgetUpdateError) {
    return {
      error: getGadgetSchemaWarning(gadgetUpdateError) ?? gadgetUpdateError.message,
    };
  }

  const syncResult = await syncActiveSemesterGadgetCharges(dormId, {
    gadgetIds: (updatedGadgets ?? []).map((gadget) => gadget.id),
  });
  if ("error" in syncResult) {
    return syncResult;
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "gadgets.global_fee_updated",
      entityType: "dorm",
      entityId: dormId,
      metadata: {
        previous_fee_pesos: feeResult.fee_pesos,
        fee_pesos: nextFee,
        updated_gadget_count: updatedGadgets?.length ?? 0,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for gadget fee update:", auditError);
  }

  const occupantIds = Array.from(new Set((updatedGadgets ?? []).map((gadget) => gadget.occupant_id)));
  revalidatePath("/student_assistant/finance/gadgets");
  for (const occupantId of occupantIds) {
    getPathsForGadgetRevalidation(occupantId).forEach((path) => revalidatePath(path));
  }

  return { success: true, fee_pesos: nextFee };
}

export async function createOccupantGadget(dormId: string, payload: unknown) {
  const parsed = gadgetInputSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid gadget payload." };
  }

  const { supabase, user, roles } = await getActorContext(dormId);
  if (!user) {
    return { error: "Unauthorized" };
  }
  if (!roles.some((role) => GADGET_MANAGER_ROLES.has(role))) {
    return { error: "You do not have permission to manage occupant gadgets." };
  }

  const writeClient = await getWriteClient(supabase);
  const feeResult = await getDormGadgetFeeValue(supabase, dormId);
  if ("error" in feeResult) {
    return feeResult;
  }

  const { data: occupant, error: occupantError } = await supabase
    .from("occupants")
    .select("id")
    .eq("dorm_id", dormId)
    .eq("id", parsed.data.occupant_id)
    .maybeSingle();

  if (occupantError || !occupant) {
    return { error: occupantError?.message ?? "Occupant not found." };
  }

  const { data: gadget, error } = await writeClient
    .from("occupant_gadgets")
    .insert({
      dorm_id: dormId,
      occupant_id: parsed.data.occupant_id,
      gadget_type: parsed.data.gadget_type,
      gadget_label: parsed.data.gadget_label,
      default_fee_pesos: feeResult.fee_pesos,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("*")
    .single();

  if (error || !gadget) {
    return {
      error: getGadgetSchemaWarning(error) ?? error?.message ?? "Failed to add gadget.",
    };
  }

  const syncResult = await syncActiveSemesterGadgetCharges(dormId, {
    occupantId: parsed.data.occupant_id,
    gadgetIds: [gadget.id],
  });
  if ("error" in syncResult) {
    return syncResult;
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "gadgets.created",
      entityType: "occupant_gadget",
      entityId: gadget.id,
      metadata: {
        occupant_id: parsed.data.occupant_id,
        gadget_type: parsed.data.gadget_type,
        gadget_label: parsed.data.gadget_label,
        fee_pesos: feeResult.fee_pesos,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for gadget creation:", auditError);
  }

  getPathsForGadgetRevalidation(parsed.data.occupant_id).forEach((path) => revalidatePath(path));
  return { success: true, gadget };
}

export async function updateOccupantGadget(dormId: string, payload: unknown) {
  const parsed = gadgetUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid gadget payload." };
  }

  const { supabase, user, roles } = await getActorContext(dormId);
  if (!user) {
    return { error: "Unauthorized" };
  }
  if (!roles.some((role) => GADGET_MANAGER_ROLES.has(role))) {
    return { error: "You do not have permission to manage occupant gadgets." };
  }

  const writeClient = await getWriteClient(supabase);
  const { data: existing, error: existingError } = await supabase
    .from("occupant_gadgets")
    .select("*")
    .eq("dorm_id", dormId)
    .eq("id", parsed.data.gadget_id)
    .maybeSingle();

  if (existingError || !existing) {
    return {
      error: getGadgetSchemaWarning(existingError) ?? existingError?.message ?? "Gadget not found.",
    };
  }

  const nextActive = parsed.data.is_active ?? existing.is_active;

  const { data: gadget, error } = await writeClient
    .from("occupant_gadgets")
    .update({
      gadget_type: parsed.data.gadget_type,
      gadget_label: parsed.data.gadget_label,
      is_active: nextActive,
      removed_at: nextActive ? null : existing.removed_at ?? new Date().toISOString(),
      removed_by: nextActive ? null : existing.removed_by ?? user.id,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.gadget_id)
    .select("*")
    .single();

  if (error || !gadget) {
    return {
      error: getGadgetSchemaWarning(error) ?? error?.message ?? "Failed to update gadget.",
    };
  }

  if (gadget.is_active) {
    const syncResult = await syncActiveSemesterGadgetCharges(dormId, {
      occupantId: gadget.occupant_id,
      gadgetIds: [gadget.id],
    });
    if ("error" in syncResult) {
      return syncResult;
    }
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "gadgets.updated",
      entityType: "occupant_gadget",
      entityId: gadget.id,
      metadata: {
        occupant_id: gadget.occupant_id,
        gadget_type: gadget.gadget_type,
        gadget_label: gadget.gadget_label,
        fee_pesos: resolveOccupantGadgetFee(gadget),
        is_active: gadget.is_active,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for gadget update:", auditError);
  }

  getPathsForGadgetRevalidation(gadget.occupant_id).forEach((path) => revalidatePath(path));
  return { success: true, gadget };
}

export async function deactivateOccupantGadget(dormId: string, gadgetId: string) {
  const { supabase, user, roles } = await getActorContext(dormId);
  if (!user) {
    return { error: "Unauthorized" };
  }
  if (!roles.some((role) => GADGET_MANAGER_ROLES.has(role))) {
    return { error: "You do not have permission to manage occupant gadgets." };
  }

  const writeClient = await getWriteClient(supabase);
  const { data: existing, error: existingError } = await supabase
    .from("occupant_gadgets")
    .select("*")
    .eq("dorm_id", dormId)
    .eq("id", gadgetId)
    .maybeSingle();

  if (existingError || !existing) {
    return {
      error: getGadgetSchemaWarning(existingError) ?? existingError?.message ?? "Gadget not found.",
    };
  }

  if (!existing.is_active) {
    return { success: true };
  }

  const { error } = await writeClient
    .from("occupant_gadgets")
    .update({
      is_active: false,
      removed_at: new Date().toISOString(),
      removed_by: user.id,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", gadgetId);

  if (error) {
    return { error: getGadgetSchemaWarning(error) ?? error.message };
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "gadgets.deactivated",
      entityType: "occupant_gadget",
      entityId: gadgetId,
      metadata: {
        occupant_id: existing.occupant_id,
        gadget_type: existing.gadget_type,
        gadget_label: existing.gadget_label,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for gadget deactivation:", auditError);
  }

  getPathsForGadgetRevalidation(existing.occupant_id).forEach((path) => revalidatePath(path));
  return { success: true };
}

export async function getOccupantGadgetSummary(dormId: string, occupantId: string) {
  const workspace = await getGadgetWorkspaceData(dormId);
  if ("error" in workspace) {
    return workspace;
  }

  const row = workspace.data.find((item) => item.id === occupantId);
  return {
    migrationRequired: workspace.migrationRequired,
    warning: workspace.warning,
    data: row ?? {
      id: occupantId,
      full_name: "",
      student_id: null,
      roomCode: null,
      gadgets: [],
      current_semester_balance: 0,
      total_balance: 0,
    },
  };
}
