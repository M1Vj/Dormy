import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type OccupantRef = {
  full_name?: string | null;
  student_id?: string | null;
};

type FineRuleRef = {
  title?: string | null;
  severity?: string | null;
};

export type FineReportRow = {
  id: string;
  status: "pending" | "approved" | "rejected";
  occurred_at: string;
  created_at: string;
  details: string;
  reporter?: OccupantRef | OccupantRef[] | null;
  reported?: OccupantRef | OccupantRef[] | null;
  rule?: FineRuleRef | FineRuleRef[] | null;
};

const first = <T,>(value?: T | T[] | null) => (Array.isArray(value) ? value[0] : value);

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

export function FineReportsTable({ reports, role = "admin" }: { reports: FineReportRow[], role?: string }) {
  return (
    <div className="space-y-3">
      <div className="space-y-3 md:hidden">
        {reports.map((report) => {
          const reported = first(report.reported);
          const reporter = first(report.reporter);

          return (
            <Link
              key={report.id}
              href={`/${role}/fines/reports/${report.id}`}
              className="block rounded-lg border p-3 transition hover:bg-muted/40"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {reported?.full_name?.trim() || "Unknown occupant"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Reporter: {reporter?.full_name?.trim() || "-"}
                  </p>
                </div>
                {statusBadge(report.status)}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Occurred {formatDateTime(report.occurred_at)}
              </p>
              <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{report.details}</p>
            </Link>
          );
        })}

        {!reports.length ? (
          <div className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
            No reports found.
          </div>
        ) : null}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b">
              <th className="px-3 py-2 font-medium">Reported</th>
              <th className="px-3 py-2 font-medium">Reporter</th>
              <th className="px-3 py-2 font-medium">Occurred</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => {
              const reported = first(report.reported);
              const reporter = first(report.reporter);

              return (
                <tr key={report.id} className="border-b">
                  <td className="px-3 py-2 font-medium">
                    {reported?.full_name?.trim() || "Unknown"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {reporter?.full_name?.trim() || "-"}
                  </td>
                  <td className="px-3 py-2 text-xs">{formatDateTime(report.occurred_at)}</td>
                  <td className="px-3 py-2">{statusBadge(report.status)}</td>
                  <td className="px-3 py-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/${role}/fines/reports/${report.id}`}>Open</Link>
                    </Button>
                  </td>
                </tr>
              );
            })}
            {!reports.length ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  No reports found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

