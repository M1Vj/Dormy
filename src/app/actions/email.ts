"use server";

import { z } from "zod";

import { logAuditEvent } from "@/lib/audit/log";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const draftReceiptSchema = z.object({
  dorm_id: z.string().uuid(),
  occupant_id: z.string().uuid(),
  category: z.enum(["adviser_maintenance", "sa_fines", "treasurer_events"]),
  amount: z.number().positive(),
  method: z.string().trim().max(60).optional(),
  note: z.string().trim().max(300).optional(),
  event_id: z.string().uuid().optional().nullable(),
});

const allowedRolesByLedger = {
  adviser_maintenance: ["admin", "adviser", "assistant_adviser"],
  sa_fines: ["admin", "student_assistant", "adviser", "assistant_adviser"],
  treasurer_events: ["admin", "treasurer"],
} as const;

function labelForLedger(category: z.infer<typeof draftReceiptSchema>["category"]) {
  if (category === "adviser_maintenance") return "Maintenance";
  if (category === "sa_fines") return "Fines";
  return "Event contributions";
}

function escapePrompt(value: string) {
  return value.replaceAll("\u0000", "").trim();
}

function fallbackDraft(input: {
  occupantName: string | null;
  ledgerLabel: string;
  amount: number;
  eventTitle: string | null;
}) {
  const subject = input.eventTitle ? `Payment receipt: ${input.eventTitle}` : "Payment receipt";
  const amountLabel = new Intl.NumberFormat("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(input.amount);

  const messageLines = [
    `Thanks for your payment of PHP ${amountLabel}${input.eventTitle ? ` for ${input.eventTitle}` : ""}.`,
    "If you have questions, you can reply to this email.",
  ];

  return { subject, message: messageLines.join("\n") };
}

async function callGeminiForDraft(prompt: string) {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || "";
  if (!apiKey) {
    return { error: "Missing GEMINI_API_KEY" } as const;
  }

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.4,
      },
    }),
  });

  if (!response.ok) {
    return { error: `Gemini error: ${response.status}` } as const;
  }

  const payload = await response.json();
  const text =
    payload?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("") ?? "";

  return { text } as const;
}

const draftResponseSchema = z.object({
  subject: z.string().trim().min(1).max(140),
  message: z.string().trim().min(1).max(2000),
});

export async function draftPaymentReceiptEmail(payload: unknown) {
  const parsed = draftReceiptSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid draft request." };
  }

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

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", parsed.data.dorm_id)
    .eq("user_id", user.id)
    .maybeSingle();

  const role = membership?.role ?? null;
  if (!role) {
    return { error: "Forbidden" };
  }

  const allowedRoles = new Set(allowedRolesByLedger[parsed.data.category]);
  if (!allowedRoles.has(role as (typeof allowedRolesByLedger)[keyof typeof allowedRolesByLedger][number])) {
    return { error: "You do not have permission to draft receipts for this ledger." };
  }

  const [{ data: occupant }, eventResult] = await Promise.all([
    supabase
      .from("occupants")
      .select("full_name")
      .eq("dorm_id", parsed.data.dorm_id)
      .eq("id", parsed.data.occupant_id)
      .maybeSingle(),
    parsed.data.event_id
      ? supabase
        .from("events")
        .select("title")
        .eq("dorm_id", parsed.data.dorm_id)
        .eq("id", parsed.data.event_id)
        .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const ledgerLabel = labelForLedger(parsed.data.category);
  const occupantName = occupant?.full_name?.trim() || null;
  const eventTitle = eventResult?.data?.title?.trim() || null;

  const fallback = fallbackDraft({
    occupantName,
    ledgerLabel,
    amount: parsed.data.amount,
    eventTitle,
  });

  const prompt = [
    "Return valid JSON only.",
    'Schema: {"subject":"string","message":"string"}',
    "Write a short, friendly payment receipt message.",
    "Constraints:",
    "- subject: <= 140 chars",
    "- message: plain text, <= 700 chars",
    "- strictly do NOT include a greeting (e.g. Hi, Dear)",
    "- strictly do NOT include a sign-off or signature (e.g. Thanks, Best, Dormy Admin)",
    "- the greeting and signature are added automatically in the email template",
    "- do not include secrets or passwords",
    "- do not repeat the full receipt table; that will be appended automatically",
    "",
    "Context:",
    `- recipient_name: ${occupantName ? escapePrompt(occupantName) : "unknown"}`,
    `- ledger: ${ledgerLabel}`,
    `- amount_php: ${parsed.data.amount.toFixed(2)}`,
    `- event_title: ${eventTitle ? escapePrompt(eventTitle) : "none"}`,
    `- method: ${parsed.data.method ? escapePrompt(parsed.data.method) : "unknown"}`,
    `- note: ${parsed.data.note ? escapePrompt(parsed.data.note) : "none"}`,
  ].join("\n");

  const gemini = await callGeminiForDraft(prompt);
  if ("error" in gemini) {
    return { success: true, subject: fallback.subject, message: fallback.message, model: "fallback" };
  }

  const candidate = draftResponseSchema.safeParse(
    (() => {
      try {
        return JSON.parse(gemini.text);
      } catch {
        return null;
      }
    })()
  );

  const drafted = candidate.success
    ? { subject: candidate.data.subject, message: candidate.data.message, model: "gemini-2.0-flash" }
    : { subject: fallback.subject, message: fallback.message, model: "fallback" };

  try {
    await logAuditEvent({
      dormId: parsed.data.dorm_id,
      actorUserId: user.id,
      action: "ai.draft_payment_receipt_email",
      entityType: "ai",
      metadata: {
        model: drafted.model,
        ledger: parsed.data.category,
        event_id: parsed.data.event_id ?? null,
        occupant_id: parsed.data.occupant_id,
      },
    });
  } catch {
    // best effort
  }

  return { success: true, ...drafted };
}
