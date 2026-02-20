"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Plus,
  Save,
  Settings2,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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

export function CleaningWorkspace({ snapshot }: { snapshot: CleaningSnapshot }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<MessageState>(null);
  const [restLevel, setRestLevel] = useState(
    String(snapshot.week?.rest_level ?? 1)
  );

  const canManage = snapshot.viewer.can_manage;
  const weekStart = snapshot.week?.week_start ?? snapshot.selected_week_start;

  const activeAreas = useMemo(
    () => snapshot.areas.filter((area) => area.active),
    [snapshot.areas]
  );

  const moveWeek = (offset: number) => {
    const nextWeek = addDays(weekStart, offset * 7);
    router.push(`/cleaning?week=${nextWeek}`);
  };

  const handleJumpWeek = (targetWeek: string) => {
    if (!targetWeek) return;
    router.push(`/cleaning?week=${targetWeek}`);
  };

  const toggleCleaningDay = (date: string, hasException: boolean, exceptionId?: string) => {
    if (!canManage) return;

    setMessage(null);
    startTransition(async () => {
      if (hasException && exceptionId) {
        const formData = new FormData();
        formData.set("exception_id", exceptionId);
        const result = await deleteCleaningException(formData);
        if (result?.error) {
          setMessage({ tone: "error", text: result.error });
          return;
        }
      } else {
        const formData = new FormData();
        formData.set("date", date);
        formData.set("reason", "Manual Override");
        const result = await createCleaningException(formData);
        if (result?.error) {
          setMessage({ tone: "error", text: result.error });
          return;
        }
      }
      router.refresh();
    });
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

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-emerald-100 via-lime-50 to-amber-50 p-6 dark:from-emerald-950/40 dark:via-emerald-900/20 dark:to-zinc-900">
        <div className="absolute -right-14 -top-14 size-44 rounded-full bg-emerald-300/30 blur-3xl dark:bg-emerald-500/15" />
        <div className="absolute -bottom-20 left-10 size-48 rounded-full bg-lime-300/25 blur-3xl dark:bg-lime-500/15" />
        <div className="relative space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground backdrop-blur">
                {canManage ? "Cleaning Operations (SAs can override)" : "Cleaning Plan"}
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">Weekly Cleaning Plan</h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Weekday-only assignments with rest-week rotation and manual overrides
                for holidays or custom cleaning days.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => moveWeek(-1)}
                isLoading={isPending}
              >
                <ChevronLeft className="mr-1 size-4" />
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => moveWeek(1)}
                isLoading={isPending}
              >
                Next
                <ChevronRight className="ml-1 size-4" />
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9 ml-1" title="Jump to Week">
                    <ChevronsRight className="size-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-4" align="end">
                  <div className="space-y-4">
                    <h4 className="font-medium leading-none">Jump to Week</h4>
                    <div className="flex items-center gap-2">
                      <Input
                        type="date"
                        defaultValue={weekStart}
                        className="h-8 w-[150px]"
                        onChange={(e) => handleJumpWeek(e.target.value)}
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              {canManage && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8">
                      <Settings2 className="mr-2 size-3.5" />
                      Clean Settings
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Cleaning Configuration</DialogTitle>
                      <DialogDescription>
                        Manage manual overrides, rest levels, and active cleaning areas.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-6">
                      <Card className="border-border/70 shadow-sm">
                        <CardHeader className="py-4">
                          <CardTitle className="text-sm">Planner Controls</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pb-4">
                          <form onSubmit={handleWeekSave} className="flex items-end gap-3">
                            <div className="space-y-1 flex-1">
                              <Label htmlFor="rest_level" className="text-xs">Rest week level</Label>
                              <select
                                id="rest_level"
                                value={restLevel}
                                onChange={(event) => setRestLevel(event.target.value)}
                                className="h-9 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
                              >
                                <option value="1">Level 1</option>
                                <option value="2">Level 2</option>
                                <option value="3">Level 3</option>
                              </select>
                            </div>
                            <Button type="submit" variant="secondary" isLoading={isPending}>
                              <Save className="mr-2 size-4" />
                              Save
                            </Button>
                          </form>

                          <div className="grid gap-2 sm:grid-cols-2 pt-2 border-t">
                            <Button
                              type="button"
                              onClick={handleGenerateAssignments}
                              isLoading={isPending}
                              className="bg-emerald-600 text-white hover:bg-emerald-600/90"
                            >
                              <Shuffle className="mr-2 size-4" />
                              Auto-Assign Rooms
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleSeedDefaultAreas}
                              isLoading={isPending}
                            >
                              <Sparkles className="mr-2 size-4" />
                              Load Default Areas
                            </Button>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border-border/70 shadow-sm">
                        <CardHeader className="py-4">
                          <CardTitle className="text-sm">Cleaning Areas</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 pb-4">
                          <form onSubmit={handleCreateArea} className="flex gap-2">
                            <Input name="name" placeholder="Area name" required className="flex-[2]" />
                            <Input name="sort_order" type="number" min={0} defaultValue={snapshot.areas.length + 1} className="w-20" />
                            <Button type="submit" variant="outline" isLoading={isPending}>
                              <Plus className="size-4" />
                            </Button>
                          </form>

                          <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                            {snapshot.areas.map((area) => (
                              <form
                                key={area.id}
                                onSubmit={handleUpdateArea}
                                className="flex items-center gap-2 rounded-md border bg-muted/40 p-2"
                              >
                                <input type="hidden" name="area_id" value={area.id} />
                                <Input name="name" defaultValue={area.name} required className="h-7 text-xs flex-[2]" />
                                <Input name="sort_order" type="number" min={0} defaultValue={area.sort_order} className="h-7 w-16 text-xs" />
                                <label className="flex items-center gap-1.5 text-xs text-muted-foreground bg-background px-2 py-1 rounded border cursor-pointer hover:bg-accent">
                                  <input type="checkbox" name="active" defaultChecked={area.active} className="accent-emerald-600" />
                                  Active
                                </label>
                                <Button type="submit" variant="secondary" size="sm" className="h-7 px-2" isLoading={isPending}>
                                  <Save className="size-3" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => handleDeleteArea(area.id)}
                                  isLoading={isPending}
                                >
                                  <Trash2 className="size-3 text-destructive" />
                                </Button>
                              </form>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
            <div className="w-full pt-1">
              <div className="inline-flex flex-wrap items-center gap-1.5 rounded-md border bg-background/60 p-1.5 px-3 text-sm text-muted-foreground backdrop-blur shadow-sm">
                <span className="font-medium mr-1 text-foreground">Cleaning Days:</span>
                {snapshot.weekdays.map((day) => {
                  const exception = snapshot.exceptions.find(e => e.date === day.date);
                  return (
                    <button
                      key={day.date}
                      type="button"
                      onClick={() => canManage && toggleCleaningDay(day.date, day.has_exception, exception?.id)}
                      disabled={isPending || !canManage}
                      className={`flex h-7 px-3.5 items-center justify-center rounded-sm font-medium transition-colors ${day.has_exception
                        ? "bg-muted text-muted-foreground/60 hover:bg-muted/80"
                        : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
                        } ${canManage ? "cursor-pointer" : "cursor-default"}`}
                      title={
                        !canManage
                          ? (day.has_exception ? day.exception_reason || "No Cleaning" : "Cleaning Day")
                          : (day.has_exception ? "Click to enable cleaning" : "Click to skip cleaning")
                      }
                    >
                      {day.day_label.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {message ? (
        <div
          className={`rounded-lg border p-3 text-sm ${message.tone === "error"
            ? "border-destructive/30 bg-destructive/5 text-destructive"
            : "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            }`}
        >
          {message.text}
        </div>
      ) : null}

      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[1.45fr_1fr]">
        <div className="space-y-6">
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
            <CardContent className="p-0">
              {/* Group rooms by level */}
              <div className="divide-y divide-border/50">
                {Array.from(new Set(snapshot.room_plans.map((p) => p.level_override ?? p.room_level)))
                  .sort((a, b) => a - b)
                  .map((level) => {
                    const roomsInLevel = snapshot.room_plans.filter((p) => (p.level_override ?? p.room_level) === level);

                    return (
                      <details key={level} className="group" open={level === 1}>
                        <summary className="flex cursor-pointer list-none items-center justify-between bg-muted/20 px-4 py-3 font-medium transition-colors hover:bg-muted/40">
                          <div className="flex items-center gap-3">
                            <span className="text-sm">
                              Level {level} Rooms
                            </span>
                            <Badge variant="outline" className="text-[10px] font-normal">
                              {roomsInLevel.length} rooms
                            </Badge>
                          </div>
                          <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
                        </summary>
                        <div className="bg-background px-4 py-3">
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {roomsInLevel.map((plan) => (
                              <div key={plan.room_id} className="flex flex-col gap-2 rounded-lg border bg-card p-3 shadow-sm">
                                <div className="flex items-start justify-between">
                                  <div>
                                    <p className="font-semibold text-sm">Room {plan.room_code}</p>
                                    <p className="text-[10px] text-muted-foreground">{plan.occupant_count} occupant(s)</p>
                                  </div>
                                  {plan.is_rest_week ? (
                                    <Badge variant="secondary" className="text-[10px]">Rest Week</Badge>
                                  ) : (
                                    <Badge variant={plan.area_name ? "outline" : "destructive"} className={`text-[10px] ${!plan.area_name ? "opacity-70" : ""}`}>
                                      {plan.area_name ?? "Unassigned"}
                                    </Badge>
                                  )}
                                </div>
                                {canManage && !plan.is_rest_week && (
                                  <form onSubmit={handleSetAssignment} className="mt-1 flex items-center gap-1.5 pt-2 border-t border-border/50">
                                    <input type="hidden" name="room_id" value={plan.room_id} />
                                    <select
                                      name="area_id"
                                      defaultValue={plan.area_id ?? ""}
                                      className="h-7 w-full rounded-md border bg-muted/50 px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
                                      onChange={() => {
                                        // Optional: Auto-submit on change for better UX instead of a save button per room
                                        // e.target.form?.requestSubmit();
                                      }}
                                    >
                                      <option value="">Unassigned</option>
                                      {activeAreas.map((area) => (
                                        <option key={area.id} value={area.id}>
                                          {area.name}
                                        </option>
                                      ))}
                                    </select>
                                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-emerald-600 hover:text-emerald-700" isLoading={isPending} title="Save">
                                      <Save className="size-3.5" />
                                    </Button>
                                  </form>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </details>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-border/70">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="size-4 text-emerald-600" />
                Dorm Areas Outline
              </CardTitle>
              <CardDescription className="text-xs">
                Cleaning responsibility coverage
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                {activeAreas.map((area) => {
                  const assignedTo = snapshot.room_plans.filter(
                    (plan) => plan.area_id === area.id
                  );
                  return (
                    <div key={area.id} className="rounded-lg border bg-muted/20 p-3 flex flex-col gap-2">
                      <div className="font-medium text-sm text-emerald-700 dark:text-emerald-400 border-b pb-1.5 border-border/50">
                        {area.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {assignedTo.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {assignedTo.map((plan) => (
                              <Badge key={plan.room_id} variant="secondary" className="text-[10px] bg-background">
                                Rm {plan.room_code}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="italic opacity-70">No rooms assigned</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
