"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeCommitteeMember } from "@/app/actions/committees";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export function RemoveMemberButton({
  committeeId,
  userId,
}: {
  committeeId: string;
  userId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleRemove = () => {
    if (confirm("Are you sure you want to remove this member?")) {
      startTransition(async () => {
        await removeCommitteeMember(committeeId, userId);
        router.refresh();
      });
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground hover:text-destructive"
      onClick={handleRemove}
      disabled={isPending}
      title="Remove member"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
