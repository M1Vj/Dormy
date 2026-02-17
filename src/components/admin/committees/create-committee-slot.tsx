"use client";

import dynamic from "next/dynamic";

import { Button } from "@/components/ui/button";

const CreateCommitteeDialog = dynamic(
  () =>
    import("@/components/admin/committees/create-committee-dialog").then(
      (mod) => mod.CreateCommitteeDialog
    ),
  {
    ssr: false,
    loading: () => (
      <Button disabled>
        <span className="opacity-70">Loading...</span>
      </Button>
    ),
  }
);

export function CreateCommitteeSlot(props: { dormId: string }) {
  return <CreateCommitteeDialog {...props} />;
}
