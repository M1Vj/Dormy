import { redirect } from "next/navigation";

import { getOccupants } from "@/app/actions/occupants";
import { TreasurerOccupantContributionDialog } from "@/components/finance/treasurer-occupant-contribution-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getActiveDormId } from "@/lib/dorms";
import { ensureActiveSemesterId } from "@/lib/semesters";
import { getContributionChargeAmount, getContributionCollectedAmount } from "@/lib/contribution-ledger";
import { getStoreContributionPriceRange } from "@/lib/store-pricing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type LedgerEntryRow = {
  id: string;
  occupant_id?: string | null;
  event_id?: string | null;
  entry_type: string;
  amount_pesos?: number | string | null;
  metadata?: Record<string, unknown> | null;
};

type AssignmentRef = {
  room?: {
    code?: string | null;
    level?: number | null;
  } | {
    code?: string | null;
    level?: number | null;
  }[] | null;
};

type ContributionLedgerSummary = {
  id: string;
  title: string;
  details: string | null;
  eventTitle: string | null;
  deadline: string | null;
  isOptional: boolean;
  declined: boolean;
  isStore: boolean;
  storeItems: unknown[];
  payable: number;
  paid: number;
  remaining: number;
};

type RoomGroup = {
  roomCode: string;
  level: number;
  occupants: Array<{
    id: string;
    fullName: string;
    studentId: string | null;
    payable: number;
    unpaidContributions: ContributionLedgerSummary[];
  }>;
};

function asFirst<T>(value?: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function parseDeadline(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function parseContributionMetadata(entry: LedgerEntryRow) {
  const metadata = entry.metadata && typeof entry.metadata === "object" ? entry.metadata : {};
  const contributionIdRaw = metadata.contribution_id ?? metadata.payable_batch_id ?? entry.event_id ?? entry.id;

  return {
    contributionId:
      typeof contributionIdRaw === "string" && contributionIdRaw.trim().length > 0
        ? contributionIdRaw.trim()
        : entry.id,
    title:
      typeof metadata.contribution_title === "string" && metadata.contribution_title.trim().length > 0
        ? metadata.contribution_title.trim()
        : typeof metadata.payable_label === "string" && metadata.payable_label.trim().length > 0
          ? metadata.payable_label.trim()
          : "Contribution",
    details:
      typeof metadata.contribution_details === "string" && metadata.contribution_details.trim().length > 0
        ? metadata.contribution_details.trim()
        : null,
    eventTitle:
      typeof metadata.contribution_event_title === "string" && metadata.contribution_event_title.trim().length > 0
        ? metadata.contribution_event_title.trim()
        : null,
    deadline: parseDeadline(metadata.payable_deadline),
    isOptional: metadata.is_optional === true,
    isStore: metadata.is_store === true,
    storeItems: Array.isArray(metadata.store_items) ? metadata.store_items : [],
    optionalDeclined: metadata.optional_declined === true,
  };
}

function normalizeUnpaidContributions(entries: Map<string, Omit<ContributionLedgerSummary, "remaining">>) {
  return Array.from(entries.values())
    .map((contribution) => {
      const roundedPaid = Number(contribution.paid.toFixed(2));
      const basePayable = Number(contribution.payable.toFixed(2));
      const storePriceRange = contribution.isStore ? getStoreContributionPriceRange(contribution.storeItems) : null;
      const fallbackPayable = Number((storePriceRange?.min ?? 0).toFixed(2));
      const payable = contribution.isStore && basePayable <= 0 && !contribution.declined ? fallbackPayable : basePayable;
      const remaining = Number((payable - roundedPaid).toFixed(2));

      return {
        ...contribution,
        payable,
        paid: roundedPaid,
        remaining,
      };
    })
    .filter((contribution) => contribution.remaining > 0.009)
    .sort((a, b) => {
      if (a.deadline && b.deadline) {
        return a.deadline.localeCompare(b.deadline);
      }
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return a.title.localeCompare(b.title);
    });
}

export const metadata = {
  title: "Occupants",
  description: "View occupants grouped by room with their payable contributions",
};

export default async function TreasurerOccupantsPage() {
  const activeDormId = await getActiveDormId();
  if (!activeDormId) {
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
    redirect("/auth/sign-in");
  }

  const { data: memberships } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", activeDormId)
    .eq("user_id", user.id);

  const roles = memberships?.map((membership) => membership.role) ?? [];
  const hasAccess = roles.some((role) => new Set(["admin", "treasurer"]).has(role));
  if (!hasAccess) {
    return <div className="p-6 text-sm text-muted-foreground">You do not have permission to view this page.</div>;
  }

  const semesterResult = await ensureActiveSemesterId(activeDormId, supabase);
  if ("error" in semesterResult) {
    return (
      <div className="p-6 text-sm text-destructive">
        {semesterResult.error ?? "Failed to resolve active semester."}
      </div>
    );
  }

  const [activeOccupants, { data: ledgerEntries, error: ledgerError }] = await Promise.all([
    getOccupants(activeDormId, { status: "active" }),
    supabase
      .from("ledger_entries")
      .select("id, occupant_id, event_id, entry_type, amount_pesos, metadata")
      .eq("dorm_id", activeDormId)
      .eq("semester_id", semesterResult.semesterId)
      .eq("ledger", "contributions")
      .is("voided_at", null),
  ]);

  if (ledgerError) {
    return <div className="p-6 text-sm text-destructive">Error loading contribution payables.</div>;
  }

  const occupantContributionMap = new Map<string, Map<string, Omit<ContributionLedgerSummary, "remaining">>>();

  for (const entry of (ledgerEntries ?? []) as LedgerEntryRow[]) {
    if (!entry.occupant_id) continue;

    const metadata = entry.metadata && typeof entry.metadata === "object" ? entry.metadata : {};
    if (metadata.finance_manual_inflow === true) continue;

    const parsed = parseContributionMetadata(entry);
    const byContribution = occupantContributionMap.get(entry.occupant_id) ?? new Map();
    const existing = byContribution.get(parsed.contributionId) ?? {
      id: parsed.contributionId,
      title: parsed.title,
      details: parsed.details,
      eventTitle: parsed.eventTitle,
      deadline: parsed.deadline,
      isOptional: parsed.isOptional,
      declined: parsed.optionalDeclined,
      isStore: parsed.isStore,
      storeItems: parsed.storeItems,
      payable: 0,
      paid: 0,
    };

    existing.paid += getContributionCollectedAmount(entry.entry_type, entry.amount_pesos, entry.metadata);
    existing.payable += getContributionChargeAmount(entry.entry_type, entry.amount_pesos);

    if (!existing.details && parsed.details) existing.details = parsed.details;
    if (!existing.eventTitle && parsed.eventTitle) existing.eventTitle = parsed.eventTitle;
    if (!existing.deadline && parsed.deadline) existing.deadline = parsed.deadline;
    if (!existing.isOptional && parsed.isOptional) existing.isOptional = parsed.isOptional;
    if (!existing.declined && parsed.optionalDeclined) existing.declined = true;
    if (!existing.isStore && parsed.isStore) existing.isStore = true;
    if (existing.storeItems.length === 0 && parsed.storeItems.length > 0) {
      existing.storeItems = parsed.storeItems;
    }

    byContribution.set(parsed.contributionId, existing);
    occupantContributionMap.set(entry.occupant_id, byContribution);
  }

  const roomGroupsMap = new Map<string, RoomGroup>();

  for (const occupant of activeOccupants) {
    const roomData = asFirst((occupant.current_room_assignment as AssignmentRef | null)?.room);
    const roomCode = roomData?.code || "Unassigned";
    const roomLevel = roomData?.level || 0;

    if (!roomGroupsMap.has(roomCode)) {
      roomGroupsMap.set(roomCode, {
        roomCode,
        level: roomLevel,
        occupants: [],
      });
    }

    const unpaidContributions = normalizeUnpaidContributions(occupantContributionMap.get(occupant.id) ?? new Map());
    const payable = unpaidContributions.reduce((sum, contribution) => sum + contribution.remaining, 0);

    roomGroupsMap.get(roomCode)!.occupants.push({
      id: occupant.id,
      fullName: occupant.full_name,
      studentId: occupant.student_id,
      payable,
      unpaidContributions,
    });
  }

  const sortedRoomGroups = Array.from(roomGroupsMap.values()).sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    return a.roomCode.localeCompare(b.roomCode, undefined, { numeric: true });
  });

  return (
    <div className="container max-w-7xl space-y-6 py-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Occupants</h1>
          <p className="mt-2 text-muted-foreground">
            View occupants grouped by their assigned rooms and open the unpaid contribution breakdown for anyone who still has a balance this semester.
          </p>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {sortedRoomGroups.map((group) => {
          const roomTotalPayable = group.occupants.reduce((sum, occupant) => sum + occupant.payable, 0);

          return (
            <Card key={group.roomCode} className="flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b bg-muted/20 pb-2">
                <CardTitle className="text-xl font-semibold">{group.roomCode}</CardTitle>
                <Badge variant={roomTotalPayable > 0 ? "destructive" : "secondary"}>
                  Room Total: ₱{roomTotalPayable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Badge>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col p-0 pb-4 pt-2">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b-0 hover:bg-transparent">
                      <TableHead className="h-8 py-1">Occupant</TableHead>
                      <TableHead className="h-8 py-1 text-right">Payable</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.occupants.map((occupant) => (
                      occupant.unpaidContributions.length > 0 ? (
                        <TreasurerOccupantContributionDialog
                          key={occupant.id}
                          dormId={activeDormId}
                          occupantId={occupant.id}
                          occupantName={occupant.fullName}
                          studentId={occupant.studentId}
                          roomCode={group.roomCode === "Unassigned" ? null : group.roomCode}
                          payable={occupant.payable}
                          contributions={occupant.unpaidContributions}
                        />
                      ) : (
                        <TableRow key={occupant.id} className="border-b-0 hover:bg-transparent">
                          <TableCell className="py-2">
                            <p className="text-sm font-medium leading-tight">{occupant.fullName}</p>
                            {occupant.studentId ? (
                              <p className="text-xs text-muted-foreground">{occupant.studentId}</p>
                            ) : null}
                          </TableCell>
                          <TableCell className="py-2 text-right">
                            <span className="text-sm font-medium text-emerald-600">
                              ₱{occupant.payable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </TableCell>
                        </TableRow>
                      )
                    ))}
                    {group.occupants.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="h-16 text-center text-muted-foreground">
                          No active occupants.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })}

        {sortedRoomGroups.length === 0 ? (
          <div className="col-span-full rounded-xl border border-dashed py-12 text-center text-muted-foreground">
            No active occupants found for this dorm.
          </div>
        ) : null}
      </div>
    </div>
  );
}
