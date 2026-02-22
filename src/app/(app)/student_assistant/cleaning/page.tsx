import { redirect } from "next/navigation";

import { getCleaningSnapshot } from "@/app/actions/cleaning";
import { CleaningWorkspace } from "@/components/cleaning/cleaning-workspace";

type Search = {
  week?: string;
};

export default async function CleaningPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const params = await searchParams;
  const snapshot = await getCleaningSnapshot(params.week);

  if ("error" in snapshot) {
    if (snapshot.error === "Unauthorized") {
      redirect("/login");
    }

    return <div className="p-6 text-sm text-muted-foreground">{snapshot.error}</div>;
  }

  return <CleaningWorkspace key={snapshot.selected_week_start} snapshot={snapshot} />;
}
