"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Clock, Mail, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";

import { reviewDormApplication } from "@/app/actions/join";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getRoleLabel, roles, type AppRole } from "@/lib/roles";

export type DormApplicationRow = {
  id: string;
  dorm_id: string;
  user_id: string;
  email: string;
  applicant_name: string | null;
  requested_role: AppRole;
  granted_role: AppRole | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  message: string | null;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

function StatusBadge({ status }: { status: DormApplicationRow["status"] }) {
  const config =
    status === "approved"
      ? { label: "Approved", icon: CheckCircle2, className: "bg-emerald-600 text-white" }
      : status === "rejected"
        ? { label: "Rejected", icon: XCircle, className: "bg-rose-600 text-white" }
        : status === "cancelled"
          ? { label: "Cancelled", icon: XCircle, className: "bg-muted text-foreground" }
          : { label: "Pending", icon: Clock, className: "bg-amber-500 text-white" };

  const Icon = config.icon;

  return (
    <Badge className={config.className}>
      <Icon className="mr-1.5 h-3.5 w-3.5" />
      {config.label}
    </Badge>
  );
}

export function ApplicationsReview({
  dormName,
  currentRole,
  applications,
}: {
  dormName: string;
  currentRole: AppRole;
  applications: DormApplicationRow[];
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<DormApplicationRow | null>(null);
  const [decision, setDecision] = useState<"approved" | "rejected">("approved");
  const [grantedRole, setGrantedRole] = useState<AppRole>("occupant");
  const [note, setNote] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const roleOptions = useMemo(() => {
    const base = roles.filter((role) => role !== "admin") as AppRole[];
    if (currentRole === "student_assistant") return ["occupant"] as AppRole[];
    if (currentRole === "adviser") return base.filter((role) => role !== "adviser");
    return base;
  }, [currentRole]);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = applications.filter((app) => {
    if (!normalizedQuery) return true;
    return (
      app.email.toLowerCase().includes(normalizedQuery) ||
      (app.applicant_name ?? "").toLowerCase().includes(normalizedQuery)
    );
  });

  const openDialog = (app: DormApplicationRow, nextDecision: "approved" | "rejected") => {
    setActive(app);
    setDecision(nextDecision);
    setGrantedRole(app.requested_role ?? "occupant");
    setNote("");
    setDialogOpen(true);
  };

  const submitReview = () => {
    if (!active) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.set("applicationId", active.id);
      formData.set("status", decision);
      if (decision === "approved") {
        formData.set("grantedRole", grantedRole);
      }
      formData.set("reviewNote", note);

      const result = await reviewDormApplication(formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }

      toast.success(decision === "approved" ? "Application approved" : "Application rejected");
      setDialogOpen(false);
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Dorm applications</h1>
        <p className="text-sm text-muted-foreground">
          Review access requests for <span className="font-medium text-foreground">{dormName}</span>.
        </p>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">Requests</CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search email or name"
                className="pl-9"
              />
            </div>
            <Badge variant="outline" className="w-fit">
              Role: {getRoleLabel(currentRole)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {filtered.length ? (
            filtered.map((app) => {
              const isPendingRow = app.status === "pending";
              return (
                <div
                  key={app.id}
                  className="rounded-lg border p-4"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <p className="font-medium">
                        {app.applicant_name ? `${app.applicant_name} ` : ""}
                        <span className="text-sm text-muted-foreground">({app.email})</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Requested: {getRoleLabel(app.requested_role)}
                        {app.granted_role ? ` • Granted: ${getRoleLabel(app.granted_role)}` : ""}
                      </p>
                    </div>
                    <StatusBadge status={app.status} />
                  </div>

                  {app.message ? (
                    <p className="mt-3 text-sm text-muted-foreground">{app.message}</p>
                  ) : null}

                  {app.review_note ? (
                    <p className="mt-3 rounded-md border bg-muted/30 p-3 text-sm">
                      <span className="font-medium">Staff note:</span> {app.review_note}
                    </p>
                  ) : null}

                  {isPendingRow ? (
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => openDialog(app, "rejected")}
                        disabled={isPending}
                      >
                        Reject
                      </Button>
                      <Button
                        type="button"
                        onClick={() => openDialog(app, "approved")}
                        disabled={isPending}
                      >
                        Approve
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })
          ) : (
            <div className="rounded-lg border p-10 text-center text-sm text-muted-foreground">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border bg-muted/40">
                <ShieldAlert className="h-5 w-5" />
              </div>
              No matching requests found.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {decision === "approved" ? "Approve request" : "Reject request"}
            </DialogTitle>
            <DialogDescription>
              {active ? (
                <>
                  {decision === "approved"
                    ? "Grant dorm membership and assign a role."
                    : "Reject this application with an optional note."}{" "}
                  <span className="font-medium text-foreground">
                    {active.email}
                  </span>
                  .
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {decision === "approved" ? (
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="grantedRole">
                  Granted role
                </label>
                <select
                  id="grantedRole"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={grantedRole}
                  onChange={(event) => setGrantedRole(event.target.value as AppRole)}
                >
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>
                      {getRoleLabel(role)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="reviewNote">
                Note (optional)
              </label>
              <Textarea
                id="reviewNote"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Example: Approved as occupant. Linked to roster by email."
                rows={4}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={submitReview} disabled={!active || isPending}>
              {isPending ? "Saving…" : decision === "approved" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
