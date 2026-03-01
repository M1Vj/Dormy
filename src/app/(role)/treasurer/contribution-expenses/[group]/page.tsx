import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";

import { getExpenses } from "@/app/actions/expenses";
import { ReviewExpenseDialog } from "@/components/finance/review-expense-dialog";
import { SubmitExpenseDialog } from "@/components/finance/submit-expense-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TREASURER_MANUAL_EXPENSE_MARKER } from "@/lib/finance/constants";
import { getActiveDormId } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = {
  group: string;
};

type ExpenseRow = {
  id: string;
  title: string;
  amount_pesos: number | string;
  purchased_at: string;
  status: "pending" | "approved" | "rejected";
  description: string | null;
  contribution_reference_title: string | null;
  vendor_name: string | null;
  official_receipt_no: string | null;
  quantity: number | string | null;
  unit_cost_pesos: number | string | null;
  payment_method: string | null;
  purchased_by: string | null;
  transparency_notes: string | null;
  receipt_storage_path: string | null;
  expense_group_title: string | null;
  approval_comment: string | null;
};

function statusBadge(status: string) {
  if (status === "approved") {
    return <Badge className="bg-emerald-600">Approved</Badge>;
  }
  if (status === "rejected") {
    return <Badge variant="destructive">Rejected</Badge>;
  }
  return <Badge variant="secondary">Pending</Badge>;
}

export default async function TreasurerContributionExpenseGroupPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { group } = await params;
  const groupName = decodeURIComponent(group);

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return <div className="p-6 text-sm text-muted-foreground">Supabase is not configured.</div>;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const dormId = await getActiveDormId();
  if (!dormId) {
    return <div className="p-6 text-sm text-muted-foreground">No active dorm selected.</div>;
  }

  const { data: memberships } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  const roles = memberships?.map((membership) => membership.role) ?? [];
  const canReview = roles.some((role) => new Set(["admin", "treasurer"]).has(role));
  if (!canReview) {
    return <div className="p-6 text-sm text-muted-foreground">You do not have access to this page.</div>;
  }

  const result = await getExpenses(dormId, { category: "contributions" });
  if ("error" in result) {
    return <div className="p-6 text-sm text-destructive">{result.error}</div>;
  }

  const rows = ((result.data ?? []) as ExpenseRow[]).filter(
    (row) => !(row.transparency_notes ?? "").includes(TREASURER_MANUAL_EXPENSE_MARKER)
  );
  const groupRows = rows.filter(
    (row) => (row.expense_group_title?.trim() || row.title) === groupName
  );

  if (!groupRows.length) {
    notFound();
  }

  const totalAmount = groupRows.reduce((sum, row) => sum + Number(row.amount_pesos ?? 0), 0);
  const approvedAmount = groupRows
    .filter((row) => row.status === "approved")
    .reduce((sum, row) => sum + Number(row.amount_pesos ?? 0), 0);
  const pendingAmount = groupRows
    .filter((row) => row.status === "pending")
    .reduce((sum, row) => sum + Number(row.amount_pesos ?? 0), 0);

  const linkedContribution =
    groupRows
      .map((row) => row.contribution_reference_title?.trim() || "")
      .find((value) => value.length > 0) || "";

  const latestPurchase = groupRows
    .map((row) => row.purchased_at)
    .sort()
    .at(-1);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{groupName}</h1>
          <p className="text-sm text-muted-foreground">
            {linkedContribution ? `Linked contribution: ${linkedContribution}` : "No linked contribution title"}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">

          <Button asChild variant="outline">
            <Link href="/treasurer/contribution-expenses">Back to Groups</Link>
          </Button>
          <SubmitExpenseDialog
            dormId={dormId}
            defaultCategory="contributions"
            defaultGroupTitle={groupName}
            defaultContributionTitle={linkedContribution}
            triggerLabel="Add Expense Item"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{groupRows.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">₱{totalAmount.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-emerald-600">₱{approvedAmount.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-amber-600">₱{pendingAmount.toFixed(2)}</div>
            {latestPurchase ? (
              <p className="text-xs text-muted-foreground">Latest: {format(new Date(latestPurchase), "MMM d, yyyy")}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3 md:hidden">
        {groupRows.map((row) => (
          <Card key={row.id}>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{row.title}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(row.purchased_at), "MMM d, yyyy")}</p>
                </div>
                {statusBadge(row.status)}
              </div>
              <p className="text-sm font-medium">₱{Number(row.amount_pesos).toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{row.vendor_name || "Vendor not provided"}</p>
              {row.status === "pending" ? (
                <ReviewExpenseDialog
                  dormId={dormId}
                  expense={{ ...row, amount_pesos: Number(row.amount_pesos) }}
                />
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="hidden rounded-md border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Unit Cost</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>OR/Invoice</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupRows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="font-medium">{row.title}</div>
                  <div className="text-xs text-muted-foreground">{row.purchased_by || "Purchased by not set"}</div>
                </TableCell>
                <TableCell>{format(new Date(row.purchased_at), "MMM d, yyyy")}</TableCell>
                <TableCell>{row.vendor_name || "—"}</TableCell>
                <TableCell className="text-right">{row.quantity ? Number(row.quantity).toFixed(2) : "—"}</TableCell>
                <TableCell className="text-right">{row.unit_cost_pesos ? `₱${Number(row.unit_cost_pesos).toFixed(2)}` : "—"}</TableCell>
                <TableCell className="text-right font-medium">₱{Number(row.amount_pesos).toFixed(2)}</TableCell>
                <TableCell>{row.official_receipt_no || "—"}</TableCell>
                <TableCell>{statusBadge(row.status)}</TableCell>
                <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
                  {row.transparency_notes || row.description || "—"}
                </TableCell>
                <TableCell className="text-right">
                  {row.status === "pending" ? (
                    <ReviewExpenseDialog
                      dormId={dormId}
                      expense={{ ...row, amount_pesos: Number(row.amount_pesos) }}
                    />
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
