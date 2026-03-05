import { redirect } from "next/navigation";

type AssistantAdviserAliasPageProps = {
  params: {
    segments?: string[];
  };
};

export default function AssistantAdviserAliasPage({ params }: AssistantAdviserAliasPageProps) {
  const nextPath = params.segments?.length ? params.segments.join("/") : "home";
  redirect(`/adviser/${nextPath}`);
}
