"use client";

import { useMemo, useState, useTransition } from "react";
import { Building2, CheckCircle2, Clock, Mail, XCircle } from "lucide-react";
import { toast } from "sonner";

import {
  acceptDormInvite,
  applyToDorm,
  cancelDormApplication,
} from "@/app/actions/join";
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
import { getRoleLabel, type AppRole, roles } from "@/lib/roles";

type DormDirectoryRow = {
  id: string;
  name: string;
  slug: string;
};

type DormApplicationRow = {
  id: string;
  dorm_id: string;
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

type DormInviteRow = {
  id: string;
  dorm_id: string;
  email: string;
  role: AppRole;
  note: string | null;
  created_at: string;
};

const requestableRoles = roles.filter((role) => role !== "admin") as AppRole[];

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

export function JoinDorm({
  dorms,
  applications,
  invites,
}: {
  dorms: DormDirectoryRow[];
  applications: DormApplicationRow[];
  invites: DormInviteRow[];
}) {
  const dormById = useMemo(
    () => new Map(dorms.map((dorm) => [dorm.id, dorm])),
    [dorms]
  );

  const [query, setQuery] = useState("");
  const [selectedDorm, setSelectedDorm] = useState<DormDirectoryRow | null>(null);
  const [requestedRole, setRequestedRole] = useState<AppRole>("occupant");
  const [message, setMessage] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const [isApplying, startApplyTransition] = useTransition();
  const [isCancelling, startCancelTransition] = useTransition();
  const [isAcceptingInvite, startInviteTransition] = useTransition();

  const normalizedQuery = query.trim().toLowerCase();
  const filteredDorms = dorms.filter((dorm) => {
    if (!normalizedQuery) return true;
    return (
      dorm.name.toLowerCase().includes(normalizedQuery) ||
      dorm.slug.toLowerCase().includes(normalizedQuery)
    );
  });

  const pendingDormIds = new Set(
    applications.filter((app) => app.status === "pending").map((app) => app.dorm_id)
  );

  const openApplyDialog = (dorm: DormDirectoryRow) => {
    setSelectedDorm(dorm);
    setRequestedRole("occupant");
    setMessage("");
    setDialogOpen(true);
  };

  const submitApplication = () => {
    if (!selectedDorm) return;
    startApplyTransition(async () => {
      const formData = new FormData();
      formData.set("dormId", selectedDorm.id);
      formData.set("requestedRole", requestedRole);
      formData.set("message", message);

      const result = await applyToDorm(formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Application submitted");
      setDialogOpen(false);
    });
  };

  const cancelApplication = (applicationId: string) => {
    startCancelTransition(async () => {
      const result = await cancelDormApplication(applicationId);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Application cancelled");
    });
  };

  const acceptInvite = (inviteId: string) => {
    startInviteTransition(async () => {
      const result = await acceptDormInvite(inviteId);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Invite accepted");
      window.location.href = "/home";
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Join a dorm</h1>
        <p className="text-sm text-muted-foreground">
          Sign in with your school email, then request access to your dorm. Staff will review your request and assign your role.
        </p>
      </div>

      {invites.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invitations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {invites.map((invite) => {
              const dorm = dormById.get(invite.dorm_id);
              return (
                <div
                  key={invite.id}
                  className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <p className="font-medium">
                      {dorm?.name ?? "Dorm"}{" "}
                      <span className="text-xs text-muted-foreground">
                        ({invite.email})
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Role: <span className="font-medium text-foreground">{getRoleLabel(invite.role)}</span>
                    </p>
                    {invite.note ? (
                      <p className="text-sm text-muted-foreground">{invite.note}</p>
                    ) : null}
                  </div>
                  <Button
                    onClick={() => acceptInvite(invite.id)}
                    disabled={isAcceptingInvite}
                    className="sm:w-auto"
                  >
                    {isAcceptingInvite ? "Accepting…" : "Accept invite"}
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-base">Dorm directory</CardTitle>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search dorm name or code"
              className="pl-9"
              autoComplete="off"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {filteredDorms.length ? (
            filteredDorms.map((dorm) => {
              const hasPending = pendingDormIds.has(dorm.id);
              return (
                <div
                  key={dorm.id}
                  className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg border bg-muted/40">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                    </span>
                    <div>
                      <p className="font-medium">{dorm.name}</p>
                      <p className="text-xs text-muted-foreground">{dorm.slug}</p>
                    </div>
                  </div>
                  <Button
                    variant={hasPending ? "secondary" : "default"}
                    disabled={hasPending}
                    onClick={() => openApplyDialog(dorm)}
                    className="sm:w-auto"
                  >
                    {hasPending ? "Pending review" : "Apply"}
                  </Button>
                </div>
              );
            })
          ) : (
            <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
              No dorms match your search.
            </div>
          )}
        </CardContent>
      </Card>

      {applications.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {applications.map((app) => {
              const dorm = dormById.get(app.dorm_id);
              const canCancel = app.status === "pending";
              return (
                <div key={app.id} className="rounded-lg border p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <p className="font-medium">{dorm?.name ?? "Dorm"}</p>
                      <p className="text-xs text-muted-foreground">
                        Requested role: {getRoleLabel(app.requested_role)}
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

                  {canCancel ? (
                    <div className="mt-4 flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isCancelling}
                        onClick={() => cancelApplication(app.id)}
                      >
                        {isCancelling ? "Cancelling…" : "Cancel request"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Request dorm access</DialogTitle>
            <DialogDescription>
              {selectedDorm ? (
                <>
                  Applying to <span className="font-medium text-foreground">{selectedDorm.name}</span>.
                </>
              ) : (
                "Select a dorm to continue."
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="requestedRole">
                Requested role
              </label>
              <select
                id="requestedRole"
                name="requestedRole"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={requestedRole}
                onChange={(event) => setRequestedRole(event.target.value as AppRole)}
              >
                {requestableRoles.map((role) => (
                  <option key={role} value={role}>
                    {getRoleLabel(role)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Staff decide your final role. For most users, choose Occupant.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="message">
                Message (optional)
              </label>
              <Textarea
                id="message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Example: New occupant for this semester, already in the roster."
                rows={4}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={submitApplication} disabled={!selectedDorm || isApplying}>
              {isApplying ? "Submitting…" : "Submit request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

