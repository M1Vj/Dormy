"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getActiveRole } from "@/lib/roles-server";
import { z } from "zod";

import { getActiveDormId } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DormRole } from "@/lib/types/events";
import type { AiConceptRecord, AdminOverviewInsights, CleaningFinesInsights, EventConceptDraft, FinanceInsights, MaintenanceInsights } from "@/lib/types/ai";

const AI_ALLOWED_ROLES: DormRole[] = [
  "admin",
  "officer",
  "student_assistant",
  "treasurer",
  "adviser",
];

const eventConceptSchema = z.object({
  title: z.string().trim().min(3).max(140),
  goals: z.array(z.string().trim().min(1).max(300)).max(20),
  timeline: z.array(z.string().trim().min(1).max(300)).max(40),
  budget_items: z.array(z.string().trim().min(1).max(300)).max(40),
  tasks: z.array(z.string().trim().min(1).max(300)).max(60),
  team_hints: z.array(z.string().trim().min(1).max(200)).max(40),
  scoring_hints: z.array(z.string().trim().min(1).max(200)).max(40),
  notes: z.string().trim().max(3000),
});

const ROLE_PROMPTS: Record<DormRole, {
  system: string;
  suggestions: string[];
  pageTitle: string;
  pageDescription: string;
}> = {
  admin: {
    system: [
      "You are a Management AI for Dormy — the dormitory management system for VSU Molave Men's Hall.",
      "Focus on overall dormitory governance, policy enforcement, and strategic planning.",
      "You can access: evaluation results, dorm-wide event data, occupant rosters, finance insights (read-only), and audit logs.",
      "Help review evaluations, manage dorm-wide initiatives, and analyze administrative data.",
      "Provide high-level summaries and strategic recommendations.",
    ].join(" "),
    suggestions: [
      "Summarize the overall dorm health: occupant count, open fines, outstanding balances, and upcoming events.",
      "Review the latest evaluation cycle results and flag occupants needing attention.",
      "Draft a memo for staff regarding upcoming semester transition tasks.",
      "Analyze dorm-wide event participation rates and suggest improvements.",
      "Identify policy gaps based on recent fine patterns and suggest new rules.",
    ],
    pageTitle: "Admin AI Assistant",
    pageDescription: "Strategic oversight, policy drafting, and dorm-wide analytics.",
  },
  adviser: {
    system: [
      "You are an Adviser AI for Dormy — the dormitory management system for VSU Molave Men's Hall.",
      "Focus on maintenance oversight, clearance workflows, and student welfare.",
      "You can access: maintenance fee ledger, occupant clearance status, evaluation feedback, and finance insights (read-only).",
      "Help review maintenance fees, manage clearance status, and provide guidance on dorm operations.",
      "Your tone should be supportive yet firm on compliance.",
    ].join(" "),
    suggestions: [
      "Summarize the current maintenance fee collection status and identify who hasn't paid.",
      "List occupants who are pending clearance for this semester.",
      "Draft a maintenance announcement for upcoming facility repairs or inspections.",
      "Review student evaluation feedback and suggest welfare initiatives.",
      "Draft a guidance notice for occupants with repeated rule violations.",
    ],
    pageTitle: "Adviser AI Assistant",
    pageDescription: "Maintenance oversight, clearance workflows, and student welfare guidance.",
  },
  treasurer: {
    system: [
      "You are a Treasurer AI for Dormy — the dormitory management system for VSU Molave Men's Hall.",
      "Focus on financial analysis, expense tracking, contribution collection, and budget planning.",
      "You have access to: ledger entries, contribution batches, expense records, payment statuses, and read-only finance insights.",
      "When organizing event concepts, pay special attention to budget items, financial feasibility, and collection strategies.",
      "Help analyze expenses, identify overdue contributions, and draft financial reports.",
    ].join(" "),
    suggestions: [
      "Analyze outstanding balances and identify the top occupants with overdue contributions.",
      "Summarize collection rates for this semester's event contributions.",
      "Draft a contribution reminder message for occupants with pending payments.",
      "Review recent expenses and suggest budget optimizations for upcoming events.",
      "Draft a financial summary report for the current semester.",
    ],
    pageTitle: "Treasurer AI Assistant",
    pageDescription: "Financial analysis, expense tracking, and contribution management.",
  },
  student_assistant: {
    system: [
      "You are a Student Assistant AI for Dormy — the dormitory management system for VSU Molave Men's Hall.",
      "Focus on dormitory operations: cleaning schedules, fine enforcement, occupant management, and room assignments.",
      "You can access: cleaning schedules & assignments, fine reports & rules, occupant roster, and room data.",
      "Help draft announcements for cleaning duties, manage fine reports, and maintain order in the dorm.",
      "Be practical and direct in your communication.",
    ].join(" "),
    suggestions: [
      "Draft a cleaning announcement for this week's general cleaning schedule.",
      "Summarize unresolved fine reports and suggest follow-up actions.",
      "Create a cleaning rotation plan for next week with level-based assignments.",
      "Draft a notice about noise violations and quiet hour enforcement.",
      "List occupants with multiple outstanding fines for review.",
    ],
    pageTitle: "SA AI Assistant",
    pageDescription: "Cleaning schedules, fine management, and occupant operations.",
  },
  officer: {
    system: [
      "You are an Event Officer AI for Dormy — the dormitory management system for VSU Molave Men's Hall.",
      "Focus on event planning, competition management, committee coordination, and student engagement.",
      "You can access: events list, competition data, committee info, and event concepts.",
      "Help turn raw ideas into exciting event concepts with clear goals, timelines, and scoring systems.",
      "Be creative and encouraging while keeping plans realistic.",
    ].join(" "),
    suggestions: [
      "Brainstorm ideas for a month-long inter-level sports fest competition.",
      "Design a scoring system and criteria for an upcoming talent show.",
      "Create a detailed event timeline for the dorm anniversary celebration.",
      "Draft an event proposal with goals, budget, and team assignments.",
      "Plan a committee meeting agenda for the next social event.",
    ],
    pageTitle: "Officer AI Assistant",
    pageDescription: "Event planning, competition design, and student engagement.",
  },
  occupant: {
    system: [
      "You are a Dormitory AI for Dormy — the dormitory management system for VSU Molave Men's Hall.",
      "Help occupants with general inquiries about events, payments, and dorm life.",
      "You can see: upcoming events and your own balance/clearance status.",
      "Be friendly and helpful.",
    ].join(" "),
    suggestions: [
      "What events are coming up this month?",
      "How do I check my outstanding balance and fines?",
      "Who is my assigned room assistant?",
      "How do I request a room transfer?",
    ],
    pageTitle: "Dorm AI Assistant",
    pageDescription: "Get answers about events, payments, and dorm life.",
  },
};

const saveConceptSchema = z.object({
  mode: z.enum(["draft_event", "attach_event"]),
  event_id: z.string().uuid().optional(),
  raw_text: z.string().trim().min(3).max(6000),
  structured: eventConceptSchema,
});

type MembershipRow = {
  dorm_id: string;
  role: DormRole;
};

type AiContext = {
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
  userId: string;
  dormId: string;
  role: DormRole;
};

function normalizeLines(input: string) {
  return input
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
    .filter(Boolean);
}

function normalizeConcept(input: Partial<EventConceptDraft>): EventConceptDraft {
  const normalizeList = (list: unknown) =>
    Array.isArray(list)
      ? list.map((item) => String(item).trim()).filter(Boolean)
      : [];

  const fallbackTitle = String(input.title ?? "").trim() || "Untitled Event Concept";

  return {
    title: fallbackTitle.slice(0, 140),
    goals: normalizeList(input.goals),
    timeline: normalizeList(input.timeline),
    budget_items: normalizeList(input.budget_items),
    tasks: normalizeList(input.tasks),
    team_hints: normalizeList(input.team_hints),
    scoring_hints: normalizeList(input.scoring_hints),
    notes: String(input.notes ?? "").trim().slice(0, 3000),
  };
}

function fallbackConcept(rawText: string): EventConceptDraft {
  const lines = normalizeLines(rawText);
  const titleLine = lines[0] ?? rawText.slice(0, 80);

  return {
    title: titleLine.slice(0, 140) || "Untitled Event Concept",
    goals: lines.slice(1, 4),
    timeline: lines.slice(4, 8),
    budget_items: [],
    tasks: lines.slice(8, 14),
    team_hints: [],
    scoring_hints: [],
    notes: rawText.slice(0, 3000),
  };
}

function sanitizeRawInput(raw: string) {
  const normalized = raw.replace(/\u0000/g, "").trim();
  if (normalized.length < 8) {
    return { error: "Provide more context so AI can organize your idea." } as const;
  }

  if (normalized.length > 6000) {
    return { error: "Input is too long. Keep it under 6000 characters." } as const;
  }

  const forbiddenPatterns = [
    /sk-[a-z0-9]{20,}/i,
    /AIza[0-9A-Za-z_-]{35}/,
    /BEGIN (RSA|EC|OPENSSH) PRIVATE KEY/,
  ];
  if (forbiddenPatterns.some((pattern) => pattern.test(normalized))) {
    return { error: "Input appears to include sensitive secrets. Remove them and try again." } as const;
  }

  return { value: normalized } as const;
}

function summarizeConceptForLog(concept: EventConceptDraft) {
  return {
    title: concept.title,
    goals_count: concept.goals.length,
    timeline_count: concept.timeline.length,
    budget_items_count: concept.budget_items.length,
    tasks_count: concept.tasks.length,
    team_hints_count: concept.team_hints.length,
    scoring_hints_count: concept.scoring_hints.length,
  };
}

async function insertAudit(
  context: AiContext,
  action: string,
  metadata: Record<string, unknown>
) {
  await context.supabase.from("audit_events").insert({
    dorm_id: context.dormId,
    actor_user_id: context.userId,
    action,
    entity_type: "ai",
    metadata,
  });
}

async function getAiContext() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { error: "Supabase is not configured for this environment." } as const;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized" } as const;
  }

  const { data: memberships } = await supabase
    .from("dorm_memberships")
    .select("dorm_id, role")
    .eq("user_id", user.id);

  if (!memberships?.length) {
    return { error: "No dorm membership found for this account." } as const;
  }

  const activeDormId = await getActiveDormId();
  const selected =
    (memberships as MembershipRow[]).find((membership) => membership.dorm_id === activeDormId) ??
    (memberships as MembershipRow[])[0];

  if (!AI_ALLOWED_ROLES.includes(selected.role)) {
    return { error: "You do not have access to AI organizer tools." } as const;
  }

  return {
    context: {
      supabase,
      userId: user.id,
      dormId: selected.dorm_id,
      role: selected.role,
    } satisfies AiContext,
  } as const;
}

async function enforceRateLimit(context: AiContext) {
  const windowStart = new Date(Date.now() - 60_000).toISOString();
  const { count } = await context.supabase
    .from("audit_events")
    .select("id", { count: "exact", head: true })
    .eq("dorm_id", context.dormId)
    .eq("actor_user_id", context.userId)
    .eq("action", "ai.organize_event_concept")
    .gte("created_at", windowStart);

  if ((count ?? 0) >= 5) {
    return { error: "Too many AI requests. Please wait a minute before trying again." } as const;
  }

  return { success: true } as const;
}

async function callGeminiForConcept(rawText: string, role: DormRole = "officer") {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { concept: fallbackConcept(rawText), model: "fallback" };
  }

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const roleContext = ROLE_PROMPTS[role] || ROLE_PROMPTS.officer;

  const prompt = [
    roleContext.system,
    "Return valid JSON only.",
    "Schema:",
    '{"title":"string","goals":["string"],"timeline":["string"],"budget_items":["string"],"tasks":["string"],"team_hints":["string"],"scoring_hints":["string"],"notes":"string"}',
    "Constraints:",
    "- Keep arrays concise and actionable.",
    "- Do not include secrets.",
    "- Infer missing details conservatively.",
    "User input:",
    rawText,
  ].join("\n");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    return { concept: fallbackConcept(rawText), model: "fallback" };
  }

  const payload = await response.json();
  const text =
    payload?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? "")
      .join("") ?? "";

  if (!text.trim()) {
    return { concept: fallbackConcept(rawText), model: "fallback" };
  }

  try {
    const parsedJson = JSON.parse(text);
    const concept = normalizeConcept(parsedJson as Partial<EventConceptDraft>);
    const validated = eventConceptSchema.safeParse(concept);
    if (!validated.success) {
      return { concept: fallbackConcept(rawText), model: "fallback" };
    }
    return { concept: validated.data, model: "gemini-2.0-flash" };
  } catch {
    return { concept: fallbackConcept(rawText), model: "fallback" };
  }
}

export async function getAiWorkspaceData(): Promise<
  | {
    events: Array<{ id: string; title: string }>;
    recentConcepts: AiConceptRecord[];
    role: DormRole;
    suggestions: string[];
    pageTitle: string;
    pageDescription: string;
  }
  | { error: string }
> {
  const result = await getAiContext();
  if ("error" in result) {
    return { error: result.error ?? "AI workspace is unavailable." };
  }
  const { context } = result;
  const [{ data: events }, { data: concepts }] = await Promise.all([
    context.supabase
      .from("events")
      .select("id, title")
      .eq("dorm_id", context.dormId)
      .order("created_at", { ascending: false })
      .limit(40),
    context.supabase
      .from("ai_event_concepts")
      .select("id, event_id, raw_text, structured, created_at, event:events(title)")
      .eq("dorm_id", context.dormId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const recentConcepts: AiConceptRecord[] = (concepts ?? []).map(
    (entry: {
      id: string;
      event_id: string | null;
      raw_text: string;
      structured: unknown;
      created_at: string;
      event: { title: string | null } | { title: string | null }[] | null;
    }) => {
      const eventJoin = Array.isArray(entry.event) ? entry.event[0] : entry.event;
      const normalized = normalizeConcept((entry.structured as Partial<EventConceptDraft>) ?? {});
      return {
        id: entry.id,
        event_id: entry.event_id,
        raw_text: entry.raw_text,
        structured: normalized,
        created_at: entry.created_at,
        event_title: eventJoin?.title ?? null,
      };
    }
  );

  const roleConfig = ROLE_PROMPTS[context.role] ?? ROLE_PROMPTS.occupant;

  return {
    events: (events ?? []) as Array<{ id: string; title: string }>,
    recentConcepts,
    role: context.role,
    suggestions: roleConfig.suggestions,
    pageTitle: roleConfig.pageTitle,
    pageDescription: roleConfig.pageDescription,
  };
}

export async function organizeEventConcept(formData: FormData) {
  const rawInput = String(formData.get("raw_text") ?? "");
  const sanitized = sanitizeRawInput(rawInput);
  if ("error" in sanitized) {
    return { error: sanitized.error };
  }

  const contextResult = await getAiContext();
  if ("error" in contextResult) {
    return { error: contextResult.error ?? "AI organizer is unavailable." };
  }

  const { context } = contextResult;
  const rateLimit = await enforceRateLimit(context);
  if ("error" in rateLimit) {
    return { error: rateLimit.error };
  }

  const generated = await callGeminiForConcept(sanitized.value, context.role);
  const validated = eventConceptSchema.safeParse(generated.concept);
  if (!validated.success) {
    return { error: "Failed to generate structured concept." };
  }

  const promptHash = createHash("sha256").update(sanitized.value).digest("hex");

  await insertAudit(context, "ai.organize_event_concept", {
    model: generated.model,
    prompt_hash: promptHash,
    prompt_length: sanitized.value.length,
    result: summarizeConceptForLog(validated.data),
  });

  return {
    success: true,
    concept: validated.data,
    model: generated.model,
  };
}

function conceptToDescription(concept: EventConceptDraft) {
  const sections: string[] = [];

  sections.push(`AI-generated draft for: ${concept.title}`);

  const appendSection = (title: string, list: string[]) => {
    if (!list.length) {
      return;
    }
    sections.push(`\n${title}`);
    sections.push(...list.map((item) => `- ${item}`));
  };

  appendSection("Goals", concept.goals);
  appendSection("Timeline", concept.timeline);
  appendSection("Budget", concept.budget_items);
  appendSection("Tasks", concept.tasks);
  appendSection("Team hints", concept.team_hints);
  appendSection("Scoring hints", concept.scoring_hints);

  if (concept.notes) {
    sections.push(`\nNotes\n${concept.notes}`);
  }

  return sections.join("\n").slice(0, 5000);
}

export async function saveEventConcept(formData: FormData) {
  let structuredPayload: unknown;
  try {
    structuredPayload = JSON.parse(String(formData.get("structured") ?? "{}"));
  } catch {
    return { error: "Structured concept payload is invalid JSON." };
  }

  const payload = saveConceptSchema.safeParse({
    mode: formData.get("mode"),
    event_id: formData.get("event_id") || undefined,
    raw_text: formData.get("raw_text"),
    structured: structuredPayload,
  });

  if (!payload.success) {
    return { error: payload.error.issues[0]?.message ?? "Invalid concept payload." };
  }

  if (payload.data.mode === "attach_event" && !payload.data.event_id) {
    return { error: "Select an event to attach this concept." };
  }

  const contextResult = await getAiContext();
  if ("error" in contextResult) {
    return { error: contextResult.error ?? "AI organizer is unavailable." };
  }

  const { context } = contextResult;

  let eventId: string | null = payload.data.event_id ?? null;

  if (payload.data.mode === "draft_event") {
    const description = conceptToDescription(payload.data.structured);
    const { ensureActiveSemesterId } = await import("@/lib/semesters");
    const semesterResult = await ensureActiveSemesterId(context.dormId, context.supabase);
    const semesterId = "semesterId" in semesterResult ? semesterResult.semesterId : null;

    const { data: event, error } = await context.supabase
      .from("events")
      .insert({
        dorm_id: context.dormId,
        semester_id: semesterId,
        title: payload.data.structured.title,
        description,
        created_by: context.userId,
        is_competition: false,
      })
      .select("id")
      .single();

    if (error || !event) {
      return { error: error?.message ?? "Failed to create event draft." };
    }

    eventId = event.id;
  }

  if (payload.data.mode === "attach_event" && payload.data.event_id) {
    const { data: event } = await context.supabase
      .from("events")
      .select("id")
      .eq("id", payload.data.event_id)
      .eq("dorm_id", context.dormId)
      .maybeSingle();

    if (!event) {
      return { error: "Selected event was not found in your active dorm." };
    }
  }

  const { error: conceptError } = await context.supabase
    .from("ai_event_concepts")
    .insert({
      dorm_id: context.dormId,
      event_id: eventId,
      raw_text: payload.data.raw_text,
      structured: payload.data.structured,
      created_by: context.userId,
    });

  if (conceptError) {
    return { error: conceptError.message };
  }

  const promptHash = createHash("sha256").update(payload.data.raw_text).digest("hex");
  await insertAudit(context, "ai.save_event_concept", {
    mode: payload.data.mode,
    event_id: eventId,
    prompt_hash: promptHash,
    result: summarizeConceptForLog(payload.data.structured),
  });

  const activeRole = await getActiveRole() || "occupant";
  revalidatePath(`/${activeRole}/ai`);
  revalidatePath(`/${activeRole}/events`);
  if (eventId) {
    revalidatePath(`/${activeRole}/events/${eventId}`);
  }

  return { success: true, eventId };
}

export async function getFinanceInsights(): Promise<FinanceInsights | { error: string }> {
  const contextResult = await getAiContext();
  if ("error" in contextResult) {
    return { error: contextResult.error ?? "Finance insights are unavailable." };
  }

  const { context } = contextResult;

  const [{ data: ledgerRows }, { data: finesRows }] = await Promise.all([
    context.supabase
      .from("ledger_entries")
      .select("occupant_id, amount_pesos, ledger, voided_at, occupant:occupants(full_name)")
      .eq("dorm_id", context.dormId)
      .is("voided_at", null),
    context.supabase
      .from("fines")
      .select("id, voided_at")
      .eq("dorm_id", context.dormId),
  ]);

  const balances = new Map<string, { occupant_id: string; full_name: string; total_balance: number }>();

  for (const row of ledgerRows ?? []) {
    const entry = row as {
      occupant_id: string | null;
      amount_pesos: number;
      occupant: { full_name: string | null } | { full_name: string | null }[] | null;
    };

    if (!entry.occupant_id) {
      continue;
    }

    const occupant = Array.isArray(entry.occupant) ? entry.occupant[0] : entry.occupant;
    const current =
      balances.get(entry.occupant_id) ?? {
        occupant_id: entry.occupant_id,
        full_name: occupant?.full_name ?? "Unknown",
        total_balance: 0,
      };
    current.total_balance += Number(entry.amount_pesos);
    balances.set(entry.occupant_id, current);
  }

  const ranked = [...balances.values()]
    .filter((row) => row.total_balance > 0)
    .sort((left, right) => right.total_balance - left.total_balance);

  const totalOutstanding = ranked.reduce((sum, row) => sum + row.total_balance, 0);
  const openFines = (finesRows ?? []).filter((fine) => !(fine as { voided_at: string | null }).voided_at).length;
  const voidedFines = (finesRows ?? []).filter((fine) => Boolean((fine as { voided_at: string | null }).voided_at)).length;

  const aiSummary = ranked.length
    ? `Outstanding balances total ₱${totalOutstanding.toFixed(2)} across ${ranked.length} occupants. Highest balances: ${ranked
      .slice(0, 3)
      .map((row) => `${row.full_name} (₱${row.total_balance.toFixed(2)})`)
      .join(", ")}. Open fines: ${openFines}.`
    : "No outstanding balances were found for the current ledger snapshot.";

  await insertAudit(context, "ai.finance_insights", {
    total_outstanding: Number(totalOutstanding.toFixed(2)),
    occupants_with_balance: ranked.length,
    open_fines: openFines,
    voided_fines: voidedFines,
  });

  return {
    total_outstanding: Number(totalOutstanding.toFixed(2)),
    occupants_with_balance: ranked.length,
    top_balances: ranked.slice(0, 5).map((row) => ({
      ...row,
      total_balance: Number(row.total_balance.toFixed(2)),
    })),
    open_fines: openFines,
    voided_fines: voidedFines,
    ai_summary: aiSummary,
  };
}


export async function getCleaningFinesInsights(): Promise<CleaningFinesInsights | { error: string }> {
  const contextResult = await getAiContext();
  if ("error" in contextResult) {
    return { error: contextResult.error ?? "Cleaning & fines insights are unavailable." };
  }

  const { context } = contextResult;

  const [{ data: finesRows }, { data: fineReports }, { data: rooms }, { data: areas }] = await Promise.all([
    context.supabase
      .from("fines")
      .select("id, amount_pesos, voided_at")
      .eq("dorm_id", context.dormId),
    context.supabase
      .from("fine_reports")
      .select("id, status")
      .eq("dorm_id", context.dormId)
      .eq("status", "pending"),
    context.supabase
      .from("rooms")
      .select("id")
      .eq("dorm_id", context.dormId),
    context.supabase
      .from("cleaning_areas")
      .select("id")
      .eq("dorm_id", context.dormId)
      .eq("active", true),
  ]);

  const activeFines = (finesRows ?? []).filter((f) => !(f as { voided_at: string | null }).voided_at);
  const voidedFines = (finesRows ?? []).filter((f) => Boolean((f as { voided_at: string | null }).voided_at));
  const totalFinePesos = activeFines.reduce((sum, f) => sum + Number((f as { amount_pesos: number }).amount_pesos), 0);

  const aiSummary = [
    `${activeFines.length} active fine(s) totaling ₱${totalFinePesos.toFixed(2)}.`,
    `${(fineReports ?? []).length} pending fine report(s) awaiting review.`,
    `${(areas ?? []).length} cleaning area(s) configured, ${(rooms ?? []).length} room(s) in the dorm.`,
  ].join(" ");

  await insertAudit(context, "ai.cleaning_fines_insights", {
    active_fines: activeFines.length,
    pending_reports: (fineReports ?? []).length,
  });

  return {
    cleaning_areas_count: (areas ?? []).length,
    current_week_label: null,
    assigned_rooms_count: 0,
    total_rooms: (rooms ?? []).length,
    active_fines_count: activeFines.length,
    voided_fines_count: voidedFines.length,
    pending_fine_reports: (fineReports ?? []).length,
    total_fine_amount_pesos: Number(totalFinePesos.toFixed(2)),
    ai_summary: aiSummary,
  };
}

export async function getMaintenanceInsights(): Promise<MaintenanceInsights | { error: string }> {
  const contextResult = await getAiContext();
  if ("error" in contextResult) {
    return { error: contextResult.error ?? "Maintenance insights are unavailable." };
  }

  const { context } = contextResult;

  const [{ data: entries }, { data: occupants }] = await Promise.all([
    context.supabase
      .from("ledger_entries")
      .select("occupant_id, amount_pesos, ledger, entry_type")
      .eq("dorm_id", context.dormId)
      .eq("ledger", "maintenance")
      .is("voided_at", null),
    context.supabase
      .from("occupants")
      .select("id")
      .eq("dorm_id", context.dormId)
      .eq("status", "active"),
  ]);

  let charged = 0;
  let paid = 0;
  const balances = new Map<string, number>();

  for (const row of entries ?? []) {
    const entry = row as { occupant_id: string | null; amount_pesos: number; entry_type: string };
    if (entry.entry_type === "charge") {
      charged += Number(entry.amount_pesos);
    } else {
      paid += Math.abs(Number(entry.amount_pesos));
    }
    if (entry.occupant_id) {
      const current = balances.get(entry.occupant_id) ?? 0;
      balances.set(entry.occupant_id, current + Number(entry.amount_pesos));
    }
  }

  const totalOccupants = (occupants ?? []).length;
  const cleared = [...balances.values()].filter((b) => b <= 0).length;
  const notCleared = totalOccupants - cleared;
  const outstanding = charged - paid;

  const aiSummary = [
    `Maintenance fees: ₱${charged.toFixed(2)} charged, ₱${paid.toFixed(2)} collected.`,
    `Outstanding: ₱${outstanding.toFixed(2)}.`,
    `${cleared} of ${totalOccupants} occupant(s) cleared for maintenance.`,
  ].join(" ");

  await insertAudit(context, "ai.maintenance_insights", {
    charged, paid, outstanding,
    occupants_cleared: cleared,
    total_occupants: totalOccupants,
  });

  return {
    maintenance_charged: Number(charged.toFixed(2)),
    maintenance_paid: Number(paid.toFixed(2)),
    maintenance_outstanding: Number(outstanding.toFixed(2)),
    occupants_cleared: cleared,
    occupants_not_cleared: notCleared,
    total_occupants: totalOccupants,
    ai_summary: aiSummary,
  };
}

export async function getAdminOverviewInsights(): Promise<AdminOverviewInsights | { error: string }> {
  const contextResult = await getAiContext();
  if ("error" in contextResult) {
    return { error: contextResult.error ?? "Admin overview is unavailable." };
  }

  const { context } = contextResult;

  const [{ data: occupants }, { data: events }, { data: finesRows }, { data: entries }, { data: expenses }] = await Promise.all([
    context.supabase
      .from("occupants")
      .select("id")
      .eq("dorm_id", context.dormId)
      .eq("status", "active"),
    context.supabase
      .from("events")
      .select("id")
      .eq("dorm_id", context.dormId),
    context.supabase
      .from("fines")
      .select("id, voided_at")
      .eq("dorm_id", context.dormId),
    context.supabase
      .from("ledger_entries")
      .select("occupant_id, amount_pesos, entry_type")
      .eq("dorm_id", context.dormId)
      .is("voided_at", null),
    context.supabase
      .from("expenses")
      .select("amount_pesos")
      .eq("dorm_id", context.dormId)
      .eq("status", "approved"),
  ]);

  const totalOccupants = (occupants ?? []).length;
  const totalEvents = (events ?? []).length;
  const activeFines = (finesRows ?? []).filter((f) => !(f as { voided_at: string | null }).voided_at).length;

  let totalPaid = 0;
  let totalCharged = 0;
  const balances = new Map<string, number>();

  for (const row of entries ?? []) {
    const entry = row as { occupant_id: string | null; amount_pesos: number; entry_type: string };
    if (entry.entry_type === "charge") {
      totalCharged += Number(entry.amount_pesos);
    } else {
      totalPaid += Math.abs(Number(entry.amount_pesos));
    }
    if (entry.occupant_id) {
      const current = balances.get(entry.occupant_id) ?? 0;
      balances.set(entry.occupant_id, current + Number(entry.amount_pesos));
    }
  }

  const totalExpenses = (expenses ?? []).reduce((sum, e) => sum + Number((e as { amount_pesos: number }).amount_pesos), 0);
  const cashOnHand = totalPaid - totalExpenses;
  const collectibles = totalCharged - totalPaid;
  const cleared = [...balances.values()].filter((b) => b <= 0).length;
  const notCleared = totalOccupants - cleared;

  const aiSummary = [
    `Dorm overview: ${totalOccupants} active occupant(s), ${totalEvents} event(s).`,
    `Cash on hand: ₱${cashOnHand.toFixed(2)}, collectibles: ₱${collectibles.toFixed(2)}.`,
    `${activeFines} active fine(s). ${cleared}/${totalOccupants} occupant(s) fully cleared.`,
  ].join(" ");

  await insertAudit(context, "ai.admin_overview_insights", {
    total_occupants: totalOccupants,
    total_events: totalEvents,
    cash_on_hand: Number(cashOnHand.toFixed(2)),
    active_fines: activeFines,
  });

  return {
    total_occupants: totalOccupants,
    total_events: totalEvents,
    cash_on_hand: Number(cashOnHand.toFixed(2)),
    total_collectibles: Number(collectibles.toFixed(2)),
    active_fines: activeFines,
    occupants_cleared: cleared,
    occupants_not_cleared: notCleared,
    ai_summary: aiSummary,
  };
}