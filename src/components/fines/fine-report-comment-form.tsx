"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createFineReportComment } from "@/app/actions/fine-reports";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function FineReportCommentForm({
  dormId,
  reportId,
  placeholder,
}: {
  dormId: string;
  reportId: string;
  placeholder?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = (formData: FormData) => {
    setError(null);
    formData.set("report_id", reportId);

    startTransition(async () => {
      const result = await createFineReportComment(dormId, formData);
      if ("error" in result) {
        setError(result.error ?? "Something went wrong.");
        return;
      }

      formRef.current?.reset();
      router.refresh();
    });
  };

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-2">
      <Textarea
        name="body"
        placeholder={placeholder ?? "Write a comment..."}
        rows={3}
        maxLength={2000}
        required
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Posting…" : "Post comment"}
        </Button>
      </div>
    </form>
  );
}

