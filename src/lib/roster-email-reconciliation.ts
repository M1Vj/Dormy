import "server-only";

import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return createSupabaseAdminClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
}

export async function reconcileRosterEmailMemberships(
  userId: string,
  email: string | null | undefined
) {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!userId || !normalizedEmail) {
    return [];
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return [];
  }

  const { data: matchingOccupants, error: occupantsError } = await adminClient
    .from("occupants")
    .select("id, dorm_id")
    .eq("status", "active")
    .is("user_id", null)
    .ilike("contact_email", normalizedEmail);

  if (occupantsError || !matchingOccupants?.length) {
    if (occupantsError) {
      console.error("Failed to load occupant email matches:", occupantsError);
    }
    return [];
  }

  const dormIds = Array.from(new Set(matchingOccupants.map((occupant) => occupant.dorm_id)));

  const { data: existingMemberships, error: membershipsError } = await adminClient
    .from("dorm_memberships")
    .select("dorm_id")
    .eq("user_id", userId)
    .in("dorm_id", dormIds);

  if (membershipsError) {
    console.error("Failed to load existing memberships for roster reconciliation:", membershipsError);
    return [];
  }

  const existingDormIds = new Set((existingMemberships ?? []).map((membership) => membership.dorm_id));
  const missingDormIds = dormIds.filter((dormId) => !existingDormIds.has(dormId));
  const now = new Date().toISOString();

  if (missingDormIds.length > 0) {
    const { error: insertMembershipError } = await adminClient.from("dorm_memberships").upsert(
      missingDormIds.map((dormId) => ({
        dorm_id: dormId,
        user_id: userId,
        role: "occupant",
        updated_at: now,
      })),
      { onConflict: "dorm_id,user_id,role" }
    );

    if (insertMembershipError) {
      console.error("Failed to create memberships from roster email match:", insertMembershipError);
      return [];
    }
  }

  const { error: updateOccupantsError } = await adminClient
    .from("occupants")
    .update({
      user_id: userId,
      updated_at: now,
    })
    .eq("status", "active")
    .is("user_id", null)
    .ilike("contact_email", normalizedEmail);

  if (updateOccupantsError) {
    console.error("Failed to link occupants to the authenticated user:", updateOccupantsError);
    return [];
  }

  return dormIds;
}
