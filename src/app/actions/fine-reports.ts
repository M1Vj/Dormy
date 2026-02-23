"use server";

import { revalidatePath } from "next/cache";
import { getActiveRole } from "@/lib/roles-server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";

import { logAuditEvent } from "@/lib/audit/log";
import { optimizeImage } from "@/lib/images";
import { ensureActiveSemesterId } from "@/lib/semesters";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const reportFineSchema = z.object({
  reported_occupant_id: z.string().uuid(),
  rule_id: z.string().uuid().optional().nullable(),
  details: z.string().min(5, "Provide details about the violation"),
  occurred_at: z.string().min(1, "Specify when the violation happened"),
});

const commentSchema = z.object({
  report_id: z.string().uuid(),
  body: z.string().trim().min(1, "Write a comment first.").max(2000),
});

const createAdminClient = () => {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
};

/**
 * Occupant submits a fine report against another occupant
 * Requires SA review before becoming an actual fine
 */
export async function submitFineReport(dormId: string, formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { error: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // Verify submitter is an occupant
  const { data: submitter } = await supabase
    .from("occupants")
    .select("id")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!submitter) {
    return { error: "Only occupants can submit fine reports." };
  }

  const parsed = reportFineSchema.safeParse({
    reported_occupant_id: formData.get("reported_occupant_id"),
    rule_id: formData.get("rule_id") || null,
    details: formData.get("details"),
    occurred_at: formData.get("occurred_at"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid report data." };
  }

  const occurredAtDate = new Date(parsed.data.occurred_at);
  if (Number.isNaN(occurredAtDate.getTime())) {
    return { error: "Invalid violation time. Please choose a valid date and time." };
  }

  const proof = formData.get("proof") as File | null;
  if (!proof || proof.size <= 0) {
    return { error: "Proof photo is required." };
  }

  if (proof.size > 10 * 1024 * 1024) {
    return { error: "Proof photo is too large. Please upload an image under 10MB." };
  }

  if (parsed.data.reported_occupant_id === submitter.id) {
    return { error: "You cannot report yourself." };
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };
  }

  const adminClient = createAdminClient();
  const { data: reportedOccupant, error: reportedError } = await adminClient
    .from("occupants")
    .select("id")
    .eq("dorm_id", dormId)
    .eq("status", "active")
    .eq("id", parsed.data.reported_occupant_id)
    .maybeSingle();

  if (reportedError) {
    return { error: reportedError.message };
  }

  if (!reportedOccupant) {
    return { error: "Reported occupant not found." };
  }

  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  if ("error" in semesterResult) {
    return { error: semesterResult.error ?? "No active semester." };
  }

  const reportId = randomUUID();

  let proofPath: string | null = null;
  try {
    const optimized = await optimizeImage(proof);
    proofPath = `fine-reports/${dormId}/${reportId}/${randomUUID()}.webp`;

    const { error: uploadError } = await supabase.storage
      .from("dormy-uploads")
      .upload(proofPath, optimized.buffer, {
        contentType: optimized.contentType,
        upsert: false,
      });

    if (uploadError) {
      return { error: `Proof upload failed: ${uploadError.message}` };
    }
  } catch (error) {
    console.error("Failed to process proof upload:", error);
    return { error: "Proof upload failed. Please try a different image." };
  }

  const { data: report, error: insertError } = await supabase
    .from("fine_reports")
    .insert({
      id: reportId,
      dorm_id: dormId,
      semester_id: semesterResult.semesterId,
      reporter_occupant_id: submitter.id,
      reported_occupant_id: parsed.data.reported_occupant_id,
      rule_id: parsed.data.rule_id ?? null,
      details: parsed.data.details,
      occurred_at: occurredAtDate.toISOString(),
      proof_storage_path: proofPath,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !report) {
    return { error: insertError?.message ?? "Failed to submit report." };
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "fines.report_submitted",
      entityType: "fine_report",
      entityId: report.id,
      metadata: {
        reporter_occupant_id: submitter.id,
        reported_occupant_id: parsed.data.reported_occupant_id,
        rule_id: parsed.data.rule_id,
      },
    });
  } catch {
    // Audit is best-effort
  }

  const activeRole = await getActiveRole() || "occupant";

  revalidatePath(`/${activeRole}/fines/reports`);
  revalidatePath(`/${activeRole}/fines`);
  return { success: true };
}

/**
 * SA reviews a fine report: approve or reject with comment
 */
export async function reviewFineReport(
  dormId: string,
  reportId: string,
  action: "approve" | "reject",
  comment: string,
  ruleId?: string | null
) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { error: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // Verify SA role
  const { data: memberships } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    ;
  const roles = memberships?.map(m => m.role) ?? [];
  const hasAccess = roles.some(r => new Set(["admin", "student_assistant"]).has(r));

  if (!hasAccess) {
    return { error: "Only Student Assistants can review fine reports." };
  }

  const { data: report } = await supabase
    .from("fine_reports")
    .select("*")
    .eq("dorm_id", dormId)
    .eq("id", reportId)
    .maybeSingle();

  if (!report) {
    return { error: "Report not found." };
  }

  if (report.status !== "pending") {
    return { error: "This report has already been reviewed." };
  }

  if (action === "approve") {
    const resolvedRuleId = (ruleId ?? report.rule_id ?? null) as string | null;
    if (!resolvedRuleId) {
      return { error: "Select a rule before approving this report." };
    }

    const { data: rule, error: ruleError } = await supabase
      .from("fine_rules")
      .select("id, title, default_pesos, default_points, active")
      .eq("dorm_id", dormId)
      .eq("id", resolvedRuleId)
      .maybeSingle();

    if (ruleError) {
      return { error: ruleError.message };
    }

    if (!rule || rule.active === false) {
      return { error: "Selected rule was not found or is inactive." };
    }

    const pesos = Number(rule.default_pesos ?? 0);
    const points = Number(rule.default_points ?? 0);

    const { data: fine, error: fineError } = await supabase
      .from("fines")
      .insert({
        dorm_id: dormId,
        semester_id: report.semester_id,
        occupant_id: report.reported_occupant_id,
        rule_id: resolvedRuleId,
        pesos,
        points,
        note: report.details,
        issued_by: user.id,
        occurred_at: report.occurred_at,
        proof_storage_path: report.proof_storage_path ?? null,
      })
      .select("id")
      .single();

    if (fineError || !fine) {
      return { error: fineError?.message ?? "Failed to create fine." };
    }

    const { error: ledgerError } = await supabase.from("ledger_entries").insert({
      dorm_id: dormId,
      semester_id: report.semester_id,
      ledger: "sa_fines",
      entry_type: "charge",
      occupant_id: report.reported_occupant_id,
      fine_id: fine.id,
      amount_pesos: pesos,
      note: `Fine (peer report): ${rule.title ?? "Violation"}`,
      created_by: user.id,
    });

    if (ledgerError) {
      await supabase.from("fines").delete().eq("dorm_id", dormId).eq("id", fine.id);
      return { error: ledgerError.message };
    }

    const { error: updateError } = await supabase
      .from("fine_reports")
      .update({
        status: "approved",
        reviewed_by: user.id,
        review_comment: comment || null,
        reviewed_at: new Date().toISOString(),
        rule_id: resolvedRuleId,
        fine_id: fine.id,
      })
      .eq("id", reportId);

    if (updateError) {
      return { error: updateError.message };
    }
  } else {
  // Update report status
    const { error: updateError } = await supabase
    .from("fine_reports")
    .update({
      status: "rejected",
      reviewed_by: user.id,
      review_comment: comment || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", reportId);

    if (updateError) {
      return { error: updateError.message };
    }
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: `fines.report_${action}d`,
      entityType: "fine_report",
      entityId: reportId,
      metadata: {
        action,
        comment,
        reported_occupant_id: report.reported_occupant_id,
      },
    });
  } catch {
    // Audit is best-effort
  }

  const activeRole = await getActiveRole() || "occupant";

  revalidatePath(`/${activeRole}/fines/reports`);
  revalidatePath(`/${activeRole}/fines`);
  return { success: true };
}

export async function createFineReportComment(dormId: string, formData: FormData) {
  const parsed = commentSchema.safeParse({
    report_id: formData.get("report_id"),
    body: formData.get("body"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid comment." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { error: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: report, error: reportError } = await supabase
    .from("fine_reports")
    .select("id, dorm_id, semester_id")
    .eq("dorm_id", dormId)
    .eq("id", parsed.data.report_id)
    .maybeSingle();

  if (reportError) {
    return { error: reportError.message };
  }

  if (!report) {
    return { error: "Fine report not found." };
  }

  const { error: insertError } = await supabase.from("fine_report_comments").insert({
    dorm_id: report.dorm_id,
    semester_id: report.semester_id,
    report_id: report.id,
    author_user_id: user.id,
    body: parsed.data.body,
  });

  if (insertError) {
    return { error: insertError.message };
  }

  const activeRole = await getActiveRole() || "occupant";

  revalidatePath(`/${activeRole}/fines/reports/${report.id}`);
  return { success: true };
}

/**
 * Get fine reports visible to the current user
 * SAs see all, occupants see only their own submitted reports
 */
export async function getFineReports(dormId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { error: "Supabase is not configured." };
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

  const isStaff =
    membership &&
    new Set(["admin", "student_assistant"]).has(membership.role);

  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  if ("error" in semesterResult) {
    return { error: semesterResult.error ?? "No active semester." };
  }

  let query = supabase
    .from("fine_reports")
    .select(
      `
      *,
      reporter:occupants!fine_reports_reporter_occupant_id_fkey(full_name),
      reported:occupants!fine_reports_reported_occupant_id_fkey(full_name),
      rule:fine_rules(title, severity)
    `
    )
    .eq("dorm_id", dormId)
    .eq("semester_id", semesterResult.semesterId)
    .order("created_at", { ascending: false });

  // Occupants only see their own submitted reports
  if (!isStaff) {
    const { data: occupant } = await supabase
      .from("occupants")
      .select("id")
      .eq("dorm_id", dormId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!occupant) return { data: [] };
    query = query.eq("reporter_occupant_id", occupant.id);
  }

  const { data, error } = await query;
  if (error) {
    return { error: error.message };
  }

  return { data: data ?? [] };
}
