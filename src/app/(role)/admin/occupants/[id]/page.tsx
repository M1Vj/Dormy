import Link from "next/link";
import { redirect } from "next/navigation";

import { getFineRules } from "@/app/actions/fines";
import { getOccupant } from "@/app/actions/occupants";
import { getCommittees } from "@/app/actions/committees";
import { IssueFineDialog } from "@/components/admin/fines/issue-fine-dialog";
import { ExportXlsxDialog } from "@/components/export/export-xlsx-dialog";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/ui/back-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveDormId, getUserDorms } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EditOccupantForm } from "@/components/admin/occupants/edit-occupant-form";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";

type RoomRef = {
  code?: string | null;
  level?: number | string | null;
};

type RoomAssignment = {
  id: string;
  start_date?: string | null;
  end_date?: string | null;
  room?: RoomRef | RoomRef[] | null;
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const raw = String(value);
  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsed = ymd
    ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))
    : new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
};

const getRoomRef = (assignment?: RoomAssignment | null) => {
  if (!assignment?.room) return null;
  return Array.isArray(assignment.room) ? assignment.room[0] : assignment.room;
};

const getRoomLabel = (assignment?: RoomAssignment | null) => {
  const roomRef = getRoomRef(assignment);
  if (!roomRef) return "Unassigned";
  return roomRef.code ? `Room ${roomRef.code}` : "Room";
};

const getStatusClass = (status?: string | null) => {
  if (status === "active") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  }
  if (status === "left") {
    return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400";
  }
  if (status === "removed") {
    return "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-400";
  }
  return "border-muted bg-muted text-muted-foreground";
};

export default async function AdminOccupantProfilePage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
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

  // Admin can view occupants from any dorm, so check admin role across *all* memberships.
  const isAdmin = memberships?.some(m => m.role === "admin") ?? false;
  const activeMemberships = memberships?.filter(m => m.dorm_id === activeDormId!) ?? [];
  const hasAccess = isAdmin || activeMemberships.some(m => new Set(["student_assistant", "adviser"]).has(m.role));
  if (!hasAccess) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You do not have access to this page.
      </div>
    );
  }

  const myRole = isAdmin ? "admin" : (activeMemberships[0]?.role || "occupant");

  // Resolve the occupant's actual dorm_id so we aren't constrained by the cookie.
  // Use admin client to bypass RLS — the regular user client can't read cross-dorm occupants.
  let occupantDormId = activeDormId!;
  if (isAdmin) {
    const adminClient = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
    const { data: occupantRow } = await adminClient
      .from("occupants")
      .select("dorm_id")
      .eq("id", params.id)
      .maybeSingle();
    if (occupantRow?.dorm_id) {
      occupantDormId = occupantRow.dorm_id;
    }
  }

  const occupant = await getOccupant(occupantDormId, params.id);

  if (!occupant) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Occupant not found.</p>
        <Button asChild variant="secondary">
          <Link href={`/admin/dorms/${occupantDormId}?tab=occupants`}>
            Back to occupants
          </Link>
        </Button>
      </div>
    );
  }

  const fineRules = await getFineRules(occupantDormId);
  const occupantOptions = [
    {
      id: occupant.id,
      full_name: occupant.full_name,
      student_id: occupant.student_id,
      course: occupant.course,
    },
  ];

  const isEditMode = searchParams.mode === "edit";

  const statusLabel = occupant.status
    ? occupant.status.replace(/_/g, " ")
    : "unknown";
  const currentRoomLabel = getRoomLabel(occupant.current_room_assignment);
  const currentRoomRef = getRoomRef(occupant.current_room_assignment);
  const currentRoomLevel =
    currentRoomRef?.level === null || currentRoomRef?.level === undefined
      ? "-"
      : `Level ${currentRoomRef.level}`;
  const assignments = (occupant.room_assignments as RoomAssignment[]) ?? [];
  const dormOptions = await getUserDorms();

  let committeesRaw: { id: string; dorm_id: string; name: string; description: string | null; created_at: string; members: { role: "member" | "head" | "co-head"; user_id: string; display_name: string | null; }[] }[] = [];
  if (isEditMode) {
    const commRes = await getCommittees(occupantDormId);
    if (!commRes.error) {
      committeesRaw = commRes.data ?? [];
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {occupant.full_name ?? "Occupant profile"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Profile details and room history.
          </p>
        </div>
        <div className="flex gap-2">
          {!isEditMode && myRole !== "admin" && (
            <IssueFineDialog
              dormId={occupantDormId}
              occupants={occupantOptions}
              rules={fineRules}
              defaultOccupantId={occupant.id}
              triggerLabel="Issue fine"
            />
          )}
          {!isEditMode && (
            <Button asChild variant="outline">
              <Link href={`/${myRole}/occupants/${occupant.id}?mode=edit`}>Edit</Link>
            </Button>
          )}
          {!isEditMode && (
            <ExportXlsxDialog
              report="occupant-statement"
              title="Export Occupant Statement"
              description="Download balances and transaction history for this occupant."
              defaultDormId={occupantDormId}
              dormOptions={dormOptions}
              includeDormSelector
              defaultParams={{ occupant_id: occupant.id }}
              triggerLabel="Export statement"
            />
          )}
          <Button asChild variant="secondary">
            <Link href={`/admin/dorms/${occupantDormId}?tab=occupants`}>
              Back to occupants
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{isEditMode ? "Edit Occupant" : "Occupant details"}</CardTitle>
        </CardHeader>
        <CardContent>
          {isEditMode ? (
            <EditOccupantForm
              dormId={occupantDormId}
              occupant={occupant}
              committees={committeesRaw}
              showSystemAccess={false}
              role={myRole}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <span
                  className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-xs capitalize ${getStatusClass(
                    occupant.status
                  )}`}
                >
                  {statusLabel}
                </span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Student ID</p>
                <p className="text-sm font-medium">
                  {occupant.student_id ?? "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Course</p>
                <p className="text-sm font-medium">
                  {occupant.course ?? "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Joined</p>
                <p className="text-sm font-medium">{formatDate(occupant.joined_at)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Current room</p>
                <p className="text-sm font-medium">{currentRoomLabel}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Current level</p>
                <p className="text-sm font-medium">{currentRoomLevel}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {!isEditMode ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                {occupant.contact_email ? (
                  <a
                    className="text-sm font-medium underline underline-offset-4"
                    href={`mailto:${occupant.contact_email}`}
                  >
                    {occupant.contact_email}
                  </a>
                ) : (
                  <p className="text-sm font-medium">-</p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Mobile number</p>
                <p className="text-sm font-medium">
                  {occupant.contact_mobile ?? "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Birthdate</p>
                <p className="text-sm font-medium">
                  {formatDate(occupant.birthdate)}
                </p>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs text-muted-foreground">Home address</p>
                <p className="text-sm font-medium whitespace-pre-line">
                  {occupant.home_address ?? "-"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!isEditMode ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Emergency contact</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="text-sm font-medium">
                  {occupant.emergency_contact_name ?? "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Relationship</p>
                <p className="text-sm font-medium">
                  {occupant.emergency_contact_relationship ?? "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Mobile number</p>
                <p className="text-sm font-medium">
                  {occupant.emergency_contact_mobile ?? "-"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Room history</CardTitle>
        </CardHeader>
        <CardContent>
          {assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No room assignments yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-3 py-2 font-medium">Room</th>
                    <th className="px-3 py-2 font-medium">Level</th>
                    <th className="px-3 py-2 font-medium">Start date</th>
                    <th className="px-3 py-2 font-medium">End date</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((assignment) => {
                    const roomRef = getRoomRef(assignment);
                    const roomLabel = roomRef?.code
                      ? `Room ${roomRef.code}`
                      : "Room";
                    const levelLabel =
                      roomRef?.level === null || roomRef?.level === undefined
                        ? "-"
                        : `Level ${roomRef.level}`;
                    const isActive = !assignment.end_date;

                    return (
                      <tr key={assignment.id} className="border-b">
                        <td className="px-3 py-2 font-medium">{roomLabel}</td>
                        <td className="px-3 py-2">{levelLabel}</td>
                        <td className="px-3 py-2">
                          {formatDate(assignment.start_date)}
                        </td>
                        <td className="px-3 py-2">
                          {assignment.end_date
                            ? formatDate(assignment.end_date)
                            : "Present"}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${isActive
                              ? "border-primary/20 bg-primary/10 text-primary"
                              : "border-muted bg-muted text-muted-foreground"
                              }`}
                          >
                            {isActive ? "Current" : "Ended"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
