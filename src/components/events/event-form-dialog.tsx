"use client";

import { useActionState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, PencilLine } from "lucide-react";

import { createEvent, updateEvent } from "@/app/actions/events";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EventDetail, EventDormOption } from "@/lib/types/events";

type FormState = {
  error: string;
  success: boolean;
  eventId: string | null;
};

const initialState: FormState = {
  error: "",
  success: false,
  eventId: null,
};

function toDateTimeLocal(value: string | null) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const offset = parsed.getTimezoneOffset() * 60 * 1000;
  return new Date(parsed.getTime() - offset).toISOString().slice(0, 16);
}

export function EventFormDialog({
  mode,
  hostDormId,
  dormOptions,
  event,
  committeeId,
  basePath,
}: {
  mode: "create" | "edit";
  hostDormId: string;
  dormOptions: EventDormOption[];
  event?: EventDetail;
  committeeId?: string;
  basePath: string;
}) {
  const router = useRouter();
  const action = mode === "create" ? createEvent : updateEvent;

  const [state, formAction, isPending] = useActionState(
    async (_previousState: FormState, formData: FormData) => {
      const result = await action(formData);
      if (result?.error) {
        return {
          error: result.error,
          success: false,
          eventId: null,
        };
      }

      const eventId =
        result &&
          typeof result === "object" &&
          "eventId" in result &&
          typeof result.eventId === "string"
          ? result.eventId
          : event?.id ?? null;

      if (mode === "create" && eventId) {
        router.push(`${basePath}/${eventId}`);
      } else {
        router.refresh();
      }

      return {
        error: "",
        success: true,
        eventId,
      };
    },
    initialState
  );

  const initialParticipatingDormIds = useMemo(
    () => new Set(event?.participating_dorms.map((dorm) => dorm.id) ?? []),
    [event?.participating_dorms]
  );

  const availableDormOptions = useMemo(
    () => dormOptions.filter((option) => option.id !== hostDormId),
    [dormOptions, hostDormId]
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant={mode === "create" ? "default" : "outline"}>
          {mode === "create" ? (
            <CalendarPlus className="mr-2 size-4" />
          ) : (
            <PencilLine className="mr-2 size-4" />
          )}
          {mode === "create" ? "Create event" : "Edit event"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create new event" : "Edit event"}
          </DialogTitle>
          <DialogDescription>
            Keep event details current for calendar visibility, ratings, and finance tracking.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {mode === "edit" ? (
            <input type="hidden" name="event_id" value={event?.id ?? ""} />
          ) : null}
          {committeeId ? (
            <input type="hidden" name="committee_id" value={committeeId} />
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              defaultValue={event?.title ?? ""}
              placeholder="Dorm General Cleaning Kickoff"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="starts_at">Starts at</Label>
              <Input
                id="starts_at"
                name="starts_at"
                type="datetime-local"
                defaultValue={toDateTimeLocal(event?.starts_at ?? null)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ends_at">Ends at</Label>
              <Input
                id="ends_at"
                name="ends_at"
                type="datetime-local"
                defaultValue={toDateTimeLocal(event?.ends_at ?? null)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              name="location"
              defaultValue={event?.location ?? ""}
              placeholder="Molave Hall Facade"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={event?.description ?? ""}
              placeholder="Describe agenda, expected attendance, and notes."
              rows={4}
            />
          </div>

          <div className="rounded-lg border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                name="is_competition"
                type="checkbox"
                defaultChecked={event?.is_competition ?? false}
                className="size-4 rounded border"
              />
              Competition mode enabled
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              Turn this on for team scoring and leaderboard workflows.
            </p>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <Label className="text-sm">Participating dorms</Label>
            {availableDormOptions.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {availableDormOptions.map((dorm) => (
                  <label key={dorm.id} className="flex items-center gap-2 text-sm">
                    <input
                      name="participating_dorm_ids"
                      type="checkbox"
                      value={dorm.id}
                      defaultChecked={initialParticipatingDormIds.has(dorm.id)}
                      className="size-4 rounded border"
                    />
                    <span>{dorm.name}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No additional dorm memberships found for cross-dorm participation.
              </p>
            )}
          </div>

          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

          <DialogFooter>
            <Button type="submit" isLoading={isPending}>
              {mode === "create" ? "Create event" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
