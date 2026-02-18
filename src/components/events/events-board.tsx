"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronRight,
  ImageIcon,
  ListFilter,
  MapPin,
  ShieldCheck,
  Star,
  Swords,
} from "lucide-react";
import {
  format,
  isAfter,
  isBefore,
  isSameDay,
  parseISO,
  startOfDay,
  startOfToday,
} from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EventSummary } from "@/lib/types/events";

type ViewMode = "calendar" | "list";
type TimeFilter = "upcoming" | "past" | "all";

type DecoratedEvent = {
  event: EventSummary;
  startsAt: Date | null;
};

const FILTER_LABELS: Record<TimeFilter, string> = {
  upcoming: "Upcoming",
  past: "Past",
  all: "All",
};

function parseDate(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatEventDate(start: Date | null, end: Date | null) {
  if (!start && !end) {
    return "Date to be announced";
  }

  if (!start && end) {
    return format(end, "MMM d, yyyy h:mm a");
  }

  if (!end || !start) {
    return format(start as Date, "MMM d, yyyy h:mm a");
  }

  if (isSameDay(start, end)) {
    return `${format(start, "MMM d, yyyy h:mm a")} - ${format(end, "h:mm a")}`;
  }

  return `${format(start, "MMM d, yyyy h:mm a")} - ${format(end, "MMM d, yyyy h:mm a")}`;
}

function EventCard({ event, startsAt }: DecoratedEvent) {
  const endsAt = parseDate(event.ends_at);

  return (
    <Card className="overflow-hidden border-border/70 bg-card/80 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="line-clamp-2 text-lg">{event.title}</CardTitle>
          {event.is_competition ? (
            <Badge variant="secondary" className="gap-1">
              <Swords className="size-3.5" />
              Competition
            </Badge>
          ) : null}
        </div>
        <CardDescription className="line-clamp-2">
          {event.description?.trim() || "No description yet."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 shrink-0" />
            <span className="line-clamp-1">{formatEventDate(startsAt, endsAt)}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="size-4 shrink-0" />
            <span className="line-clamp-1">{event.location?.trim() || "Location TBD"}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1">
              <Star className="size-4 text-amber-500" />
              {event.average_rating ? event.average_rating.toFixed(1) : "No ratings"}
            </span>
            <span className="inline-flex items-center gap-1">
              <ImageIcon className="size-4" />
              {event.photo_count} photos
            </span>
          </div>
        </div>
        <Button asChild className="w-full justify-between">
          <Link href={`/events/${event.id}`}>
            Open event
            <ChevronRight className="size-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function EventsBoard({
  events,
  canManageEvents,
}: {
  events: EventSummary[];
  canManageEvents: boolean;
}) {
  const [view, setView] = useState<ViewMode>("calendar");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("upcoming");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  const today = startOfToday();

  const decoratedEvents = useMemo<DecoratedEvent[]>(
    () =>
      events.map((event) => ({
        event,
        startsAt: parseDate(event.starts_at),
      })),
    [events]
  );

  const filteredEvents = useMemo(() => {
    if (timeFilter === "all") {
      return decoratedEvents;
    }

    return decoratedEvents.filter(({ startsAt }) => {
      if (!startsAt) {
        return timeFilter === "upcoming";
      }

      const day = startOfDay(startsAt);
      if (timeFilter === "upcoming") {
        return isAfter(day, today) || isSameDay(day, today);
      }

      return isBefore(day, today);
    });
  }, [decoratedEvents, timeFilter, today]);

  const sortedFilteredEvents = useMemo(
    () =>
      [...filteredEvents].sort((left, right) => {
        if (!left.startsAt && !right.startsAt) {
          return right.event.created_at.localeCompare(left.event.created_at);
        }
        if (!left.startsAt) {
          return 1;
        }
        if (!right.startsAt) {
          return -1;
        }
        return left.startsAt.getTime() - right.startsAt.getTime();
      }),
    [filteredEvents]
  );

  const eventsOnSelectedDate = useMemo(() => {
    if (!selectedDate) {
      return [];
    }
    return sortedFilteredEvents.filter(
      ({ startsAt }) => startsAt && isSameDay(startsAt, selectedDate)
    );
  }, [selectedDate, sortedFilteredEvents]);

  const eventDates = useMemo(
    () =>
      sortedFilteredEvents
        .map(({ startsAt }) => startsAt)
        .filter((date): date is Date => Boolean(date)),
    [sortedFilteredEvents]
  );

  const featuredEvents = selectedDate ? eventsOnSelectedDate : sortedFilteredEvents;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-emerald-600/20 bg-gradient-to-r from-emerald-600/10 via-emerald-600/5 to-amber-500/15 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Event Calendar</h2>
            <p className="text-sm text-muted-foreground">
              Browse all dorm activities, schedules, ratings, and media in one place.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border bg-background/80 p-1">
              {(["calendar", "list"] as const).map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  variant={view === mode ? "default" : "ghost"}
                  size="sm"
                  className="h-8"
                  onClick={() => setView(mode)}
                >
                  {mode === "calendar" ? "Calendar" : "List"}
                </Button>
              ))}
            </div>
            <div className="inline-flex rounded-lg border bg-background/80 p-1">
              {(["upcoming", "past", "all"] as const).map((filter) => (
                <Button
                  key={filter}
                  type="button"
                  variant={timeFilter === filter ? "default" : "ghost"}
                  size="sm"
                  className="h-8"
                  onClick={() => setTimeFilter(filter)}
                >
                  {FILTER_LABELS[filter]}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className="gap-1">
            <ListFilter className="size-3.5" />
            {FILTER_LABELS[timeFilter]} ({sortedFilteredEvents.length})
          </Badge>
          {canManageEvents ? (
            <Badge variant="secondary" className="gap-1">
              <ShieldCheck className="size-3.5" />
              Manage access enabled
            </Badge>
          ) : null}
        </div>
      </div>

      {view === "calendar" ? (
        <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="text-base">Monthly View</CardTitle>
              <CardDescription>Select a date to focus events.</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                modifiers={{ hasEvent: eventDates }}
                modifiersClassNames={{
                  hasEvent:
                    "after:absolute after:bottom-1 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-emerald-500",
                }}
              />
            </CardContent>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            {featuredEvents.map(({ event, startsAt }) => (
              <EventCard key={event.id} event={event} startsAt={startsAt} />
            ))}
            {!featuredEvents.length ? (
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">No matching events</CardTitle>
                  <CardDescription>
                    Try another date or switch filter to see more records.
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sortedFilteredEvents.map(({ event, startsAt }) => (
            <EventCard key={event.id} event={event} startsAt={startsAt} />
          ))}
          {!sortedFilteredEvents.length ? (
            <Card className="md:col-span-2 xl:col-span-3">
              <CardHeader>
                <CardTitle className="text-base">No events yet</CardTitle>
                <CardDescription>
                  {timeFilter === "upcoming"
                    ? "Upcoming activities will appear here."
                    : "Switch filters to view events from other periods."}
                </CardDescription>
              </CardHeader>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
