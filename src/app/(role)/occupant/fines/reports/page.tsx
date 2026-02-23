import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getFineRules } from "@/app/actions/fines";
import { getFineReports } from "@/app/actions/fine-reports";
import { SubmitFineReportDialog } from "@/components/fines/submit-fine-report-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveDormId } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type DirectoryRow = {
  id: string;
  full_name: string | null;
  student_id: string | null;
  course: string | null;
  room_code: string | null;
  room_level: number | null;
};

type FineReportRow = {
  id: string;
  reported_occupant_id: string;
  rule_id: string | null;
  details: string;
  occurred_at: string;
  proof_storage_path: string | null;
  status: "pending" | "approved" | "rejected";
  review_comment: string | null;
  reviewed_at: string | null;
  created_at: string;
};

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function statusBadge(status: FineReportRow["status"]) {
  if (status === "approved") return <Badge className="bg-emerald-600">Approved</Badge>;
  if (status === "rejected") return <Badge variant="destructive">Rejected</Badge>;
  return <Badge variant="outline">Pending</Badge>;
}

export default async function FineReportsPage() {
  const dormId = await getActiveDormId();
  if (!dormId) {
    return <div className="p-6 text-sm text-muted-foreground">No active dorm selected.</div>;
  }

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

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  const role = membership?.role ?? null;
  if (!role) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        No dorm membership found for this account.
      </div>
    );
  }

  // Students and occupants need access. Role logic here was overly restrictive.
  if (!role) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fine reports</h1>
          <p className="text-sm text-muted-foreground">
            You do not have a role in this dorm.
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/occupant/home">Back to home</Link>
        </Button>
      </div>
    );
  }

  const { data: currentOccupant } = await supabase
    .from("occupants")
    .select("id")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!currentOccupant?.id) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Your account is not linked to an occupant profile yet.
      </div>
    );
  }

  const [{ data: directory }, rules, reportsResult] = await Promise.all([
    supabase.rpc("get_dorm_occupant_directory", { p_dorm_id: dormId }),
    getFineRules(dormId),
    getFineReports(dormId),
  ]);

  const directoryRows = (directory ?? []) as DirectoryRow[];
  const occupantById = new Map(directoryRows.map((row) => [row.id, row]));
  const reports = ("data" in reportsResult ? (reportsResult.data ?? []) : []) as FineReportRow[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Fine reports</h1>
          <p className="text-sm text-muted-foreground">
            Submit peer-reported violations for Student Assistant review. Reporters remain anonymous to the fined occupant.
          </p>
        </div>
        <SubmitFineReportDialog
          dormId={dormId}
          currentOccupantId={currentOccupant.id}
          occupants={directoryRows}
          rules={rules}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">My submitted reports</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 md:hidden">
            {reports.map((report) => {
              const reported = occupantById.get(report.reported_occupant_id);
              const reportedName = reported?.full_name?.trim() || "Unknown occupant";

              return (
                <Link
                  key={report.id}
                  href={`/fines/reports/${report.id}`}
                  className="block rounded-lg border p-3 transition hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{reportedName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(report.occurred_at)}
                      </p>
                    </div>
                    {statusBadge(report.status)}
                  </div>
                  <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">
                    {report.details}
                  </p>
                </Link>
              );
            })}

            {!reports.length ? (
              <div className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
                No reports submitted yet.
              </div>
            ) : null}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="px-3 py-2 font-medium">Reported occupant</th>
                  <th className="px-3 py-2 font-medium">Occurred</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => {
                  const reported = occupantById.get(report.reported_occupant_id);
                  const reportedName = reported?.full_name?.trim() || "Unknown occupant";

                  return (
                    <tr key={report.id} className="border-b">
                      <td className="px-3 py-2 font-medium">{reportedName}</td>
                      <td className="px-3 py-2 text-xs">{formatDateTime(report.occurred_at)}</td>
                      <td className="px-3 py-2">{statusBadge(report.status)}</td>
                      <td className="px-3 py-2">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/fines/reports/${report.id}`}>Open</Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {!reports.length ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                      No reports submitted yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
