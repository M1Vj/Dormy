import { redirect } from "next/navigation";

type AssistantAdviserAliasPageProps = {
  params: Promise<{
    segments?: string[];
  }>;
};

export default async function AssistantAdviserAliasPage({ params }: AssistantAdviserAliasPageProps) {
  const resolvedParams = await params;
  const nextPath = resolvedParams.segments?.length ? resolvedParams.segments.join("/") : "home";
  redirect(`/adviser/${nextPath}`);
}
