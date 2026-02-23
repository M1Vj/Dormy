import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getEvaluationCycle, getEvaluationMetrics, getEvaluationTemplate } from "@/app/actions/evaluation";
import { MetricsTable } from "@/components/admin/evaluation/metrics-table";
import { WeightsEditor } from "@/components/admin/evaluation/weights-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveDormId } from "@/lib/dorms";

interface Props {
  params: Promise<{
    cycle_id: string;
    template_id: string;
  }>;
}

export default async function AdviserTemplatePage({ params }: Props) {
  const { cycle_id, template_id } = await params;
  const dormId = await getActiveDormId();
  if (!dormId) return <div>No active dorm selected.</div>;

  const [cycle, template, metrics] = await Promise.all([
    getEvaluationCycle(dormId, cycle_id),
    getEvaluationTemplate(dormId, template_id),
    getEvaluationMetrics(dormId, template_id),
  ]);

  if (!cycle || !template) notFound();

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/adviser/evaluation/${cycle_id}`}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-3xl font-bold tracking-tight">{template.name}</h2>
            <Badge variant={template.status === "active" ? "default" : "secondary"}>{template.status.toUpperCase()}</Badge>
          </div>
          <p className="text-muted-foreground">Configure metrics and rater group weights for this template.</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Evaluation Metrics</CardTitle>
              <CardDescription>The criteria occupants will be rated on.</CardDescription>
            </CardHeader>
            <CardContent>
              <MetricsTable dormId={dormId} templateId={template_id} cycleId={cycle_id} metrics={metrics} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Rater Group Weights</CardTitle>
              <CardDescription>Define the importance of each rater category.</CardDescription>
            </CardHeader>
            <CardContent>
              <WeightsEditor dormId={dormId} templateId={template_id} weights={template.rater_group_weights || {}} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Status Management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Set this template to <strong>Active</strong> to start receiving submissions.
              </p>
              <Button variant="outline" className="w-full">
                Mark as Active
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
