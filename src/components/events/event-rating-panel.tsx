"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Star, Trash2 } from "lucide-react";

import { deleteEventRating, upsertEventRating } from "@/app/actions/events";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { EventRating } from "@/lib/types/events";

type RatingFormState = {
  error: string;
  success: boolean;
};

const initialRatingFormState: RatingFormState = {
  error: "",
  success: false,
};

export function EventRatingPanel({
  eventId,
  ratings,
  viewerRating,
  canModerate,
  canRate,
}: {
  eventId: string;
  ratings: EventRating[];
  viewerRating: EventRating | null;
  canModerate: boolean;
  canRate: boolean;
}) {
  const router = useRouter();
  const [deleteError, setDeleteError] = useState("");
  const [deletingRatingId, setDeletingRatingId] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  const [formState, formAction, isSubmitting] = useActionState(
    async (_previousState: RatingFormState, formData: FormData) => {
      const result = await upsertEventRating(formData);
      if (result?.error) {
        return {
          error: result.error,
          success: false,
        };
      }

      router.refresh();
      return {
        error: "",
        success: true,
      };
    },
    initialRatingFormState
  );

  const handleDelete = (ratingId: string) => {
    const confirmed = window.confirm("Delete this rating and comment?");
    if (!confirmed) {
      return;
    }

    setDeleteError("");
    setDeletingRatingId(ratingId);

    startDeleteTransition(async () => {
      const formData = new FormData();
      formData.set("event_id", eventId);
      formData.set("rating_id", ratingId);
      const result = await deleteEventRating(formData);
      if (result?.error) {
        setDeleteError(result.error);
        setDeletingRatingId(null);
        return;
      }

      setDeletingRatingId(null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {canRate ? (
        <form action={formAction} className="rounded-lg border p-3">
          <input type="hidden" name="event_id" value={eventId} />
          <div className="space-y-2">
            <p className="text-sm font-medium">Your rating</p>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <label
                  key={value}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-sm"
                >
                  <input
                    type="radio"
                    name="rating"
                    value={String(value)}
                    defaultChecked={viewerRating?.rating === value}
                    className="size-3.5"
                    required
                  />
                  <Star className="size-3.5 text-amber-500" />
                  {value}
                </label>
              ))}
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <p className="text-sm font-medium">Comment</p>
            <Textarea
              name="comment"
              rows={3}
              defaultValue={viewerRating?.comment ?? ""}
              placeholder="Share feedback about this event."
            />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Saving...
                </>
              ) : viewerRating ? (
                "Update rating"
              ) : (
                "Submit rating"
              )}
            </Button>
          </div>
          {formState.error ? <p className="mt-2 text-sm text-destructive">{formState.error}</p> : null}
        </form>
      ) : (
        <div className="rounded-lg border p-3 text-sm text-muted-foreground">
          Your account is not linked to an occupant profile, so rating is unavailable.
        </div>
      )}

      <div className="space-y-3">
        {ratings.length ? (
          ratings.map((rating) => {
            const isViewerRating = viewerRating?.id === rating.id;
            const showDelete = canModerate || isViewerRating;
            return (
              <div key={rating.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {rating.occupant_name || "Dorm occupant"}
                    {isViewerRating ? " (You)" : ""}
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="gap-1">
                      <Star className="size-3.5 text-amber-500" />
                      {rating.rating}
                    </Badge>
                    {showDelete ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(rating.id)}
                        disabled={isDeleting && deletingRatingId === rating.id}
                      >
                        {isDeleting && deletingRatingId === rating.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2 className="size-4 text-destructive" />
                        )}
                      </Button>
                    ) : null}
                  </div>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {rating.comment?.trim() || "No comment left."}
                </p>
              </div>
            );
          })
        ) : (
          <p className="text-sm text-muted-foreground">No ratings submitted for this event yet.</p>
        )}
      </div>

      {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
    </div>
  );
}
