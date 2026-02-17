"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { reviewFineReport } from "@/app/actions/fine-reports";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type FineRuleOption = {
  id: string;
  title?: string | null;
  severity?: string | null;
  active?: boolean | null;
};

export function ReviewFineReportPanel({
  dormId,
  reportId,
  initialRuleId,
  rules,
}: {
  dormId: string;
  reportId: string;
  initialRuleId: string | null;
  rules: FineRuleOption[];
}) {
  const [ruleId, setRuleId] = useState<string>(initialRuleId ?? "");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const commentRef = useRef<HTMLTextAreaElement>(null);

  const activeRules = useMemo(
    () => rules.filter((rule) => rule.active !== false),
    [rules]
  );

  const submit = (action: "approve" | "reject") => {
    setError(null);
    startTransition(async () => {
      const result = await reviewFineReport(
        dormId,
        reportId,
        action,
        comment,
        ruleId || null
      );

      if ("error" in result) {
        setError(result.error ?? "Something went wrong.");
        return;
      }

      setComment("");
      commentRef.current?.focus();
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        <Label>Rule (required to approve)</Label>
        <Select value={ruleId} onValueChange={setRuleId}>
          <SelectTrigger>
            <SelectValue placeholder="Select rule..." />
          </SelectTrigger>
          <SelectContent>
            {activeRules.map((rule) => (
              <SelectItem key={rule.id} value={rule.id}>
                {(rule.title ?? "Untitled rule") + (rule.severity ? ` (${rule.severity})` : "")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label>Comment (optional)</Label>
        <Textarea
          ref={commentRef}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Add a note for the reporter (optional)..."
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="destructive"
          disabled={isPending}
          onClick={() => submit("reject")}
        >
          Reject
        </Button>
        <Button
          className="bg-emerald-600 hover:bg-emerald-700"
          disabled={isPending}
          onClick={() => submit("approve")}
        >
          Approve and issue fine
        </Button>
      </div>
    </div>
  );
}

