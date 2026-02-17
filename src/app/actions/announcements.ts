"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logAuditEvent } from "@/lib/audit/log";
import { ensureActiveSemesterId } from "@/lib/semesters";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Joined<T> = T | T[] | null;

function first<T>(value: Joined<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

const STAFF_ROLES = new Set([
  "admin",
  "adviser",
  "assistant_adviser",
  "student_assistant",
  "treasurer",
  "officer",
]);

const visibilitySchema = z.enum(["members", "staff"]);
const audienceSchema = z.enum(["dorm", "committee"]);

const announcementSchema = z.object({
  title: z.string().trim().min(2, "Title is required.").max(140),
  body: z.string().trim().min(2, "Body is required.").max(8000),
  visibility: visibilitySchema.default("members"),
  audience: audienceSchema.default("dorm"),
  committee_id: z.string().uuid().nullable().optional(),
  pinned: z.boolean().default(false),
  starts_at: z.string().datetime().nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
});

function parseCheckbox(value: FormDataEntryValue | null) {
  return value === "on" || value === "true" || value === "1";
}

function parseDateTimeInput(value: FormDataEntryValue | null) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "INVALID_DATE" as const;
  return parsed.toISOString();
}

export type DormAnnouncement = {
  id: string;
  dorm_id: string;
  semester_id: string | null;
  title: string;
  body: string;
  visibility: "members" | "staff";
  audience: "dorm" | "committee";
  committee_id: string | null;
  committee: { id: string; name: string } | null;
  pinned: boolean;
  starts_at: string;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function getDormAnnouncements(
  dormId: string,
  options: { limit?: number } = {}
) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { announcements: [] as DormAnnouncement[], error: "" };
  }

  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  if ("error" in semesterResult) {
    return { announcements: [] as DormAnnouncement[], error: semesterResult.error ?? "Failed to load semester." };
  }

  const query = supabase
    .from("dorm_announcements")
    .select(
      "id, dorm_id, semester_id, title, body, visibility, audience, committee_id, pinned, starts_at, expires_at, created_by, created_at, updated_at, committee:committees(id, name)"
    )
    .eq("dorm_id", dormId)
    .eq("semester_id", semesterResult.semesterId)
    .order("pinned", { ascending: false })
    .order("starts_at", { ascending: false })
    .order("created_at", { ascending: false });

  const { data, error } = options.limit ? await query.limit(options.limit) : await query;

  if (error) {
    return { announcements: [] as DormAnnouncement[], error: error.message };
  }

  const normalized = ((data ?? []) as Array<
    Omit<DormAnnouncement, "committee"> & { committee: Joined<{ id: string; name: string }> }
  >).map((row) => ({
    ...row,
    committee: first(row.committee),
  })) satisfies DormAnnouncement[];

  return { announcements: normalized, error: "" };
}

export async function getCommitteeAnnouncements(
  dormId: string,
  committeeId: string,
  options: { limit?: number } = {}
) {
  const parsedCommitteeId = z.string().uuid().safeParse(committeeId);
  if (!parsedCommitteeId.success) {
    return { announcements: [] as DormAnnouncement[], error: "Invalid committee id." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { announcements: [] as DormAnnouncement[], error: "" };
  }

  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  if ("error" in semesterResult) {
    return { announcements: [] as DormAnnouncement[], error: semesterResult.error ?? "Failed to load semester." };
  }

  const query = supabase
    .from("dorm_announcements")
    .select(
      "id, dorm_id, semester_id, title, body, visibility, audience, committee_id, pinned, starts_at, expires_at, created_by, created_at, updated_at, committee:committees(id, name)"
    )
    .eq("dorm_id", dormId)
    .eq("semester_id", semesterResult.semesterId)
    .eq("committee_id", parsedCommitteeId.data)
    .order("pinned", { ascending: false })
    .order("starts_at", { ascending: false })
    .order("created_at", { ascending: false });

  const { data, error } = options.limit ? await query.limit(options.limit) : await query;

  if (error) {
    return { announcements: [] as DormAnnouncement[], error: error.message };
  }

  const normalized = ((data ?? []) as Array<
    Omit<DormAnnouncement, "committee"> & { committee: Joined<{ id: string; name: string }> }
  >).map((row) => ({
    ...row,
    committee: first(row.committee),
  })) satisfies DormAnnouncement[];

  return { announcements: normalized, error: "" };
}

export async function createAnnouncement(dormId: string, formData: FormData) {
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

  const { data: membership, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError || !membership?.role) {
    return { error: "Forbidden" };
  }

  const isStaff = STAFF_ROLES.has(membership.role);

  const startsAt = parseDateTimeInput(formData.get("starts_at"));
  const expiresAt = parseDateTimeInput(formData.get("expires_at"));
  if (startsAt === "INVALID_DATE" || expiresAt === "INVALID_DATE") {
    return { error: "Provide valid date and time values." };
  }

  const committeeIdRaw = String(formData.get("committee_id") ?? "").trim();

  const parsed = announcementSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    visibility: formData.get("visibility"),
    audience: formData.get("audience"),
    committee_id: committeeIdRaw || null,
    pinned: parseCheckbox(formData.get("pinned")),
    starts_at: startsAt,
    expires_at: expiresAt,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid announcement input." };
  }

  if (parsed.data.starts_at && parsed.data.expires_at) {
    if (new Date(parsed.data.expires_at) <= new Date(parsed.data.starts_at)) {
      return { error: "Expiry must be after the publish time." };
    }
  }

  if (parsed.data.audience === "committee" && !parsed.data.committee_id) {
    return { error: "Select a committee for committee-only announcements." };
  }

  const committeeId = parsed.data.committee_id ?? null;

  if (committeeId) {
    const { data: committee } = await supabase
      .from("committees")
      .select("id")
      .eq("id", committeeId)
      .eq("dorm_id", dormId)
      .maybeSingle();

    if (!committee) {
      return { error: "Committee not found for this dorm." };
    }
  }

  if (!isStaff) {
    if (!committeeId) {
      return { error: "Only staff can create dorm-wide announcements." };
    }

    if (parsed.data.visibility !== "members") {
      return { error: "Committee announcements must be visible to members." };
    }

    const { data: committeeRole } = await supabase
      .from("committee_members")
      .select("role")
      .eq("committee_id", committeeId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!committeeRole || !new Set(["head", "co-head"]).has(committeeRole.role)) {
      return { error: "Only committee heads can create announcements." };
    }
  }

  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  if ("error" in semesterResult) {
    return { error: semesterResult.error ?? "Failed to resolve active semester." };
  }

  const payload: Record<string, unknown> = {
    dorm_id: dormId,
    semester_id: semesterResult.semesterId,
    title: parsed.data.title,
    body: parsed.data.body,
    visibility: isStaff ? parsed.data.visibility : "members",
    audience: committeeId ? parsed.data.audience : "dorm",
    committee_id: committeeId,
    pinned: parsed.data.pinned,
    expires_at: parsed.data.expires_at ?? null,
    created_by: user.id,
  };

  if (parsed.data.starts_at) {
    payload.starts_at = parsed.data.starts_at;
  }

  const { data, error } = await supabase
    .from("dorm_announcements")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Failed to create announcement." };
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "announcements.created",
      entityType: "announcement",
      entityId: data.id,
      metadata: {
        title: parsed.data.title,
        visibility: isStaff ? parsed.data.visibility : "members",
        audience: committeeId ? parsed.data.audience : "dorm",
        committee_id: committeeId,
        pinned: parsed.data.pinned,
        starts_at: parsed.data.starts_at ?? null,
        expires_at: parsed.data.expires_at ?? null,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for announcement create:", auditError);
  }

  revalidatePath("/home");
  revalidatePath("/home/announcements");

  return { success: true };
}

export async function updateAnnouncement(
  dormId: string,
  announcementId: string,
  formData: FormData
) {
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

  const { data: membership, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError || !membership?.role) {
    return { error: "Forbidden" };
  }

  const isStaff = STAFF_ROLES.has(membership.role);

  const { data: existing } = await supabase
    .from("dorm_announcements")
    .select("id, committee_id, visibility")
    .eq("dorm_id", dormId)
    .eq("id", announcementId)
    .maybeSingle();

  if (!existing) {
    return { error: "Announcement not found." };
  }

  const existingCommitteeId = (existing as { committee_id?: string | null }).committee_id ?? null;
  const existingVisibility = (existing as { visibility?: string | null }).visibility ?? null;

  if (!isStaff) {
    if (!existingCommitteeId) {
      return { error: "Only staff can edit dorm-wide announcements." };
    }

    if (existingVisibility !== "members") {
      return { error: "You cannot edit staff-only announcements." };
    }

    const { data: committeeRole } = await supabase
      .from("committee_members")
      .select("role")
      .eq("committee_id", existingCommitteeId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!committeeRole || !new Set(["head", "co-head"]).has(committeeRole.role)) {
      return { error: "Only committee heads can edit announcements." };
    }
  }

  const startsAt = parseDateTimeInput(formData.get("starts_at"));
  const expiresAt = parseDateTimeInput(formData.get("expires_at"));
  if (startsAt === "INVALID_DATE" || expiresAt === "INVALID_DATE") {
    return { error: "Provide valid date and time values." };
  }

  const committeeIdRaw = String(formData.get("committee_id") ?? "").trim();

  const parsed = announcementSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    visibility: formData.get("visibility"),
    audience: formData.get("audience"),
    committee_id: committeeIdRaw || null,
    pinned: parseCheckbox(formData.get("pinned")),
    starts_at: startsAt,
    expires_at: expiresAt,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid announcement input." };
  }

  if (parsed.data.starts_at && parsed.data.expires_at) {
    if (new Date(parsed.data.expires_at) <= new Date(parsed.data.starts_at)) {
      return { error: "Expiry must be after the publish time." };
    }
  }

  if (parsed.data.audience === "committee" && !parsed.data.committee_id) {
    return { error: "Select a committee for committee-only announcements." };
  }

  const committeeId = parsed.data.committee_id ?? null;

  if (committeeId) {
    const { data: committee } = await supabase
      .from("committees")
      .select("id")
      .eq("id", committeeId)
      .eq("dorm_id", dormId)
      .maybeSingle();

    if (!committee) {
      return { error: "Committee not found for this dorm." };
    }
  }

  if (!isStaff) {
    if (!committeeId || committeeId !== existingCommitteeId) {
      return { error: "You cannot change the committee for this announcement." };
    }

    if (parsed.data.visibility !== "members") {
      return { error: "Committee announcements must be visible to members." };
    }
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("dorm_announcements")
    .update({
      title: parsed.data.title,
      body: parsed.data.body,
      visibility: isStaff ? parsed.data.visibility : "members",
      audience: committeeId ? parsed.data.audience : "dorm",
      committee_id: committeeId,
      pinned: parsed.data.pinned,
      starts_at: parsed.data.starts_at ?? nowIso,
      expires_at: parsed.data.expires_at ?? null,
      updated_at: nowIso,
    })
    .eq("dorm_id", dormId)
    .eq("id", announcementId);

  if (error) {
    return { error: error.message };
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "announcements.updated",
      entityType: "announcement",
      entityId: announcementId,
      metadata: {
        title: parsed.data.title,
        visibility: isStaff ? parsed.data.visibility : "members",
        audience: committeeId ? parsed.data.audience : "dorm",
        committee_id: committeeId,
        pinned: parsed.data.pinned,
        starts_at: parsed.data.starts_at ?? null,
        expires_at: parsed.data.expires_at ?? null,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for announcement update:", auditError);
  }

  revalidatePath("/home");
  revalidatePath("/home/announcements");

  return { success: true };
}

export async function deleteAnnouncement(dormId: string, announcementId: string) {
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

  const { data: membership, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError || !membership?.role) {
    return { error: "Forbidden" };
  }

  const isStaff = STAFF_ROLES.has(membership.role);

  const { data: existing } = await supabase
    .from("dorm_announcements")
    .select("id, title, visibility, pinned, audience, committee_id")
    .eq("dorm_id", dormId)
    .eq("id", announcementId)
    .maybeSingle();

  if (!existing) {
    return { error: "Announcement not found." };
  }

  const existingCommitteeId = (existing as { committee_id?: string | null }).committee_id ?? null;
  const existingVisibility = (existing as { visibility?: string | null }).visibility ?? null;

  if (!isStaff) {
    if (!existingCommitteeId) {
      return { error: "Only staff can delete dorm-wide announcements." };
    }

    if (existingVisibility !== "members") {
      return { error: "You cannot delete staff-only announcements." };
    }

    const { data: committeeRole } = await supabase
      .from("committee_members")
      .select("role")
      .eq("committee_id", existingCommitteeId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!committeeRole || !new Set(["head", "co-head"]).has(committeeRole.role)) {
      return { error: "Only committee heads can delete announcements." };
    }
  }

  const { error } = await supabase
    .from("dorm_announcements")
    .delete()
    .eq("dorm_id", dormId)
    .eq("id", announcementId);

  if (error) {
    return { error: error.message };
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "announcements.deleted",
      entityType: "announcement",
      entityId: announcementId,
      metadata: {
        title: existing?.title ?? null,
        visibility: existing?.visibility ?? null,
        audience: (existing as { audience?: string | null }).audience ?? null,
        committee_id: (existing as { committee_id?: string | null }).committee_id ?? null,
        pinned: existing?.pinned ?? null,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for announcement delete:", auditError);
  }

  revalidatePath("/home");
  revalidatePath("/home/announcements");

  return { success: true };
}
