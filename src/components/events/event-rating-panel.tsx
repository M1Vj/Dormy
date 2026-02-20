"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Star, Trash2 } from "lucide-react";

import { deleteEventRating, upsertEventRating } from "@/app/actions/events";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { EventRating } from "@/lib/types/events";

type RatingFormState = {
  error: string;
  success: boolean;
};

const initialRatingFormState: RatingFormState = {
  error: "",
  success: false,
};

export function LikertScale({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const getButtonStyles = (scale: number) => {
    const isSelected = value === scale;
    const isHovered = hovered === scale;

    if (isSelected) {
      if (scale <= 3) return "bg-red-500 text-white border-red-600 hover:bg-red-600";
      if (scale <= 7) return "bg-yellow-500 text-yellow-950 border-yellow-600 hover:bg-yellow-600";
      return "bg-green-500 text-white border-green-600 hover:bg-green-600";
    }

    if (isHovered) {
      if (scale <= 3) return "bg-red-100 border-red-300 text-red-900";
      if (scale <= 7) return "bg-yellow-100 border-yellow-300 text-yellow-900";
      return "bg-green-100 border-green-300 text-green-900";
    }

    return "bg-background border-input hover:border-accent-foreground/30";
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-5 gap-1.5 sm:flex sm:items-center sm:gap-2">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((scale) => (
          <button
            key={scale}
            type="button"
            disabled={disabled}
            onClick={() => onChange(scale)}
            onMouseEnter={() => setHovered(scale)}
            onMouseLeave={() => setHovered(null)}
            className={cn(
              "flex h-9 w-full items-center justify-center rounded-md border text-sm font-medium transition-colors sm:size-9",
              getButtonStyles(scale),
              disabled && "cursor-not-allowed opacity-50"
            )}
          >
            {scale}
          </button>
        ))}
      </div>
      <div className="flex justify-between px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:text-xs">
        <span>Poor</span>
        <span className="hidden sm:inline">Satisfactory</span>
        <span>Excellent</span>
      </div>
    </div>
  );
}

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

  const [selectedRating, setSelectedRating] = useState(viewerRating?.rating ?? 0);

  const [formState, formAction, isSubmitting] = useActionState(
    async (_previousState: RatingFormState, formData: FormData) => {
      if (selectedRating < 1) {
        return { error: "Please select a rating.", success: false };
      }
      formData.set("rating", String(selectedRating));
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
          <div className="space-y-3">
            <p className="text-sm font-medium">Your rating (1-10)</p>
            <LikertScale
              value={selectedRating}
              onChange={setSelectedRating}
              disabled={isSubmitting}
            />
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
