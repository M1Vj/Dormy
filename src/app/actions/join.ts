"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";

import { logAuditEvent } from "@/lib/audit/log";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicBaseUrl } from "@/lib/public-url";

const assignableRoles = [
  "student_assistant",
  "treasurer",
  "adviser",
  "assistant_adviser",
  "occupant",
  "officer",
] as const;

const applicationStatusSchema = z.enum(["pending", "approved", "rejected", "cancelled"]);

const applySchema = z.object({
  dormId: z.string().uuid(),
  requestedRole: z.enum(assignableRoles).default("occupant"),
  message: z.string().trim().max(500).optional().nullable(),
  studentId: z.string().trim().max(50).optional().nullable(),
  roomNumber: z.string().trim().max(20).optional().nullable(),
  course: z.string().trim().max(100).optional().nullable(),
  yearLevel: z.string().trim().max(50).optional().nullable(),
  contactNumber: z.string().trim().max(20).optional().nullable(),
  homeAddress: z.string().trim().max(500).optional().nullable(),
  birthdate: z.string().trim().optional().nullable(),
  emergencyContactName: z.string().trim().max(100).optional().nullable(),
  emergencyContactMobile: z.string().trim().max(20).optional().nullable(),
  emergencyContactRelationship: z.string().trim().max(50).optional().nullable(),
});

const inviteSchema = z.object({
  dormId: z.string().uuid(),
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  role: z.enum(assignableRoles),
  note: z.string().trim().max(500).optional().nullable(),
});

const reviewSchema = z.object({
  applicationId: z.string().uuid(),
  status: applicationStatusSchema.exclude(["cancelled"]),
  grantedRole: z.enum(assignableRoles).optional().nullable(),
  reviewNote: z.string().trim().max(500).optional().nullable(),
});

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

function getUserNameFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null;
  const value = metadata as Record<string, unknown>;
  const fullName = typeof value.full_name === "string" ? value.full_name.trim() : "";
  if (fullName) return fullName;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (name) return name;
  return null;
}

function getUserAvatarFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null;
  const value = metadata as Record<string, unknown>;
  const avatar = typeof value.avatar_url === "string" ? value.avatar_url.trim() : "";
  if (avatar) return avatar;
  const picture = typeof value.picture === "string" ? value.picture.trim() : "";
  if (picture) return picture;
  return null;
}

export async function getDormDirectory() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("dorms")
    .select("id, name, slug")
    .order("name", { ascending: true });

  if (error) {
    console.error("Failed to load dorm directory:", error);
    return [];
  }

  return data ?? [];
}

export async function getMyDormApplications() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("dorm_applications")
    .select(
      "id, dorm_id, email, applicant_name, requested_role, granted_role, status, message, review_note, created_at, reviewed_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load applications:", error);
    return [];
  }

  return data ?? [];
}

export async function getMyDormInvites() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase() ?? null;
  if (!user || !email) return [];

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("dorm_invites")
    .select("id, dorm_id, email, role, note, created_at")
    .eq("email", email)
    .is("revoked_at", null)
    .is("claimed_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load invites:", error);
    return [];
  }

  return data ?? [];
}

export async function applyToDorm(formData: FormData) {
  const parsed = applySchema.safeParse({
    dormId: String(formData.get("dormId") ?? ""),
    requestedRole: String(formData.get("requestedRole") ?? "occupant"),
    message: String(formData.get("message") ?? "").trim() || null,
    studentId: String(formData.get("studentId") ?? "").trim() || null,
    roomNumber: String(formData.get("roomNumber") ?? "").trim() || null,
    course: String(formData.get("course") ?? "").trim() || null,
    yearLevel: String(formData.get("yearLevel") ?? "").trim() || null,
    contactNumber: String(formData.get("contactNumber") ?? "").trim() || null,
    homeAddress: String(formData.get("homeAddress") ?? "").trim() || null,
    birthdate: String(formData.get("birthdate") ?? "").trim() || null,
    emergencyContactName: String(formData.get("emergencyContactName") ?? "").trim() || null,
    emergencyContactMobile: String(formData.get("emergencyContactMobile") ?? "").trim() || null,
    emergencyContactRelationship: String(formData.get("emergencyContactRelationship") ?? "").trim() || null,
  });

  if (!parsed.success) {
    return { error: "Check the form inputs and try again." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email?.trim().toLowerCase() ?? null;
  if (!user || !email) {
    return { error: "You must be logged in to apply." };
  }

  const name = getUserNameFromMetadata(user.user_metadata) ?? null;
  const avatarUrl = getUserAvatarFromMetadata(user.user_metadata) ?? null;

  const { error } = await supabase.from("dorm_applications").insert({
    dorm_id: parsed.data.dormId,
    user_id: user.id,
    email,
    applicant_name: name,
    applicant_avatar_url: avatarUrl,
    requested_role: parsed.data.requestedRole,
    status: "pending",
    message: parsed.data.message,
    student_id: parsed.data.studentId,
    room_number: parsed.data.roomNumber,
    course: parsed.data.course,
    year_level: parsed.data.yearLevel,
    contact_number: parsed.data.contactNumber,
    home_address: parsed.data.homeAddress,
    birthdate: parsed.data.birthdate || null,
    emergency_contact_name: parsed.data.emergencyContactName,
    emergency_contact_mobile: parsed.data.emergencyContactMobile,
    emergency_contact_relationship: parsed.data.emergencyContactRelationship,
  });

  if (error) {
    return { error: error.message };
  }

  try {
    await logAuditEvent({
      dormId: parsed.data.dormId,
      actorUserId: user.id,
      action: "dorm.application_created",
      entityType: "dorm_application",
      metadata: {
        email,
        requested_role: parsed.data.requestedRole,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for application:", auditError);
  }

  revalidatePath("/join");
  return { success: true };
}

export async function cancelDormApplication(applicationId: string) {
  const parsed = z.string().uuid().safeParse(applicationId);
  if (!parsed.success) {
    return { error: "Invalid application." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in to cancel." };
  }

  const { data: application, error: fetchError } = await supabase
    .from("dorm_applications")
    .select("id, dorm_id, status")
    .eq("id", parsed.data)
    .maybeSingle();

  if (fetchError || !application) {
    return { error: fetchError?.message ?? "Application not found." };
  }

  if (application.status !== "pending") {
    return { error: "Only pending applications can be cancelled." };
  }

  const { error } = await supabase
    .from("dorm_applications")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", parsed.data);

  if (error) {
    return { error: error.message };
  }

  try {
    await logAuditEvent({
      dormId: application.dorm_id,
      actorUserId: user.id,
      action: "dorm.application_cancelled",
      entityType: "dorm_application",
      entityId: application.id,
    });
  } catch (auditError) {
    console.error("Failed to write audit event for cancellation:", auditError);
  }

  revalidatePath("/join");
  return { success: true };
}

export async function acceptDormInvite(inviteId: string) {
  const parsed = z.string().uuid().safeParse(inviteId);
  if (!parsed.success) {
    return { error: "Invalid invite." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email?.trim().toLowerCase() ?? null;
  if (!user || !email) {
    return { error: "You must be logged in to accept." };
  }

  const adminClient = createAdminClient();
  const { data: invite, error: inviteError } = await adminClient
    .from("dorm_invites")
    .select("id, dorm_id, email, role, claimed_at, revoked_at")
    .eq("id", parsed.data)
    .maybeSingle();

  if (inviteError || !invite) {
    return { error: inviteError?.message ?? "Invite not found." };
  }

  if (invite.email !== email) {
    return { error: "This invite does not match your email." };
  }

  if (invite.revoked_at) {
    return { error: "This invite has been revoked." };
  }

  if (invite.claimed_at) {
    return { error: "This invite has already been claimed." };
  }

  const { data: membership, error: membershipError } = await adminClient
    .from("dorm_memberships")
    .insert({
      dorm_id: invite.dorm_id,
      user_id: user.id,
      role: invite.role,
    })
    .select("id")
    .maybeSingle();

  if (membershipError) {
    return { error: membershipError.message };
  }

  const now = new Date().toISOString();
  await adminClient
    .from("dorm_invites")
    .update({
      claimed_by: user.id,
      claimed_at: now,
      updated_at: now,
    })
    .eq("id", invite.id);

  await adminClient
    .from("occupants")
    .update({ user_id: user.id, updated_at: now })
    .eq("dorm_id", invite.dorm_id)
    .is("user_id", null)
    .ilike("contact_email", email);

  try {
    await logAuditEvent({
      dormId: invite.dorm_id,
      actorUserId: user.id,
      action: "dorm.invite_claimed",
      entityType: "dorm_invite",
      entityId: invite.id,
      metadata: {
        role: invite.role,
        membership_id: membership?.id ?? null,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for invite claim:", auditError);
  }

  revalidatePath("/join");
  revalidatePath("/home");
  return { success: true };
}

export async function createDormInvite(formData: FormData) {
  const parsed = inviteSchema.safeParse({
    dormId: String(formData.get("dormId") ?? ""),
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? ""),
    note: String(formData.get("note") ?? "").trim() || null,
  });

  if (!parsed.success) {
    return { error: "Check the form inputs and try again." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in to invite." };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", parsed.data.dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError || !membership?.role) {
    return { error: membershipError?.message ?? "You do not have permission to invite." };
  }

  if (!new Set(["admin", "adviser"]).has(membership.role)) {
    return { error: "You do not have permission to invite." };
  }

  if (membership.role === "adviser" && parsed.data.role === "adviser") {
    return { error: "Only admins can invite adviser accounts." };
  }

  const adminClient = createAdminClient();
  const now = new Date().toISOString();
  const { data: createdInvite, error } = await adminClient
    .from("dorm_invites")
    .insert({
      dorm_id: parsed.data.dormId,
      email: parsed.data.email,
      role: parsed.data.role,
      note: parsed.data.note,
      created_by: user.id,
      updated_at: now,
    })
    .select("id")
    .single();

  if (error || !createdInvite) {
    return { error: error?.message ?? "Failed to create invite." };
  }

  try {
    await logAuditEvent({
      dormId: parsed.data.dormId,
      actorUserId: user.id,
      action: "dorm.invite_created",
      entityType: "dorm_invite",
      entityId: createdInvite.id,
      metadata: {
        email: parsed.data.email,
        role: parsed.data.role,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for invite:", auditError);
  }

  try {
    const { sendEmail, renderDormInviteEmail } = await import("@/lib/email");
    const baseUrl = getPublicBaseUrl();
    const joinUrl = `${baseUrl}/join`;

    const roleLabel = parsed.data.role
      .split("_")
      .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
      .join(" ");

    const { data: dorm } = await adminClient
      .from("dorms")
      .select("name")
      .eq("id", parsed.data.dormId)
      .maybeSingle();

    const rendered = renderDormInviteEmail({
      dormName: dorm?.name?.trim() || "Dorm",
      roleLabel,
      joinUrl,
      note: parsed.data.note ?? null,
    });

    const result = await sendEmail({
      to: parsed.data.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    if (!result.success) {
      console.warn("Invite email could not be sent:", result.error);
    }
  } catch (emailError) {
    console.error("Failed to send invite email:", emailError);
  }

  revalidatePath("/admin/users");
  return { success: true };
}

export async function getDormApplicationsForActiveDorm(dormId: string, status?: string | null) {
  const parsedDormId = z.string().uuid().safeParse(dormId);
  if (!parsedDormId.success) return [];

  const normalizedStatus = status ? applicationStatusSchema.safeParse(status) : null;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", parsedDormId.data)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership?.role || !new Set(["admin", "adviser", "student_assistant"]).has(membership.role)) {
    return [];
  }

  let query = supabase
    .from("dorm_applications")
    .select(
      "id, dorm_id, user_id, email, applicant_name, requested_role, granted_role, status, message, review_note, created_at, reviewed_at"
    )
    .eq("dorm_id", parsedDormId.data)
    .order("created_at", { ascending: false });

  if (normalizedStatus?.success) {
    query = query.eq("status", normalizedStatus.data);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Failed to load dorm applications:", error);
    return [];
  }

  return data ?? [];
}

export async function reviewDormApplication(formData: FormData) {
  const parsed = reviewSchema.safeParse({
    applicationId: String(formData.get("applicationId") ?? ""),
    status: String(formData.get("status") ?? ""),
    grantedRole: String(formData.get("grantedRole") ?? "").trim() || null,
    reviewNote: String(formData.get("reviewNote") ?? "").trim() || null,
  });

  if (!parsed.success) {
    return { error: "Check the form inputs and try again." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in to review applications." };
  }

  const { data: application, error: applicationError } = await supabase
    .from("dorm_applications")
    .select("id, dorm_id, user_id, email, status, requested_role, student_id, room_number, course, year_level, contact_number, home_address, birthdate, emergency_contact_name, emergency_contact_mobile, emergency_contact_relationship")
    .eq("id", parsed.data.applicationId)
    .maybeSingle();

  if (applicationError || !application) {
    return { error: applicationError?.message ?? "Application not found." };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", application.dorm_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    membershipError ||
    !membership?.role ||
    !new Set(["admin", "adviser", "student_assistant"]).has(membership.role)
  ) {
    return { error: "You do not have permission to review applications." };
  }

  const grantedRole =
    parsed.data.status === "approved"
      ? (parsed.data.grantedRole ?? application.requested_role)
      : null;

  if (membership.role === "student_assistant" && grantedRole && grantedRole !== "occupant") {
    return { error: "Student assistants can only approve occupant applications." };
  }

  if (membership.role === "adviser" && grantedRole === "adviser") {
    return { error: "Only admins can grant adviser roles." };
  }

  const now = new Date().toISOString();
  const adminClient = createAdminClient();

  if (parsed.data.status === "approved" && grantedRole) {
    const { error: membershipInsertError } = await adminClient
      .from("dorm_memberships")
      .upsert(
        {
          dorm_id: application.dorm_id,
          user_id: application.user_id,
          role: grantedRole,
          updated_at: now,
        },
        { onConflict: "dorm_id,user_id" }
      );

    if (membershipInsertError) {
      return { error: membershipInsertError.message };
    }

    await adminClient
      .from("occupants")
      .update({
        user_id: application.user_id,
        student_id: application.student_id,
        classification: application.course, // Maps course to classification
        room_number: application.room_number,
        year_level: application.year_level,
        contact_number: application.contact_number,
        contact_mobile: application.contact_number, // Also fill contact_mobile for consistency
        home_address: application.home_address,
        birthdate: application.birthdate,
        emergency_contact_name: application.emergency_contact_name,
        emergency_contact_mobile: application.emergency_contact_mobile,
        emergency_contact_relationship: application.emergency_contact_relationship,
        updated_at: now
      })
      .eq("dorm_id", application.dorm_id)
      .is("user_id", null)
      .ilike("contact_email", application.email);
  }

  const { error: updateError } = await adminClient
    .from("dorm_applications")
    .update({
      status: parsed.data.status,
      granted_role: grantedRole,
      reviewed_by: user.id,
      reviewed_at: now,
      review_note: parsed.data.reviewNote,
      updated_at: now,
    })
    .eq("id", application.id);

  if (updateError) {
    return { error: updateError.message };
  }

  try {
    await logAuditEvent({
      dormId: application.dorm_id,
      actorUserId: user.id,
      action:
        parsed.data.status === "approved"
          ? "dorm.application_approved"
          : "dorm.application_rejected",
      entityType: "dorm_application",
      entityId: application.id,
      metadata: {
        applicant_email: application.email,
        granted_role: grantedRole,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for review:", auditError);
  }

  revalidatePath("/applications");
  revalidatePath("/join");
  return { success: true };
}
