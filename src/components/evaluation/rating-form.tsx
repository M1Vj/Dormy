"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { submitEvaluation } from "@/app/actions/evaluation";
import { EvaluationMetric } from "@/lib/types/evaluation";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";


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
        router.push("/occupant/evaluation");
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
          <RadioGroup
            onValueChange={(val: string) => handleScoreChange(metric.id, val)}
            value={scores[metric.id]?.toString() || ""} // Ensure controlled component
            className="grid grid-cols-5 gap-2 pt-2 sm:grid-cols-10 px-6 pb-6" // Added px-6 pb-6 for padding since CardContent is removed
            required
          >
            {Array.from({ length: metric.scale_max - metric.scale_min + 1 }).map(
              (_, i) => {
                const val = metric.scale_min + i;
                return (
                  <div
                    key={val}
                    className="flex flex-col items-center space-y-1"
                  >
                    <RadioGroupItem value={val.toString()} id={`${metric.id}-${val}`} />
                    <Label htmlFor={`${metric.id}-${val}`} className="font-normal text-xs cursor-pointer">
                      {val}
                    </Label>
                  </div>
                );
              }
            )}
          </RadioGroup>
        </Card>
      ))}

      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          isLoading={isPending}
        >
          Cancel
        </Button>
        <Button type="submit" isLoading={isPending}>
          Submit Evaluation
        </Button>
      </div>
    </form>
  );
}
