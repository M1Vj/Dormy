import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, ImageIcon, MapPin, Star } from "lucide-react";
import { format, isSameDay, parseISO } from "date-fns";

import { getEventDetail, getEventViewerContext } from "@/app/actions/events";
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

  const event = await getEventDetail(context.dormId, id);
  if (!event) {
    notFound();
  }

  const startsAt = parseDate(event.starts_at);
  const endsAt = parseDate(event.ends_at);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{event.title}</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {event.description?.trim() || "No event description yet."}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/events">Back to events</Link>
        </Button>
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
              Photos are available after event officers upload media for this event.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {event.photos.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {event.photos.map((photo) => (
                  <div
                    key={photo.id}
                    className="aspect-square rounded-lg border border-dashed bg-muted/40"
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No photos uploaded yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Ratings & Comments</CardTitle>
            <CardDescription>
              Rating and comment submission tools are available in the next Events Core step.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {event.ratings.length ? (
              event.ratings.slice(0, 6).map((rating) => (
                <div key={rating.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">
                      {rating.occupant_name || "Dorm occupant"}
                    </p>
                    <Badge variant="secondary" className="gap-1">
                      <Star className="size-3.5 text-amber-500" />
                      {rating.rating}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {rating.comment?.trim() || "No comment left."}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No ratings submitted for this event yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
