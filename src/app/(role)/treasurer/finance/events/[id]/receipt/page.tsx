import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ContributionReceiptBuilder } from "@/components/finance/contribution-receipt-builder";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveDormId } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = {
  id: string;
};

type EntryRow = {
  id: string;
  occupant_id: string | null;
  event_id: string | null;
  amount_pesos: number | string | null;
  entry_type: string;
  metadata: Record<string, unknown> | null;
};

function parseContribution(entry: EntryRow) {
  const metadata = entry.metadata && typeof entry.metadata === "object" ? entry.metadata : {};
  const contributionIdRaw = metadata.contribution_id ?? metadata.payable_batch_id ?? entry.event_id ?? null;
  const contributionId = typeof contributionIdRaw === "string" ? contributionIdRaw : null;

  return {
    contributionId,
    title:
      typeof metadata.contribution_title === "string" && metadata.contribution_title.trim().length > 0
        ? metadata.contribution_title.trim()
        : typeof metadata.payable_label === "string" && metadata.payable_label.trim().length > 0
          ? metadata.payable_label.trim()
          : "Contribution",
    receiptSignature:
      typeof metadata.contribution_receipt_signature === "string" &&
      metadata.contribution_receipt_signature.trim().length > 0
        ? metadata.contribution_receipt_signature.trim()
        : null,
    receiptSubject:
      typeof metadata.contribution_receipt_subject === "string" &&
      metadata.contribution_receipt_subject.trim().length > 0
        ? metadata.contribution_receipt_subject.trim()
        : null,
    receiptMessage:
      typeof metadata.contribution_receipt_message === "string" &&
      metadata.contribution_receipt_message.trim().length > 0
        ? metadata.contribution_receipt_message.trim()
        : null,
    receiptLogoUrl:
      typeof metadata.contribution_receipt_logo_url === "string" &&
      metadata.contribution_receipt_logo_url.trim().length > 0
        ? metadata.contribution_receipt_logo_url.trim()
        : null,
  };
}

export default async function ContributionReceiptBuilderPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id: contributionId } = await params;

  const dormId = await getActiveDormId();
  if (!dormId) {
    return <div className="p-6 text-sm text-muted-foreground">No active dorm selected.</div>;
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return <div className="p-6 text-sm text-muted-foreground">Supabase is not configured.</div>;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return <div className="p-6 text-sm text-muted-foreground">Unauthorized.</div>;
  }

  const { data: memberships } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  const roles = memberships?.map((membership) => membership.role) ?? [];
  if (!roles.some((role) => new Set(["admin", "treasurer"]).has(role))) {
    return <div className="p-6 text-sm text-muted-foreground">You do not have access to this page.</div>;
  }

  const [{ data: rawEntries, error: entriesError }, { data: occupants }] = await Promise.all([
    supabase
      .from("ledger_entries")
      .select("id, occupant_id, event_id, amount_pesos, entry_type, metadata")
      .eq("dorm_id", dormId)
      .eq("ledger", "contributions")
      .is("voided_at", null),
    supabase
      .from("occupants")
      .select("id, full_name, contact_email")
      .eq("dorm_id", dormId)
      .eq("status", "active")
      .order("full_name", { ascending: true }),
  ]);

  if (entriesError) {
    return <div className="p-6 text-sm text-destructive">Failed to load contribution entries.</div>;
  }

  const entryRows = ((rawEntries ?? []) as EntryRow[]).filter((entry) => {
    const contribution = parseContribution(entry);
    return contribution.contributionId === contributionId;
  });

  if (!entryRows.length) {
    notFound();
  }

  const contributionTitle = parseContribution(entryRows[0]).title;
  const contributionTemplate = entryRows
    .map((entry) => parseContribution(entry))
    .reduce(
      (acc, item) => ({
        signature: acc.signature || item.receiptSignature || "",
        subject: acc.subject || item.receiptSubject || "",
        message: acc.message || item.receiptMessage || "",
        logoUrl: acc.logoUrl || item.receiptLogoUrl || "",
      }),
      {
        signature: "",
        subject: "",
        message: "",
        logoUrl: "",
      }
    );
  const totalAmountContext = entryRows.reduce((sum, entry) => {
    const amount = Number(entry.amount_pesos ?? 0);
    if (entry.entry_type === "payment" || amount < 0) {
      return sum + Math.abs(amount);
    }
    return sum + amount;
  }, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/treasurer/finance/events/${contributionId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Contribution Receipt Builder</h1>
          <p className="text-sm text-muted-foreground">{contributionTitle}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Composer</CardTitle>
        </CardHeader>
        <CardContent>
          <ContributionReceiptBuilder
            dormId={dormId}
            contributionId={contributionId}
            contributionTitle={contributionTitle}
            defaultAmount={Number(totalAmountContext.toFixed(2))}
            initialSignature={contributionTemplate.signature}
            initialSubject={contributionTemplate.subject}
            initialMessage={contributionTemplate.message}
            initialLogoUrl={contributionTemplate.logoUrl}
            occupants={(occupants ?? []).map((occupant) => ({
              id: occupant.id,
              fullName: occupant.full_name ?? "Unnamed",
              email: occupant.contact_email ?? null,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
