import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FlagTriangleRight, Swords } from "lucide-react";

import {
  getCompetitionOccupantOptions,
  getCompetitionSnapshot,
} from "@/app/actions/competition";
import { getEventViewerContext } from "@/app/actions/events";
import { CompetitionScoringPanel } from "@/components/competition/competition-scoring-panel";
import { CompetitionWorkspace } from "@/components/competition/competition-workspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function EventCompetitionPage({
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

  const [snapshot, occupants] = await Promise.all([
    getCompetitionSnapshot(context.dormId, id),
    getCompetitionOccupantOptions(context.dormId),
  ]);

  if (!snapshot) {
    notFound();
  }

  if (!snapshot.event.is_competition) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Competition Mode</h1>
          <Button asChild variant="outline">
            <Link href={`/events/${id}`}>Back to event</Link>
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FlagTriangleRight className="size-4" />
              Competition mode is disabled
            </CardTitle>
            <CardDescription>
              Enable competition mode on this event before adding teams and scores.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href={`/events/${id}`}>Open event settings</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            <span className="inline-flex items-center gap-2">
              <Swords className="size-5 text-amber-500" />
              Competition Workspace
            </span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage teams and leaderboard for {snapshot.event.title}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href={`/events/${id}/competition/print`}>Printable results</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/events/${id}`}>Back to event</Link>
          </Button>
        </div>
      </div>

      <CompetitionWorkspace
        snapshot={snapshot}
        occupants={occupants}
        canManage={context.canManageEvents}
      />
      <CompetitionScoringPanel snapshot={snapshot} canManage={context.canManageEvents} />
    </div>
  );
}
