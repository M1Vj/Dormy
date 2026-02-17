"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logAuditEvent } from "@/lib/audit/log";
import { ensureActiveSemesterId } from "@/lib/semesters";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const reportFineSchema = z.object({
  reported_occupant_id: z.string().uuid(),
  rule_id: z.string().uuid().optional().nullable(),
  details: z.string().min(5, "Provide details about the violation"),
  occurred_at: z.string().min(1, "Specify when the violation happened"),
});

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

  if (parsed.data.reported_occupant_id === submitter.id) {
    return { error: "You cannot report yourself." };
  }

  // Verify reported occupant exists in same dorm
  const { data: reportedOccupant } = await supabase
    .from("occupants")
    .select("id")
    .eq("dorm_id", dormId)
    .eq("id", parsed.data.reported_occupant_id)
    .maybeSingle();

  if (!reportedOccupant) {
    return { error: "Reported occupant not found." };
  }

  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  if ("error" in semesterResult) {
    return { error: semesterResult.error ?? "No active semester." };
  }

  const { data: report, error: insertError } = await supabase
    .from("fine_reports")
    .insert({
      dorm_id: dormId,
      semester_id: semesterResult.semesterId,
      reporter_occupant_id: submitter.id,
      reported_occupant_id: parsed.data.reported_occupant_id,
      rule_id: parsed.data.rule_id ?? null,
      details: parsed.data.details,
      occurred_at: parsed.data.occurred_at,
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

  revalidatePath("/fines/reports");
  revalidatePath("/admin/fines");
  return { success: true };
}

/**
 * SA reviews a fine report: approve or reject with comment
 */
export async function reviewFineReport(
  dormId: string,
  reportId: string,
  action: "approve" | "reject",
  comment: string
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
  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    !membership ||
    !new Set(["admin", "student_assistant"]).has(membership.role)
  ) {
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

  // Update report status
  const { error: updateError } = await supabase
    .from("fine_reports")
    .update({
      status: action === "approve" ? "approved" : "rejected",
      reviewed_by: user.id,
      review_comment: comment || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", reportId);

  if (updateError) {
    return { error: updateError.message };
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

  revalidatePath("/fines/reports");
  revalidatePath("/admin/fines");
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
