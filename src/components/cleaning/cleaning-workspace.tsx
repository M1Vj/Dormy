"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Save,
  Shuffle,
  Sparkles,
  Trash2,
} from "lucide-react";

import {
  createCleaningArea,
  createCleaningException,
  deleteCleaningArea,
  deleteCleaningException,
  generateCleaningAssignments,
  seedDefaultCleaningAreas,
  setCleaningRoomAssignment,
  upsertCleaningWeek,
  updateCleaningArea,
} from "@/app/actions/cleaning";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CleaningSnapshot } from "@/lib/types/cleaning";

type MessageState = {
  tone: "success" | "error";
  text: string;
} | null;

function parseDateOnly(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateInput: string, days: number) {
  const date = parseDateOnly(dateInput);
  if (!date) {
    return dateInput;
  }
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return toIsoDate(next);
}

function formatReadableDate(value: string) {
  const date = parseDateOnly(value);
  if (!date) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function CleaningWorkspace({ snapshot }: { snapshot: CleaningSnapshot }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<MessageState>(null);
  const [restLevel, setRestLevel] = useState(
    String(snapshot.week?.rest_level ?? 1)
  );

  const canManage = snapshot.viewer.can_manage;
  const weekStart = snapshot.week?.week_start ?? snapshot.selected_week_start;
  const weekEnd = addDays(weekStart, 4);

  const activeAreas = useMemo(
    () => snapshot.areas.filter((area) => area.active),
    [snapshot.areas]
  );

  const eligibleRooms = snapshot.room_plans.filter((plan) => !plan.is_rest_week).length;
  const assignedRooms = snapshot.room_plans.filter(
    (plan) => !plan.is_rest_week && plan.area_id
  ).length;
  const assignmentProgress =
    eligibleRooms > 0 ? Math.round((assignedRooms / eligibleRooms) * 100) : 0;

  const moveWeek = (offset: number) => {
    const nextWeek = addDays(weekStart, offset * 7);
    router.push(`/cleaning?week=${nextWeek}`);
  };

  const handleJumpWeek = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const targetWeek = String(formData.get("week") ?? "").trim();
    if (!targetWeek) {
      return;
    }
    router.push(`/cleaning?week=${targetWeek}`);
  };

  const handleWeekSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage) {
      return;
    }

    const formData = new FormData();
    formData.set("week_start", weekStart);
    formData.set("rest_level", restLevel);
    setMessage(null);

    startTransition(async () => {
      const result = await upsertCleaningWeek(formData);
      if (result?.error) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      setMessage({ tone: "success", text: "Week configuration saved." });
      router.refresh();
    });
  };

  const handleGenerateAssignments = () => {
    if (!canManage) {
      return;
    }

    const formData = new FormData();
    formData.set("week_start", weekStart);
    formData.set("rest_level", restLevel);
    setMessage(null);

    startTransition(async () => {
      const result = await generateCleaningAssignments(formData);
      if (result?.error) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      setMessage({ tone: "success", text: "Balanced assignments generated." });
      router.refresh();
    });
  };

  const handleSeedDefaultAreas = () => {
    if (!canManage) {
      return;
    }

    setMessage(null);
    startTransition(async () => {
      const result = await seedDefaultCleaningAreas();
      if (result?.error) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      setMessage({ tone: "success", text: "Molave default areas are ready." });
      router.refresh();
    });
  };

  const handleCreateArea = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    setMessage(null);

    startTransition(async () => {
      const result = await createCleaningArea(formData);
      if (result?.error) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      form.reset();
      setMessage({ tone: "success", text: "Cleaning area added." });
      router.refresh();
    });
  };

  const handleUpdateArea = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    setMessage(null);

    startTransition(async () => {
      const result = await updateCleaningArea(formData);
      if (result?.error) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      setMessage({ tone: "success", text: "Area updated." });
      router.refresh();
    });
  };

  const handleDeleteArea = (areaId: string) => {
    if (!canManage) {
      return;
    }

    const confirmed = window.confirm(
      "Delete this area? Existing assignments using this area will be removed."
    );
    if (!confirmed) {
      return;
    }

    const formData = new FormData();
    formData.set("area_id", areaId);
    setMessage(null);

    startTransition(async () => {
      const result = await deleteCleaningArea(formData);
      if (result?.error) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      setMessage({ tone: "success", text: "Area deleted." });
      router.refresh();
    });
  };

  const handleSetAssignment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    formData.set("week_start", weekStart);
    formData.set("rest_level", restLevel);
    setMessage(null);

    startTransition(async () => {
      const result = await setCleaningRoomAssignment(formData);
      if (result?.error) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      setMessage({ tone: "success", text: "Room assignment saved." });
      router.refresh();
    });
  };

  const handleCreateException = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    setMessage(null);

    startTransition(async () => {
      const result = await createCleaningException(formData);
      if (result?.error) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      form.reset();
      setMessage({ tone: "success", text: "Exception saved." });
      router.refresh();
    });
  };

  const handleDeleteException = (exceptionId: string) => {
    if (!canManage) {
      return;
    }

    const formData = new FormData();
    formData.set("exception_id", exceptionId);
    setMessage(null);

    startTransition(async () => {
      const result = await deleteCleaningException(formData);
      if (result?.error) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      setMessage({ tone: "success", text: "Exception removed." });
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-emerald-100 via-lime-50 to-amber-50 p-6 dark:from-emerald-950/40 dark:via-emerald-900/20 dark:to-zinc-900">
        <div className="absolute -right-14 -top-14 size-44 rounded-full bg-emerald-300/30 blur-3xl dark:bg-emerald-500/15" />
        <div className="absolute -bottom-20 left-10 size-48 rounded-full bg-lime-300/25 blur-3xl dark:bg-lime-500/15" />
        <div className="relative space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground backdrop-blur">
                <CalendarDays className="size-3.5 text-emerald-600" />
                Cleaning Operations
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">Weekly Cleaning Plan</h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Weekday-only assignments with rest-week rotation and exception controls
                for holidays or no-class days.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => moveWeek(-1)}
                disabled={isPending}
              >
                <ChevronLeft className="mr-1 size-4" />
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => moveWeek(1)}
                disabled={isPending}
              >
                Next
                <ChevronRight className="ml-1 size-4" />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-600">
              <CalendarDays className="size-3.5" />
              {formatReadableDate(weekStart)} to {formatReadableDate(weekEnd)}
            </Badge>
            <Badge variant="secondary">Rest Level {restLevel}</Badge>
            <Badge variant="outline">{assignedRooms}/{eligibleRooms} assigned</Badge>
            <Badge variant="outline">{assignmentProgress}% coverage</Badge>
            <Badge variant="outline">{snapshot.exceptions.length} exception(s)</Badge>
          </div>

          <form onSubmit={handleJumpWeek} className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="week-jump" className="text-xs">Jump to week</Label>
              <Input
                id="week-jump"
                name="week"
                type="date"
                defaultValue={weekStart}
                className="w-[180px] bg-background/80"
              />
            </div>
            <Button type="submit" variant="secondary" disabled={isPending}>
              Open Week
            </Button>
          </form>
        </div>
      </section>

      {message ? (
        <div
          className={`rounded-lg border p-3 text-sm ${
            message.tone === "error"
              ? "border-destructive/30 bg-destructive/5 text-destructive"
              : "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border/70">
          <CardHeader className="pb-2">
            <CardDescription>Weekdays</CardDescription>
            <CardTitle className="text-xl">5 days</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Monday to Friday at 5:30 AM.</p>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardHeader className="pb-2">
            <CardDescription>Rest Rotation</CardDescription>
            <CardTitle className="text-xl">Level {restLevel}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Levels rotate weekly: 1 then 2 then 3.
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardHeader className="pb-2">
            <CardDescription>Rooms Assigned</CardDescription>
            <CardTitle className="text-xl">{assignedRooms}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Out of {eligibleRooms} eligible rooms.</p>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardHeader className="pb-2">
            <CardDescription>Coverage</CardDescription>
            <CardTitle className="text-xl">{assignmentProgress}%</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-2 rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-emerald-600 transition-all"
                style={{ width: `${assignmentProgress}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shuffle className="size-4 text-emerald-600" />
              Room-to-Area Assignments
            </CardTitle>
            <CardDescription>
              Rooms in the rest level are automatically skipped for this week.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Room</th>
                    <th className="px-3 py-2 font-medium">Level</th>
                    <th className="px-3 py-2 font-medium">Occupants</th>
                    <th className="px-3 py-2 font-medium">Assignment</th>
                    {canManage ? <th className="px-3 py-2 font-medium text-right">Action</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {snapshot.room_plans.map((plan) => (
                    <tr key={plan.room_id} className="border-b align-middle">
                      <td className="px-3 py-2 font-medium">Room {plan.room_code}</td>
                      <td className="px-3 py-2">{plan.room_level}</td>
                      <td className="px-3 py-2">{plan.occupant_count}</td>
                      <td className="px-3 py-2">
                        {canManage && !plan.is_rest_week ? (
                          <form onSubmit={handleSetAssignment} className="flex items-center gap-2">
                            <input type="hidden" name="room_id" value={plan.room_id} />
                            <select
                              name="area_id"
                              defaultValue={plan.area_id ?? ""}
                              className="h-9 rounded-md border bg-background px-2 text-sm"
                            >
                              <option value="">Unassigned</option>
                              {activeAreas.map((area) => (
                                <option key={area.id} value={area.id}>
                                  {area.name}
                                </option>
                              ))}
                            </select>
                            <Button size="sm" variant="outline" disabled={isPending}>
                              <Save className="mr-1.5 size-3.5" />
                              Save
                            </Button>
                          </form>
                        ) : plan.is_rest_week ? (
                          <Badge variant="secondary">Rest Week</Badge>
                        ) : (
                          <span className="text-muted-foreground">{plan.area_name ?? "Unassigned"}</span>
                        )}
                      </td>
                      {canManage ? (
                        <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                          {plan.is_rest_week
                            ? "No assignment needed"
                            : plan.area_name ?? "Pending assignment"}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="text-base">Weekday Calendar</CardTitle>
              <CardDescription>
                Mark non-class days and holidays as exceptions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {snapshot.weekdays.map((weekday) => (
                <div
                  key={weekday.date}
                  className={`rounded-lg border p-3 ${
                    weekday.has_exception
                      ? "border-amber-400/50 bg-amber-500/10"
                      : "border-border/70"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      {weekday.day_label} · {formatReadableDate(weekday.date)}
                    </p>
                    {weekday.has_exception ? (
                      <Badge variant="secondary" className="gap-1">
                        <AlertTriangle className="size-3.5" />
                        Exception
                      </Badge>
                    ) : (
                      <Badge variant="outline">Scheduled</Badge>
                    )}
                  </div>
                  {weekday.exception_reason ? (
                    <p className="mt-1 text-xs text-muted-foreground">{weekday.exception_reason}</p>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>

          {canManage ? (
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="text-base">Planner Controls</CardTitle>
                <CardDescription>
                  Set rest level, auto-generate assignments, and bootstrap default areas.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={handleWeekSave} className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="rest_level">Rest week level</Label>
                    <select
                      id="rest_level"
                      value={restLevel}
                      onChange={(event) => setRestLevel(event.target.value)}
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    >
                      <option value="1">Level 1</option>
                      <option value="2">Level 2</option>
                      <option value="3">Level 3</option>
                    </select>
                  </div>
                  <Button type="submit" variant="secondary" disabled={isPending}>
                    {isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
                    Save Week Settings
                  </Button>
                </form>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    onClick={handleGenerateAssignments}
                    disabled={isPending}
                    className="bg-emerald-600 text-white hover:bg-emerald-600/90"
                  >
                    {isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Shuffle className="mr-2 size-4" />}
                    Generate Plan
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSeedDefaultAreas}
                    disabled={isPending}
                  >
                    {isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
                    Load Molave Areas
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {canManage ? (
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="text-base">Exceptions</CardTitle>
                <CardDescription>Add dates to skip weekday cleaning.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <form onSubmit={handleCreateException} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <Input name="date" type="date" required />
                  <Input name="reason" placeholder="Holiday / no classes" />
                  <Button type="submit" variant="outline" disabled={isPending}>
                    <Plus className="mr-2 size-4" />
                    Add
                  </Button>
                </form>

                <div className="space-y-2">
                  {snapshot.exceptions.map((exception) => (
                    <div key={exception.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                      <div>
                        <p className="text-sm font-medium">{formatReadableDate(exception.date)}</p>
                        <p className="text-xs text-muted-foreground">{exception.reason ?? "No reason"}</p>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDeleteException(exception.id)}
                        disabled={isPending}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  {!snapshot.exceptions.length ? (
                    <p className="text-xs text-muted-foreground">No exceptions for this week.</p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {canManage ? (
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Cleaning Areas</CardTitle>
            <CardDescription>
              Maintain active cleaning areas and display order.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleCreateArea} className="grid gap-2 md:grid-cols-[1fr_120px_auto]">
              <Input name="name" placeholder="Area name" required />
              <Input name="sort_order" type="number" min={0} defaultValue={snapshot.areas.length + 1} />
              <Button type="submit" variant="outline" disabled={isPending}>
                <Plus className="mr-2 size-4" />
                Add Area
              </Button>
            </form>

            <div className="space-y-2">
              {snapshot.areas.map((area) => (
                <form
                  key={area.id}
                  onSubmit={handleUpdateArea}
                  className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_120px_auto_auto_auto] md:items-center"
                >
                  <input type="hidden" name="area_id" value={area.id} />
                  <Input name="name" defaultValue={area.name} required />
                  <Input name="sort_order" type="number" min={0} defaultValue={area.sort_order} />
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" name="active" defaultChecked={area.active} />
                    Active
                  </label>
                  <Button type="submit" variant="secondary" size="sm" disabled={isPending}>
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteArea(area.id)}
                    disabled={isPending}
                  >
                    <Trash2 className="mr-1.5 size-3.5 text-destructive" />
                    Delete
                  </Button>
                </form>
              ))}
              {!snapshot.areas.length ? (
                <p className="text-sm text-muted-foreground">
                  No cleaning areas yet. Use &quot;Load Molave Areas&quot; or add custom areas.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
