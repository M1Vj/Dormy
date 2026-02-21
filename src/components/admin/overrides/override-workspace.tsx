"use client";

import { useActionState, useMemo, useState } from "react";

import {
  overrideCleaningAssignment,
  overrideCleaningRestLevel,
  overrideEvaluationMetricScore,
  overrideEventPayableDeadline,
  overrideEventRecord,
  overrideFineRecord,
  overrideLedgerEntryOccupant,
  overrideOccupantRecord,
} from "@/app/actions/overrides";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type FormState = {
  error: string;
  success: string;
};

const initialState: FormState = {
  error: "",
  success: "",
};

const getText = (formData: FormData, key: string) => {
  const value = String(formData.get(key) ?? "").trim();
  return value.length > 0 ? value : undefined;
};

const isChecked = (formData: FormData, key: string) => formData.get(key) === "on";

const parseNumber = (formData: FormData, key: string) => {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) {
    return Number.NaN;
  }
  return Number(raw);
};

export type OverrideOccupantOption = {
  id: string;
  label: string;
  status: "active" | "left" | "removed";
};

export type OverrideFineOption = {
  id: string;
  label: string;
  voided: boolean;
};

export type OverrideFineRuleOption = {
  id: string;
  label: string;
  active: boolean;
};

export type OverrideEventOption = {
  id: string;
  label: string;
};

export type OverrideCleaningWeekOption = {
  id: string;
  label: string;
  rest_level: number | null;
};

export type OverrideRoomOption = {
  id: string;
  label: string;
};

export type OverrideCleaningAreaOption = {
  id: string;
  label: string;
  active: boolean;
};

export type OverrideSubmissionOption = {
  id: string;
  label: string;
  template_id: string;
};

export type OverrideMetricOption = {
  id: string;
  label: string;
  template_id: string;
  scale_min: number;
  scale_max: number;
};

export type OverrideLedgerEntryOption = {
  id: string;
  label: string;
};

type OverrideWorkspaceProps = {
  dormId: string;
  occupants: OverrideOccupantOption[];
  fineOptions: OverrideFineOption[];
  fineRules: OverrideFineRuleOption[];
  events: OverrideEventOption[];
  cleaningWeeks: OverrideCleaningWeekOption[];
  rooms: OverrideRoomOption[];
  cleaningAreas: OverrideCleaningAreaOption[];
  submissions: OverrideSubmissionOption[];
  metrics: OverrideMetricOption[];
  ledgerEntries: OverrideLedgerEntryOption[];
};

type OverrideTab = "occupants" | "fines" | "payments" | "cleaning" | "events" | "evaluation";

export function OverrideWorkspace({
  dormId,
  occupants,
  fineOptions,
  fineRules,
  events,
  cleaningWeeks,
  rooms,
  cleaningAreas,
  submissions,
  metrics,
  ledgerEntries,
}: OverrideWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<OverrideTab>("occupants");
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(submissions[0]?.id ?? "");
  const submissionTemplateById = useMemo(
    () => new Map(submissions.map((submission) => [submission.id, submission.template_id])),
    [submissions]
  );

  const visibleMetrics = useMemo(() => {
    const templateId = submissionTemplateById.get(selectedSubmissionId);
    if (!templateId) {
      return metrics;
    }
    return metrics.filter((metric) => metric.template_id === templateId);
  }, [metrics, selectedSubmissionId, submissionTemplateById]);

  const [occupantState, occupantAction, occupantPending] = useActionState(
    async (_state: FormState, formData: FormData) => {
      const result = await overrideOccupantRecord(dormId, {
        occupant_id: String(formData.get("occupant_id") ?? ""),
        reason: String(formData.get("reason") ?? ""),
        full_name: getText(formData, "full_name"),
        student_id: getText(formData, "student_id"),
        course: getText(formData, "course"),
        joined_at: getText(formData, "joined_at"),
        left_at: getText(formData, "left_at"),
        status: (getText(formData, "status") as "active" | "left" | "removed" | undefined) ?? undefined,
        clear_student_id: isChecked(formData, "clear_student_id"),
        clear_course: isChecked(formData, "clear_course"),
        clear_left_at: isChecked(formData, "clear_left_at"),
      });

      if (result?.error) {
        return { error: result.error, success: "" };
      }
      return { error: "", success: "Occupant override saved." };
    },
    initialState
  );

  const [fineState, fineAction, finePending] = useActionState(
    async (_state: FormState, formData: FormData) => {
      const ruleValue = String(formData.get("rule_id") ?? "").trim();
      const result = await overrideFineRecord(dormId, {
        fine_id: String(formData.get("fine_id") ?? ""),
        reason: String(formData.get("reason") ?? ""),
        pesos: parseNumber(formData, "pesos"),
        points: parseNumber(formData, "points"),
        note: getText(formData, "note"),
        clear_note: isChecked(formData, "clear_note"),
        clear_rule: ruleValue === "__clear__",
        rule_id: ruleValue && ruleValue !== "__clear__" ? ruleValue : undefined,
        restore_if_voided: isChecked(formData, "restore_if_voided"),
      });

      if (result?.error) {
        return { error: result.error, success: "" };
      }
      return { error: "", success: "Fine override saved." };
    },
    initialState
  );

  const [ledgerState, ledgerAction, ledgerPending] = useActionState(
    async (_state: FormState, formData: FormData) => {
      const result = await overrideLedgerEntryOccupant(dormId, {
        entry_id: String(formData.get("entry_id") ?? ""),
        occupant_id: String(formData.get("occupant_id") ?? ""),
        reason: String(formData.get("reason") ?? ""),
      });

      if (result?.error) {
        return { error: result.error, success: "" };
      }
      return { error: "", success: "Ledger entry reassigned." };
    },
    initialState
  );

  const [deadlineState, deadlineAction, deadlinePending] = useActionState(
    async (_state: FormState, formData: FormData) => {
      const result = await overrideEventPayableDeadline(dormId, {
        event_id: String(formData.get("event_id") ?? ""),
        reason: String(formData.get("reason") ?? ""),
        deadline: getText(formData, "deadline"),
        clear_deadline: isChecked(formData, "clear_deadline"),
      });

      if (result?.error) {
        return { error: result.error, success: "" };
      }
      return { error: "", success: "Event payable deadline override saved." };
    },
    initialState
  );

  const [cleaningAssignmentState, cleaningAssignmentAction, cleaningAssignmentPending] = useActionState(
    async (_state: FormState, formData: FormData) => {
      const areaValue = String(formData.get("area_id") ?? "").trim();
      const result = await overrideCleaningAssignment(dormId, {
        week_id: String(formData.get("week_id") ?? ""),
        room_id: String(formData.get("room_id") ?? ""),
        area_id: areaValue && areaValue !== "__clear__" ? areaValue : undefined,
        reason: String(formData.get("reason") ?? ""),
        allow_rest_level: isChecked(formData, "allow_rest_level"),
        clear_area: areaValue === "__clear__",
      });

      if (result?.error) {
        return { error: result.error, success: "" };
      }
      return { error: "", success: "Cleaning assignment override saved." };
    },
    initialState
  );

  const [cleaningRestState, cleaningRestAction, cleaningRestPending] = useActionState(
    async (_state: FormState, formData: FormData) => {
      const restLevelValue = String(formData.get("rest_level") ?? "").trim();
      const result = await overrideCleaningRestLevel(dormId, {
        week_id: String(formData.get("week_id") ?? ""),
        rest_level: restLevelValue ? Number(restLevelValue) : undefined,
        reason: String(formData.get("reason") ?? ""),
        clear_rest_level: isChecked(formData, "clear_rest_level"),
      });

      if (result?.error) {
        return { error: result.error, success: "" };
      }
      return { error: "", success: "Cleaning rest-level override saved." };
    },
    initialState
  );

  const [eventState, eventAction, eventPending] = useActionState(
    async (_state: FormState, formData: FormData) => {
      const competitionValue = String(formData.get("is_competition") ?? "").trim();
      const result = await overrideEventRecord(dormId, {
        event_id: String(formData.get("event_id") ?? ""),
        reason: String(formData.get("reason") ?? ""),
        title: getText(formData, "title"),
        description: getText(formData, "description"),
        location: getText(formData, "location"),
        starts_at: getText(formData, "starts_at"),
        ends_at: getText(formData, "ends_at"),
        is_competition:
          competitionValue === "true" ? true : competitionValue === "false" ? false : undefined,
        clear_description: isChecked(formData, "clear_description"),
        clear_location: isChecked(formData, "clear_location"),
      });

      if (result?.error) {
        return { error: result.error, success: "" };
      }
      return { error: "", success: "Event override saved." };
    },
    initialState
  );

  const [evaluationState, evaluationAction, evaluationPending] = useActionState(
    async (_state: FormState, formData: FormData) => {
      const result = await overrideEvaluationMetricScore(dormId, {
        submission_id: String(formData.get("submission_id") ?? ""),
        metric_id: String(formData.get("metric_id") ?? ""),
        score: parseNumber(formData, "score"),
        reason: String(formData.get("reason") ?? ""),
      });

      if (result?.error) {
        return { error: result.error, success: "" };
      }
      return { error: "", success: "Evaluation score override saved." };
    },
    initialState
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {(
          [
            { value: "occupants", label: "Occupants" },
            { value: "fines", label: "Fines" },
            { value: "payments", label: "Payments" },
            { value: "cleaning", label: "Cleaning" },
            { value: "events", label: "Events" },
            { value: "evaluation", label: "Evaluation" },
          ] as Array<{ value: OverrideTab; label: string }>
        ).map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className={`h-10 rounded-md border px-3 text-sm font-medium transition ${activeTab === tab.value
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input bg-background hover:bg-muted"
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "occupants" ? (
        <Card>
          <CardHeader>
            <CardTitle>Occupant override</CardTitle>
            <CardDescription>Correct occupant profile and status edge cases.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={occupantAction} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="occupant_id">
                    Occupant
                  </label>
                  <select
                    id="occupant_id"
                    name="occupant_id"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    defaultValue={occupants[0]?.id ?? ""}
                    required
                  >
                    {occupants.map((occupant) => (
                      <option key={occupant.id} value={occupant.id}>
                        {occupant.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="full_name">
                    Full name
                  </label>
                  <Input id="full_name" name="full_name" placeholder="Keep current if blank" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="status">
                    Status
                  </label>
                  <select
                    id="status"
                    name="status"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    defaultValue=""
                  >
                    <option value="">Keep current</option>
                    <option value="active">Active</option>
                    <option value="left">Left</option>
                    <option value="removed">Removed</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="student_id">
                    Student ID
                  </label>
                  <Input id="student_id" name="student_id" placeholder="Set new value" />
                  <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" name="clear_student_id" className="h-4 w-4" />
                    Clear student ID
                  </label>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="course">
                    Course
                  </label>
                  <Input id="course" name="course" placeholder="Set new value" />
                  <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" name="clear_course" className="h-4 w-4" />
                    Clear course
                  </label>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="joined_at">
                    Joined date
                  </label>
                  <Input id="joined_at" name="joined_at" type="date" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="left_at">
                    Left date
                  </label>
                  <Input id="left_at" name="left_at" type="date" />
                  <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" name="clear_left_at" className="h-4 w-4" />
                    Clear left date
                  </label>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="occupant_reason">
                  Reason
                </label>
                <Textarea id="occupant_reason" name="reason" required />
              </div>
              {occupantState.error ? (
                <p className="text-sm text-destructive">{occupantState.error}</p>
              ) : null}
              {occupantState.success ? (
                <p className="text-sm text-emerald-600">{occupantState.success}</p>
              ) : null}
              <Button type="submit" disabled={occupantPending}>
                {occupantPending ? "Saving..." : "Apply occupant override"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "fines" ? (
        <Card>
          <CardHeader>
            <CardTitle>Fine override</CardTitle>
            <CardDescription>Fix incorrect fine amounts, points, and mapping.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={fineAction} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="fine_id">
                    Fine
                  </label>
                  <select
                    id="fine_id"
                    name="fine_id"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    defaultValue={fineOptions[0]?.id ?? ""}
                    required
                  >
                    {fineOptions.map((fine) => (
                      <option key={fine.id} value={fine.id}>
                        {fine.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="pesos">
                    New amount (pesos)
                  </label>
                  <Input id="pesos" name="pesos" type="number" min={0} step="0.01" required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="points">
                    New points
                  </label>
                  <Input id="points" name="points" type="number" min={0} step="0.01" required />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="rule_id">
                    Rule mapping
                  </label>
                  <select
                    id="rule_id"
                    name="rule_id"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    defaultValue=""
                  >
                    <option value="">Keep current</option>
                    <option value="__clear__">Clear rule</option>
                    {fineRules.map((rule) => (
                      <option key={rule.id} value={rule.id}>
                        {rule.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="note">
                    Note
                  </label>
                  <Textarea id="note" name="note" placeholder="Keep current if blank" />
                  <div className="flex flex-wrap gap-4">
                    <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                      <input type="checkbox" name="clear_note" className="h-4 w-4" />
                      Clear note
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                      <input type="checkbox" name="restore_if_voided" className="h-4 w-4" />
                      Restore if currently voided
                    </label>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="fine_reason">
                  Reason
                </label>
                <Textarea id="fine_reason" name="reason" required />
              </div>
              {fineState.error ? <p className="text-sm text-destructive">{fineState.error}</p> : null}
              {fineState.success ? (
                <p className="text-sm text-emerald-600">{fineState.success}</p>
              ) : null}
              <Button type="submit" disabled={finePending}>
                {finePending ? "Saving..." : "Apply fine override"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "payments" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Ledger occupant override</CardTitle>
              <CardDescription>Move a ledger entry to the correct occupant account.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={ledgerAction} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium" htmlFor="entry_id">
                      Ledger entry
                    </label>
                    <select
                      id="entry_id"
                      name="entry_id"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      defaultValue={ledgerEntries[0]?.id ?? ""}
                      required
                    >
                      {ledgerEntries.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium" htmlFor="ledger_occupant_id">
                      New occupant
                    </label>
                    <select
                      id="ledger_occupant_id"
                      name="occupant_id"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      defaultValue={occupants[0]?.id ?? ""}
                      required
                    >
                      {occupants.map((occupant) => (
                        <option key={occupant.id} value={occupant.id}>
                          {occupant.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="ledger_reason">
                    Reason
                  </label>
                  <Textarea id="ledger_reason" name="reason" required />
                </div>
                {ledgerState.error ? (
                  <p className="text-sm text-destructive">{ledgerState.error}</p>
                ) : null}
                {ledgerState.success ? (
                  <p className="text-sm text-emerald-600">{ledgerState.success}</p>
                ) : null}
                <Button type="submit" disabled={ledgerPending}>
                  {ledgerPending ? "Saving..." : "Reassign ledger entry"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contribution deadline override</CardTitle>
              <CardDescription>Update or clear contribution deadlines across all event charges.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={deadlineAction} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium" htmlFor="deadline_event_id">
                      Event
                    </label>
                    <select
                      id="deadline_event_id"
                      name="event_id"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      defaultValue={events[0]?.id ?? ""}
                      required
                    >
                      {events.map((event) => (
                        <option key={event.id} value={event.id}>
                          {event.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium" htmlFor="deadline">
                      New deadline
                    </label>
                    <Input id="deadline" name="deadline" type="datetime-local" />
                    <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                      <input type="checkbox" name="clear_deadline" className="h-4 w-4" />
                      Clear deadline
                    </label>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="deadline_reason">
                    Reason
                  </label>
                  <Textarea id="deadline_reason" name="reason" required />
                </div>
                {deadlineState.error ? (
                  <p className="text-sm text-destructive">{deadlineState.error}</p>
                ) : null}
                {deadlineState.success ? (
                  <p className="text-sm text-emerald-600">{deadlineState.success}</p>
                ) : null}
                <Button type="submit" disabled={deadlinePending}>
                  {deadlinePending ? "Saving..." : "Apply deadline override"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {activeTab === "cleaning" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Cleaning assignment override</CardTitle>
              <CardDescription>Force assignment changes for exceptional week conditions.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={cleaningAssignmentAction} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="assignment_week_id">
                      Week
                    </label>
                    <select
                      id="assignment_week_id"
                      name="week_id"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      defaultValue={cleaningWeeks[0]?.id ?? ""}
                      required
                    >
                      {cleaningWeeks.map((week) => (
                        <option key={week.id} value={week.id}>
                          {week.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="assignment_room_id">
                      Room
                    </label>
                    <select
                      id="assignment_room_id"
                      name="room_id"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      defaultValue={rooms[0]?.id ?? ""}
                      required
                    >
                      {rooms.map((room) => (
                        <option key={room.id} value={room.id}>
                          {room.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium" htmlFor="area_id">
                      Area
                    </label>
                    <select
                      id="area_id"
                      name="area_id"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      defaultValue={cleaningAreas[0]?.id ?? "__clear__"}
                    >
                      <option value="__clear__">Clear assignment</option>
                      {cleaningAreas.map((area) => (
                        <option key={area.id} value={area.id}>
                          {area.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4">
                  <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" name="allow_rest_level" className="h-4 w-4" />
                    Allow rest-level room assignment
                  </label>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="cleaning_assignment_reason">
                    Reason
                  </label>
                  <Textarea id="cleaning_assignment_reason" name="reason" required />
                </div>
                {cleaningAssignmentState.error ? (
                  <p className="text-sm text-destructive">{cleaningAssignmentState.error}</p>
                ) : null}
                {cleaningAssignmentState.success ? (
                  <p className="text-sm text-emerald-600">{cleaningAssignmentState.success}</p>
                ) : null}
                <Button type="submit" disabled={cleaningAssignmentPending}>
                  {cleaningAssignmentPending ? "Saving..." : "Apply cleaning assignment override"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rest-level override</CardTitle>
              <CardDescription>Override or clear weekly rest-level settings.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={cleaningRestAction} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="rest_week_id">
                      Week
                    </label>
                    <select
                      id="rest_week_id"
                      name="week_id"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      defaultValue={cleaningWeeks[0]?.id ?? ""}
                      required
                    >
                      {cleaningWeeks.map((week) => (
                        <option key={week.id} value={week.id}>
                          {week.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="rest_level">
                      Rest level
                    </label>
                    <select
                      id="rest_level"
                      name="rest_level"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      defaultValue=""
                    >
                      <option value="">No change</option>
                      <option value="1">Level 1</option>
                      <option value="2">Level 2</option>
                      <option value="3">Level 3</option>
                    </select>
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" name="clear_rest_level" className="h-4 w-4" />
                  Clear rest level
                </label>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="cleaning_rest_reason">
                    Reason
                  </label>
                  <Textarea id="cleaning_rest_reason" name="reason" required />
                </div>
                {cleaningRestState.error ? (
                  <p className="text-sm text-destructive">{cleaningRestState.error}</p>
                ) : null}
                {cleaningRestState.success ? (
                  <p className="text-sm text-emerald-600">{cleaningRestState.success}</p>
                ) : null}
                <Button type="submit" disabled={cleaningRestPending}>
                  {cleaningRestPending ? "Saving..." : "Apply rest-level override"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {activeTab === "events" ? (
        <Card>
          <CardHeader>
            <CardTitle>Event override</CardTitle>
            <CardDescription>Correct event records while preserving audit accountability.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={eventAction} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="event_id">
                    Event
                  </label>
                  <select
                    id="event_id"
                    name="event_id"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    defaultValue={events[0]?.id ?? ""}
                    required
                  >
                    {events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="title">
                    Title
                  </label>
                  <Input id="title" name="title" placeholder="Keep current if blank" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="is_competition">
                    Competition flag
                  </label>
                  <select
                    id="is_competition"
                    name="is_competition"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    defaultValue=""
                  >
                    <option value="">Keep current</option>
                    <option value="true">Competition</option>
                    <option value="false">Regular event</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="starts_at">
                    Starts at
                  </label>
                  <Input id="starts_at" name="starts_at" type="datetime-local" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="ends_at">
                    Ends at
                  </label>
                  <Input id="ends_at" name="ends_at" type="datetime-local" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="location">
                    Location
                  </label>
                  <Input id="location" name="location" placeholder="Keep current if blank" />
                  <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" name="clear_location" className="h-4 w-4" />
                    Clear location
                  </label>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="description">
                    Description
                  </label>
                  <Textarea id="description" name="description" placeholder="Keep current if blank" />
                  <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" name="clear_description" className="h-4 w-4" />
                    Clear description
                  </label>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="event_reason">
                  Reason
                </label>
                <Textarea id="event_reason" name="reason" required />
              </div>
              {eventState.error ? <p className="text-sm text-destructive">{eventState.error}</p> : null}
              {eventState.success ? <p className="text-sm text-emerald-600">{eventState.success}</p> : null}
              <Button type="submit" disabled={eventPending}>
                {eventPending ? "Saving..." : "Apply event override"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "evaluation" ? (
        <Card>
          <CardHeader>
            <CardTitle>Evaluation score override</CardTitle>
            <CardDescription>Correct submission metric scores for exceptional disputes.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={evaluationAction} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="submission_id">
                    Submission
                  </label>
                  <select
                    id="submission_id"
                    name="submission_id"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    defaultValue={submissions[0]?.id ?? ""}
                    onChange={(event) => setSelectedSubmissionId(event.target.value)}
                    required
                  >
                    {submissions.map((submission) => (
                      <option key={submission.id} value={submission.id}>
                        {submission.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="metric_id">
                    Metric
                  </label>
                  <select
                    id="metric_id"
                    name="metric_id"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    defaultValue={visibleMetrics[0]?.id ?? ""}
                    required
                  >
                    {visibleMetrics.map((metric) => (
                      <option key={metric.id} value={metric.id}>
                        {metric.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="score">
                    New score
                  </label>
                  <Input id="score" name="score" type="number" step="0.01" required />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="evaluation_reason">
                  Reason
                </label>
                <Textarea id="evaluation_reason" name="reason" required />
              </div>
              {evaluationState.error ? (
                <p className="text-sm text-destructive">{evaluationState.error}</p>
              ) : null}
              {evaluationState.success ? (
                <p className="text-sm text-emerald-600">{evaluationState.success}</p>
              ) : null}
              <Button type="submit" disabled={evaluationPending}>
                {evaluationPending ? "Saving..." : "Apply evaluation override"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
