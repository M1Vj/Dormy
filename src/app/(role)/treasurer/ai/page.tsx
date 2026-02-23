import { redirect } from "next/navigation";

import { getAiWorkspaceData, getFinanceInsights } from "@/app/actions/ai";
import { AiOrganizerWorkspace } from "@/components/ai/ai-organizer-workspace";

export default async function AiPage() {
  const workspace = await getAiWorkspaceData();
  if ("error" in workspace) {
    if (workspace.error === "Unauthorized") {
      redirect("/login");
    }
    return <div className="p-6 text-sm text-muted-foreground">{workspace.error}</div>;
  }

  const insightsResult = await getFinanceInsights();
  const initialInsights =
    "error" in insightsResult ? null : { kind: "finance" as const, data: insightsResult };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{workspace.pageTitle}</h1>
        <p className="text-sm text-muted-foreground">
          {workspace.pageDescription}
        </p>
      </div>

      <AiOrganizerWorkspace
        role={workspace.role}
        suggestedPrompts={workspace.suggestions}
        events={workspace.events}
        recentConcepts={workspace.recentConcepts}
        initialInsights={initialInsights}
      />
    </div>
  );
}
