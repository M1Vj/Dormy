"use client";

import { useTransition } from "react";
import { updateTemplate } from "@/app/actions/evaluation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface Props {
  dormId: string;
  templateId: string;
  weights: Record<string, number>;
}

export function WeightsEditor({ dormId, templateId, weights }: Props) {
  const [isPending, startTransition] = useTransition();

  const handleUpdate = (formData: FormData) => {
    const peer = Number(formData.get("peer"));
    const adviser = Number(formData.get("adviser"));

    // Basic validation: sum should be 1.0 (though system can scale)
    if (peer + adviser !== 100) {
      if (!confirm("Weights do not sum to 100%. Continue?")) return;
    }

    startTransition(async () => {
      const result = await updateTemplate(dormId, templateId, {
        rater_group_weights: {
          peer: peer / 100,
          adviser: adviser / 100,
        },
      });

      if (result.success) {
        toast.success("Weights updated");
      } else {
        toast.error(result.error || "Failed to update weights");
      }
    });
  };

  return (
    <form action={handleUpdate} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="peer">Peer Evaluation Weight (%)</Label>
        <Input
          id="peer"
          name="peer"
          type="number"
          defaultValue={(weights.peer || 0) * 100}
          min="0"
          max="100"
          disabled={isPending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="adviser">Adviser/Staff Evaluation Weight (%)</Label>
        <Input
          id="adviser"
          name="adviser"
          type="number"
          defaultValue={(weights.adviser || 0) * 100}
          min="0"
          max="100"
          disabled={isPending}
        />
      </div>

      <div className="pt-2">
        <div className="text-xs text-muted-foreground mb-4">
          Peer and Adviser weights should typically sum to 100%.
        </div>
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "Saving..." : "Save Weights"}
        </Button>
      </div>
    </form>
  );
}
