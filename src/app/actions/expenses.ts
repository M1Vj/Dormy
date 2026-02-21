"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { z } from "zod";

import { logAuditEvent } from "@/lib/audit/log";
import { optimizeImage } from "@/lib/images";
import { ensureActiveSemesterId } from "@/lib/semesters";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const submitExpenseSchema = z.object({
  title: z.string().min(2, "Title is required"),
  description: z.string().optional(),
  amount_pesos: z.coerce.number().positive("Amount must be positive"),
  purchased_at: z.string().min(1, "Purchase date is required"),
  category: z.enum(["maintenance_fee", "contributions"]),
});

/**
 * Officer submits an expense with optional receipt photo
 */
export async function submitExpense(dormId: string, formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Supabase is not configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const committeeIdInput = String(formData.get("committee_id") ?? "").trim();
  const committeeId = committeeIdInput ? committeeIdInput : null;

  // Verify officer/treasurer role
  const { data: memberships } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    ;
  const roles = memberships?.map(m => m.role) ?? [];
  const hasAccess = roles.some(r => new Set(["admin", "treasurer"]).has(r));

  const staffSubmitRoles = new Set(["admin", "treasurer", "officer", "adviser"]);
  const isStaffSubmitter = Boolean(memberships && roles.some(r => staffSubmitRoles.has(r)));

  if (!memberships || memberships.length === 0) {
    return { error: "No dorm membership found for this account." };
  }

  if (!committeeId && !isStaffSubmitter) {
    return { error: "Only officers and treasurer can submit dorm-wide expenses." };
  }

  if (committeeId) {
    const parsedCommitteeId = z.string().uuid("Invalid committee id.").safeParse(committeeId);
    if (!parsedCommitteeId.success) {
      return { error: parsedCommitteeId.error.issues[0]?.message ?? "Invalid committee id." };
    }

    const { data: committee, error: committeeError } = await supabase
      .from("committees")
      .select("id, dorm_id")
      .eq("id", parsedCommitteeId.data)
      .maybeSingle();

    if (committeeError) {
      return { error: committeeError.message };
    }

    if (!committee || committee.dorm_id !== dormId) {
      return { error: "Committee not found for the active dorm." };
    }

    const { data: committeeMembership, error: committeeMembershipError } = await supabase
      .from("committee_members")
      .select("role")
      .eq("committee_id", parsedCommitteeId.data)
      .eq("user_id", user.id)
      .maybeSingle();

    if (committeeMembershipError) {
      return { error: committeeMembershipError.message };
    }

    const isCommitteeLead = Boolean(
      committeeMembership && new Set(["head", "co-head"]).has(committeeMembership.role)
    );

    if (!isStaffSubmitter && !isCommitteeLead) {
      return { error: "Only committee heads/co-heads can submit committee expenses." };
    }
  }

  const parsed = submitExpenseSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    amount_pesos: formData.get("amount_pesos"),
    purchased_at: formData.get("purchased_at"),
    category: formData.get("category"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid data." };
  }

  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  if ("error" in semesterResult) {
    return { error: semesterResult.error ?? "No active semester." };
  }

  // Handle receipt upload
  let receiptPath: string | null = null;
  const receipt = formData.get("receipt") as File | null;
  if (receipt && receipt.size > 0) {
    const { buffer, contentType } = await optimizeImage(receipt);
    const scopeFolder = committeeId ? `committee-${committeeId}` : "dorm";
    const filename = `expenses/${dormId}/${scopeFolder}/${Date.now()}-${randomUUID()}.webp`;
    const { error: uploadError } = await supabase.storage
      .from("dormy-uploads")
      .upload(filename, buffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      return { error: `Receipt upload failed: ${uploadError.message}` };
    }
    receiptPath = filename;
  }

  const { data: expense, error: insertError } = await supabase
    .from("expenses")
    .insert({
      dorm_id: dormId,
      semester_id: semesterResult.semesterId,
      committee_id: committeeId,
      submitted_by: user.id,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      amount_pesos: parsed.data.amount_pesos,
      purchased_at: parsed.data.purchased_at,
      receipt_storage_path: receiptPath,
      category: parsed.data.category,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !expense) {
    return { error: insertError?.message ?? "Failed to submit expense." };
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "expenses.submitted",
      entityType: "expense",
      entityId: expense.id,
      metadata: {
        title: parsed.data.title,
        amount: parsed.data.amount_pesos,
      },
    });
  } catch {
    // best-effort
  }

  revalidatePath("/admin/finance/expenses");
  if (committeeId) {
    revalidatePath(`/committees/${committeeId}`);
  }
  return { success: true };
}

/**
 * Treasurer reviews an expense: approve or reject with optional comment
 */
export async function reviewExpense(
  dormId: string,
  expenseId: string,
  action: "approve" | "reject",
  comment?: string
) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Supabase is not configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: memberships } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);
  const roles = memberships?.map(m => m.role) ?? [];

  if (!roles.some(r => new Set(["admin", "treasurer"]).has(r))) {
    return { error: "Only treasurer or admin can approve expenses." };
  }

  const { data: expense } = await supabase
    .from("expenses")
    .select("*")
    .eq("dorm_id", dormId)
    .eq("id", expenseId)
    .maybeSingle();

  if (!expense) return { error: "Expense not found." };
  if (expense.status !== "pending") {
    return { error: "This expense has already been reviewed." };
  }

  const { error: updateError } = await supabase
    .from("expenses")
    .update({
      status: action === "approve" ? "approved" : "rejected",
      approved_by: user.id,
      approval_comment: comment ?? null,
      approved_at: new Date().toISOString(),
    })
    .eq("id", expenseId);

  if (updateError) return { error: updateError.message };

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: `expenses.${action}d`,
      entityType: "expense",
      entityId: expenseId,
      metadata: {
        action,
        comment,
        title: expense.title,
        amount: expense.amount_pesos,
      },
    });
  } catch {
    // best-effort
  }

  revalidatePath("/admin/finance/expenses");
  if (expense.committee_id) {
    revalidatePath(`/committees/${expense.committee_id}`);
  }
  return { success: true };
}

/**
 * Get expenses for a dorm with optional status filter
 */
export async function getExpenses(
  dormId: string,
  opts: { status?: string; category?: string } = {}
) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Supabase is not configured." };

  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  if ("error" in semesterResult) {
    return { error: semesterResult.error ?? "No active semester." };
  }

  let query = supabase
    .from("expenses")
    .select("*")
    .eq("dorm_id", dormId)
    .eq("semester_id", semesterResult.semesterId)
    .order("created_at", { ascending: false });

  if (opts.status && opts.status !== "all") {
    query = query.eq("status", opts.status);
  }

  if (opts.category && opts.category !== "all") {
    query = query.eq("category", opts.category);
  }

  const { data, error } = await query;
  if (error) return { error: error.message };
  return { data: data ?? [] };
}
