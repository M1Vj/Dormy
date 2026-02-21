"use client";

import dynamic from "next/dynamic";

import type { CommitteeSummary } from "@/app/actions/committees";

const CommitteeCard = dynamic(
  () =>
    import("@/components/admin/committees/committee-card").then(
      (mod) => mod.CommitteeCard
    ),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-lg border p-4 text-sm text-muted-foreground">
        Loading committee...
      </div>
    ),
  }
);

export function CommitteeCardSlot({ committee, canManage }: { committee: CommitteeSummary; canManage?: boolean }) {
  return <CommitteeCard committee={committee as any} canManage={canManage} />;
}

