import { redirect } from "next/navigation";

import { getAiWorkspaceData } from "@/app/actions/ai";
import { AiOrganizerWorkspace } from "@/components/ai/ai-organizer-workspace";

export default async function AiPage() {
  const workspace = await getAiWorkspaceData();
  if ("error" in workspace) {
    if (workspace.error === "Unauthorized") {
      redirect("/login");
    }
    return <div className="p-6 text-sm text-muted-foreground">{workspace.error}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI + Voice Organizer</h1>
        <p className="text-sm text-muted-foreground">
          Turn raw ideas into structured event concepts and review read-only finance insights.
        </p>
      </div>

      <AiOrganizerWorkspace
        role={workspace.role}
        suggestedPrompts={workspace.suggestions}
        events={workspace.events}
        recentConcepts={workspace.recentConcepts}
        initialInsights={null}
      />
    </div>
  );
}
