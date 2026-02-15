"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";

import {
  createCompetitionCategory,
  deleteCompetitionCategory,
  setCompetitionManualRank,
  upsertCompetitionScore,
} from "@/app/actions/competition";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CompetitionSnapshot } from "@/lib/types/competition";

export function CompetitionScoringPanel({
  snapshot,
  canManage,
}: {
  snapshot: CompetitionSnapshot;
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");

  const handleCreateCategory = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    setErrorMessage("");

    startTransition(async () => {
      const result = await createCompetitionCategory(formData);
      if (result?.error) {
        setErrorMessage(result.error);
        return;
      }
      form.reset();
      router.refresh();
    });
  };

  const handleDeleteCategory = (eventId: string, categoryId: string) => {
    if (!canManage) {
      return;
    }
    const confirmed = window.confirm(
      "Delete this category? Existing scores under this category will be removed by relation rules."
    );
    if (!confirmed) {
      return;
    }

    const formData = new FormData();
    formData.set("event_id", eventId);
    formData.set("category_id", categoryId);
    setErrorMessage("");

    startTransition(async () => {
      const result = await deleteCompetitionCategory(formData);
      if (result?.error) {
        setErrorMessage(result.error);
        return;
      }
      router.refresh();
    });
  };

  const handleScoreSubmit = (
    event: FormEvent<HTMLFormElement>,
    eventId: string,
    teamId: string,
    categoryId?: string
  ) => {
    event.preventDefault();
    if (!canManage) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    formData.set("event_id", eventId);
    formData.set("team_id", teamId);
    formData.set("category_id", categoryId ?? "");
    setErrorMessage("");

    startTransition(async () => {
      const result = await upsertCompetitionScore(formData);
      if (result?.error) {
        setErrorMessage(result.error);
        return;
      }
      router.refresh();
    });
  };

  const handleManualRank = (event: FormEvent<HTMLFormElement>, eventId: string, teamId: string) => {
    event.preventDefault();
    if (!canManage) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    formData.set("event_id", eventId);
    formData.set("team_id", teamId);
    setErrorMessage("");

    startTransition(async () => {
      const result = await setCompetitionManualRank(formData);
      if (result?.error) {
        setErrorMessage(result.error);
        return;
      }
      router.refresh();
    });
  };

  const scoreByTeamAndCategory = new Map<string, number>();
  for (const score of snapshot.scores) {
    const key = `${score.team_id}:${score.category_id ?? "__general__"}`;
    scoreByTeamAndCategory.set(key, score.points);
  }

  return (
    <Card className="border-border/70">
      <CardHeader>
        <CardTitle className="text-base">Scoring & Categories</CardTitle>
        <CardDescription>
          Define criteria and enter points per team. Manual rank overrides are optional.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canManage ? (
          <form
            onSubmit={handleCreateCategory}
            className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_120px_120px_auto]"
          >
            <input type="hidden" name="event_id" value={snapshot.event.id} />
            <div className="space-y-1">
              <Label htmlFor="category_name">Category</Label>
              <Input id="category_name" name="name" placeholder="Attendance" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="category_max_points">Max points</Label>
              <Input
                id="category_max_points"
                name="max_points"
                type="number"
                min={0}
                step="0.01"
                placeholder="100"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="category_sort">Order</Label>
              <Input
                id="category_sort"
                name="sort_order"
                type="number"
                min={0}
                step="1"
                defaultValue={snapshot.categories.length}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 size-4" />
                    Add category
                  </>
                )}
              </Button>
            </div>
          </form>
        ) : null}

        {snapshot.categories.length ? (
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">Categories</p>
            <div className="flex flex-wrap gap-2">
              {snapshot.categories.map((category) => (
                <div key={category.id} className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                  <span>{category.name}</span>
                  <span className="text-muted-foreground">
                    {category.max_points == null ? "No max" : `Max ${category.max_points}`}
                  </span>
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(snapshot.event.id, category.id)}
                      disabled={isPending}
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No categories yet. Scores can still be entered as a general total below.
          </p>
        )}

        <div className="space-y-3">
          {snapshot.teams.map((team) => (
            <div key={team.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">{team.name}</p>
                {canManage ? (
                  <form
                    onSubmit={(event) => handleManualRank(event, snapshot.event.id, team.id)}
                    className="flex items-center gap-2"
                  >
                    <Input
                      name="manual_rank_override"
                      type="number"
                      min={1}
                      step={1}
                      defaultValue={team.manual_rank_override ?? ""}
                      placeholder="Manual rank"
                      className="h-8 w-28"
                    />
                    <Button type="submit" size="sm" variant="outline" disabled={isPending}>
                      <Save className="mr-1 size-3.5" />
                      Rank
                    </Button>
                  </form>
                ) : null}
              </div>

              <div className="mt-3 grid gap-2">
                {snapshot.categories.length ? (
                  snapshot.categories.map((category) => {
                    const key = `${team.id}:${category.id}`;
                    const score = scoreByTeamAndCategory.get(key);
                    return (
                      <form
                        key={category.id}
                        onSubmit={(event) =>
                          handleScoreSubmit(event, snapshot.event.id, team.id, category.id)
                        }
                        className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_140px_auto]"
                      >
                        <div className="text-sm">
                          <p>{category.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {category.max_points == null
                              ? "No max limit"
                              : `Max ${category.max_points}`}
                          </p>
                        </div>
                        <Input
                          name="points"
                          type="number"
                          min={0}
                          step="0.01"
                          defaultValue={score == null ? "" : String(score)}
                          placeholder="0.00"
                          required
                        />
                        <Button type="submit" variant="outline" disabled={isPending}>
                          Save
                        </Button>
                      </form>
                    );
                  })
                ) : (
                  <form
                    onSubmit={(event) => handleScoreSubmit(event, snapshot.event.id, team.id)}
                    className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_140px_auto]"
                  >
                    <div className="text-sm">
                      <p>General score</p>
                      <p className="text-xs text-muted-foreground">
                        Use this when category scoring is not needed.
                      </p>
                    </div>
                    <Input
                      name="points"
                      type="number"
                      min={0}
                      step="0.01"
                      defaultValue={String(
                        scoreByTeamAndCategory.get(`${team.id}:__general__`) ?? ""
                      )}
                      placeholder="0.00"
                      required
                    />
                    <Button type="submit" variant="outline" disabled={isPending}>
                      Save
                    </Button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>

        {errorMessage ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
