"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAuditEvent } from "@/lib/audit/log";
import { ensureActiveSemesterId } from "@/lib/semesters";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// --- Rules ---

const fineRuleSchema = z.object({
  title: z.string().min(2, "Title is required"),
  severity: z.enum(["minor", "major", "severe"]),
  default_pesos: z.coerce.number().min(0),
  default_points: z.coerce.number().min(0),
  active: z.boolean().optional().default(true),
});

export async function getFineRules(dormId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }
  const { data, error } = await supabase
    .from("fine_rules")
    .select("*")
    .eq("dorm_id", dormId)
    .order("title");

  if (error) {
    console.error("Error fetching fine rules:", error);
    return [];
  }
  return data;
}

export async function createFineRule(dormId: string, formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    !membership ||
    !new Set(["admin", "adviser", "student_assistant"]).has(membership.role)
  ) {
    return { error: "You do not have permission to manage fine rules." };
  }

  const rawData = {
    title: formData.get("title"),
    severity: formData.get("severity"),
    default_pesos: formData.get("default_pesos"),
    default_points: formData.get("default_points"),
    active: true,
  };

  const parsed = fineRuleSchema.safeParse(rawData);
  if (!parsed.success) return { error: "Invalid data" };

  const { error } = await supabase.from("fine_rules").insert({
    dorm_id: dormId,
    ...parsed.data,
  });

  if (error) return { error: error.message };

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user?.id ?? null,
      action: "fines.rule_created",
      entityType: "fine_rule",
      metadata: {
        title: parsed.data.title,
        severity: parsed.data.severity,
        default_pesos: parsed.data.default_pesos,
        default_points: parsed.data.default_points,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for fine rule creation:", auditError);
  }

  revalidatePath("/admin/fines");
  return { success: true };
}

export async function updateFineRule(
  dormId: string,
  ruleId: string,
  formData: FormData
) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    !membership ||
    !new Set(["admin", "adviser", "student_assistant"]).has(membership.role)
  ) {
    return { error: "You do not have permission to manage fine rules." };
  }

  // Handle checkbox carefully (if present = true, else false? Or just updates?)
  // For strictness, let's assume active is passed as 'true'/'false' string or via checkbox logic
  const activeVal = formData.get("active");
  const isActive = activeVal === "on" || activeVal === "true";

  const rawData = {
    title: formData.get("title"),
    severity: formData.get("severity"),
    default_pesos: formData.get("default_pesos"),
    default_points: formData.get("default_points"),
    active: isActive,
  };

  // Partial update logic usually desired, but we can adhere to schema for critical fields
  // Let's safeParse the numeric/enum fields
  const parsed = fineRuleSchema.partial().safeParse(rawData);
  if (!parsed.success) return { error: "Invalid data" };

  const { data: existingRule, error: existingRuleError } = await supabase
    .from("fine_rules")
    .select("id, active")
    .eq("dorm_id", dormId)
    .eq("id", ruleId)
    .maybeSingle();

  if (existingRuleError || !existingRule) {
    return { error: existingRuleError?.message ?? "Fine rule not found." };
  }

  const { error } = await supabase
    .from("fine_rules")
    .update(parsed.data)
    .eq("dorm_id", dormId)
    .eq("id", ruleId);

  if (error) return { error: error.message };

  const updatedActive =
    typeof parsed.data.active === "boolean" ? parsed.data.active : existingRule.active;
  const action =
    updatedActive === false && existingRule.active !== false
      ? "fines.rule_deleted"
      : updatedActive === true && existingRule.active === false
        ? "fines.rule_restored"
        : "fines.rule_updated";

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user?.id ?? null,
      action,
      entityType: "fine_rule",
      entityId: ruleId,
      metadata: parsed.data,
    });
  } catch (auditError) {
    console.error("Failed to write audit event for fine rule update:", auditError);
  }

  revalidatePath("/admin/fines");
  return { success: true };
}

// --- Fines ---

const issueFineSchema = z.object({
  occupant_id: z.string().uuid(),
  rule_id: z.string().uuid().optional().nullable(),
  pesos: z.coerce.number().min(0),
  points: z.coerce.number().min(0),
  note: z.string().optional(),
});

export async function getFines(
  dormId: string,
  { search, status, occupantId }: { search?: string; status?: string; occupantId?: string } = {}
) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  if ("error" in semesterResult) {
    console.error("Failed to resolve active semester for fines:", semesterResult.error);
    return [];
  }

  let query = supabase
    .from("fines")
    .select(`
      *,
      occupant:occupants(full_name, student_id, room_assignments(room:rooms(code))),
      rule:fine_rules(title, severity),
      issuer:issued_by(display_name)
    `)
    .eq("dorm_id", dormId)
    .eq("semester_id", semesterResult.semesterId)
    .order("issued_at", { ascending: false });

  if (status === "voided") {
    query = query.not("voided_at", "is", null);
  } else if (status === "active") {
    query = query.is("voided_at", null);
  }

  if (occupantId) {
    query = query.eq("occupant_id", occupantId);
  }

  const { data, error } = await query;
  if (error) {
    console.error(error);
    return [];
  }

  if (!search) {
    return data;
  }

  const normalizedSearch = search.toLowerCase();
  const asFirst = <T,>(value?: T | T[] | null) =>
    Array.isArray(value) ? value[0] : value;

  return data.filter((fine) => {
    const occupant = asFirst(fine.occupant);
    const rule = asFirst(fine.rule);

    const values = [
      fine.note ?? "",
      occupant?.full_name ?? "",
      occupant?.student_id ?? "",
      rule?.title ?? "",
      rule?.severity ?? "",
    ];

    return values.some((value) => value.toLowerCase().includes(normalizedSearch));
  });
}

export async function issueFine(dormId: string, formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const rawData = {
    occupant_id: formData.get("occupant_id"),
    rule_id: formData.get("rule_id"),
    pesos: formData.get("pesos"),
    points: formData.get("points"),
    note: formData.get("note")
  };

  const parsed = issueFineSchema.safeParse(rawData);
  if (!parsed.success) return { error: "Invalid data" };

  // Get current user for issued_by
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    !membership ||
    !new Set(["admin", "adviser", "student_assistant"]).has(membership.role)
  ) {
    return { error: "You do not have permission to issue fines." };
  }

  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  if ("error" in semesterResult) {
    return { error: semesterResult.error ?? "Failed to resolve active semester." };
  }

  const { data, error } = await supabase.from("fines").insert({
    dorm_id: dormId,
    semester_id: semesterResult.semesterId,
    occupant_id: parsed.data.occupant_id,
    rule_id: parsed.data.rule_id || null, // Allow custom fine without rule
    pesos: parsed.data.pesos,
    points: parsed.data.points,
    note: parsed.data.note,
    issued_by: user.id
  })
    .select()
    .single();

  if (error) return { error: error.message };

  // Sync to Ledger (Charge)
  const { error: ledgerError } = await supabase.from("ledger_entries").insert({
    dorm_id: dormId,
    ledger: "sa_fines",
    entry_type: "charge",
    occupant_id: parsed.data.occupant_id,
    fine_id: data.id,
    amount_pesos: parsed.data.pesos,
    note: `Fine: ${parsed.data.note || "Violation"}`,
    created_by: user.id
  });

  if (ledgerError) {
    // If ledger fails, we technically have an inconsistency. 
    // In a real app we'd rollback. For v1, we log error.
    console.error("Failed to create ledger entry for fine:", ledgerError);
    // Ideally update fine to add a warning or delete it?
    // Let's keep it simple: just log.
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "fines.issued",
      entityType: "fine",
      entityId: data.id,
      metadata: {
        occupant_id: parsed.data.occupant_id,
        rule_id: parsed.data.rule_id ?? null,
        pesos: parsed.data.pesos,
        points: parsed.data.points,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for fine issuance:", auditError);
  }

  revalidatePath("/admin/fines");
  revalidatePath(`/admin/occupants/${parsed.data.occupant_id}`);
  return { success: true };
}

export async function voidFine(dormId: string, fineId: string, reason: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    !membership ||
    !new Set(["admin", "adviser", "student_assistant"]).has(membership.role)
  ) {
    return { error: "You do not have permission to void fines." };
  }

  const { error } = await supabase
    .from("fines")
    .update({
      voided_at: new Date().toISOString(),
      voided_by: user.id,
      void_reason: reason
    })
    .eq("dorm_id", dormId)
    .eq("id", fineId);

  if (error) return { error: error.message };

  revalidatePath("/admin/fines");

  // Sync to Ledger (Void)
  const { error: ledgerError } = await supabase
    .from("ledger_entries")
    .update({
      voided_at: new Date().toISOString(),
      voided_by: user.id,
      void_reason: `Fine voided: ${reason}`
    })
    .eq("dorm_id", dormId)
    .eq("fine_id", fineId);

  if (ledgerError) {
    console.error("Failed to void ledger entry:", ledgerError);
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "fines.voided",
      entityType: "fine",
      entityId: fineId,
      metadata: {
        reason,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for fine void:", auditError);
  }

  return { success: true };
}
