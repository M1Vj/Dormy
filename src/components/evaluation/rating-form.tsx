"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { submitEvaluation } from "@/app/actions/evaluation";
import { EvaluationMetric } from "@/lib/types/evaluation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface Props {
  raterId: string;
  rateeId: string;
  templateId: string;
  metrics: EvaluationMetric[];
}

export function RatingForm({ raterId, rateeId, templateId, metrics }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [scores, setScores] = useState<Record<string, number>>({});

  const handleScoreChange = (metricId: string, score: string) => {
    setScores(prev => ({
      ...prev,
      [metricId]: Number(score)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check if all metrics are scored
    if (Object.keys(scores).length < metrics.length) {
      toast.error("Please provide a rating for all criteria.");
      return;
    }

    startTransition(async () => {
      const result = await submitEvaluation({
        templateId,
        raterId,
        rateeId,
        scores
      });

      if (result.success) {
        toast.success("Evaluation submitted successfully");
        router.push("/evaluation");
        router.refresh();
      } else {
        toast.error(result.error || "Failed to submit evaluation");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 pb-20">
      {metrics.map((metric) => (
        <Card key={metric.id}>
          <CardHeader>
            <CardTitle className="text-lg">{metric.name}</CardTitle>
            {metric.description && (
              <CardDescription>{metric.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <RadioGroup
              onValueChange={(val: string) => handleScoreChange(metric.id, val)}
              className="flex flex-wrap gap-4"
              required
            >
              {[...Array(metric.scale_max - metric.scale_min + 1)].map((_, i) => {
                const value = metric.scale_min + i;
                return (
                  <div key={value} className="flex items-center space-x-2">
                    <RadioGroupItem value={value.toString()} id={`${metric.id}-${value}`} />
                    <Label htmlFor={`${metric.id}-${value}`} className="cursor-pointer">{value}</Label>
                  </div>
                );
              })}
            </RadioGroup>
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit Evaluation
        </Button>
      </div>
    </form>
  );
}
