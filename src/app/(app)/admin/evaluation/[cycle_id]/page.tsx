import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getEvaluationCycle, getEvaluationTemplates } from "@/app/actions/evaluation";
import { getActiveDormId, getUserDorms } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ExportXlsxDialog } from "@/components/export/export-xlsx-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RankingResults } from "@/components/admin/evaluation/ranking-results";
import { CreateTemplateDialog } from "@/components/admin/evaluation/create-template-dialog";

interface Props {
  params: Promise<{ cycle_id: string }>;
}

export default async function CycleDetailsPage({ params }: Props) {
  const { cycle_id } = await params;
  const dormId = await getActiveDormId();
  if (!dormId) return <div>No active dorm selected.</div>;

  const cycle = await getEvaluationCycle(dormId, cycle_id);
  if (!cycle) notFound();

  const templates = await getEvaluationTemplates(dormId, cycle_id);
  const dormOptions = await getUserDorms();

  const supabase = await createSupabaseServerClient();
  if (!supabase) return <div>Supabase not configured.</div>;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <div>Unauthorized</div>;

  const { data: memberships } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  const roles = memberships?.map(m => m.role) ?? ["occupant"];
  const myRole = roles.includes("admin") ? "admin" : roles[0] || "occupant";

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/${myRole}/evaluation`}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="space-y-1">
            <h2 className="text-3xl font-bold tracking-tight">
              {cycle.label || "Evaluation Cycle"}
            </h2>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>{cycle.school_year}</span>
              <span>•</span>
              <span>Sem {cycle.semester}</span>
              {cycle.is_active && (
                <>
                  <span>•</span>
                  <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                    Active
                  </Badge>
                </>
              )}
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
            <CreateTemplateDialog dormId={dormId} cycleId={cycle_id} />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => (
              <Card key={template.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                    <Badge variant={template.status === 'active' ? 'default' : 'secondary'}>
                      {template.status.toUpperCase()}
                    </Badge>
                  </div>
                  <CardDescription>
                    Created {new Date(template.created_at).toLocaleDateString()}
                  </CardDescription>
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
                      <Link href={`/${myRole}/evaluation/${cycle_id}/templates/${template.id}`}>
                        Edit Metrics & Weights
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {templates.length === 0 && (
              <div className="col-span-full py-12 text-center text-muted-foreground border-2 border-dashed rounded-lg">
                No templates created for this cycle yet.
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="ranking">
          <Card>
            <CardHeader>
              <CardTitle>Current Rankings</CardTitle>
              <CardDescription>
                Live calculation of scores based on active submissions and fines.
              </CardDescription>
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
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-0.5">
                  <div className="text-base font-medium">Counts for Retention</div>
                  <div className="text-sm text-muted-foreground">
                    If enabled, this cycle will be used to calculate the top 30% retention ranking.
                  </div>
                </div>
                <div className="text-lg font-bold">{cycle.counts_for_retention ? "YES" : "NO"}</div>
              </div>
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-0.5">
                  <div className="text-base font-medium">Active Status</div>
                  <div className="text-sm text-muted-foreground">
                    Only one cycle can be active at a time for submission.
                  </div>
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
