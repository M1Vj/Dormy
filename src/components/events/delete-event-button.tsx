"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

import { deleteEvent } from "@/app/actions/events";
import { Button } from "@/components/ui/button";

export function DeleteEventButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    const confirmed = window.confirm(
      "Delete this event? This action removes linked photos and cannot be undone."
    );
    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("event_id", eventId);
      const result = await deleteEvent(formData);
      if (result?.error) {
        window.alert(result.error);
        return;
      }

      router.push("/occupant/events");
      router.refresh();
    });
  };

  return (
    <Button type="button" variant="destructive" onClick={handleDelete} isLoading={isPending}>
      <Trash2 className="mr-2 size-4" />
      Delete event
    </Button>
  );
}
