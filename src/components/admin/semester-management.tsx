"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  activateSemesterPlan,
  archiveSemesterAndStartNext,
  createSemesterPlan,
} from "@/app/actions/semesters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { DormSemester, DormSemesterArchive } from "@/lib/semesters";

type ActiveOccupant = {
  id: string;
  full_name: string;
  student_id: string | null;
  course: string | null;
};

type SemesterManagementProps = {
  dormId: string;
  activeSemester: DormSemester | null;
  semesters: DormSemester[];
  archives: DormSemesterArchive[];
  activeOccupants: ActiveOccupant[];
  outstandingMoney: {
    total: number;
    byLedger: {
      adviser_maintenance: number;
      sa_fines: number;
      treasurer_events: number;
    };
  };
};

function inferNextSemester(activeSemester: DormSemester | null) {
  if (!activeSemester) {
    return {
      schoolYear: "",
      semester: "1st",
      label: "",
    };
  }

  const normalizedSemester = activeSemester.semester.toLowerCase();
  const isFirst = normalizedSemester.includes("1");
  const [startYearRaw, endYearRaw] = activeSemester.school_year.split("-");
  const startYear = Number(startYearRaw);
  const endYear = Number(endYearRaw);

  if (
    Number.isFinite(startYear) &&
    Number.isFinite(endYear) &&
    startYear > 0 &&
    endYear > startYear
  ) {
    if (isFirst) {
      return {
        schoolYear: `${startYear}-${endYear}`,
        semester: "2nd",
        label: `${startYear}-${endYear} 2nd Semester`,
      };
    }

    return {
      schoolYear: `${endYear}-${endYear + 1}`,
      semester: "1st",
      label: `${endYear}-${endYear + 1} 1st Semester`,
    };
  }

  return {
    schoolYear: activeSemester.school_year,
    semester: isFirst ? "2nd" : "1st",
    label: "",
  };
}

function getSummaryValue(snapshot: Record<string, unknown> | null, key: string) {
  const summary = snapshot?.summary;
  if (!summary || typeof summary !== "object") {
    return "-";
  }

  const rawValue = (summary as Record<string, unknown>)[key];
  if (rawValue === null || rawValue === undefined) {
    return "-";
  }

  if (typeof rawValue === "number") {
    return rawValue.toString();
  }

  return String(rawValue);
}

export function SemesterManagement({
  dormId,
  activeSemester,
  semesters,
  archives,
  activeOccupants,
  outstandingMoney,
}: SemesterManagementProps) {
  const [isCreatingPlan, startCreatePlan] = useTransition();
  const [isActivating, startActivate] = useTransition();
  const [isArchiving, startArchive] = useTransition();
  const [turnoverEnabled, setTurnoverEnabled] = useState(false);

  const plannedSemesters = useMemo(
    () => semesters.filter((semester) => semester.status === "planned"),
    [semesters]
  );

  const nextDefaults = useMemo(() => inferNextSemester(activeSemester), [activeSemester]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active semester</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{activeSemester?.label ?? "Not set"}</p>
            {activeSemester ? (
              <p className="text-xs text-muted-foreground">
                {activeSemester.starts_on} to {activeSemester.ends_on}
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active occupants</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{activeOccupants.length}</p>
            <p className="text-xs text-muted-foreground">Persistent roster with overwrite controls</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Outstanding money</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">₱{outstandingMoney.total.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Finance remains persistent across semesters</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create semester plan</CardTitle>
          <CardDescription>Prepare the next semester without changing the active term yet.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              startCreatePlan(async () => {
                const result = await createSemesterPlan(dormId, formData);
                if (result?.error) {
                  toast.error(result.error);
                  return;
                }
                toast.success("Semester plan created.");
              });
            }}
          >
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="plan-school-year">
                School year
              </label>
              <Input id="plan-school-year" name="school_year" defaultValue={nextDefaults.schoolYear} required />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="plan-semester">
                Semester
              </label>
              <Input id="plan-semester" name="semester" defaultValue={nextDefaults.semester} required />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium" htmlFor="plan-label">
                Label
              </label>
              <Input id="plan-label" name="label" defaultValue={nextDefaults.label} required />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="plan-starts-on">
                Starts on
              </label>
              <Input id="plan-starts-on" type="date" name="starts_on" required />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="plan-ends-on">
                Ends on
              </label>
              <Input id="plan-ends-on" type="date" name="ends_on" required />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={isCreatingPlan}>
                {isCreatingPlan ? "Creating..." : "Create plan"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {plannedSemesters.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Activate planned semester</CardTitle>
            <CardDescription>
              Use this when there is no active semester and you only need to activate an existing plan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                startActivate(async () => {
                  const result = await activateSemesterPlan(dormId, formData);
                  if (result?.error) {
                    toast.error(result.error);
                    return;
                  }
                  toast.success("Semester activated.");
                });
              }}
            >
              <div className="w-full space-y-1 sm:max-w-sm">
                <label className="text-sm font-medium" htmlFor="activate-semester-id">
                  Planned semester
                </label>
                <select
                  id="activate-semester-id"
                  name="semester_id"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue={plannedSemesters[0]?.id}
                  required
                >
                  {plannedSemesters.map((semester) => (
                    <option key={semester.id} value={semester.id}>
                      {semester.label}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" disabled={isActivating}>
                {isActivating ? "Activating..." : "Activate"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {activeSemester ? (
        <Card>
          <CardHeader>
            <CardTitle>Archive current semester and start next</CardTitle>
            <CardDescription>
              Archives events, fines, cleaning, and evaluation into semester history, then activates the new term.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                if (!turnoverEnabled) {
                  formData.set("apply_occupant_turnover", "false");
                }

                startArchive(async () => {
                  const result = await archiveSemesterAndStartNext(dormId, formData);
                  if (result?.error) {
                    toast.error(result.error);
                    return;
                  }

                  toast.success("Semester archived and rollover completed.");
                });
              }}
            >
              <input type="hidden" name="active_semester_id" value={activeSemester.id} />
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="archive-label">
                  Archive label (optional)
                </label>
                <Input id="archive-label" name="archive_label" placeholder={activeSemester.label} />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium" htmlFor="next-school-year">
                    Next school year
                  </label>
                  <Input
                    id="next-school-year"
                    name="next_school_year"
                    defaultValue={nextDefaults.schoolYear}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium" htmlFor="next-semester">
                    Next semester
                  </label>
                  <Input
                    id="next-semester"
                    name="next_semester"
                    defaultValue={nextDefaults.semester}
                    required
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="next-label">
                    Next label
                  </label>
                  <Input id="next-label" name="next_label" defaultValue={nextDefaults.label} required />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium" htmlFor="next-starts-on">
                    Next starts on
                  </label>
                  <Input id="next-starts-on" type="date" name="next_starts_on" required />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium" htmlFor="next-ends-on">
                    Next ends on
                  </label>
                  <Input id="next-ends-on" type="date" name="next_ends_on" required />
                </div>
              </div>

              <div className="rounded-md border p-3">
                <label className="inline-flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    name="apply_occupant_turnover"
                    checked={turnoverEnabled}
                    onChange={(event) => setTurnoverEnabled(event.target.checked)}
                  />
                  Apply new-school-year occupant turnover
                </label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Money persists. Occupants not retained below will be marked removed and their active room assignments will be closed.
                </p>

                {turnoverEnabled ? (
                  <div className="mt-3 max-h-56 space-y-2 overflow-y-auto rounded-md border p-2">
                    {activeOccupants.map((occupant) => (
                      <label
                        key={occupant.id}
                        className="flex items-start gap-2 rounded-md border p-2 text-sm"
                      >
                        <input type="checkbox" name="retain_occupant_ids" value={occupant.id} />
                        <span>
                          <span className="font-medium">{occupant.full_name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {occupant.student_id ?? "No ID"}
                            {occupant.course ? ` · ${occupant.course}` : ""}
                          </span>
                        </span>
                      </label>
                    ))}
                    {!activeOccupants.length ? (
                      <p className="text-xs text-muted-foreground">No active occupants available.</p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <Button type="submit" disabled={isArchiving}>
                {isArchiving ? "Processing rollover..." : "Archive and start next semester"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Semester history</CardTitle>
          <CardDescription>Archived records grouped by semester snapshots.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-2 py-2 font-medium">Label</th>
                  <th className="px-2 py-2 font-medium">Archived at</th>
                  <th className="px-2 py-2 font-medium">Events</th>
                  <th className="px-2 py-2 font-medium">Fines</th>
                  <th className="px-2 py-2 font-medium">Cleaning weeks</th>
                  <th className="px-2 py-2 font-medium">Cycles</th>
                </tr>
              </thead>
              <tbody>
                {archives.map((archive) => (
                  <tr key={archive.id} className="border-b">
                    <td className="px-2 py-2">{archive.label}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">
                      {new Date(archive.created_at).toLocaleString()}
                    </td>
                    <td className="px-2 py-2">{getSummaryValue(archive.snapshot, "events_count")}</td>
                    <td className="px-2 py-2">{getSummaryValue(archive.snapshot, "fines_count")}</td>
                    <td className="px-2 py-2">{getSummaryValue(archive.snapshot, "cleaning_weeks_count")}</td>
                    <td className="px-2 py-2">{getSummaryValue(archive.snapshot, "evaluation_cycles_count")}</td>
                  </tr>
                ))}
                {!archives.length ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-8 text-center text-muted-foreground">
                      No archived semester yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
