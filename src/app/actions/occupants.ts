"use server";

import { revalidatePath } from "next/cache";
import { getActiveRole } from "@/lib/roles-server";
import { z } from "zod";
import { logAuditEvent } from "@/lib/audit/log";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { AppRole } from "@/lib/auth";

const createAdminClient = () => {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
      },
    }
  );
};

const occupantStatusSchema = z.enum(["active", "left", "removed"]);

const occupantSchema = z.object({
  full_name: z.string().min(2, "Name is required"),
  student_id: z.string().optional(),
  course: z.string().optional(),
  joined_at: z.string().optional(), // Date string
});

const systemAccessSchema = z.object({
  role: z.enum([
    "admin",
    "student_assistant",
    "treasurer",
    "adviser",
    "assistant_adviser",
    "occupant",
    "officer",
  ]).optional().nullable(),
  committee_id: z.string().uuid().optional().nullable().or(z.literal("")),
  committee_role: z.enum(["head", "co-head", "member"]).optional().nullable().or(z.literal("")),
});

type RoomRef = {
  id: string;
  code: string;
  level: number;
};

type RoomAssignment = {
  id: string;
  start_date: string;
  end_date: string | null;
  room?: RoomRef | RoomRef[] | null;
};

const OCCUPANT_AUDIT_FIELDS = [
  "full_name",
  "student_id",
  "course",
  "joined_at",
  "status",
  "home_address",
  "birthdate",
  "contact_mobile",
  "contact_email",
  "emergency_contact_name",
  "emergency_contact_mobile",
  "emergency_contact_relationship",
] as const;

function normalizeAuditValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  return String(value);
}

function getChangedOccupantFields(
  previous: Record<string, unknown>,
  updates: Record<string, unknown>
) {
  return OCCUPANT_AUDIT_FIELDS.filter((field) => {
    if (!(field in updates)) {
      return false;
    }
    return normalizeAuditValue(previous[field]) !== normalizeAuditValue(updates[field]);
  });
}

export async function getOccupants(
  dormId: string,
  {
    search,
    status,
    room,
    level,
  }: { search?: string; status?: string; room?: string; level?: string } = {}
) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const { data: { user } } = await supabase.auth.getUser();
  const { data: adminMembership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("user_id", user?.id || "")
    .eq("role", "admin")
    .limit(1);

  const client = adminMembership?.length ? createAdminClient() : supabase;

  let query = client
    .from("occupants")
    .select(`
      id, full_name, student_id, user_id, course:classification, joined_at, status, 
      room_assignments(
        id,
        start_date,
        end_date,
        room:rooms(id, code, level)
      )
    `)
    .eq("dorm_id", dormId);

  if (status) {
    query = query.eq("status", status);
  }

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,student_id.ilike.%${search}%`);
  }

  query = query.order("full_name");

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching occupants:", error);
    return [];
  }

  const userIds = data.map((occ) => occ.user_id).filter(Boolean) as string[];
  const membershipsMap = new Map<string, AppRole[]>();

  if (userIds.length > 0) {
    const { data: memData, error: memError } = await client
      .from("dorm_memberships")
      .select("user_id, role")
      .eq("dorm_id", dormId)
      .in("user_id", userIds);

    if (!memError && memData) {
      memData.forEach((m) => {
        const roles = membershipsMap.get(m.user_id) || [];
        roles.push(m.role as AppRole);
        membershipsMap.set(m.user_id, roles);
      });
    }
  }

  let mapped = data.map((occ) => {
    // Find the active assignment (no end_date)
    // If multiple (shouldn't happen with DB constraint), take the first one
    const assignments = occ.room_assignments as unknown as RoomAssignment[];
    const activeAssignment = assignments?.find(
      (a) => !a.end_date
    );

    return {
      ...occ,
      current_room_assignment: activeAssignment || null,
      room_assignments: undefined,
      roles: (occ.user_id && membershipsMap.get(occ.user_id)) || ["occupant"],
    };
  });

  const normalizedRoom = room?.trim().toLowerCase();
  const normalizedLevel = level?.trim();

  const getRoomRef = (assignment?: RoomAssignment | null) => {
    if (!assignment?.room) return null;
    return Array.isArray(assignment.room) ? assignment.room[0] : assignment.room;
  };

  if (normalizedRoom) {
    mapped = mapped.filter((occ) => {
      const roomRef = getRoomRef(occ.current_room_assignment);
      const code = roomRef?.code?.toLowerCase() ?? "";
      return code.includes(normalizedRoom);
    });
  }

  if (normalizedLevel) {
    mapped = mapped.filter((occ) => {
      const roomRef = getRoomRef(occ.current_room_assignment);
      if (roomRef?.level === null || roomRef?.level === undefined) return false;
      return String(roomRef.level) === normalizedLevel;
    });
  }

  return mapped;
}

export async function getOccupant(dormId: string, occupantId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const { data: { user } } = await supabase.auth.getUser();
  const { data: adminMembership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("user_id", user?.id || "")
    .eq("role", "admin")
    .limit(1);

  const client = adminMembership?.length ? createAdminClient() : supabase;

  const { data, error } = await client
    .from("occupants")
    .select(`
      id, full_name, student_id, user_id, course:classification, joined_at, status,
      home_address, birthdate, contact_mobile, contact_email, 
      emergency_contact_name, emergency_contact_mobile, emergency_contact_relationship,
      room_assignments(
        id,
        start_date,
        end_date,
        room:rooms(id, code, level)
      )
    `)
    .eq("dorm_id", dormId)
    .eq("id", occupantId)
    .single();

  if (error) {
    console.error("Error fetching occupant:", error);
    return null;
  }

  // Fetch the role and committee info if user_id exists
  let memRoles: AppRole[] = ["occupant"];
  let committeeMemberships: { committee_id: string; role: string; committee_name: string }[] = [];

  if (data.user_id) {
    const { data: memData } = await client
      .from("dorm_memberships")
      .select("role")
      .eq("dorm_id", dormId)
      .eq("user_id", data.user_id);

    if (memData && memData.length > 0) {
      memRoles = memData.map((m) => m.role as AppRole);
    }

    const { data: commData } = await client
      .from("committee_members")
      .select("role, committee_id, committees(name)")
      .eq("user_id", data.user_id);

    // filter to only committees in this dorm
    const { data: dormCommittees } = await client
      .from("committees")
      .select("id")
      .eq("dorm_id", dormId);
    const dormCommitteeIds = new Set((dormCommittees ?? []).map((c) => c.id));

    if (commData) {
      committeeMemberships = commData
        .filter((c) => dormCommitteeIds.has(c.committee_id))
        .map((c) => {
          const commName = Array.isArray(c.committees)
            ? c.committees[0]?.name
            : (c.committees as unknown as { name: string } | null)?.name;

          return {
            committee_id: c.committee_id,
            role: c.role,
            committee_name: commName ?? "Unknown Committee",
          };
        });
    }
  }

  // Sort assignments: Active first, then by end_date desc (most recent history)
  const assignments = (data.room_assignments || []) as unknown as RoomAssignment[];
  const sortedAssignments = assignments.sort((a, b) => {
    if (!a.end_date && b.end_date) return -1;
    if (a.end_date && !b.end_date) return 1;
    // Both active or both ended: sort by start_date desc
    return new Date(b.start_date).getTime() - new Date(a.start_date).getTime();
  });

  return {
    ...data,
    roles: memRoles,
    committee_memberships: committeeMemberships,
    room_assignments: sortedAssignments,
    current_room_assignment: sortedAssignments.find((a) => !a.end_date) || null,
  };
}

export async function createOccupant(dormId: string, formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in to add occupants." };
  }

  const { data: memberships, error: membershipError } = await supabase.from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    ;
  const roles = memberships?.map(m => m.role) ?? [];
  const hasAccess = roles.some(r => new Set(["admin", "student_assistant", "adviser"]).has(r));
  if (membershipError || !hasAccess) {
    return { error: "You do not have permission to add occupants." };
  }

  const rawData = {
    full_name: formData.get("full_name"),
    student_id: formData.get("student_id"),
    course: formData.get("course"),
    joined_at: formData.get("joined_at") || new Date().toISOString().split('T')[0],
    home_address: formData.get("home_address"),
    birthdate: formData.get("birthdate"),
    contact_mobile: formData.get("contact_mobile"),
    contact_email: formData.get("contact_email"),
    emergency_contact_name: formData.get("emergency_contact_name"),
    emergency_contact_mobile: formData.get("emergency_contact_mobile"),
    emergency_contact_relationship: formData.get("emergency_contact_relationship"),
  };

  const parsed = occupantSchema.safeParse(rawData);

  if (!parsed.success) {
    return { error: "Invalid data" };
  }

  const { data: createdOccupant, error } = await supabase
    .from("occupants")
    .insert({
      dorm_id: dormId,
      full_name: parsed.data.full_name,
      student_id: parsed.data.student_id ? parsed.data.student_id : null,
      classification: parsed.data.course,
      joined_at: parsed.data.joined_at,
      home_address: typeof rawData.home_address === "string" && rawData.home_address.trim() ? rawData.home_address.trim() : null,
      birthdate: typeof rawData.birthdate === "string" && rawData.birthdate.trim() ? rawData.birthdate.trim() : null,
      contact_mobile: typeof rawData.contact_mobile === "string" && rawData.contact_mobile.trim() ? rawData.contact_mobile.trim() : null,
      contact_email: typeof rawData.contact_email === "string" && rawData.contact_email.trim()
        ? rawData.contact_email.trim().toLowerCase()
        : null,
      emergency_contact_name: typeof rawData.emergency_contact_name === "string" && rawData.emergency_contact_name.trim()
        ? rawData.emergency_contact_name.trim()
        : null,
      emergency_contact_mobile: typeof rawData.emergency_contact_mobile === "string" && rawData.emergency_contact_mobile.trim()
        ? rawData.emergency_contact_mobile.trim()
        : null,
      emergency_contact_relationship: typeof rawData.emergency_contact_relationship === "string" && rawData.emergency_contact_relationship.trim()
        ? rawData.emergency_contact_relationship.trim()
        : null,
      status: "active"
    })
    .select("id, full_name, student_id, course:classification, joined_at, status")
    .single();

  if (error || !createdOccupant) {
    return { error: error?.message ?? "Failed to create occupant." };
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "occupants.created",
      entityType: "occupant",
      entityId: createdOccupant.id,
      metadata: {
        full_name: createdOccupant.full_name,
        student_id: createdOccupant.student_id,
        course: createdOccupant.course,
        joined_at: createdOccupant.joined_at,
        status: createdOccupant.status,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for occupant creation:", auditError);
  }

  const activeRole = (await getActiveRole()) || "occupant";
  revalidatePath(`/${activeRole}/occupants`);
  return { success: true };
}

export async function updateOccupant(
  dormId: string,
  occupantId: string,
  formData: FormData
) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in to update occupants." };
  }

  const { data: memberships, error: membershipError } = await supabase.from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    ;
  const roles = memberships?.map(m => m.role) ?? [];
  const hasAccess = roles.some(r => new Set(["admin", "student_assistant", "adviser"]).has(r));
  if (membershipError || !hasAccess) {
    return { error: "You do not have permission to update occupants." };
  }

  const { data: previousOccupant, error: previousOccupantError } = await supabase
    .from("occupants")
    .select(
      "id, full_name, student_id, course:classification, joined_at, status, home_address, birthdate, contact_mobile, contact_email, emergency_contact_name, emergency_contact_mobile, emergency_contact_relationship"
    )
    .eq("dorm_id", dormId)
    .eq("id", occupantId)
    .maybeSingle();

  if (previousOccupantError || !previousOccupant) {
    return { error: previousOccupantError?.message ?? "Occupant not found." };
  }

  const rawData = {
    full_name: formData.get("full_name"),
    student_id: formData.get("student_id"),
    course: formData.get("course"),
    joined_at: formData.get("joined_at"),
    status: formData.get("status"),
    home_address: formData.get("home_address"),
    birthdate: formData.get("birthdate"),
    contact_mobile: formData.get("contact_mobile"),
    contact_email: formData.get("contact_email"),
    emergency_contact_name: formData.get("emergency_contact_name"),
    emergency_contact_mobile: formData.get("emergency_contact_mobile"),
    emergency_contact_relationship: formData.get("emergency_contact_relationship"),
  };

  const parsedSystemAccess = systemAccessSchema.safeParse({
    role: formData.get("role"),
    committee_id: formData.get("committee_id"),
    committee_role: formData.get("committee_role"),
  });

  if (!parsedSystemAccess.success) {
    return { error: "Invalid system access data. " + JSON.stringify(parsedSystemAccess.error.issues) };
  }

  // Allow partial updates, but validate stricter if needed. 
  // For simpliciy, reusing logic but manually creating object
  const updates: Record<string, string | number | boolean | null> = {};
  if (rawData.full_name) updates.full_name = String(rawData.full_name).trim();
  if (rawData.student_id !== undefined) updates.student_id = String(rawData.student_id ?? "").trim() || null;
  if (rawData.course !== undefined) updates.classification = String(rawData.course ?? "").trim() || null;
  if (rawData.joined_at) updates.joined_at = String(rawData.joined_at).trim();
  if (rawData.status) {
    const parsedStatus = occupantStatusSchema.safeParse(
      String(rawData.status).trim()
    );
    if (!parsedStatus.success) {
      return { error: "Invalid occupant status." };
    }
    updates.status = parsedStatus.data;
  }
  if (rawData.home_address !== undefined) updates.home_address = String(rawData.home_address ?? "").trim() || null;
  if (rawData.birthdate !== undefined) updates.birthdate = String(rawData.birthdate ?? "").trim() || null;
  if (rawData.contact_mobile !== undefined) updates.contact_mobile = String(rawData.contact_mobile ?? "").trim() || null;
  if (rawData.contact_email !== undefined) {
    const value = String(rawData.contact_email ?? "").trim();
    updates.contact_email = value ? value.toLowerCase() : null;
  }
  if (rawData.emergency_contact_name !== undefined) updates.emergency_contact_name = String(rawData.emergency_contact_name ?? "").trim() || null;
  if (rawData.emergency_contact_mobile !== undefined) updates.emergency_contact_mobile = String(rawData.emergency_contact_mobile ?? "").trim() || null;
  if (rawData.emergency_contact_relationship !== undefined) updates.emergency_contact_relationship = String(rawData.emergency_contact_relationship ?? "").trim() || null;

  const { error } = await supabase
    .from("occupants")
    .update(updates)
    .eq("dorm_id", dormId)
    .eq("id", occupantId);

  if (error) {
    return { error: error.message };
  }

  const changedFields = getChangedOccupantFields(previousOccupant, updates);
  const previousStatus =
    typeof previousOccupant.status === "string" ? previousOccupant.status : null;
  const updatedStatus = typeof updates.status === "string" ? updates.status : previousStatus;

  if (changedFields.length > 0) {
    let action = "occupants.updated";
    if (updatedStatus === "removed" && previousStatus !== "removed") {
      action = "occupants.deleted";
    } else if (updatedStatus === "left" && previousStatus !== "left") {
      action = "occupants.marked_left";
    }

    try {
      await logAuditEvent({
        dormId,
        actorUserId: user.id,
        action,
        entityType: "occupant",
        entityId: occupantId,
        metadata: {
          changed_fields: changedFields,
          previous_status: previousStatus,
          new_status: updatedStatus,
        },
      });
    } catch (auditError) {
      console.error("Failed to write audit event for occupant update:", auditError);
    }
  }

  // Update System Access if user_id exists
  const { data: currentOccupant } = await supabase
    .from("occupants")
    .select("user_id")
    .eq("id", occupantId)
    .single();

  if (currentOccupant?.user_id) {
    const sysAccess = parsedSystemAccess.data;

    // Update Dorm Role
    if (sysAccess.role) {
      const { data: previousMembership } = await supabase
        .from("dorm_memberships")
        .select("role")
        .eq("dorm_id", dormId)
        .eq("user_id", currentOccupant.user_id)
        .maybeSingle();

      if (previousMembership?.role !== sysAccess.role) {
        await supabase
          .from("dorm_memberships")
          .upsert(
            { dorm_id: dormId, user_id: currentOccupant.user_id, role: sysAccess.role as AppRole },
            { onConflict: "dorm_id,user_id" }
          );

        await logAuditEvent({
          dormId,
          actorUserId: user.id,
          action: "membership.role_updated",
          entityType: "membership",
          entityId: currentOccupant.user_id, // Using userId as entityId for membership
          metadata: {
            target_user_id: currentOccupant.user_id,
            previous_role: previousMembership?.role ?? "none",
            new_role: sysAccess.role,
          },
        });
      }
    }

    // Update Committee Assignment - Overwrite previous assignments for simplicity given UI limitations.
    if (sysAccess.committee_id && sysAccess.committee_role) {
      // If we are assigning to a new committee, or updating role in current committee.
      // First, get committees in this dorm
      const { data: dormCommittees } = await supabase
        .from("committees")
        .select("id")
        .eq("dorm_id", dormId);
      const dormCommitteeIds = (dormCommittees ?? []).map((c) => c.id);

      // Ensure a single head/co-head by demoting existing members first in target committee
      if (sysAccess.committee_role === "head" || sysAccess.committee_role === "co-head") {
        await supabase
          .from("committee_members")
          .update({ role: "member" })
          .eq("committee_id", sysAccess.committee_id)
          .eq("role", sysAccess.committee_role);
      }

      // We clear out other committee memberships in this dorm to match the dropdown replacing the full role.
      if (dormCommitteeIds.length > 0) {
        await supabase
          .from("committee_members")
          .delete()
          .eq("user_id", currentOccupant.user_id)
          .in("committee_id", dormCommitteeIds)
          .neq("committee_id", sysAccess.committee_id);
      }

      // Upsert the new committee member assignment
      await supabase
        .from("committee_members")
        .upsert(
          {
            committee_id: sysAccess.committee_id,
            user_id: currentOccupant.user_id,
            role: sysAccess.committee_role
          },
          { onConflict: "committee_id,user_id" }
        );
    } else if (sysAccess.committee_id === "" || sysAccess.committee_role === "") {
      // Clear committee roles in this dorm, as they deselected it.
      const { data: dormCommittees } = await supabase
        .from("committees")
        .select("id")
        .eq("dorm_id", dormId);
      const dormCommitteeIds = (dormCommittees ?? []).map((c) => c.id);

      if (dormCommitteeIds.length > 0) {
        await supabase
          .from("committee_members")
          .delete()
          .eq("user_id", currentOccupant.user_id)
          .in("committee_id", dormCommitteeIds);
      }
    }
  }

  const activeRole = (await getActiveRole()) || "occupant";
  revalidatePath(`/${activeRole}/occupants`);
  revalidatePath(`/${activeRole}/occupants/${occupantId}`);
  return { success: true };
}

export async function getPersonalOccupant() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("occupants")
    .select(`
      id, dorm_id, full_name, student_id, course:classification, joined_at, status,
      home_address, birthdate, contact_mobile, contact_email, 
      emergency_contact_name, emergency_contact_mobile, emergency_contact_relationship
    `)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Error fetching personal occupant:", error);
    return null;
  }

  return data;
}

export async function updatePersonalOccupant(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in to update your info." };
  }

  const { data: occupant, error: occupantError } = await supabase
    .from("occupants")
    .select("id, dorm_id, full_name, student_id, status, home_address, birthdate, contact_mobile, contact_email, emergency_contact_name, emergency_contact_mobile, emergency_contact_relationship")
    .eq("user_id", user.id)
    .maybeSingle();

  if (occupantError || !occupant) {
    return { error: "Occupant record not found for this account." };
  }

  const rawData = {
    student_id: formData.get("student_id"),
    course: formData.get("course"),
    home_address: formData.get("home_address"),
    birthdate: formData.get("birthdate"),
    contact_mobile: formData.get("contact_mobile"),
    contact_email: formData.get("contact_email"),
    emergency_contact_name: formData.get("emergency_contact_name"),
    emergency_contact_mobile: formData.get("emergency_contact_mobile"),
    emergency_contact_relationship: formData.get("emergency_contact_relationship"),
  };

  const updates: Record<string, string | null> = {};
  if (rawData.student_id !== undefined) updates.student_id = String(rawData.student_id ?? "").trim() || null;
  if (rawData.course !== undefined) updates.classification = String(rawData.course ?? "").trim() || null;
  if (rawData.home_address !== undefined) updates.home_address = String(rawData.home_address ?? "").trim() || null;
  if (rawData.birthdate !== undefined) updates.birthdate = String(rawData.birthdate ?? "").trim() || null;
  if (rawData.contact_mobile !== undefined) updates.contact_mobile = String(rawData.contact_mobile ?? "").trim() || null;
  if (rawData.contact_email !== undefined) {
    const value = String(rawData.contact_email ?? "").trim();
    updates.contact_email = value ? value.toLowerCase() : null;
  }
  if (rawData.emergency_contact_name !== undefined) updates.emergency_contact_name = String(rawData.emergency_contact_name ?? "").trim() || null;
  if (rawData.emergency_contact_mobile !== undefined) updates.emergency_contact_mobile = String(rawData.emergency_contact_mobile ?? "").trim() || null;
  if (rawData.emergency_contact_relationship !== undefined) updates.emergency_contact_relationship = String(rawData.emergency_contact_relationship ?? "").trim() || null;

  // We use the same update logic but we'll use an admin client to bypass the current staff-only RLS update policy
  // while still verifying the record belongs to the user via our manual query above.
  const { createClient: createSupabaseAdminClient } = await import("@supabase/supabase-js");
  const adminClient = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { error } = await adminClient
    .from("occupants")
    .update(updates)
    .eq("id", occupant.id);

  if (error) {
    return { error: error.message };
  }

  const changedFields = getChangedOccupantFields(occupant as Record<string, unknown>, updates);

  if (changedFields.length > 0) {
    try {
      await logAuditEvent({
        dormId: occupant.dorm_id,
        actorUserId: user.id,
        action: "occupants.self_updated",
        entityType: "occupant",
        entityId: occupant.id,
        metadata: {
          changed_fields: changedFields,
        },
      });
    } catch (auditError) {
      console.error("Failed to write audit event for self update:", auditError);
    }
  }

  revalidatePath("/profile");
  const activeRole = (await getActiveRole()) || "occupant";
  revalidatePath(`/${activeRole}/occupants`);
  revalidatePath(`/${activeRole}/occupants/${occupant.id}`);

  return { success: true };
}
