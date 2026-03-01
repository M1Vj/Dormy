import { redirect } from "next/navigation";
import { getActiveDormId } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getGlobalReceiptTemplate } from "@/app/actions/dorm";
import { GlobalReceiptBuilder } from "@/components/finance/global-receipt-builder";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export const metadata = {
  title: "Global Receipt Template | Dormy",
  description: "Configure global receipt templates for contributions",
};

export default async function GlobalReceiptSettingsPage() {
  const activeDormId = await getActiveDormId();
  if (!activeDormId) {
    redirect("/home");
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return <div className="p-6">Error configuring database client.</div>;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const { data: memberships } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", activeDormId)
    .eq("user_id", user.id);

  const roles = memberships?.map((m) => m.role) ?? [];
  const hasAccess = roles.some((r) => new Set(["admin", "treasurer"]).has(r));

  if (!hasAccess) {
    return <div className="p-6 text-muted-foreground">You do not have permission to view this page.</div>;
  }

  const globalTemplateResult = await getGlobalReceiptTemplate(activeDormId);
  if (globalTemplateResult && "error" in globalTemplateResult) {
    return (
      <div className="p-6 text-destructive">
        Failed to load global receipt template: {globalTemplateResult.error}
      </div>
    );
  }

  // Use the global template properties or defaults
  const template = globalTemplateResult && !("error" in globalTemplateResult) && globalTemplateResult.template
    ? globalTemplateResult.template
    : {
      subject: null, message: null, logo_url: null, signature: null,
    };

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/treasurer/contributions"
          className={buttonVariants({ variant: "ghost", size: "icon" })}
          title="Back to Contributions"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Global Receipt Builder</h1>
          <p className="text-muted-foreground mt-2">
            This template is used as the default for all future contribution payments in this dorm.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Template Settings</CardTitle>
          <CardDescription>
            Customize the email receipt appearance. These changes update the dorm-wide default immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GlobalReceiptBuilder
            dormId={activeDormId}
            initialSubject={template.subject ?? ""}
            initialMessage={template.message ?? ""}
            initialSignature={template.signature ?? ""}
            initialLogoUrl={template.logo_url ?? ""}
          />
        </CardContent>
      </Card>
    </div>
  );
}
