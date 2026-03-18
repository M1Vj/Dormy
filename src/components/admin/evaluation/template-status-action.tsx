"use client";

import { useTransition } from "react";
import { updateTemplate } from "@/app/actions/evaluation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  dormId: string;
  templateId: string;
  status: string;
}

export function TemplateStatusAction({ dormId, templateId, status }: Props) {
  const [isPending, startTransition] = useTransition();
  const isActive = status === "active";

  const handleActivate = () => {
    if (isActive) return;

    startTransition(async () => {
      const result = await updateTemplate(dormId, templateId, { status: "active" });

      if (result?.success) {
        toast.success("Template activated.");
        return;
      }

      toast.error(result?.error ?? "Failed to activate template.");
    });
  };

  return (
    <Button
      variant="outline"
      className="w-full"
      onClick={handleActivate}
      disabled={isActive || isPending}
      isLoading={isPending}
    >
      {isActive ? "Already Active" : "Mark as Active"}
    </Button>
  );
}
