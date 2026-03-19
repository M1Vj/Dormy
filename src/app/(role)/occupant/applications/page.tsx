import { ApplicationsPage as ApplicationsPageContent } from "@/components/applications/applications-page";

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  return <ApplicationsPageContent searchParams={searchParams} />;
}
