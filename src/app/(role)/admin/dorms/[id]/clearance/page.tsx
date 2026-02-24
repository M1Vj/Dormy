import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { getDashboardStats } from "@/app/actions/stats";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

function formatPesos(value: number) {
  return `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function DormClearancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return <div className="p-6 text-sm text-muted-foreground">Supabase is not configured for this environment.</div>;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: memberships } = await supabase
    .from("dorm_memberships")
    .select("role, dorm_id")
    .eq("user_id", user.id);

  const isAdmin = memberships?.some(m => m.role === "admin") ?? false;
  const hasDormAccess = memberships?.some(m => m.dorm_id === id && new Set(["admin", "student_assistant", "adviser"]).has(m.role)) ?? false;

  if (!isAdmin && !hasDormAccess) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You do not have access to this page.
      </div>
    );
  }

  const stats = await getDashboardStats(id);
  if ("error" in stats) {
    return <div className="p-6 text-sm text-destructive">{stats.error}</div>;
  }

  const clearanceList = [...stats.clearanceList].sort((a, b) => {
    if (a.is_cleared === b.is_cleared) {
      return a.full_name.localeCompare(b.full_name);
    }
    return a.is_cleared ? 1 : -1;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href={`/admin/dorms/${id}`}>
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clearance</h1>
          <p className="text-sm text-muted-foreground">
            Dorm-wide clearance view for all active occupants in this dorm.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Occupants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{stats.totalOccupants}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Cleared</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-emerald-600">{stats.occupantsCleared}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Not Cleared</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-amber-600">{stats.occupantsNotCleared}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Occupant Clearance List</CardTitle>
          <CardDescription>Status is based on current semester balances across required ledgers.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Student ID</TableHead>
                  <TableHead className="text-right">Payables</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clearanceList.map((item) => (
                  <TableRow key={item.occupant_id}>
                    <TableCell className="font-medium">{item.full_name}</TableCell>
                    <TableCell>{item.student_id ?? "-"}</TableCell>
                    <TableCell className="text-right">{formatPesos(Math.max(item.total_balance, 0))}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${item.is_cleared
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
                          : "border-amber-500/20 bg-amber-500/10 text-amber-700"
                          }`}
                      >
                        {item.is_cleared ? "Cleared" : "Not Cleared"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {!clearanceList.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                      No occupants found.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
