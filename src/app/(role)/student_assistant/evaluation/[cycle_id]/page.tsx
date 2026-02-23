import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getEvaluationCycle, getEvaluationTemplates } from "@/app/actions/evaluation";
import { CreateTemplateDialog } from "@/components/admin/evaluation/create-template-dialog";
import { RankingResults } from "@/components/admin/evaluation/ranking-results";
import { ExportXlsxDialog } from "@/components/export/export-xlsx-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getActiveDormId, getUserDorms } from "@/lib/dorms";

interface Props {
  params: Promise<{ cycle_id: string }>;
}

export default async function StudentAssistantCycleDetailsPage({ params }: Props) {
  const { cycle_id } = await params;
  const dormId = await getActiveDormId();
  if (!dormId) return <div>No active dorm selected.</div>;

  const cycle = await getEvaluationCycle(dormId, cycle_id);
  if (!cycle) notFound();

  const templates = await getEvaluationTemplates(dormId, cycle_id);
  const dormOptions = await getUserDorms();

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/student_assistant/evaluation">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="space-y-1">
            <h2 className="text-3xl font-bold tracking-tight">{cycle.label || "Evaluation Cycle"}</h2>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>{cycle.school_year}</span>
              <span>•</span>
              <span>Sem {cycle.semester}</span>
              {cycle.is_active ? (
                <>
                  <span>•</span>
                  <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                    Active
                  </Badge>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <ExportXlsxDialog
          report="evaluation-rankings"
          title="Export Evaluation Rankings"
          description="Download ranking results with top 30% retention tagging."
          defaultDormId={dormId}
          dormOptions={dormOptions}
          includeDormSelector
          defaultParams={{ cycle_id }}
        />
      </div>

      <Tabs defaultValue="templates" className="space-y-4">
        <TabsList>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="ranking">Ranking Results</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold">Evaluation Templates</h3>
            <CreateTemplateDialog dormId={dormId} cycleId={cycle_id} rolePath="student_assistant" />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => (
              <Card key={template.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                    <Badge variant={template.status === "active" ? "default" : "secondary"}>
                      {template.status.toUpperCase()}
                    </Badge>
                  </div>
                  <CardDescription>Created {new Date(template.created_at).toLocaleDateString()}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                      Weights:
                      {Object.entries(template.rater_group_weights || {}).map(([group, weight]) => (
                        <div key={group} className="flex justify-between">
                          <span className="capitalize">{group}:</span>
                          <span>{Number(weight) * 100}%</span>
                        </div>
                      ))}
                    </div>
                    <Button variant="outline" className="w-full" asChild>
                      <Link href={`/student_assistant/evaluation/${cycle_id}/templates/${template.id}`}>Edit Metrics & Weights</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {!templates.length ? (
              <div className="col-span-full rounded-lg border-2 border-dashed py-12 text-center text-muted-foreground">
                No templates created for this cycle yet.
              </div>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="ranking">
          <Card>
            <CardHeader>
              <CardTitle>Current Rankings</CardTitle>
              <CardDescription>Live calculation of scores based on active submissions and fines.</CardDescription>
            </CardHeader>
            <CardContent>
              <RankingResults cycleId={cycle_id} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Cycle Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <div className="text-base font-medium">Counts for Retention</div>
                  <div className="text-sm text-muted-foreground">
                    If enabled, this cycle is used for top 30% retention ranking.
                  </div>
                </div>
                <div className="text-lg font-bold">{cycle.counts_for_retention ? "YES" : "NO"}</div>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <div className="text-base font-medium">Active Status</div>
                  <div className="text-sm text-muted-foreground">Only one cycle can be active for submissions.</div>
                </div>
                <div className="text-lg font-bold">{cycle.is_active ? "ACTIVE" : "INACTIVE"}</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
