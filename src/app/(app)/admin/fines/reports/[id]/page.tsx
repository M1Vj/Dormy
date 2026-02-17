import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";

import { getFineRules } from "@/app/actions/fines";
import { FineReportCommentForm } from "@/components/fines/fine-report-comment-form";
import { ReviewFineReportPanel } from "@/components/admin/fines/review-fine-report-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveDormId } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type OccupantRef = {
  full_name?: string | null;
  student_id?: string | null;
  user_id?: string | null;
};

type FineRuleRef = {
  title?: string | null;
  severity?: string | null;
};

type FineReportRow = {
  id: string;
  dorm_id: string;
  semester_id: string;
  reporter_occupant_id: string;
  reported_occupant_id: string;
  rule_id: string | null;
  details: string;
  occurred_at: string;
  proof_storage_path: string | null;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  review_comment: string | null;
  reviewed_at: string | null;
  fine_id: string | null;
  created_at: string;
  reporter?: OccupantRef | OccupantRef[] | null;
  reported?: OccupantRef | OccupantRef[] | null;
  rule?: FineRuleRef | FineRuleRef[] | null;
};

type FineReportCommentRow = {
  id: string;
  author_user_id: string;
  body: string;
  created_at: string;
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

export default async function AdminFineReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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

  if (!membership || !new Set(["admin", "student_assistant"]).has(membership.role)) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You do not have access to this page.
      </div>
    );
  }

  const [reportResult, commentsResult, rules] = await Promise.all([
    supabase
      .from("fine_reports")
      .select(
        `
        *,
        reporter:occupants(full_name, student_id, user_id),
        reported:occupants(full_name, student_id),
        rule:fine_rules(title, severity)
      `
      )
      .eq("dorm_id", dormId)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("fine_report_comments")
      .select("id, author_user_id, body, created_at")
      .eq("dorm_id", dormId)
      .eq("report_id", id)
      .order("created_at", { ascending: true }),
    getFineRules(dormId),
  ]);

  if (reportResult.error) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        {reportResult.error.message}
      </div>
    );
  }

  const report = reportResult.data as FineReportRow | null;
  if (!report) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Fine report not found.
      </div>
    );
  }

  const reporter = first(report.reporter);
  const reported = first(report.reported);
  const rule = first(report.rule);

  let proofSignedUrl: string | null = null;
  if (report.proof_storage_path) {
    const { data, error } = await supabase.storage
      .from("dormy-uploads")
      .createSignedUrl(report.proof_storage_path, 10 * 60);
    if (!error) {
      proofSignedUrl = data?.signedUrl ?? null;
    }
  }

  const comments = (commentsResult.data ?? []) as FineReportCommentRow[];

  const reporterUserId = reporter?.user_id ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Fine report review</h1>
          <p className="text-sm text-muted-foreground">
            Reported occupant: <span className="font-medium text-foreground">{reported?.full_name ?? "Unknown"}</span>
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/admin/fines">Back to fines</Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-base">Report details</CardTitle>
              {statusBadge(report.status)}
            </div>
            <div className="text-xs text-muted-foreground">
              Occurred {formatDateTime(report.occurred_at)} · Submitted {formatDateTime(report.created_at)}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm">
              <p className="text-xs font-medium text-muted-foreground">Reporter (SA-only)</p>
              <p className="font-medium">{reporter?.full_name ?? "Unknown"}</p>
              <p className="text-xs text-muted-foreground">{reporter?.student_id ?? "-"}</p>
            </div>
            <div className="text-sm">
              <p className="text-xs font-medium text-muted-foreground">Rule</p>
              <p className="font-medium">
                {rule?.title
                  ? `${rule.title}${rule.severity ? ` (${rule.severity})` : ""}`
                  : "Unspecified"}
              </p>
            </div>
            <div className="text-sm">
              <p className="text-xs font-medium text-muted-foreground">Details</p>
              <p className="whitespace-pre-wrap">{report.details}</p>
            </div>

            {report.review_comment ? (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="text-xs font-medium text-muted-foreground">Decision note</p>
                <p className="whitespace-pre-wrap">{report.review_comment}</p>
                {report.reviewed_at ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Reviewed {formatDateTime(report.reviewed_at)}
                  </p>
                ) : null}
                {report.fine_id ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Fine ID: <span className="font-mono">{report.fine_id}</span>
                  </p>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Proof</CardTitle>
          </CardHeader>
          <CardContent>
            {proofSignedUrl ? (
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md border bg-muted">
                <Image
                  src={proofSignedUrl}
                  alt="Proof photo"
                  fill
                  sizes="(max-width: 1024px) 100vw, 560px"
                  className="object-contain"
                />
              </div>
            ) : (
              <div className="flex h-32 items-center justify-center rounded-md border bg-muted text-sm text-muted-foreground">
                Proof photo unavailable.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {report.status === "pending" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review</CardTitle>
          </CardHeader>
          <CardContent>
            <ReviewFineReportPanel
              dormId={dormId}
              reportId={report.id}
              initialRuleId={report.rule_id}
              rules={rules}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Discussion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {comments.map((comment) => {
              const mine = comment.author_user_id === user.id;
              const isReporter = reporterUserId && comment.author_user_id === reporterUserId;
              const author = mine ? "You" : isReporter ? `Reporter (${reporter?.full_name ?? "Unknown"})` : "Staff";

              return (
                <div key={comment.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{author}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(comment.created_at)}</p>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{comment.body}</p>
                </div>
              );
            })}

            {!comments.length ? (
              <div className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
                No comments yet.
              </div>
            ) : null}
          </div>

          <FineReportCommentForm dormId={dormId} reportId={report.id} placeholder="Reply to the reporter..." />
        </CardContent>
      </Card>
    </div>
  );
}

