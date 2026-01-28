"use client";

import { useTransition } from "react";
import { Trash2, Edit2, GripVertical } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { deleteEvaluationMetric } from "@/app/actions/evaluation";
import { EvaluationMetric } from "@/lib/types/evaluation";
import { AddMetricDialog } from "./add-metric-dialog";

interface Props {
  dormId: string;
  templateId: string;
  cycleId: string;
  metrics: EvaluationMetric[];
}

export function MetricsTable({ dormId, templateId, cycleId, metrics }: Props) {
  const [isPending, startTransition] = useTransition();

  const handleDelete = (metricId: string) => {
    if (!confirm("Are you sure you want to delete this metric?")) return;

    startTransition(async () => {
      const result = await deleteEvaluationMetric(dormId, metricId, cycleId);
      if (result.success) {
        toast.success("Metric deleted");
      } else {
        toast.error(result.error || "Failed to delete metric");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AddMetricDialog dormId={dormId} templateId={templateId} cycleId={cycleId} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[30px]"></TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Weight</TableHead>
            <TableHead>Scale</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {metrics.map((metric) => (
            <TableRow key={metric.id}>
              <TableCell>
                <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
              </TableCell>
              <TableCell>
                <div className="font-medium">{metric.name}</div>
                {metric.description && (
                  <div className="text-xs text-muted-foreground line-clamp-1">
                    {metric.description}
                  </div>
                )}
              </TableCell>
              <TableCell>{metric.weight_pct}%</TableCell>
              <TableCell>
                {metric.scale_min}-{metric.scale_max}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="icon">
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleDelete(metric.id)}
                    disabled={isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {metrics.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                No metrics defined yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
