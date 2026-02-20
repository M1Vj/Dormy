import { format } from "date-fns";
import { redirect } from "next/navigation";

import { OverrideWorkspace } from "@/components/admin/overrides/override-workspace";
import { getActiveDormId } from "@/lib/dorms";
import { ensureActiveSemesterId } from "@/lib/semesters";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type OccupantRow = {
  id: string;
  full_name: string;
  student_id: string | null;
  status: "active" | "left" | "removed";
};

type FineRow = {
  id: string;
  occupant_id: string;
  pesos: number | string;
  points: number | string;
  issued_at: string | null;
  voided_at: string | null;
  occupant:
  | {
    full_name: string | null;
  }
  | {
    full_name: string | null;
  }[]
  | null;
};

type FineRuleRow = {
  id: string;
  title: string;
  active: boolean;
};

type EventRow = {
  id: string;
  title: string;
  starts_at: string | null;
};

type CleaningWeekRow = {
  id: string;
  week_start: string;
  rest_level: number | null;
};

type RoomRow = {
  id: string;
  code: string;
  level: number;
  level_override: string | null;
};

type CleaningAreaRow = {
  id: string;
  name: string;
  active: boolean;
};

type EvaluationSubmissionRow = {
  id: string;
  template_id: string;
  rater_occupant_id: string;
  ratee_occupant_id: string;
  submitted_at: string | null;
  created_at: string;
};

type EvaluationTemplateRow = {
  id: string;
  name: string;
};

type EvaluationMetricRow = {
  id: string;
  template_id: string;
  name: string;
  scale_min: number | string;
  scale_max: number | string;
};

type LedgerEntryRow = {
  id: string;
  ledger: string;
  entry_type: string;
  occupant_id: string | null;
  event_id: string | null;
  fine_id: string | null;
  amount_pesos: number | string;
  posted_at: string;
  note: string | null;
};

function asFirst<T>(value: T | T[] | null) {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default async function AdminOverridesPage() {
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
  if (!activeDormId) {
    return <div className="p-6 text-sm text-muted-foreground">No active dorm selected.</div>;
  }

  const { data: memberships } = await supabase
    .from("dorm_memberships")
    .select("role, dorm_id")
    .eq("user_id", user.id);

  const activeMembership =
    memberships?.find((membership) => membership.dorm_id === activeDormId) ??
    memberships?.[0];

  if (!activeMembership || activeMembership.role !== "admin") {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Only admins can access overrides.
      </div>
    );
  }

  const semesterResult = await ensureActiveSemesterId(activeDormId, supabase);
  const activeSemesterId = "error" in semesterResult ? null : semesterResult.semesterId;

  const occupantsPromise = supabase
    .from("occupants")
    .select("id, full_name, student_id, status")
    .eq("dorm_id", activeDormId)
    .order("full_name", { ascending: true });

  const fineRulesPromise = supabase
    .from("fine_rules")
    .select("id, title, active")
    .eq("dorm_id", activeDormId)
    .order("title", { ascending: true });

  const finesPromise = supabase
    .from("fines")
    .select("id, occupant_id, pesos, points, issued_at, voided_at, occupant:occupants(full_name)")
    .eq("dorm_id", activeDormId)
    .order("issued_at", { ascending: false })
    .limit(300);

  let eventsQuery = supabase
    .from("events")
    .select("id, title, starts_at")
    .eq("dorm_id", activeDormId)
    .order("starts_at", { ascending: false, nullsFirst: false })
    .limit(300);
  if (activeSemesterId) {
    eventsQuery = eventsQuery.eq("semester_id", activeSemesterId);
  }

  let cleaningWeeksQuery = supabase
    .from("cleaning_weeks")
    .select("id, week_start, rest_level")
    .eq("dorm_id", activeDormId)
    .order("week_start", { ascending: false })
    .limit(120);
  if (activeSemesterId) {
    cleaningWeeksQuery = cleaningWeeksQuery.eq("semester_id", activeSemesterId);
  }

  const roomsPromise = supabase
    .from("rooms")
    .select("id, code, level, level_override")
    .eq("dorm_id", activeDormId)
    .order("level", { ascending: true })
    .order("code", { ascending: true });

  const cleaningAreasPromise = supabase
    .from("cleaning_areas")
    .select("id, name, active")
    .eq("dorm_id", activeDormId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  const submissionsPromise = supabase
    .from("evaluation_submissions")
    .select("id, template_id, rater_occupant_id, ratee_occupant_id, submitted_at, created_at")
    .eq("dorm_id", activeDormId)
    .order("created_at", { ascending: false })
    .limit(300);

  const templatesPromise = supabase
    .from("evaluation_templates")
    .select("id, name")
    .eq("dorm_id", activeDormId)
    .order("created_at", { ascending: false });

  const metricsPromise = supabase
    .from("evaluation_metrics")
    .select("id, template_id, name, scale_min, scale_max")
    .eq("dorm_id", activeDormId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  const ledgerEntriesPromise = supabase
    .from("ledger_entries")
    .select("id, ledger, entry_type, occupant_id, event_id, fine_id, amount_pesos, posted_at, note")
    .eq("dorm_id", activeDormId)
    .is("voided_at", null)
    .order("posted_at", { ascending: false })
    .limit(300);

  const [
    occupantsResult,
    fineRulesResult,
    finesResult,
    eventsResult,
    cleaningWeeksResult,
    roomsResult,
    cleaningAreasResult,
    submissionsResult,
    templatesResult,
    metricsResult,
    ledgerEntriesResult,
  ] = await Promise.all([
    occupantsPromise,
    fineRulesPromise,
    finesPromise,
    eventsQuery,
    cleaningWeeksQuery,
    roomsPromise,
    cleaningAreasPromise,
    submissionsPromise,
    templatesPromise,
    metricsPromise,
    ledgerEntriesPromise,
  ]);

  if (
    occupantsResult.error ||
    fineRulesResult.error ||
    finesResult.error ||
    eventsResult.error ||
    cleaningWeeksResult.error ||
    roomsResult.error ||
    cleaningAreasResult.error ||
    submissionsResult.error ||
    templatesResult.error ||
    metricsResult.error ||
    ledgerEntriesResult.error
  ) {
    return (
      <div className="p-6 text-sm text-destructive">
        Failed to load override workspace data.
      </div>
    );
  }

  const occupants = (occupantsResult.data ?? []) as OccupantRow[];
  const fineRules = (fineRulesResult.data ?? []) as FineRuleRow[];
  const fines = (finesResult.data ?? []) as FineRow[];
  const events = (eventsResult.data ?? []) as EventRow[];
  const cleaningWeeks = (cleaningWeeksResult.data ?? []) as CleaningWeekRow[];
  const rooms = (roomsResult.data ?? []) as RoomRow[];
  const cleaningAreas = (cleaningAreasResult.data ?? []) as CleaningAreaRow[];
  const submissions = (submissionsResult.data ?? []) as EvaluationSubmissionRow[];
  const templates = (templatesResult.data ?? []) as EvaluationTemplateRow[];
  const metrics = (metricsResult.data ?? []) as EvaluationMetricRow[];
  const ledgerEntries = (ledgerEntriesResult.data ?? []) as LedgerEntryRow[];

  const occupantNameById = new Map(occupants.map((occupant) => [occupant.id, occupant.full_name]));
  const templateNameById = new Map(templates.map((template) => [template.id, template.name]));
  const eventNameById = new Map(events.map((event) => [event.id, event.title]));

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Admin Overrides</h1>
        <p className="text-sm text-muted-foreground">
          Apply controlled overrides for exceptional operations while preserving full audit history.
        </p>
      </div>

      <OverrideWorkspace
        dormId={activeDormId}
        occupants={occupants.map((occupant) => ({
          id: occupant.id,
          label: `${occupant.full_name}${occupant.student_id ? ` (${occupant.student_id})` : ""} • ${occupant.status}`,
          status: occupant.status,
        }))}
        fineOptions={fines.map((fine) => ({
          id: fine.id,
          label: `${asFirst(fine.occupant)?.full_name ?? "Unknown occupant"} • ₱${Number(fine.pesos ?? 0).toFixed(2)} / ${Number(fine.points ?? 0).toFixed(2)} pts • ${fine.issued_at ? format(new Date(fine.issued_at), "MMM d, yyyy") : "No date"}${fine.voided_at ? " • voided" : ""}`,
          voided: Boolean(fine.voided_at),
        }))}
        fineRules={fineRules.map((rule) => ({
          id: rule.id,
          label: `${rule.title}${rule.active ? "" : " (inactive)"}`,
          active: rule.active,
        }))}
        events={events.map((event) => ({
          id: event.id,
          label: `${event.title}${event.starts_at ? ` • ${format(new Date(event.starts_at), "MMM d, yyyy")}` : ""}`,
        }))}
        cleaningWeeks={cleaningWeeks.map((week) => ({
          id: week.id,
          label: `${week.week_start}${week.rest_level ? ` • rest level ${week.rest_level}` : " • no rest level"}`,
          rest_level: week.rest_level,
        }))}
        rooms={rooms.map((room) => ({
          id: room.id,
          label: `${room.code} • level ${room.level_override ?? room.level}`,
        }))}
        cleaningAreas={cleaningAreas.map((area) => ({
          id: area.id,
          label: `${area.name}${area.active ? "" : " (inactive)"}`,
          active: area.active,
        }))}
        submissions={submissions.map((submission) => ({
          id: submission.id,
          label: `${templateNameById.get(submission.template_id) ?? "Template"} • ${occupantNameById.get(submission.ratee_occupant_id) ?? "Unknown ratee"} rated by ${occupantNameById.get(submission.rater_occupant_id) ?? "Unknown rater"} • ${format(new Date(submission.submitted_at ?? submission.created_at), "MMM d, yyyy")}`,
          template_id: submission.template_id,
        }))}
        metrics={metrics.map((metric) => ({
          id: metric.id,
          label: `${metric.name} (scale ${metric.scale_min}-${metric.scale_max})`,
          template_id: metric.template_id,
          scale_min: Number(metric.scale_min),
          scale_max: Number(metric.scale_max),
        }))}
        ledgerEntries={ledgerEntries.map((entry) => ({
          id: entry.id,
          label: `${format(new Date(entry.posted_at), "MMM d, yyyy")} • ${entry.ledger}/${entry.entry_type} • ${entry.occupant_id ? occupantNameById.get(entry.occupant_id) ?? entry.occupant_id : "No occupant"} • ₱${Number(entry.amount_pesos ?? 0).toFixed(2)}${entry.event_id ? ` • ${eventNameById.get(entry.event_id) ?? entry.event_id}` : ""}${entry.fine_id ? " • fine-linked" : ""}`,
        }))}
      />
    </div>
  );
}
