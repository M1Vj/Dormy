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

const provisioningRoles = ["admin", "adviser"] as const;
const occupantLinkedRoles = new Set([
  "student_assistant",
  "treasurer",
  "occupant",
  "officer",
]);

const createUserSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(assignableRoles),
  dormId: z.string().uuid(),
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

async function findAuthUserByEmail(
  adminClient: ReturnType<typeof createAdminClient>,
  email: string
) {
  const target = email.trim().toLowerCase();
  if (!target) return { user: null as null | { id: string; email?: string | null }, error: null as string | null };

  const perPage = 200;
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) {
      return { user: null, error: error.message };
    }

    const match = (data?.users ?? []).find((user) => (user.email ?? "").toLowerCase() === target);
    if (match) {
      return { user: match, error: null };
    }

    if (!data?.users?.length || data.users.length < perPage) {
      break;
    }
  }

  return { user: null, error: null };
}

async function ensureLinkedOccupant({
  adminClient,
  dormId,
  userId,
  fullName,
}: {
  adminClient: ReturnType<typeof createAdminClient>;
  dormId: string;
  userId: string;
  fullName: string;
}) {
  const { data: existing, error: existingError } = await adminClient
    .from("occupants")
    .select("id")
    .eq("dorm_id", dormId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError) {
    return { error: existingError.message };
  }

  if (existing?.id) {
    return { error: null };
  }

  const { data: namedMatch, error: namedMatchError } = await adminClient
    .from("occupants")
    .select("id")
    .eq("dorm_id", dormId)
    .eq("full_name", fullName)
    .is("user_id", null)
    .maybeSingle();

  if (namedMatchError) {
    return { error: namedMatchError.message };
  }

  if (namedMatch?.id) {
    const { error: linkError } = await adminClient
      .from("occupants")
      .update({ user_id: userId })
      .eq("id", namedMatch.id);

    return { error: linkError?.message ?? null };
  }

  const { error: insertError } = await adminClient.from("occupants").insert({
    dorm_id: dormId,
    user_id: userId,
    full_name: fullName,
  });

  return { error: insertError?.message ?? null };
}

export async function createUser(formData: FormData) {
  const parsed = createUserSchema.safeParse({
    firstName: String(formData.get("firstName") ?? "").trim(),
    lastName: String(formData.get("lastName") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    role: String(formData.get("role") ?? ""),
    dormId: String(formData.get("dormId") ?? ""),
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
    return { error: "You must be logged in to create users." };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", parsed.data.dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    membershipError ||
    !membership?.role ||
    !provisioningRoles.includes(
      membership.role as (typeof provisioningRoles)[number]
    )
  ) {
    return { error: "You do not have permission to create users." };
  }

  if (membership.role === "adviser" && parsed.data.role === "adviser") {
    return { error: "Only admins can create adviser accounts." };
  }

  const adminClient = createAdminClient();
  const displayName = `${parsed.data.firstName} ${parsed.data.lastName}`.trim();
  const existingLookup = await findAuthUserByEmail(adminClient, parsed.data.email);
  if (existingLookup.error) {
    return { error: existingLookup.error };
  }

  const existingUser = existingLookup.user;
  const targetUserId = existingUser?.id ?? null;
  const isExistingAccount = Boolean(targetUserId);

  if (targetUserId) {
    const { error: updateError } = await adminClient.auth.admin.updateUserById(targetUserId, {
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: {
        full_name: displayName,
      },
    });

    if (updateError) {
      return { error: updateError.message ?? "Failed to update user." };
    }
  }

  const { data: created, error: createError } = targetUserId
    ? { data: { user: { id: targetUserId } }, error: null }
    : await adminClient.auth.admin.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: {
        full_name: displayName,
      },
    });

  if (createError || !created.user) {
    return { error: createError?.message ?? "Failed to create user." };
  }

  const createdUserId = created.user.id;

  const { error: profileError } = await adminClient.from("profiles").upsert(
    {
      user_id: createdUserId,
      display_name: displayName,
    },
    {
      onConflict: "user_id",
    }
  );

  if (profileError) {
    console.warn("Failed to sync profile display name:", profileError.message);
  }

  const { data: existingMembership, error: membershipFetchError } = await adminClient
    .from("dorm_memberships")
    .select("id, role")
    .eq("dorm_id", parsed.data.dormId)
    .eq("user_id", createdUserId)
    .maybeSingle();

  if (membershipFetchError) {
    if (!isExistingAccount) {
      await adminClient.auth.admin.deleteUser(createdUserId);
    }
    return { error: membershipFetchError.message };
  }

  if (existingMembership?.role === "admin") {
    // Never downgrade admin from the UI. Admin must be managed directly in the database.
  } else if (existingMembership?.id) {
    const { error: membershipUpdateError } = await adminClient
      .from("dorm_memberships")
      .update({ role: parsed.data.role })
      .eq("id", existingMembership.id);

    if (membershipUpdateError) {
      if (!isExistingAccount) {
        await adminClient.auth.admin.deleteUser(createdUserId);
      }
      return { error: membershipUpdateError.message };
    }
  } else {
    const { error: membershipInsertError } = await adminClient
      .from("dorm_memberships")
      .insert({
        dorm_id: parsed.data.dormId,
        user_id: createdUserId,
        role: parsed.data.role,
      });

    if (membershipInsertError) {
      if (!isExistingAccount) {
        await adminClient.auth.admin.deleteUser(createdUserId);
      }
      return { error: membershipInsertError.message };
    }
  }

  if (occupantLinkedRoles.has(parsed.data.role)) {
    const ensureResult = await ensureLinkedOccupant({
      adminClient,
      dormId: parsed.data.dormId,
      userId: createdUserId,
      fullName: displayName,
    });

    if (ensureResult.error) {
      return { error: `Failed to link occupant profile: ${ensureResult.error}` };
    }
  }

  try {
    await logAuditEvent({
      dormId: parsed.data.dormId,
      actorUserId: user.id,
      action: isExistingAccount ? "admin.user_reprovisioned" : "admin.user_provisioned",
      entityType: "dorm_membership",
      entityId: null,
      metadata: {
        target_user_id: createdUserId,
        target_email: parsed.data.email,
        target_role: existingMembership?.role === "admin" ? "admin" : parsed.data.role,
        existing_account: isExistingAccount,
      },
    });
  } catch (error) {
    console.error("Failed to write audit event for user provisioning:", error);
  }

  try {
    const { sendEmail, renderAccountWelcomeEmail } = await import("@/lib/email");
    const baseUrl = getPublicBaseUrl();
    const loginUrl = `${baseUrl}/login`;

    const roleLabel = parsed.data.role
      .split("_")
      .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
      .join(" ");

    const rendered = renderAccountWelcomeEmail({
      recipientEmail: parsed.data.email,
      recipientName: displayName,
      roleLabel,
      loginUrl,
    });

    const result = await sendEmail({
      to: parsed.data.email,
      subject: isExistingAccount ? `Dormy access updated` : rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    if (!result.success) {
      console.warn("Account email could not be sent:", result.error);
    }
  } catch (emailError) {
    console.error("Failed to send account email:", emailError);
  }

  revalidatePath("/admin/users");
  return { success: true };
}
