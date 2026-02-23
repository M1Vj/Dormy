import Link from "next/link";
import { getEvaluationCycles } from "@/app/actions/evaluation";
import { getActiveDormId } from "@/lib/dorms";
import { CreateCycleDialog } from "@/components/admin/evaluation/create-cycle-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function StudentAssistantEvaluationPage() {
  const dormId = await getActiveDormId();
  if (!dormId) return <div>No active dorm selected.</div>;

  const cycles = await getEvaluationCycles(dormId);

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight">Evaluation Management</h2>
          <p className="text-muted-foreground">
            Start cycles, configure templates, and manage metrics and weights.
          </p>
        </div>
        <CreateCycleDialog dormId={dormId} rolePath="student_assistant" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Evaluation Cycles</CardTitle>
          <CardDescription>History of evaluation periods and their current status.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cycle Label</TableHead>
                <TableHead>SY / Semester</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Retention</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cycles.map((cycle) => (
                <TableRow key={cycle.id}>
                  <TableCell className="font-medium">{cycle.label || "Evaluation Period"}</TableCell>
                  <TableCell>
                    {cycle.school_year} - Sem {cycle.semester}
                  </TableCell>
                  <TableCell>
                    {cycle.is_active ? <Badge variant="default">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                  </TableCell>
                  <TableCell>
                    {cycle.counts_for_retention ? (
                      <Badge variant="outline">Ranking</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Informal</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/student_assistant/evaluation/${cycle.id}`}>Manage</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!cycles.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No evaluation cycles found.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
