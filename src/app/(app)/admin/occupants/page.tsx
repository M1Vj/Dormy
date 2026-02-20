import { redirect } from "next/navigation";

import { getOccupants } from "@/app/actions/occupants";
import { OccupantTable } from "@/components/admin/occupants/occupant-table";
import { getActiveDormId } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SearchParams = {
  search?: string | string[];
  status?: string | string[];
  room?: string | string[];
  level?: string | string[];
};

const normalizeParam = (value?: string | string[]) => {
  if (Array.isArray(value)) {
    return value.length ? value[0] : undefined;
  }
  return value;
};

export default async function AdminOccupantsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Supabase is not configured for this environment.
      </div>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const activeDormId = await getActiveDormId();
  const { data: memberships } = await supabase
    .from("dorm_memberships")
    .select("role, dorm_id")
    .eq("user_id", user.id);

  const activeMemberships = memberships?.filter(m => m.dorm_id === activeDormId) ?? [];
  const hasAccess = activeMemberships.some(m => new Set(["admin", "student_assistant"]).has(m.role));
  if (!hasAccess) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You do not have access to this page.
      </div>
    );
  }

  const search = normalizeParam(params?.search);
  const status = normalizeParam(params?.status);
  const room = normalizeParam(params?.room);
  const level = normalizeParam(params?.level);
  const trimmedSearch = search?.trim() || undefined;
  const trimmedStatus = status?.trim() || undefined;
  const trimmedRoom = room?.trim() || undefined;
  const trimmedLevel = level?.trim() || undefined;

  const occupants = await getOccupants(activeDormId!, {
    search: trimmedSearch,
    status: trimmedStatus,
    room: trimmedRoom,
    level: trimmedLevel,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Occupants</h1>
        <p className="text-sm text-muted-foreground">
          Manage the roster and current room assignments.
        </p>
      </div>
      <OccupantTable
        dormId={activeDormId!}
        occupants={occupants}
        filters={{
          search: trimmedSearch,
          status: trimmedStatus,
          room: trimmedRoom,
          level: trimmedLevel,
        }}
      />
    </div>
  );
}
