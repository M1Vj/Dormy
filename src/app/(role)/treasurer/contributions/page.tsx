import Link from "next/link";
import { format } from "date-fns";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveDormId, getUserDorms } from "@/lib/dorms";
import { ensureActiveSemesterId, getActiveSemester } from "@/lib/semesters";
import { ExportXlsxDialog } from "@/components/export/export-xlsx-dialog";
import { LedgerOverwriteDialog } from "@/components/finance/ledger-overwrite-dialog";
import { ContributionBatchDialog } from "@/components/finance/contribution-batch-dialog";
import { ContributionBatchPaymentDialog } from "@/components/finance/contribution-batch-payment-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type SearchParams = {
  search?: string | string[];
  semester?: string | string[];
};

type EventRef = {
  id: string;
  title: string;
};

type SemesterRef = {
  id: string;
  label: string;
};

type LedgerEntryRow = {
  id: string;
  semester_id: string | null;
  event_id: string | null;
  occupant_id: string | null;
  entry_type: string;
  amount_pesos: number | string | null;
  posted_at: string;
  note: string | null;
  metadata: Record<string, unknown> | null;
};

type ContributionGroup = {
  id: string;
  title: string;
  details: string | null;
  eventTitle: string | null;
  receiptSignature: string | null;
  receiptSubject: string | null;
  receiptMessage: string | null;
  receiptLogoUrl: string | null;
  deadline: string | null;
  charged: number;
  collected: number;
  remaining: number;
  participantCount: number;
  latestPostedAt: string;
  semesterLabels: string[];
};

const normalizeParam = (value?: string | string[]) => {
  if (Array.isArray(value)) {
    return value.length ? value[0] : undefined;
  }
  return value;
};

const normalizeArrayParam = (value?: string | string[]) => {
  if (!value) return [] as string[];
  if (Array.isArray(value)) return value.filter(Boolean);
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

function parseContributionFromMetadata(row: LedgerEntryRow, eventTitleFallback: string | null) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const contributionIdRaw =
    metadata.contribution_id ?? metadata.payable_batch_id ?? row.event_id ?? null;
  const contributionTitleRaw =
    metadata.contribution_title ?? metadata.payable_label ?? row.note ?? eventTitleFallback ?? "Contribution";

  const contributionId =
    typeof contributionIdRaw === "string" && contributionIdRaw.trim().length > 0
      ? contributionIdRaw
      : row.id;

  const title =
    typeof contributionTitleRaw === "string" && contributionTitleRaw.trim().length > 0
      ? contributionTitleRaw.trim()
      : "Contribution";

  const details =
    typeof metadata.contribution_details === "string" && metadata.contribution_details.trim().length > 0
      ? metadata.contribution_details.trim()
      : null;

  const eventTitle =
    typeof metadata.contribution_event_title === "string" && metadata.contribution_event_title.trim().length > 0
      ? metadata.contribution_event_title.trim()
      : eventTitleFallback;

  const deadline =
    typeof metadata.payable_deadline === "string" && metadata.payable_deadline.trim().length > 0
      ? metadata.payable_deadline
      : null;
  const receiptSignature =
    typeof metadata.contribution_receipt_signature === "string" &&
      metadata.contribution_receipt_signature.trim().length > 0
      ? metadata.contribution_receipt_signature.trim()
      : null;
  const receiptSubject =
    typeof metadata.contribution_receipt_subject === "string" &&
      metadata.contribution_receipt_subject.trim().length > 0
      ? metadata.contribution_receipt_subject.trim()
      : null;
  const receiptMessage =
    typeof metadata.contribution_receipt_message === "string" &&
      metadata.contribution_receipt_message.trim().length > 0
      ? metadata.contribution_receipt_message.trim()
      : null;
  const receiptLogoUrl =
    typeof metadata.contribution_receipt_logo_url === "string" &&
      metadata.contribution_receipt_logo_url.trim().length > 0
      ? metadata.contribution_receipt_logo_url.trim()
      : null;

  return {
    contributionId,
    title,
    details,
    eventTitle,
    receiptSignature,
    receiptSubject,
    receiptMessage,
    receiptLogoUrl,
    deadline,
  };
}

export default async function EventsFinancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const search = normalizeParam(params?.search)?.trim() || "";

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
    return <div className="p-6 text-sm text-muted-foreground">Unauthorized.</div>;
  }

  const { data: memberships } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", activeDormId)
    .eq("user_id", user.id);

  const roles = memberships?.map((membership) => membership.role) ?? [];
  const hasAccess = roles.some((role) => new Set(["admin", "treasurer"]).has(role));
  if (!hasAccess) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You do not have access to this page.
      </div>
    );
  }

  const canFilterDorm = roles.includes("admin");

  const semesterResult = await ensureActiveSemesterId(activeDormId, supabase);
  if ("error" in semesterResult) {
    return (
      <div className="p-6 text-sm text-destructive">
        {semesterResult.error ?? "Failed to resolve active semester."}
      </div>
    );
  }

  const activeSemesterId = semesterResult.semesterId;
  const activeSemester = await getActiveSemester(activeDormId, supabase);

  const [{ data: semesterRows }, dormOptions, { data: occupants }, { data: dormConfig }] = await Promise.all([
    supabase
      .from("dorm_semesters")
      .select("id, label")
      .eq("dorm_id", activeDormId)
      .order("starts_on", { ascending: false }),
    getUserDorms(),
    supabase
      .from("occupants")
      .select("id, full_name, student_id")
      .eq("dorm_id", activeDormId)
      .eq("status", "active")
      .order("full_name", { ascending: true }),
    supabase
      .from("dorms")
      .select("attributes")
      .eq("id", activeDormId)
      .maybeSingle(),
  ]);

  const semesters = (semesterRows ?? []) as SemesterRef[];
  const semesterIdsFromParams = normalizeArrayParam(params?.semester);
  const validSemesterIds = new Set(semesters.map((semester) => semester.id));
  const selectedSemesterIds =
    semesterIdsFromParams.length > 0
      ? semesterIdsFromParams.filter((id) => validSemesterIds.has(id))
      : [activeSemesterId];

  const dormAttributes =
    typeof dormConfig?.attributes === "object" && dormConfig.attributes !== null
      ? (dormConfig.attributes as Record<string, unknown>)
      : {};
  const allowHistoricalEdit = dormAttributes.finance_non_current_semester_override === true;
  const isReadOnlyView =
    !selectedSemesterIds.includes(activeSemesterId) && !allowHistoricalEdit;

  const { data: entryRows, error: entriesError } = await supabase
    .from("ledger_entries")
    .select("id, semester_id, event_id, occupant_id, entry_type, amount_pesos, posted_at, note, metadata")
    .eq("dorm_id", activeDormId)
    .eq("ledger", "contributions")
    .in("semester_id", selectedSemesterIds)
    .is("voided_at", null)
    .order("posted_at", { ascending: false });

  if (entriesError) {
    return <div className="p-6 text-sm text-destructive">Error loading contribution ledger.</div>;
  }

  const typedEntries = (entryRows ?? []) as LedgerEntryRow[];

  const eventIds = Array.from(
    new Set(
      typedEntries
        .map((entry) => entry.event_id)
        .filter((eventId): eventId is string => Boolean(eventId))
    )
  );

  let eventById = new Map<string, string>();
  if (eventIds.length > 0) {
    const { data: events } = await supabase
      .from("events")
      .select("id, title")
      .eq("dorm_id", activeDormId)
      .in("id", eventIds);

    eventById = new Map(((events ?? []) as EventRef[]).map((event) => [event.id, event.title]));
  }

  const semesterLabelById = new Map(semesters.map((semester) => [semester.id, semester.label]));

  const groupMap = new Map<
    string,
    ContributionGroup & {
      participantIds: Set<string>;
      semesterIds: Set<string>;
    }
  >();

  for (const entry of typedEntries) {
    const metadata = parseContributionFromMetadata(entry, entry.event_id ? eventById.get(entry.event_id) ?? null : null);
    const amount = Number(entry.amount_pesos ?? 0);

    const existing =
      groupMap.get(metadata.contributionId) ?? {
        id: metadata.contributionId,
        title: metadata.title,
        details: metadata.details,
        eventTitle: metadata.eventTitle,
        deadline: metadata.deadline,
        receiptSignature: metadata.receiptSignature,
        receiptSubject: metadata.receiptSubject,
        receiptMessage: metadata.receiptMessage,
        receiptLogoUrl: metadata.receiptLogoUrl,
        charged: 0,
        collected: 0,
        remaining: 0,
        participantCount: 0,
        latestPostedAt: entry.posted_at,
        semesterLabels: [],
        participantIds: new Set<string>(),
        semesterIds: new Set<string>(),
      };

    if (amount < 0 || entry.entry_type === "payment") {
      existing.collected += Math.abs(amount);
    } else {
      existing.charged += amount;
    }
    existing.remaining += amount;

    if (entry.occupant_id) {
      existing.participantIds.add(entry.occupant_id);
    }
    if (entry.semester_id) {
      existing.semesterIds.add(entry.semester_id);
    }
    if (entry.posted_at > existing.latestPostedAt) {
      existing.latestPostedAt = entry.posted_at;
    }

    if (!existing.details && metadata.details) {
      existing.details = metadata.details;
    }
    if (!existing.eventTitle && metadata.eventTitle) {
      existing.eventTitle = metadata.eventTitle;
    }
    if (!existing.deadline && metadata.deadline) {
      existing.deadline = metadata.deadline;
    }
    if (!existing.receiptSignature && metadata.receiptSignature) {
      existing.receiptSignature = metadata.receiptSignature;
    }
    if (!existing.receiptSubject && metadata.receiptSubject) {
      existing.receiptSubject = metadata.receiptSubject;
    }
    if (!existing.receiptMessage && metadata.receiptMessage) {
      existing.receiptMessage = metadata.receiptMessage;
    }
    if (!existing.receiptLogoUrl && metadata.receiptLogoUrl) {
      existing.receiptLogoUrl = metadata.receiptLogoUrl;
    }

    groupMap.set(metadata.contributionId, existing);
  }

  const normalizedSearch = search.toLowerCase();

  const contributionGroups = Array.from(groupMap.values())
    .map((group) => {
      const semesterLabels = Array.from(group.semesterIds)
        .map((semesterId) => semesterLabelById.get(semesterId) ?? "Unknown semester")
        .filter(Boolean);

      return {
        id: group.id,
        title: group.title,
        details: group.details,
        eventTitle: group.eventTitle,
        deadline: group.deadline,
        receiptSignature: group.receiptSignature,
        receiptSubject: group.receiptSubject,
        receiptMessage: group.receiptMessage,
        receiptLogoUrl: group.receiptLogoUrl,
        charged: group.charged,
        collected: group.collected,
        remaining: group.remaining,
        participantCount: group.participantIds.size,
        latestPostedAt: group.latestPostedAt,
        semesterLabels,
      } as ContributionGroup;
    })
    .filter((group) => {
      if (!normalizedSearch) return true;
      return (
        group.title.toLowerCase().includes(normalizedSearch) ||
        (group.details ?? "").toLowerCase().includes(normalizedSearch) ||
        (group.eventTitle ?? "").toLowerCase().includes(normalizedSearch)
      );
    })
    .sort((a, b) => (a.latestPostedAt < b.latestPostedAt ? 1 : -1));

  const totalCharged = contributionGroups.reduce((sum, group) => sum + group.charged, 0);
  const totalCollected = contributionGroups.reduce((sum, group) => sum + group.collected, 0);
  const totalRemaining = contributionGroups.reduce((sum, group) => sum + Math.max(0, group.remaining), 0);

  const payableContributionOptions = contributionGroups
    .filter((group) => group.remaining > 0)
    .map((group) => ({
      id: group.id,
      title: group.title,
      remaining: Number(group.remaining.toFixed(2)),
      receiptSignature: group.receiptSignature,
      receiptSubject: group.receiptSubject,
      receiptMessage: group.receiptMessage,
      receiptLogoUrl: group.receiptLogoUrl,
    }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Contributions</h1>
            <p className="text-sm text-muted-foreground">
              Track contribution records, totals, and collection status.
            </p>
            {activeSemester ? (
              <p className="text-xs text-muted-foreground mt-1">Active semester: {activeSemester.label}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isReadOnlyView ? (
              <>
                <ContributionBatchDialog
                  dormId={activeDormId}
                  events={Array.from(eventById.entries()).map(([id, title]) => ({ id, title }))}
                  trigger={<Button size="sm">Add Contribution</Button>}
                />
                <LedgerOverwriteDialog dormId={activeDormId} />
              </>
            ) : (
              <Badge variant="outline">Selected semesters are view-only</Badge>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href="/treasurer/contribution-expenses">Expenses</Link>
            </Button>
            <ExportXlsxDialog
              report="event-contributions"
              title="Export Event Contributions"
              description="Download contribution summary and detailed ledger entries."
              defaultDormId={activeDormId}
              dormOptions={dormOptions}
              includeDormSelector={canFilterDorm}
            />
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 rounded-lg border border-muted bg-muted/20 p-3 sm:flex-row sm:items-center">
          <form className="flex w-full flex-col gap-2 sm:flex-row sm:items-center" method="GET">
            <Input
              name="search"
              placeholder="Search contribution..."
              defaultValue={search}
              className="h-9 w-full bg-background sm:w-60"
            />
            <select
              name="semester"
              defaultValue={selectedSemesterIds[0]}
              className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm md:w-60"
            >
              {semesters.map((semester) => (
                <option key={semester.id} value={semester.id}>
                  {semester.label}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button type="submit" variant="secondary" size="sm" className="h-9">
                Apply
              </Button>
              {search || semesterIdsFromParams.length > 0 ? (
                <Button asChild type="button" variant="ghost" size="sm" className="h-9">
                  <Link href="/treasurer/contributions">Reset</Link>
                </Button>
              ) : null}
            </div>
          </form>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-white/90 dark:bg-card/90 backdrop-blur-md shadow-md hover:shadow-lg transition-all duration-200 border-muted">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Visible Contributions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{contributionGroups.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-white/90 dark:bg-card/90 backdrop-blur-md shadow-md hover:shadow-lg transition-all duration-200 border-muted">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Charged</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">₱{totalCharged.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card className="bg-white/90 dark:bg-card/90 backdrop-blur-md shadow-md hover:shadow-lg transition-all duration-200 border-muted">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Collected</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-emerald-600">₱{totalCollected.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card className="bg-white/90 dark:bg-card/90 backdrop-blur-md shadow-md hover:shadow-lg transition-all duration-200 border-muted">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending Collection</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-rose-600">₱{totalRemaining.toFixed(2)}</div>
            {!isReadOnlyView ? (
              <div className="mt-4">
                <ContributionBatchPaymentDialog
                  dormId={activeDormId}
                  contributions={payableContributionOptions}
                  occupants={(occupants ?? []).map((occupant) => ({
                    id: occupant.id,
                    fullName: occupant.full_name ?? "Unnamed",
                    studentId: occupant.student_id ?? null,
                  }))}
                  triggerVariant="outline"
                  triggerClassName="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 border-rose-200 shadow-sm transition-colors"
                />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3 md:hidden">
        {contributionGroups.length === 0 ? (
          <Card className="bg-white/90 dark:bg-card/90 backdrop-blur-md shadow-sm border-muted">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No contribution records found.
            </CardContent>
          </Card>
        ) : (
          contributionGroups.map((contribution) => (
            <Card key={contribution.id} className="bg-white/90 dark:bg-card/90 backdrop-blur-md shadow-sm hover:shadow-md transition-shadow duration-200 border-muted">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{contribution.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {contribution.eventTitle ? `Linked event: ${contribution.eventTitle}` : "No linked event"}
                    </p>
                  </div>
                  <Badge variant={contribution.remaining > 0 ? "destructive" : "secondary"}>
                    {contribution.remaining > 0 ? "Open" : "Settled"}
                  </Badge>
                </div>

                {contribution.details ? (
                  <p className="text-xs text-muted-foreground line-clamp-2">{contribution.details}</p>
                ) : null}

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Charged</p>
                    <p className="font-medium">₱{contribution.charged.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Collected</p>
                    <p className="font-medium text-emerald-600">₱{contribution.collected.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Remaining</p>
                    <p className={`font-medium ${contribution.remaining > 0 ? "text-rose-600" : "text-muted-foreground"}`}>
                      ₱{contribution.remaining.toFixed(2)}
                    </p>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Deadline: {contribution.deadline ? format(new Date(contribution.deadline), "MMM d, yyyy h:mm a") : "Not set"}
                </p>

                <Button asChild size="sm" className="w-full">
                  <Link href={`/treasurer/contributions/${contribution.id}`}>Manage</Link>
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <div className="hidden rounded-lg border border-muted bg-white/90 dark:bg-card/90 backdrop-blur-md md:block shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border/50">
              <TableHead className="font-semibold text-foreground">Contribution</TableHead>
              <TableHead className="font-semibold text-foreground">Linked Event</TableHead>
              <TableHead className="text-right font-semibold text-foreground">Charged</TableHead>
              <TableHead className="text-right font-semibold text-foreground">Collected</TableHead>
              <TableHead className="text-right font-semibold text-foreground">Remaining</TableHead>
              <TableHead className="text-right font-semibold text-foreground">Participants</TableHead>
              <TableHead className="font-semibold text-foreground">Semesters</TableHead>
              <TableHead className="text-right font-semibold text-foreground">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contributionGroups.map((contribution) => (
              <TableRow key={contribution.id} className="border-border/50 hover:bg-muted/30 transition-colors">
                <TableCell>
                  <div className="font-medium">{contribution.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {contribution.deadline
                      ? `Deadline: ${format(new Date(contribution.deadline), "MMM d, yyyy h:mm a")}`
                      : "No deadline"}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{contribution.eventTitle ?? "—"}</TableCell>
                <TableCell className="text-right">₱{contribution.charged.toFixed(2)}</TableCell>
                <TableCell className="text-right text-emerald-600">₱{contribution.collected.toFixed(2)}</TableCell>
                <TableCell className={`text-right ${contribution.remaining > 0 ? "text-rose-600" : "text-muted-foreground"}`}>
                  ₱{contribution.remaining.toFixed(2)}
                </TableCell>
                <TableCell className="text-right">{contribution.participantCount}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {contribution.semesterLabels.length > 0
                      ? contribution.semesterLabels.map((label) => (
                        <Badge key={`${contribution.id}-${label}`} variant="outline">
                          {label}
                        </Badge>
                      ))
                      : <span className="text-xs text-muted-foreground">—</span>}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/treasurer/contributions/${contribution.id}`}>Manage</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {contributionGroups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  No contribution records found.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
