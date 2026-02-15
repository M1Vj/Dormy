import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, ImageIcon, MapPin, Star, Swords } from "lucide-react";
import { format, isSameDay, parseISO } from "date-fns";

import {
  getEventDetail,
  getEventDormOptions,
  getEventViewerContext,
} from "@/app/actions/events";
import { DeleteEventButton } from "@/components/events/delete-event-button";
import { EventFormDialog } from "@/components/events/event-form-dialog";
import { EventPhotoManager } from "@/components/events/event-photo-manager";
import { EventRatingPanel } from "@/components/events/event-rating-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function parseDate(value: string | null) {
  if (!value) {
    return null;
  }
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateRange(start: Date | null, end: Date | null) {
  if (!start && !end) {
    return "Date to be announced";
  }

  if (!start && end) {
    return format(end, "MMMM d, yyyy h:mm a");
  }

  if (!end || !start) {
    return format(start as Date, "MMMM d, yyyy h:mm a");
  }

  if (isSameDay(start, end)) {
    return `${format(start, "MMMM d, yyyy h:mm a")} - ${format(end, "h:mm a")}`;
  }

  return `${format(start, "MMMM d, yyyy h:mm a")} - ${format(end, "MMMM d, yyyy h:mm a")}`;
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getEventViewerContext();
  if ("error" in context) {
    if (context.error === "Unauthorized") {
      redirect("/login");
    }
    return <div className="p-6 text-sm text-muted-foreground">{context.error}</div>;
  }

  const [event, dormOptions] = await Promise.all([
    getEventDetail(context.dormId, id, context.userId),
    context.canManageEvents ? getEventDormOptions() : Promise.resolve([]),
  ]);
  if (!event) {
    notFound();
  }

  const startsAt = parseDate(event.starts_at);
  const endsAt = parseDate(event.ends_at);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{event.title}</h1>
            {event.is_competition ? (
              <Badge variant="secondary" className="gap-1">
                <Swords className="size-3.5" />
                Competition
              </Badge>
            ) : null}
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {event.description?.trim() || "No event description yet."}
          </p>
          {event.participating_dorms.length ? (
            <div className="flex flex-wrap gap-2">
              {event.participating_dorms.map((dorm) => (
                <Badge key={dorm.id} variant="outline">
                  {dorm.name}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {context.canManageEvents ? (
            <>
              <EventFormDialog
                mode="edit"
                event={event}
                hostDormId={context.dormId}
                dormOptions={dormOptions}
              />
              <DeleteEventButton eventId={event.id} />
            </>
          ) : null}
          <Button asChild variant="outline">
            <Link href="/events">Back to events</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Schedule</CardTitle>
          </CardHeader>
          <CardContent className="flex items-start gap-2 text-sm">
            <CalendarDays className="mt-0.5 size-4 text-muted-foreground" />
            <span>{formatDateRange(startsAt, endsAt)}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Location</CardTitle>
          </CardHeader>
          <CardContent className="flex items-start gap-2 text-sm">
            <MapPin className="mt-0.5 size-4 text-muted-foreground" />
            <span>{event.location?.trim() || "Location TBD"}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Community Feedback</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="inline-flex items-center gap-1">
              <Star className="size-4 text-amber-500" />
              <span>
                {event.average_rating ? event.average_rating.toFixed(1) : "No ratings yet"}
              </span>
            </div>
            <p className="text-muted-foreground">{event.rating_count} total rating(s)</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ImageIcon className="size-4" />
              Photo Gallery
            </CardTitle>
            <CardDescription>
              Event officers and admins can upload photos for this event.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EventPhotoManager
              eventId={event.id}
              canManage={context.canManageEvents}
              photos={event.photos}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Ratings & Comments</CardTitle>
            <CardDescription>
              Occupants can submit ratings and comments. Event officers/admin can moderate entries.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <EventRatingPanel
              eventId={event.id}
              ratings={event.ratings}
              viewerRating={event.viewer_rating}
              canModerate={context.canManageEvents}
              canRate={event.viewer_can_rate}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
