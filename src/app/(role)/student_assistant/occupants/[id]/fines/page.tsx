import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { getActiveDormId } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOccupant } from "@/app/actions/occupants";
import { getFineRules, getFines } from "@/app/actions/fines";
import { FinesLedger } from "@/components/admin/fines/fines-ledger";
import { Button } from "@/components/ui/button";

type SearchParams = {
  search?: string | string[];
  status?: string | string[];
};

const normalizeParam = (value?: string | string[]) => {
  if (Array.isArray(value)) {
    return value.length ? value[0] : undefined;
  }
  return value;
};

export default async function OccupantFinesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const resolvedParams = await params;
  const sParams = await searchParams;
  const search = normalizeParam(sParams?.search)?.trim() || "";
  const status = normalizeParam(sParams?.status)?.trim() || "";

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
  if (!activeDormId) {
    redirect("/dorm-selection");
  }

  const { data: memberships } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("dorm_id", activeDormId);

  const roles = memberships?.map((m) => m.role) ?? [];
  const hasAccess = roles.some((r) => new Set(["admin", "student_assistant", "adviser"]).has(r));

  if (!hasAccess) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You do not have access to this page.
      </div>
    );
  }

  const occupantId = resolvedParams.id;
  const occupantParams = { id: occupantId, dormId: activeDormId };
  
  // We need to fetch the occupant to ensure they exist and get their name
  const occupant = await getOccupant(activeDormId, occupantId);
  
  if (!occupant) {
    notFound();
  }

  const [rules, fines] = await Promise.all([
    getFineRules(activeDormId),
    getFines(activeDormId, {
      search: search || undefined,
      status: status || undefined,
      occupantId,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href={`/student_assistant/occupants`}>
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only">Back</span>
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Fines: {occupant.full_name}</h1>
          <p className="text-sm text-muted-foreground">
            Manage fines specifically for this occupant.
          </p>
        </div>
      </div>

      <FinesLedger
        dormId={activeDormId}
        fines={fines}
        rules={rules}
        // Pass only this occupant to the dropdown so it's the only option available
        occupants={[{ id: occupant.id, full_name: occupant.full_name ?? "Unknown", student_id: occupant.student_id ?? "" }]}
        role="student_assistant"
        filters={{ search, status }}
      />
    </div>
  );
}
