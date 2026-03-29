import { ApplicationsPage } from "@/components/applications/applications-page";

export default function StudentAssistantApplicationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  return <ApplicationsPage searchParams={searchParams} />;
}
