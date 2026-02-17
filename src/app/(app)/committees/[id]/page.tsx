import { redirect } from "next/navigation";
import { format } from "date-fns";

import { getEventDormOptions } from "@/app/actions/events";
import { getCommittee, getCommitteeFinanceSummary, type CommitteeMemberRole } from "@/app/actions/committees";
import { getCommitteeAnnouncements } from "@/app/actions/announcements";
import { AnnouncementFormSlot } from "@/components/announcements/announcement-form-slot";
import { DeleteAnnouncementButton } from "@/components/announcements/delete-announcement-button";
import { getOccupants } from "@/app/actions/occupants";
import { AddMemberDialog } from "@/components/admin/committees/add-member-dialog";
import { RemoveMemberButton } from "@/components/admin/committees/remove-member-button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EventFormDialog } from "@/components/events/event-form-dialog";
import { SubmitExpenseDialog } from "@/components/finance/submit-expense-dialog";
import { getActiveDormId } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const STAFF_MANAGE_ROLES = new Set(["admin", "adviser", "student_assistant"]);
const COMMITTEE_LEAD_ROLES = new Set<CommitteeMemberRole>(["head", "co-head"]);

function getRoleLabel(role: CommitteeMemberRole) {
  if (role === "co-head") return "Co-head";
  return `${role.slice(0, 1).toUpperCase()}${role.slice(1)}`;
}

export default async function CommitteeDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return <div className="p-6 text-sm text-muted-foreground">Supabase is not configured.</div>;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const dormId = await getActiveDormId();
  if (!dormId) {
    return <div className="p-6 text-sm text-muted-foreground">No active dorm selected.</div>;
  }

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  const viewerRole = membership?.role ?? null;

  const { data: committee, error } = await getCommittee(id);
  if (error || !committee) {
    return <div className="p-6 text-sm text-destructive">Committee not found.</div>;
  }

  const viewerCommitteeRole =
    committee.members.find((member) => member.user_id === user.id)?.role ?? null;

  const canManageCommittee =
    (viewerRole ? STAFF_MANAGE_ROLES.has(viewerRole) : false) ||
    (viewerCommitteeRole ? COMMITTEE_LEAD_ROLES.has(viewerCommitteeRole) : false);

  const canCreateCommitteeEvent =
    (viewerRole ? new Set(["admin", "officer"]).has(viewerRole) : false) ||
    (viewerCommitteeRole ? COMMITTEE_LEAD_ROLES.has(viewerCommitteeRole) : false);

  const canSubmitExpense =
    (viewerRole ? new Set(["admin", "treasurer", "officer"]).has(viewerRole) : false) ||
    (viewerCommitteeRole ? COMMITTEE_LEAD_ROLES.has(viewerCommitteeRole) : false);

  const dormOptions = canCreateCommitteeEvent ? await getEventDormOptions() : [];

  const memberUserIds = new Set(committee.members.map((member) => member.user_id));
  const eligibleOccupants = canManageCommittee
    ? (await getOccupants(dormId, { status: "active" }))
        .filter((occ) => occ.user_id && !memberUserIds.has(occ.user_id))
        .map((occ) => ({
          id: occ.id as string,
          full_name: occ.full_name as string,
          user_id: occ.user_id as string,
        }))
    : [];

  const visibleExpenses = canManageCommittee
    ? committee.expenses
    : committee.expenses.filter((expense) => expense.status === "approved");

  const totalApproved = committee.expenses
    .filter((expense) => expense.status === "approved")
    .reduce((sum, expense) => sum + Number(expense.amount_pesos), 0);

  const members = [...committee.members].sort((a, b) => {
    const priority: Record<CommitteeMemberRole, number> = {
      head: 1,
      "co-head": 2,
      member: 3,
    };
    return priority[a.role] - priority[b.role];
  });

  const events = committee.events ?? [];

  const [{ announcements: committeeAnnouncements }, financeSummaryResult] = await Promise.all([
    getCommitteeAnnouncements(dormId, committee.id, { limit: 8 }),
    getCommitteeFinanceSummary(committee.id),
  ]);

  const financeSummary = financeSummaryResult.data ?? [];
  const incomeCharged = financeSummary.reduce((sum, row) => sum + row.charged_pesos, 0);
  const incomeCollected = financeSummary.reduce((sum, row) => sum + row.collected_pesos, 0);
  const incomeOutstanding = financeSummary.reduce((sum, row) => sum + row.balance_pesos, 0);

  const topIncomeEvents = financeSummary
    .filter((row) => row.charged_pesos > 0 || row.collected_pesos > 0)
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{committee.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {committee.description || "No description provided."}
            </p>
          </div>
          {viewerCommitteeRole ? (
            <Badge variant="secondary">{getRoleLabel(viewerCommitteeRole)}</Badge>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg font-medium">Members</CardTitle>
              {canManageCommittee ? (
                <AddMemberDialog committeeId={committee.id} occupants={eligibleOccupants} />
              ) : null}
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-3">
                {members.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    No members assigned yet.
                  </div>
                ) : (
                  members.map((member) => {
                    const name = member.display_name ?? "Unknown member";
                    return (
                      <div
                        key={member.user_id}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarFallback>
                              {name.slice(0, 1).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-medium leading-none">{name}</p>
                              <Badge variant="outline" className="h-5 px-2 text-[10px]">
                                {getRoleLabel(member.role)}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        {canManageCommittee ? (
                          <RemoveMemberButton committeeId={committee.id} userId={member.user_id} />
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <div className="space-y-1">
                <CardTitle>Announcements</CardTitle>
                <CardDescription>
                  Updates from the committee. Posts can be shared to committee members or the whole dorm.
                </CardDescription>
              </div>
              {canManageCommittee ? (
                <AnnouncementFormSlot dormId={dormId} mode="create" committeeId={committee.id} />
              ) : null}
            </CardHeader>
            <CardContent className="space-y-3">
              {committeeAnnouncements.length ? (
                committeeAnnouncements.map((announcement) => (
                  <div key={announcement.id} className="rounded-lg border p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{announcement.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {announcement.starts_at
                            ? format(new Date(announcement.starts_at), "MMM d, yyyy h:mm a")
                            : "Published"}
                          {" · "}
                          {announcement.audience === "committee" ? "Committee members" : "Whole dorm"}
                        </p>
                      </div>
                      {canManageCommittee ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <AnnouncementFormSlot
                            dormId={dormId}
                            mode="edit"
                            announcement={announcement}
                            committeeId={committee.id}
                            trigger={
                              <button className="text-xs font-medium text-primary underline-offset-4 hover:underline">
                                Edit
                              </button>
                            }
                          />
                          <DeleteAnnouncementButton dormId={dormId} announcementId={announcement.id} />
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-3 whitespace-pre-line text-sm">{announcement.body}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border bg-muted/20 p-4 text-center text-sm text-muted-foreground">
                  No announcements posted yet.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <div className="space-y-1">
                <CardTitle>Finances</CardTitle>
                <CardDescription>Committee expenses are visible to dorm members after approval.</CardDescription>
              </div>
              {canSubmitExpense ? (
                <SubmitExpenseDialog dormId={dormId} committeeId={committee.id} />
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border bg-muted/40 p-4">
                  <p className="text-xs font-medium text-muted-foreground">Event income collected</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-600">₱{incomeCollected.toFixed(2)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Charged ₱{incomeCharged.toFixed(2)} · Outstanding ₱{incomeOutstanding.toFixed(2)}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/40 p-4">
                  <p className="text-xs font-medium text-muted-foreground">Approved expenses</p>
                  <p className="mt-1 text-2xl font-bold">₱{totalApproved.toFixed(2)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Only approved expenses are included here.</p>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Event income</h4>
                {financeSummaryResult.error ? (
                  <p className="text-xs text-muted-foreground">{financeSummaryResult.error}</p>
                ) : null}
                {topIncomeEvents.map((row) => (
                  <div key={row.event_id} className="flex items-start justify-between gap-3 border-b py-2 text-sm last:border-0">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{row.event_title}</p>
                      <p className="text-xs text-muted-foreground">
                        Charged ₱{row.charged_pesos.toFixed(2)} · Collected ₱{row.collected_pesos.toFixed(2)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-muted-foreground">Outstanding</p>
                      <p className="font-semibold">₱{row.balance_pesos.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
                {!topIncomeEvents.length ? (
                  <p className="text-xs text-muted-foreground">No event income recorded yet.</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Recent expenses</h4>
                {visibleExpenses.slice(0, 6).map((expense) => (
                  <div
                    key={expense.id}
                    className="flex items-start justify-between gap-3 border-b py-2 text-sm last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{expense.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {expense.status === "approved" ? "Approved" : expense.status}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold">₱{Number(expense.amount_pesos).toFixed(2)}</p>
                    </div>
                  </div>
                ))}
                {visibleExpenses.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No expenses recorded.</p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <div className="space-y-1">
                <CardTitle>Events</CardTitle>
                <CardDescription>Events organized by this committee.</CardDescription>
              </div>
              {canCreateCommitteeEvent ? (
                <EventFormDialog
                  mode="create"
                  hostDormId={dormId}
                  dormOptions={dormOptions}
                  committeeId={committee.id}
                />
              ) : null}
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {events.slice(0, 6).map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between gap-3 border-b py-2 text-sm last:border-0"
                  >
                    <span className="truncate font-medium">{event.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {event.starts_at ? format(new Date(event.starts_at), "MMM d") : "TBA"}
                    </span>
                  </div>
                ))}
                {events.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No events scheduled.</p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
