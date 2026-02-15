import { redirect } from "next/navigation";
import { CalendarCheck2 } from "lucide-react";

import {
  getEventsOverview,
  getEventViewerContext,
} from "@/app/actions/events";
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

  const events = await getEventsOverview(context.dormId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
          <p className="text-sm text-muted-foreground">
            Calendar, event pages, photos, and ratings for your dorm activities.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
          <CalendarCheck2 className="size-4 text-emerald-600" />
          <span>{events.length} total events</span>
        </div>
      </div>

      <EventsBoard events={events} canManageEvents={context.canManageEvents} />
    </div>
  );
}
