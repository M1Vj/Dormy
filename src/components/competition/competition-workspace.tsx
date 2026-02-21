"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trophy, Trash2, Users } from "lucide-react";

import {
  addCompetitionMember,
  createCompetitionTeam,
  deleteCompetitionTeam,
  removeCompetitionMember,
} from "@/app/actions/competition";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CompetitionSnapshot } from "@/lib/types/competition";

type OccupantOption = {
  id: string;
  full_name: string;
  student_id: string | null;
};

export function CompetitionWorkspace({
  snapshot,
  occupants,
  canManage,
}: {
  snapshot: CompetitionSnapshot;
  occupants: OccupantOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");

  const sortedLeaderboard = useMemo(
    () => [...snapshot.leaderboard].sort((a, b) => a.rank - b.rank),
    [snapshot.leaderboard]
  );

  const handleCreateTeam = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    setErrorMessage("");

    startTransition(async () => {
      const result = await createCompetitionTeam(formData);
      if (result?.error) {
        setErrorMessage(result.error);
        return;
      }
      form.reset();
      router.refresh();
    });
  };

  const handleDeleteTeam = (eventId: string, teamId: string) => {
    if (!canManage) {
      return;
    }
    const confirmed = window.confirm(
      "Delete this team? This also removes all members and scores."
    );
    if (!confirmed) {
      return;
    }

    const formData = new FormData();
    formData.set("event_id", eventId);
    formData.set("team_id", teamId);
    setErrorMessage("");

    startTransition(async () => {
      const result = await deleteCompetitionTeam(formData);
      if (result?.error) {
        setErrorMessage(result.error);
        return;
      }
      router.refresh();
    });
  };

  const handleAddMember = (
    event: FormEvent<HTMLFormElement>,
    eventId: string,
    teamId: string
  ) => {
    event.preventDefault();
    if (!canManage) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("event_id", eventId);
    formData.set("team_id", teamId);
    setErrorMessage("");

    startTransition(async () => {
      const result = await addCompetitionMember(formData);
      if (result?.error) {
        setErrorMessage(result.error);
        return;
      }
      form.reset();
      router.refresh();
    });
  };

  const handleRemoveMember = (eventId: string, memberId: string) => {
    if (!canManage) {
      return;
    }

    const formData = new FormData();
    formData.set("event_id", eventId);
    formData.set("member_id", memberId);
    setErrorMessage("");

    startTransition(async () => {
      const result = await removeCompetitionMember(formData);
      if (result?.error) {
        setErrorMessage(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4" />
              Team Management
            </CardTitle>
            <CardDescription>
              Create teams and assign members from occupants or external participants.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {canManage ? (
              <form
                onSubmit={handleCreateTeam}
                className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-end"
              >
                <input type="hidden" name="event_id" value={snapshot.event.id} />
                <div className="w-full space-y-1">
                  <Label htmlFor="team_name">Team name</Label>
                  <Input
                    id="team_name"
                    name="name"
                    placeholder="Team Molave"
                    required
                  />
                </div>
                <Button type="submit" isLoading={isPending}>
                  Add team
                </Button>
              </form>
            ) : null}

            <div className="grid gap-3">
              {snapshot.teams.map((team) => (
                <div key={team.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-1">
                      <p className="font-medium">{team.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {team.members.length} member(s)
                      </p>
                    </div>
                    {canManage ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDeleteTeam(snapshot.event.id, team.id)}
                        isLoading={isPending}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    ) : null}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {team.members.map((member) => (
                      <Badge key={member.id} variant="secondary" className="gap-2">
                        <span>
                          {member.occupant_name ||
                            member.display_name ||
                            member.occupant_student_id ||
                            "Member"}
                        </span>
                        {canManage ? (
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(snapshot.event.id, member.id)}
                            className="inline-flex items-center"
                            disabled={isPending}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        ) : null}
                      </Badge>
                    ))}
                    {!team.members.length ? (
                      <p className="text-xs text-muted-foreground">No members yet.</p>
                    ) : null}
                  </div>

                  {canManage ? (
                    <form
                      onSubmit={(event) => handleAddMember(event, snapshot.event.id, team.id)}
                      className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                    >
                      <select
                        name="occupant_id"
                        className="h-9 rounded-md border bg-background px-2 text-sm"
                        defaultValue=""
                      >
                        <option value="">Select occupant</option>
                        {occupants.map((occupant) => (
                          <option key={occupant.id} value={occupant.id}>
                            {occupant.full_name}
                            {occupant.student_id ? ` (${occupant.student_id})` : ""}
                          </option>
                        ))}
                      </select>
                      <Input name="display_name" placeholder="Or external member name" />
                      <Button type="submit" variant="outline" isLoading={isPending}>
                        Add member
                      </Button>
                    </form>
                  ) : null}
                </div>
              ))}
              {!snapshot.teams.length ? (
                <p className="text-sm text-muted-foreground">
                  No teams yet. Create the first team to start competition setup.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="size-4" />
              Live Leaderboard
            </CardTitle>
            <CardDescription>
              Deterministic ranking by total points, tie-break by category order, then team name.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {sortedLeaderboard.map((row) => (
              <div key={row.team_id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">
                      #{row.rank} {row.team_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.members.length} member(s)
                    </p>
                  </div>
                  <Badge>{row.total_points.toFixed(2)} pts</Badge>
                </div>
              </div>
            ))}
            {!sortedLeaderboard.length ? (
              <p className="text-sm text-muted-foreground">
                Leaderboard is empty until teams are added.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}
