import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Trophy } from "lucide-react";

import { getCompetitionSnapshot } from "@/app/actions/competition";
import { getEventViewerContext } from "@/app/actions/events";
import { CompetitionPrintButton } from "@/components/competition/competition-print-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function CompetitionPrintPage({
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

  const snapshot = await getCompetitionSnapshot(context.dormId, id);
  if (!snapshot) {
    notFound();
  }

  if (!snapshot.event.is_competition) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Printable Results</h1>
          <Button asChild variant="outline">
            <Link href={`/events/${id}/competition`}>Back</Link>
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Competition mode is disabled</CardTitle>
            <CardDescription>
              Enable competition mode on the event before printing results.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const leaderboard = [...snapshot.leaderboard].sort((a, b) => a.rank - b.rank);
  const generatedAt = formatDateTime(new Date());

  return (
    <div className="space-y-5 print:space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Printable Results</h1>
          <p className="text-sm text-muted-foreground">{snapshot.event.title}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href={`/events/${id}/competition`}>Back</Link>
          </Button>
          <CompetitionPrintButton />
        </div>
      </div>

      <Card className="print:shadow-none">
        <CardHeader className="print:pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Trophy className="size-4 text-amber-500" />
            {snapshot.event.title} Final Rankings
          </CardTitle>
          <CardDescription>Generated on {generatedAt}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <table className="min-w-full border text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="border px-3 py-2 text-left">Rank</th>
                  <th className="border px-3 py-2 text-left">Team</th>
                  {snapshot.categories.map((category) => (
                    <th key={category.id} className="border px-3 py-2 text-right">
                      {category.name}
                    </th>
                  ))}
                  {!snapshot.categories.length ? (
                    <th className="border px-3 py-2 text-right">General</th>
                  ) : null}
                  <th className="border px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row) => (
                  <tr key={row.team_id}>
                    <td className="border px-3 py-2 font-medium">#{row.rank}</td>
                    <td className="border px-3 py-2">
                      <div className="font-medium">{row.team_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.members
                          .map((member) => member.occupant_name || member.display_name)
                          .filter(Boolean)
                          .join(", ") || "No members listed"}
                      </div>
                    </td>
                    {snapshot.categories.map((category) => (
                      <td key={category.id} className="border px-3 py-2 text-right">
                        {(row.category_breakdown[category.id] ?? 0).toFixed(2)}
                      </td>
                    ))}
                    {!snapshot.categories.length ? (
                      <td className="border px-3 py-2 text-right">
                        {(row.category_breakdown.__general__ ?? 0).toFixed(2)}
                      </td>
                    ) : null}
                    <td className="border px-3 py-2 text-right font-semibold">
                      {row.total_points.toFixed(2)}
                    </td>
                  </tr>
                ))}
                {!leaderboard.length ? (
                  <tr>
                    <td
                      className="border px-3 py-6 text-center text-muted-foreground"
                      colSpan={snapshot.categories.length + 4}
                    >
                      No competition data available yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
