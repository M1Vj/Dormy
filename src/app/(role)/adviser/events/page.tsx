import { redirect } from "next/navigation";
import { CalendarCheck2 } from "lucide-react";

import {
  getEventDormOptions,
  getEventsOverview,
  getEventViewerContext,
} from "@/app/actions/events";
import { EventFormDialog } from "@/components/events/event-form-dialog";
import { EventsBoard } from "@/components/events/events-board";

export default async function EventsPage() {
  const context = await getEventViewerContext();
  if ("error" in context) {
    if (context.error === "Unauthorized") {
      redirect("/login");
    }

    return (
      <div className="p-6 text-sm text-muted-foreground">{context.error}</div>
    );
  }

  const [events, dormOptions] = await Promise.all([
    getEventsOverview(context.dormId),
    getEventDormOptions(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
          <p className="text-sm text-muted-foreground">
            Calendar, event pages, photos, and ratings for your dorm activities.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
            <CalendarCheck2 className="size-4 text-emerald-600" />
            <span>{events.length} total events</span>
          </div>
          {context.canManageEvents ? (
            <EventFormDialog
              mode="create"
              hostDormId={context.dormId}
              dormOptions={dormOptions}
              basePath="/adviser/events"
            />
          ) : null}
        </div>
      </div>

      <EventsBoard events={events} canManageEvents={context.canManageEvents} />
    </div>
  );
}
