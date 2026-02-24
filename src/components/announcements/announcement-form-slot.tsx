"use client";

import dynamic from "next/dynamic";

import type { DormAnnouncement } from "@/app/actions/announcements";
import { Button } from "@/components/ui/button";

const AnnouncementFormDialog = dynamic(
  () =>
    import("@/components/announcements/announcement-form-dialog").then(
      (mod) => mod.AnnouncementFormDialog
    ),
  {
    ssr: false,
    loading: () => (
      <Button disabled>
        <span className="opacity-70">Loading…</span>
      </Button>
    ),
  }
);

export function AnnouncementFormSlot(props: {
  dormId: string | null;
  mode: "create" | "edit";
  announcement?: DormAnnouncement;
  trigger?: React.ReactNode;
  committeeId?: string;
}) {
  return <AnnouncementFormDialog {...props} />;
}
