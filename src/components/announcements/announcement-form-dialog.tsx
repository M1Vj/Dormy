"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Megaphone, PencilLine } from "lucide-react";

import type { DormAnnouncement } from "@/app/actions/announcements";
import { createAnnouncement, updateAnnouncement } from "@/app/actions/announcements";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type FormState = {
  error: string;
};

const initialState: FormState = {
  error: "",
};

function toDateTimeLocal(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const offset = parsed.getTimezoneOffset() * 60 * 1000;
  return new Date(parsed.getTime() - offset).toISOString().slice(0, 16);
}

export function AnnouncementFormDialog({
  dormId,
  mode,
  announcement,
  trigger,
  committeeId,
}: {
  dormId: string | null;
  mode: "create" | "edit";
  announcement?: DormAnnouncement;
  trigger?: React.ReactNode;
  committeeId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const resolvedCommitteeId = committeeId ?? announcement?.committee_id ?? null;
  const isCommitteeContext = Boolean(resolvedCommitteeId);

  const action =
    mode === "create"
      ? createAnnouncement.bind(null, dormId)
      : updateAnnouncement.bind(null, dormId, announcement?.id ?? "");

  const [state, formAction, isPending] = useActionState(
    async (_previousState: FormState, formData: FormData) => {
      const result = await action(formData);
      if (result?.error) {
        return { error: result.error };
      }

      setOpen(false);
      router.refresh();
      return initialState;
    },
    initialState
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ? (
          trigger
        ) : (
          <Button variant={mode === "create" ? "default" : "outline"} size={mode === "create" ? "default" : "sm"}>
            {mode === "create" ? <Megaphone className="mr-2 size-4" /> : <PencilLine className="mr-2 size-4" />}
            {mode === "create" ? "New announcement" : "Edit"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Create announcement" : "Edit announcement"}</DialogTitle>
          <DialogDescription>
            {isCommitteeContext
              ? "Committee announcements can be shared with committee members or the whole dorm."
              : "Member-visible announcements appear on the occupant Home page. Staff-only updates stay hidden from occupants."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {resolvedCommitteeId ? (
            <input type="hidden" name="committee_id" value={resolvedCommitteeId} />
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="announcement_title">Title</Label>
            <Input
              id="announcement_title"
              name="title"
              placeholder="Payment reminder: maintenance fee collection"
              defaultValue={announcement?.title ?? ""}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="announcement_body">Body</Label>
            <Textarea
              id="announcement_body"
              name="body"
              placeholder="Write the update clearly. Avoid posting sensitive personal info."
              rows={7}
              defaultValue={announcement?.body ?? ""}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {isCommitteeContext ? (
              <div className="space-y-2">
                <Label htmlFor="announcement_audience">Post to</Label>
                <select
                  id="announcement_audience"
                  name="audience"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue={announcement?.audience ?? "committee"}
                >
                  <option value="committee">Committee members</option>
                  <option value="dorm">Whole dorm</option>
                </select>
                <input type="hidden" name="visibility" value="members" />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="announcement_visibility">Visibility</Label>
                <select
                  id="announcement_visibility"
                  name="visibility"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue={announcement?.visibility ?? "members"}
                >
                  <option value="members">Members (occupants can view)</option>
                  <option value="staff">Staff only</option>
                </select>
                <input type="hidden" name="audience" value="dorm" />
              </div>
            )}
            <div className="space-y-2">
              <span className="text-sm font-medium">Options</span>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="pinned"
                  defaultChecked={announcement?.pinned ?? false}
                  className="size-4 rounded border"
                />
                Pin to top
              </label>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="announcement_starts_at">Publish at (optional)</Label>
              <Input
                id="announcement_starts_at"
                name="starts_at"
                type="datetime-local"
                defaultValue={toDateTimeLocal(announcement?.starts_at)}
              />
              <p className="text-xs text-muted-foreground">Leave blank to publish immediately.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="announcement_expires_at">Expires at (optional)</Label>
              <Input
                id="announcement_expires_at"
                name="expires_at"
                type="datetime-local"
                defaultValue={toDateTimeLocal(announcement?.expires_at)}
              />
              <p className="text-xs text-muted-foreground">If set, members won’t see it after expiry.</p>
            </div>
          </div>

          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

          <DialogFooter>
            <Button type="submit" isLoading={isPending}>
              {mode === "create" ? "Create" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
