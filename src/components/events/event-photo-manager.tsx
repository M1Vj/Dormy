"use client";

import Image from "next/image";
import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, Upload } from "lucide-react";

import { deleteEventPhoto, uploadEventPhoto } from "@/app/actions/events";
import { Button } from "@/components/ui/button";
import type { EventPhoto } from "@/lib/types/events";

type UploadState = {
  error: string;
  success: boolean;
};

const initialUploadState: UploadState = {
  error: "",
  success: false,
};

export function EventPhotoManager({
  eventId,
  canManage,
  photos,
}: {
  eventId: string;
  canManage: boolean;
  photos: EventPhoto[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [isDeletePending, startDeleteTransition] = useTransition();

  const [uploadState, uploadAction, isUploadPending] = useActionState(
    async (_previousState: UploadState, formData: FormData) => {
      const result = await uploadEventPhoto(formData);
      if (result?.error) {
        return {
          error: result.error,
          success: false,
        };
      }

      formRef.current?.reset();
      router.refresh();
      return {
        error: "",
        success: true,
      };
    },
    initialUploadState
  );

  const handleDeletePhoto = (photoId: string) => {
    if (!canManage) {
      return;
    }

    const confirmed = window.confirm("Delete this photo permanently?");
    if (!confirmed) {
      return;
    }

    setDeleteError("");
    setDeletingPhotoId(photoId);

    startDeleteTransition(async () => {
      const formData = new FormData();
      formData.set("event_id", eventId);
      formData.set("photo_id", photoId);
      const result = await deleteEventPhoto(formData);
      if (result?.error) {
        setDeleteError(result.error);
        setDeletingPhotoId(null);
        return;
      }

      setDeletingPhotoId(null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {canManage ? (
        <form ref={formRef} action={uploadAction} className="rounded-lg border p-3">
          <input type="hidden" name="event_id" value={eventId} />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="file"
              name="photo"
              accept="image/png,image/jpeg,image/webp,image/gif"
              required
              className="w-full text-sm"
            />
            <Button type="submit" disabled={isUploadPending}>
              {isUploadPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 size-4" />
                  Upload photo
                </>
              )}
            </Button>
          </div>
          {uploadState.error ? (
            <p className="mt-2 text-sm text-destructive">{uploadState.error}</p>
          ) : null}
        </form>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((photo) => (
          <div key={photo.id} className="group relative overflow-hidden rounded-lg border bg-muted/20">
            {photo.url ? (
              <Image
                src={photo.url}
                alt="Event photo"
                width={640}
                height={640}
                unoptimized
                loader={({ src }) => src}
                className="aspect-square w-full object-cover"
              />
            ) : (
              <div className="aspect-square w-full bg-muted/40" />
            )}
            {canManage ? (
              <Button
                type="button"
                size="icon"
                variant="destructive"
                className="absolute right-2 top-2 size-8 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => handleDeletePhoto(photo.id)}
                disabled={isDeletePending && deletingPhotoId === photo.id}
              >
                {isDeletePending && deletingPhotoId === photo.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
              </Button>
            ) : null}
          </div>
        ))}
      </div>

      {!photos.length ? (
        <p className="text-sm text-muted-foreground">No photos uploaded yet.</p>
      ) : null}

      {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
    </div>
  );
}
