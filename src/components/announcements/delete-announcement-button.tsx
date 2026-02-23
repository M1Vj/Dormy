"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { deleteAnnouncement } from "@/app/actions/announcements";
import { Button } from "@/components/ui/button";

export function DeleteAnnouncementButton({
  dormId,
  announcementId,
}: {
  dormId: string;
  announcementId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    const confirmed = window.confirm(
      "Delete this announcement? This action cannot be undone."
    );
    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      const result = await deleteAnnouncement(dormId, announcementId);
      if (result?.error) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <Button type="button" variant="destructive" size="sm" onClick={handleDelete} isLoading={isPending}>
      <Trash2 className="mr-2 size-4" />
      Delete
    </Button>
  );
}

