import { redirect } from "next/navigation";
import { format } from "date-fns";
import { Pin, ShieldAlert } from "lucide-react";

import { getDormAnnouncements } from "@/app/actions/announcements";
import type { DormAnnouncement } from "@/app/actions/announcements";
import { AnnouncementFormSlot } from "@/components/announcements/announcement-form-slot";
import { DeleteAnnouncementButton } from "@/components/announcements/delete-announcement-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function getAnnouncementStatus(announcement: DormAnnouncement, now: Date) {
  const startsAt = announcement.starts_at ? new Date(announcement.starts_at) : null;
  const expiresAt = announcement.expires_at ? new Date(announcement.expires_at) : null;

  if (startsAt && startsAt.getTime() > now.getTime()) {
    return { label: "Scheduled", className: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400" };
  }

  if (expiresAt && expiresAt.getTime() <= now.getTime()) {
    return { label: "Expired", className: "border-muted bg-muted text-muted-foreground" };
  }

  return { label: "Live", className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" };
}

export default async function AdminAnnouncementsPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Supabase is not configured for this environment.
      </div>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Global admin announcements — pass null dormId to show all
  const { announcements, error } = await getDormAnnouncements(null);
  const now = new Date();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Announcements</h1>
          <p className="text-sm text-muted-foreground">
            Manage global announcements across all dormitories. These announcements are visible to all occupants.
          </p>
        </div>

        <AnnouncementFormSlot dormId={null} mode="create" />
      </div>

      {error ? (
        <Card>
          <CardContent className="flex items-start gap-3 p-6 text-sm text-muted-foreground">
            <ShieldAlert className="mt-0.5 size-5 text-amber-600" />
            <div>
              <p className="font-medium text-foreground">Announcements are unavailable</p>
              <p className="mt-1">{error}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-4">
        {announcements.map((announcement) => {
          const status = getAnnouncementStatus(announcement, now);
          const startsAt = announcement.starts_at ? new Date(announcement.starts_at) : null;
          const expiresAt = announcement.expires_at ? new Date(announcement.expires_at) : null;

          return (
            <Card key={announcement.id}>
              <CardHeader className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">{announcement.title}</CardTitle>
                    <CardDescription>
                      {startsAt ? `Published ${format(startsAt, "MMM d, yyyy h:mm a")}` : "Published"}
                      {expiresAt ? ` • Expires ${format(expiresAt, "MMM d, yyyy h:mm a")}` : ""}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {announcement.committee ? (
                      <span className="rounded-full border bg-card px-2 py-0.5 text-xs">
                        {announcement.committee.name}
                      </span>
                    ) : null}
                    {announcement.committee ? (
                      <span className="rounded-full border bg-card px-2 py-0.5 text-xs">
                        {announcement.audience === "committee" ? "Committee members" : "Whole dorm"}
                      </span>
                    ) : null}
                    {announcement.pinned ? (
                      <span className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-xs">
                        <Pin className="size-3" />
                        Pinned
                      </span>
                    ) : null}
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${status.className}`}>
                      {status.label}
                    </span>
                    <span className="rounded-full border bg-card px-2 py-0.5 text-xs capitalize">
                      {announcement.visibility}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="whitespace-pre-line text-sm">{announcement.body}</div>

                <div className="flex flex-wrap items-center gap-2">
                  <AnnouncementFormSlot
                    dormId={null}
                    mode="edit"
                    announcement={announcement}
                    trigger={
                      <Button variant="outline" size="sm">
                        Edit
                      </Button>
                    }
                  />
                  <DeleteAnnouncementButton dormId={null} announcementId={announcement.id} />
                </div>
              </CardContent>
            </Card>
          );
        })}

        {!announcements.length ? (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              No announcements posted yet. Use the button above to create a global announcement.
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
