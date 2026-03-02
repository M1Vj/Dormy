"use client";

import { useTransition } from "react";
import { BellRing } from "lucide-react";
import { toast } from "sonner";

import { sendContributionPayableReminders } from "@/app/actions/finance";
import { Button } from "@/components/ui/button";

export function SendContributionRemindersButton({
  dormId,
  semesterIds,
}: {
  dormId: string;
  semesterIds: string[];
}) {
  const [isPending, startTransition] = useTransition();

  const handleSend = () => {
    const confirmed = window.confirm(
      "Send reminder emails to all occupants with remaining contribution payables?"
    );

    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      const result = await sendContributionPayableReminders(dormId, {
        semester_ids: semesterIds,
      });

      if (result && "error" in result) {
        toast.error(typeof result.error === "string" ? result.error : "Failed to send reminders.");
        return;
      }

      if (!result || !("success" in result) || !result.success) {
        toast.error("Failed to send reminders.");
        return;
      }

      if (result.sent_count === 0 && result.target_count === 0) {
        toast.success("No occupants with remaining payable found.");
        return;
      }

      const summary = [
        `Sent: ${result.sent_count}`,
        `Skipped: ${result.skipped_count}`,
        `Failed: ${result.failed_count}`,
      ].join(" · ");

      toast.success(`Reminder emails processed. ${summary}`);
    });
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleSend} disabled={isPending} isLoading={isPending}>
      <BellRing className="mr-2 h-4 w-4" />
      Send Payable Reminders
    </Button>
  );
}
