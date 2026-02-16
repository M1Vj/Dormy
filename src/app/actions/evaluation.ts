"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logAuditEvent } from "@/lib/audit/log";
import { ensureActiveSemesterId } from "@/lib/semesters";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EvaluationSubmission, EvaluationSummary } from "@/lib/types/evaluation";

type SubmitEvaluationPayload = {
  templateId: string;
  raterId: string;
  rateeId: string;
  scores: Record<string, number>;
};

type EvaluationCycleInput = {
  school_year: string;
  semester: number;
  label?: string | null;
  counts_for_retention?: boolean;
  is_active?: boolean;
};

type EvaluationTemplateInput = {
  cycle_id: string;
  name: string;
  status: "draft" | "active" | "archived";
  rater_group_weights?: Record<string, number>;
};

type EvaluationMetricInput = {
  template_id: string;
  name: string;
  description?: string | null;
  weight_pct?: number;
  scale_min?: number;
  scale_max?: number;
  sort_order?: number;
};

const booleanish = z.preprocess((value) => {
  if (value === null || value === undefined) return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off", ""].includes(normalized)) return false;
  }
  return value;
}, z.boolean());

const weightSchema = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}, z.record(z.string(), z.any()));

const cycleSchema = z.object({
  school_year: z.string().min(1),
  semester: z.coerce.number().int().min(1),
  label: z.string().optional().nullable(),
  counts_for_retention: booleanish.optional(),
  is_active: booleanish.optional(),
});

const templateSchema = z.object({
  cycle_id: z.string().uuid(),
  name: z.string().min(1),
  status: z.enum(["draft", "active", "archived"]),
  rater_group_weights: weightSchema.optional(),
});

const metricSchema = z.object({
  template_id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  weight_pct: z.coerce.number().min(0).max(100),
  scale_min: z.coerce.number().int().min(1),
  scale_max: z.coerce.number().int().min(1),
  sort_order: z.coerce.number().int().min(0),
});

const submitEvaluationSchema = z.object({
  templateId: z.string().uuid(),
  raterId: z.string().uuid(),
  rateeId: z.string().uuid(),
  scores: z.record(z.string(), z.number()),
});

const normalizeSubmissionPayload = (
  payload: SubmitEvaluationPayload | EvaluationSubmission
): SubmitEvaluationPayload => {
  if ("template_id" in payload) {
    return {
      templateId: payload.template_id,
      raterId: payload.rater_occupant_id,
      rateeId: payload.ratee_occupant_id,
      scores: payload.scores,
    };
  }
  return payload;
};

const stripUndefined = <T extends Record<string, unknown>>(value: T) => {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  ) as T;
};

// --- Summary ---

export async function getEvaluationSummary(cycleId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }
  const { data, error } = await supabase.rpc("get_evaluation_summary", {
    p_cycle_id: cycleId,
  });

  if (error) {
    console.error("Error fetching evaluation summary:", error);
    return [];
  }

  return (data ?? []) as EvaluationSummary[];
}

// --- Submissions ---

export async function submitEvaluation(
  payload: SubmitEvaluationPayload | EvaluationSubmission
) {
  const normalized = normalizeSubmissionPayload(payload);
  const parsed = submitEvaluationSchema.safeParse(normalized);
  if (!parsed.success) {
    return { error: "Invalid evaluation submission." };
  }

  if (parsed.data.raterId === parsed.data.rateeId) {
    return { error: "You cannot evaluate yourself." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: "Unauthorized" };

  const { data: rater, error: raterError } = await supabase
    .from("occupants")
    .select("id, dorm_id, user_id")
    .eq("id", parsed.data.raterId)
    .single();

  if (raterError || !rater) {
    return { error: "Rater not found." };
  }

  if (rater.user_id !== auth.user.id) {
    return { error: "Rater mismatch." };
  }

  const { data: ratee, error: rateeError } = await supabase
    .from("occupants")
    .select("id, dorm_id")
    .eq("id", parsed.data.rateeId)
    .single();

  if (rateeError || !ratee) {
    return { error: "Ratee not found." };
  }

  const { data: template, error: templateError } = await supabase
    .from("evaluation_templates")
    .select("id, dorm_id")
    .eq("id", parsed.data.templateId)
    .single();

  if (templateError || !template) {
    return { error: "Template not found." };
  }

  if (template.dorm_id !== rater.dorm_id || ratee.dorm_id !== rater.dorm_id) {
    return { error: "Evaluation must be within the same dorm." };
  }

  const scoreEntries = Object.entries(parsed.data.scores).filter(
    ([, score]) => Number.isFinite(score)
  );

  if (scoreEntries.length === 0) {
    return { error: "Provide at least one score." };
  }

  const { data: submission, error: submissionError } = await supabase
    .from("evaluation_submissions")
    .insert({
      dorm_id: rater.dorm_id,
      template_id: parsed.data.templateId,
      rater_occupant_id: parsed.data.raterId,
      ratee_occupant_id: parsed.data.rateeId,
      submitted_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (submissionError || !submission) {
    return {
      error: submissionError?.message ?? "Failed to submit evaluation.",
    };
  }

  const metricScores = scoreEntries.map(([metricId, score]) => ({
    dorm_id: rater.dorm_id,
    submission_id: submission.id,
    metric_id: metricId,
    score,
  }));

  const { error: scoresError } = await supabase
    .from("evaluation_metric_scores")
    .insert(metricScores);

  if (scoresError) {
    await supabase.from("evaluation_submissions").delete().eq("id", submission.id);
    return { error: scoresError.message };
  }

  try {
    await logAuditEvent({
      dormId: rater.dorm_id,
      actorUserId: auth.user.id,
      action: "evaluation.submission_created",
      entityType: "evaluation_submission",
      entityId: submission.id,
      metadata: {
        template_id: parsed.data.templateId,
        rater_occupant_id: parsed.data.raterId,
        ratee_occupant_id: parsed.data.rateeId,
        metric_scores_count: metricScores.length,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for evaluation submission:", auditError);
  }

  revalidatePath("/evaluation");
  revalidatePath("/admin/evaluation");
  return { success: true };
}

// --- Evaluation Cycles ---

export async function getEvaluationCycles(dormId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  if ("error" in semesterResult) {
    console.error("Failed to resolve active semester for evaluation cycles:", semesterResult.error);
    return [];
  }

  const { data, error } = await supabase
    .from("evaluation_cycles")
    .select("*")
    .eq("dorm_id", dormId)
    .eq("semester_id", semesterResult.semesterId)
    .order("is_active", { ascending: false })
    .order("school_year", { ascending: false })
    .order("semester", { ascending: false });

  if (error) {
    console.error("Error fetching evaluation cycles:", error);
    return [];
  }
  return data ?? [];
}

export async function getEvaluationCycle(dormId: string, cycleId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }
  const { data, error } = await supabase
    .from("evaluation_cycles")
    .select("*")
    .eq("dorm_id", dormId)
    .eq("id", cycleId)
    .single();

  if (error) {
    console.error("Error fetching evaluation cycle:", error);
    return null;
  }
  return data;
}

export async function createEvaluationCycle(
  dormId: string,
  input: EvaluationCycleInput
) {
  const parsed = cycleSchema.safeParse({
    ...input,
    label: input.label === "" ? null : input.label ?? null,
    counts_for_retention: input.counts_for_retention ?? false,
    is_active: input.is_active ?? false,
  });

  if (!parsed.success) {
    return { error: "Invalid evaluation cycle data." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: "Unauthorized" };

  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  if ("error" in semesterResult) {
    return { error: semesterResult.error ?? "Failed to resolve active semester." };
  }

  const { data: cycle, error } = await supabase
    .from("evaluation_cycles")
    .insert({
      dorm_id: dormId,
      semester_id: semesterResult.semesterId,
      school_year: parsed.data.school_year,
      semester: parsed.data.semester,
      label: parsed.data.label,
      counts_for_retention: parsed.data.counts_for_retention ?? false,
      is_active: parsed.data.is_active ?? false,
    })
    .select("id")
    .single();

  if (error || !cycle) {
    return { error: error?.message ?? "Failed to create evaluation cycle." };
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: auth.user.id,
      action: "evaluation.cycle_created",
      entityType: "evaluation_cycle",
      entityId: cycle.id,
      metadata: {
        semester_id: semesterResult.semesterId,
        school_year: parsed.data.school_year,
        semester: parsed.data.semester,
        label: parsed.data.label,
        counts_for_retention: parsed.data.counts_for_retention ?? false,
        is_active: parsed.data.is_active ?? false,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for evaluation cycle creation:", auditError);
  }

  revalidatePath("/admin/evaluation");
  return { success: true, id: cycle.id };
}

export async function updateEvaluationCycle(
  dormId: string,
  cycleId: string,
  input: Partial<EvaluationCycleInput>
) {
  const parsed = cycleSchema.partial().safeParse({
    ...input,
    label: input.label === "" ? null : input.label,
  });
  if (!parsed.success) {
    return { error: "Invalid evaluation cycle data." };
  }

  const updates = stripUndefined(parsed.data);
  if (!Object.keys(updates).length) {
    return { error: "No updates provided." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: "Unauthorized" };

  const { data: currentCycle, error: currentCycleError } = await supabase
    .from("evaluation_cycles")
    .select("id, school_year, semester, label, counts_for_retention, is_active")
    .eq("dorm_id", dormId)
    .eq("id", cycleId)
    .maybeSingle();

  if (currentCycleError || !currentCycle) {
    return { error: currentCycleError?.message ?? "Evaluation cycle not found." };
  }

  const { error } = await supabase
    .from("evaluation_cycles")
    .update(updates)
    .eq("dorm_id", dormId)
    .eq("id", cycleId);

  if (error) return { error: error.message };

  try {
    await logAuditEvent({
      dormId,
      actorUserId: auth.user.id,
      action: "evaluation.cycle_updated",
      entityType: "evaluation_cycle",
      entityId: cycleId,
      metadata: {
        previous: currentCycle,
        updates,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for evaluation cycle update:", auditError);
  }

  revalidatePath("/admin/evaluation");
  revalidatePath(`/admin/evaluation/${cycleId}`);
  return { success: true };
}

export async function deleteEvaluationCycle(dormId: string, cycleId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: "Unauthorized" };

  const { data: cycle, error: cycleError } = await supabase
    .from("evaluation_cycles")
    .select("id, school_year, semester, label, counts_for_retention, is_active")
    .eq("dorm_id", dormId)
    .eq("id", cycleId)
    .maybeSingle();

  if (cycleError || !cycle) {
    return { error: cycleError?.message ?? "Evaluation cycle not found." };
  }

  const { error } = await supabase
    .from("evaluation_cycles")
    .delete()
    .eq("dorm_id", dormId)
    .eq("id", cycleId);

  if (error) return { error: error.message };

  try {
    await logAuditEvent({
      dormId,
      actorUserId: auth.user.id,
      action: "evaluation.cycle_deleted",
      entityType: "evaluation_cycle",
      entityId: cycleId,
      metadata: cycle,
    });
  } catch (auditError) {
    console.error("Failed to write audit event for evaluation cycle deletion:", auditError);
  }

  revalidatePath("/admin/evaluation");
  return { success: true };
}

// --- Evaluation Templates ---

export async function getEvaluationTemplates(
  dormId: string,
  cycleId?: string
) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }
  let query = supabase
    .from("evaluation_templates")
    .select("*")
    .eq("dorm_id", dormId)
    .order("created_at", { ascending: false });

  if (cycleId) {
    query = query.eq("cycle_id", cycleId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching evaluation templates:", error);
    return [];
  }
  return data ?? [];
}

export async function getEvaluationTemplate(dormId: string, templateId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }
  const { data, error } = await supabase
    .from("evaluation_templates")
    .select("*")
    .eq("dorm_id", dormId)
    .eq("id", templateId)
    .single();

  if (error) {
    console.error("Error fetching evaluation template:", error);
    return null;
  }
  return data;
}

export async function createEvaluationTemplate(
  dormId: string,
  input: EvaluationTemplateInput
) {
  const parsed = templateSchema.safeParse({
    ...input,
    rater_group_weights: input.rater_group_weights ?? {},
  });

  if (!parsed.success) {
    return { error: "Invalid evaluation template data." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: "Unauthorized" };

  const { data: template, error } = await supabase
    .from("evaluation_templates")
    .insert({
      dorm_id: dormId,
      cycle_id: parsed.data.cycle_id,
      name: parsed.data.name,
      status: parsed.data.status,
      rater_group_weights: parsed.data.rater_group_weights ?? {},
      created_by: auth.user.id,
    })
    .select("id, cycle_id")
    .single();

  if (error || !template) {
    return { error: error?.message ?? "Failed to create evaluation template." };
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: auth.user.id,
      action: "evaluation.template_created",
      entityType: "evaluation_template",
      entityId: template.id,
      metadata: {
        cycle_id: template.cycle_id,
        name: parsed.data.name,
        status: parsed.data.status,
        rater_group_weights: parsed.data.rater_group_weights ?? {},
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for evaluation template creation:", auditError);
  }

  revalidatePath("/admin/evaluation");
  revalidatePath(`/admin/evaluation/${template.cycle_id}`);
  return { success: true, id: template.id };
}

export async function updateTemplate(
  dormId: string,
  templateId: string,
  input: Partial<EvaluationTemplateInput>
) {
  const parsed = templateSchema.partial().safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid evaluation template data." };
  }

  const updates = stripUndefined(parsed.data);
  if (!Object.keys(updates).length) {
    return { error: "No updates provided." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: "Unauthorized" };

  const { data: updated, error } = await supabase
    .from("evaluation_templates")
    .update(updates)
    .eq("dorm_id", dormId)
    .eq("id", templateId)
    .select("cycle_id")
    .single();

  if (error || !updated) {
    return { error: error?.message ?? "Failed to update evaluation template." };
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: auth.user.id,
      action: "evaluation.template_updated",
      entityType: "evaluation_template",
      entityId: templateId,
      metadata: updates,
    });
  } catch (auditError) {
    console.error("Failed to write audit event for evaluation template update:", auditError);
  }

  revalidatePath("/admin/evaluation");
  revalidatePath(`/admin/evaluation/${updated.cycle_id}`);
  return { success: true };
}

export async function deleteEvaluationTemplate(
  dormId: string,
  templateId: string,
  cycleId?: string
) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("evaluation_templates")
    .delete()
    .eq("dorm_id", dormId)
    .eq("id", templateId);

  if (error) return { error: error.message };

  try {
    await logAuditEvent({
      dormId,
      actorUserId: auth.user.id,
      action: "evaluation.template_deleted",
      entityType: "evaluation_template",
      entityId: templateId,
      metadata: {
        cycle_id: cycleId ?? null,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for evaluation template deletion:", auditError);
  }

  revalidatePath("/admin/evaluation");
  if (cycleId) {
    revalidatePath(`/admin/evaluation/${cycleId}`);
  }
  return { success: true };
}

// --- Evaluation Metrics ---

export async function getEvaluationMetrics(
  dormId: string,
  templateId?: string
) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }
  let query = supabase
    .from("evaluation_metrics")
    .select("*")
    .eq("dorm_id", dormId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (templateId) {
    query = query.eq("template_id", templateId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching evaluation metrics:", error);
    return [];
  }
  return data ?? [];
}

export async function createEvaluationMetric(
  dormId: string,
  input: EvaluationMetricInput,
  cycleId?: string
) {
  const parsed = metricSchema.safeParse({
    ...input,
    description: input.description ?? null,
    weight_pct: input.weight_pct ?? 0,
    scale_min: input.scale_min ?? 1,
    scale_max: input.scale_max ?? 5,
    sort_order: input.sort_order ?? 0,
  });

  if (!parsed.success) {
    return { error: "Invalid evaluation metric data." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: "Unauthorized" };

  const { data: metric, error } = await supabase.from("evaluation_metrics").insert({
    dorm_id: dormId,
    template_id: parsed.data.template_id,
    name: parsed.data.name,
    description: parsed.data.description,
    weight_pct: parsed.data.weight_pct,
    scale_min: parsed.data.scale_min,
    scale_max: parsed.data.scale_max,
    sort_order: parsed.data.sort_order,
  })
    .select("id")
    .single();

  if (error || !metric) {
    return { error: error?.message ?? "Failed to create evaluation metric." };
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: auth.user.id,
      action: "evaluation.metric_created",
      entityType: "evaluation_metric",
      entityId: metric.id,
      metadata: parsed.data,
    });
  } catch (auditError) {
    console.error("Failed to write audit event for evaluation metric creation:", auditError);
  }

  if (cycleId) {
    revalidatePath(`/admin/evaluation/${cycleId}`);
  }
  revalidatePath("/admin/evaluation");
  return { success: true };
}

export async function updateEvaluationMetric(
  dormId: string,
  metricId: string,
  input: Partial<EvaluationMetricInput>,
  cycleId?: string
) {
  const parsed = metricSchema.partial().safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid evaluation metric data." };
  }

  const updates = stripUndefined(parsed.data);
  if (!Object.keys(updates).length) {
    return { error: "No updates provided." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: "Unauthorized" };

  const { data: currentMetric, error: currentMetricError } = await supabase
    .from("evaluation_metrics")
    .select("id, template_id, name, description, weight_pct, scale_min, scale_max, sort_order")
    .eq("dorm_id", dormId)
    .eq("id", metricId)
    .maybeSingle();

  if (currentMetricError || !currentMetric) {
    return { error: currentMetricError?.message ?? "Evaluation metric not found." };
  }

  const { error } = await supabase
    .from("evaluation_metrics")
    .update(updates)
    .eq("dorm_id", dormId)
    .eq("id", metricId);

  if (error) return { error: error.message };

  try {
    await logAuditEvent({
      dormId,
      actorUserId: auth.user.id,
      action: "evaluation.metric_updated",
      entityType: "evaluation_metric",
      entityId: metricId,
      metadata: {
        previous: currentMetric,
        updates,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for evaluation metric update:", auditError);
  }

  if (cycleId) {
    revalidatePath(`/admin/evaluation/${cycleId}`);
  }
  revalidatePath("/admin/evaluation");
  return { success: true };
}

export async function deleteEvaluationMetric(
  dormId: string,
  metricId: string,
  cycleId?: string
) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: "Unauthorized" };

  const { data: metric, error: metricError } = await supabase
    .from("evaluation_metrics")
    .select("id, template_id, name, description, weight_pct, scale_min, scale_max, sort_order")
    .eq("dorm_id", dormId)
    .eq("id", metricId)
    .maybeSingle();

  if (metricError || !metric) {
    return { error: metricError?.message ?? "Evaluation metric not found." };
  }

  const { error } = await supabase
    .from("evaluation_metrics")
    .delete()
    .eq("dorm_id", dormId)
    .eq("id", metricId);

  if (error) return { error: error.message };

  try {
    await logAuditEvent({
      dormId,
      actorUserId: auth.user.id,
      action: "evaluation.metric_deleted",
      entityType: "evaluation_metric",
      entityId: metricId,
      metadata: metric,
    });
  } catch (auditError) {
    console.error("Failed to write audit event for evaluation metric deletion:", auditError);
  }

  if (cycleId) {
    revalidatePath(`/admin/evaluation/${cycleId}`);
  }
  revalidatePath("/admin/evaluation");
  return { success: true };
}

// --- Occupant Listing for Raters ---

export async function getOccupantsToRate(dormId: string, currentUserId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  if ("error" in semesterResult) {
    return [];
  }

  // 1. Get occupant profile for current user
  const { data: self } = await supabase
    .from("occupants")
    .select("id")
    .eq("dorm_id", dormId)
    .eq("user_id", currentUserId)
    .single();

  if (!self) return [];

  // 2. Get active cycle and template
  const { data: cycle } = await supabase
    .from("evaluation_cycles")
    .select("id")
    .eq("dorm_id", dormId)
    .eq("semester_id", semesterResult.semesterId)
    .eq("is_active", true)
    .single();

  if (!cycle) return [];

  const { data: template } = await supabase
    .from("evaluation_templates")
    .select("id")
    .eq("cycle_id", cycle.id)
    .eq("status", "active")
    .single();

  if (!template) return [];

  // 3. Get all other occupants
  const { data: occupants } = await supabase
    .from("occupants")
    .select("id, full_name, classification")
    .eq("dorm_id", dormId)
    .eq("status", "active")
    .neq("id", self.id)
    .order("full_name");

  if (!occupants) return [];

  // 4. Get existing submissions by this user in this template
  const { data: submissions } = await supabase
    .from("evaluation_submissions")
    .select("ratee_occupant_id")
    .eq("template_id", template.id)
    .eq("rater_occupant_id", self.id);

  const ratedIds = new Set(submissions?.map(s => s.ratee_occupant_id) || []);

  return occupants.map(o => ({
    ...o,
    is_rated: ratedIds.has(o.id),
    template_id: template.id,
    rater_id: self.id
  }));
}
