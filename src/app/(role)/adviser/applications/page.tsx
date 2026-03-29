import { ApplicationsPage } from "@/components/applications/applications-page";

export default function AdviserApplicationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  return <ApplicationsPage searchParams={searchParams} />;
}
