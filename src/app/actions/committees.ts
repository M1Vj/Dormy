"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logAuditEvent } from "@/lib/audit/log";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Joined<T> = T | T[] | null;

function first<T>(value: Joined<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

const committeeSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().optional(),
});

const memberSchema = z.object({
  userId: z.string().uuid("Invalid user id"),
  role: z.enum(["head", "co-head", "member"]),
});

export type CommitteeMemberRole = z.infer<typeof memberSchema>["role"];

type CommitteeMemberJoinRow = {
  role: CommitteeMemberRole;
  user_id: string;
  profile: Joined<{
    display_name: string | null;
  }>;
};

type CommitteeRow = {
  id: string;
  dorm_id: string;
  name: string;
  description: string | null;
  created_at: string;
  members: CommitteeMemberJoinRow[] | null;
};

type CommitteeEventRow = {
  id: string;
  title: string;
  starts_at: string | null;
};

type CommitteeExpenseRow = {
  id: string;
  title: string;
  amount_pesos: number;
  status: string;
};

export type CommitteeMember = {
  role: CommitteeMemberRole;
  user_id: string;
  display_name: string | null;
};

export type CommitteeSummary = {
  id: string;
  dorm_id: string;
  name: string;
  description: string | null;
  created_at: string;
  members: CommitteeMember[];
};

export type CommitteeDetail = CommitteeSummary & {
  events: CommitteeEventRow[];
  expenses: CommitteeExpenseRow[];
};

export async function createCommittee(dormId: string, formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Supabase not configured." };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // Check permission (Admin, Adviser, SA)
  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership || !["admin", "adviser", "student_assistant"].includes(membership.role)) {
    return { error: "Only admins, advisers, and student assistants can create committees." };
  }

  const parse = committeeSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
  });

  if (!parse.success) return { error: parse.error.issues[0].message };

  const { data: committee, error } = await supabase
    .from("committees")
    .insert({
      dorm_id: dormId,
      name: parse.data.name,
      description: parse.data.description,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  await logAuditEvent({
    dormId,
    actorUserId: user.id,
    action: "committee.created",
    entityType: "committee",
    entityId: committee.id,
    metadata: { name: committee.name },
  });

  revalidatePath("/committees");
  return { success: true, committee };
}

export async function addCommitteeMember(committeeId: string, userId: string, role: "head" | "co-head" | "member") {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Supabase not configured." };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const parsedInput = memberSchema.safeParse({ userId, role });
  if (!parsedInput.success) {
    return { error: parsedInput.error.issues[0]?.message ?? "Invalid member input." };
  }

  // Check if current user is admin/SA of dorm OR head/co-head of committee
  const { data: committee } = await supabase
    .from("committees")
    .select("dorm_id")
    .eq("id", committeeId)
    .single();

  if (!committee) return { error: "Committee not found" };

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", committee.dorm_id)
    .eq("user_id", user.id)
    .maybeSingle();

  const isAdminOrSA = membership && ["admin", "adviser", "student_assistant"].includes(membership.role);

  // check if head
  const { data: userCommitteeRole } = await supabase
    .from("committee_members")
    .select("role")
    .eq("committee_id", committeeId)
    .eq("user_id", user.id)
    .maybeSingle();

  const isHead = userCommitteeRole && ["head", "co-head"].includes(userCommitteeRole.role);

  if (!isAdminOrSA && !isHead) {
    return { error: "You do not have permission to manage members." };
  }

  const { data: targetMembership, error: targetMembershipError } = await supabase
    .from("dorm_memberships")
    .select("id")
    .eq("dorm_id", committee.dorm_id)
    .eq("user_id", parsedInput.data.userId)
    .maybeSingle();

  if (targetMembershipError) {
    return { error: targetMembershipError.message };
  }

  if (!targetMembership?.id) {
    return { error: "That user is not a member of this dorm." };
  }

  // Ensure a single head/co-head by demoting existing members first.
  if (parsedInput.data.role === "head") {
    await supabase
      .from("committee_members")
      .update({ role: "member" })
      .eq("committee_id", committeeId)
      .eq("role", "head");
  }

  if (parsedInput.data.role === "co-head") {
    await supabase
      .from("committee_members")
      .update({ role: "member" })
      .eq("committee_id", committeeId)
      .eq("role", "co-head");
  }

  const { error } = await supabase
    .from("committee_members")
    .upsert({
      committee_id: committeeId,
      user_id: parsedInput.data.userId,
      role: parsedInput.data.role,
    }, { onConflict: "committee_id,user_id" });

  if (error) return { error: error.message };

  revalidatePath(`/committees/${committeeId}`);
  return { success: true };
}

export async function removeCommitteeMember(committeeId: string, userId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Supabase not configured." };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const parsedInput = z.string().uuid("Invalid user id").safeParse(userId);
  if (!parsedInput.success) {
    return { error: parsedInput.error.issues[0]?.message ?? "Invalid member input." };
  }

  // Check permissions (same as add)
  const { data: committee } = await supabase
    .from("committees")
    .select("dorm_id")
    .eq("id", committeeId)
    .single();

  if (!committee) return { error: "Committee not found" };

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", committee.dorm_id)
    .eq("user_id", user.id)
    .maybeSingle();

  const isAdminOrSA = membership && ["admin", "adviser", "student_assistant"].includes(membership.role);

  const { data: userCommitteeRole } = await supabase
    .from("committee_members")
    .select("role")
    .eq("committee_id", committeeId)
    .eq("user_id", user.id)
    .maybeSingle();

  const isHead = userCommitteeRole && ["head", "co-head"].includes(userCommitteeRole.role);

  if (!isAdminOrSA && !isHead) {
    return { error: "Permission denied." };
  }

  const { error } = await supabase
    .from("committee_members")
    .delete()
    .eq("committee_id", committeeId)
    .eq("user_id", parsedInput.data);

  if (error) return { error: error.message };

  revalidatePath(`/committees/${committeeId}`);
  return { success: true };
}

export async function deleteCommittee(committeeId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Supabase not configured." };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: committee } = await supabase
    .from("committees")
    .select("dorm_id")
    .eq("id", committeeId)
    .single();

  if (!committee) return { error: "Committee not found" };

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", committee.dorm_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership || !["admin", "adviser"].includes(membership.role)) {
    return { error: "Only admins and advisers can delete committees." };
  }

  const { error } = await supabase.from("committees").delete().eq("id", committeeId);
  if (error) return { error: error.message };

  await logAuditEvent({
    dormId: committee.dorm_id,
    actorUserId: user.id,
    action: "committee.deleted",
    entityType: "committee",
    entityId: committeeId,
    metadata: {},
  });

  revalidatePath("/committees");
  return { success: true };
}

export async function getCommittees(dormId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Supabase not configured." };

  // select committees, join committee_members, join profiles
  const { data, error } = await supabase
    .from("committees")
    .select(`
      *,
      members:committee_members(
        role,
        user_id,
        profile:profiles(
          display_name
        )
      )
    `)
    .eq("dorm_id", dormId)
    .order("created_at", { ascending: false });

  if (error) return { error: error.message };

  const formatted = ((data ?? []) as unknown as CommitteeRow[]).map((committee) => ({
    id: committee.id,
    dorm_id: committee.dorm_id,
    name: committee.name,
    description: committee.description ?? null,
    created_at: committee.created_at,
    members: (committee.members ?? []).map((member) => ({
      role: member.role,
      user_id: member.user_id,
      display_name: first(member.profile)?.display_name ?? null,
    })),
  })) satisfies CommitteeSummary[];

  return { data: formatted };
}

export async function getCommittee(committeeId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Supabase not configured." };

  const { data, error } = await supabase
    .from("committees")
    .select(`
      *,
      members:committee_members(
        role,
        user_id,
        profile:profiles(
          display_name
        )
      ),
      events(id, title, starts_at),
      expenses(id, title, amount_pesos, status)
    `)
    .eq("id", committeeId)
    .single();

  if (error) return { error: error.message };

  const raw = data as unknown as CommitteeRow & {
    events: CommitteeEventRow[] | null;
    expenses: CommitteeExpenseRow[] | null;
  };

  const formatted = {
    id: raw.id,
    dorm_id: raw.dorm_id,
    name: raw.name,
    description: raw.description ?? null,
    created_at: raw.created_at,
    members: (raw.members ?? []).map((member) => ({
      role: member.role,
      user_id: member.user_id,
      display_name: first(member.profile)?.display_name ?? null,
    })),
    events: raw.events ?? [],
    expenses: raw.expenses ?? [],
  } satisfies CommitteeDetail;

  return { data: formatted };
}
