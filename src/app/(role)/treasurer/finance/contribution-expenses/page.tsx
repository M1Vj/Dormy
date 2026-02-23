import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";

import { getExpenses } from "@/app/actions/expenses";
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
import { getActiveDormId } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ExpenseRow = {
  id: string;
  title: string;
  amount_pesos: number | string;
  purchased_at: string;
  status: "pending" | "approved" | "rejected";
  expense_group_title: string | null;
  contribution_reference_title: string | null;
};

type GroupSummary = {
  name: string;
  linkedContributionTitles: string[];
  itemCount: number;
  totalAmount: number;
  approvedAmount: number;
  pendingAmount: number;
  latestPurchasedAt: string;
};

export default async function TreasurerContributionExpensesPage() {
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
  if (!roles.some((role) => new Set(["admin", "treasurer"]).has(role))) {
    return <div className="p-6 text-sm text-muted-foreground">You do not have access to this page.</div>;
  }

  const expenseResult = await getExpenses(dormId, { category: "contributions" });
  if ("error" in expenseResult) {
    return <div className="p-6 text-sm text-destructive">{expenseResult.error}</div>;
  }

  const rows = (expenseResult.data ?? []) as ExpenseRow[];

  const groupMap = new Map<string, GroupSummary & { contributionTitleSet: Set<string> }>();
  for (const row of rows) {
    const groupName = row.expense_group_title?.trim() || row.title;

    const existing =
      groupMap.get(groupName) ?? {
        name: groupName,
        linkedContributionTitles: [],
        contributionTitleSet: new Set<string>(),
        itemCount: 0,
        totalAmount: 0,
        approvedAmount: 0,
        pendingAmount: 0,
        latestPurchasedAt: row.purchased_at,
      };

    const amount = Number(row.amount_pesos ?? 0);
    existing.itemCount += 1;
    existing.totalAmount += amount;
    if (row.status === "approved") {
      existing.approvedAmount += amount;
    }
    if (row.status === "pending") {
      existing.pendingAmount += amount;
    }

    if (row.purchased_at > existing.latestPurchasedAt) {
      existing.latestPurchasedAt = row.purchased_at;
    }

    if (row.contribution_reference_title?.trim()) {
      existing.contributionTitleSet.add(row.contribution_reference_title.trim());
    }

    groupMap.set(groupName, existing);
  }

  const groups = Array.from(groupMap.values())
    .map((group) => ({
      name: group.name,
      linkedContributionTitles: Array.from(group.contributionTitleSet),
      itemCount: group.itemCount,
      totalAmount: group.totalAmount,
      approvedAmount: group.approvedAmount,
      pendingAmount: group.pendingAmount,
      latestPurchasedAt: group.latestPurchasedAt,
    }))
    .sort((a, b) => (a.latestPurchasedAt < b.latestPurchasedAt ? 1 : -1));

  const grandTotal = groups.reduce((sum, group) => sum + group.totalAmount, 0);
  const approvedTotal = groups.reduce((sum, group) => sum + group.approvedAmount, 0);
  const pendingTotal = groups.reduce((sum, group) => sum + group.pendingAmount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Contribution Expenses</h1>
          <p className="text-sm text-muted-foreground">
            Group contribution expenses and keep item-level transparency for audits and presentations.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/treasurer/finance/events">Back to Contributions</Link>
          </Button>
          <SubmitExpenseDialog
            dormId={dormId}
            defaultCategory="contributions"
            triggerLabel="Add Grouped Expense"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-white/90 dark:bg-card/90 backdrop-blur-md shadow-md hover:shadow-lg transition-all duration-200 border-muted">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Expense Groups</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{groups.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-white/90 dark:bg-card/90 backdrop-blur-md shadow-md hover:shadow-lg transition-all duration-200 border-muted">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">₱{grandTotal.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card className="bg-white/90 dark:bg-card/90 backdrop-blur-md shadow-md hover:shadow-lg transition-all duration-200 border-muted">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-emerald-600">₱{approvedTotal.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card className="bg-white/90 dark:bg-card/90 backdrop-blur-md shadow-md hover:shadow-lg transition-all duration-200 border-muted">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-amber-600">₱{pendingTotal.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3 md:hidden">
        {groups.length === 0 ? (
          <Card className="bg-white/90 dark:bg-card/90 backdrop-blur-md shadow-sm border-muted">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">No grouped contribution expenses yet.</CardContent>
          </Card>
        ) : (
          groups.map((group) => (
            <Card key={group.name} className="bg-white/90 dark:bg-card/90 backdrop-blur-md shadow-sm hover:shadow-md transition-shadow duration-200 border-muted">
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{group.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {group.linkedContributionTitles.length > 0
                        ? group.linkedContributionTitles.join(", ")
                        : "No linked contribution title"}
                    </p>
                  </div>
                  <Badge variant="secondary">{group.itemCount} items</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Total</span>
                  <span className="font-medium">₱{group.totalAmount.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{format(new Date(group.latestPurchasedAt), "MMM d, yyyy")}</span>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/treasurer/finance/contribution-expenses/${encodeURIComponent(group.name)}`}>Open</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <div className="hidden rounded-lg border border-muted bg-white/90 dark:bg-card/90 backdrop-blur-md md:block shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border/50">
              <TableHead className="font-semibold text-foreground">Group</TableHead>
              <TableHead className="font-semibold text-foreground">Linked Contribution</TableHead>
              <TableHead className="text-right font-semibold text-foreground">Items</TableHead>
              <TableHead className="text-right font-semibold text-foreground">Total</TableHead>
              <TableHead className="text-right font-semibold text-foreground">Approved</TableHead>
              <TableHead className="text-right font-semibold text-foreground">Pending</TableHead>
              <TableHead className="font-semibold text-foreground">Last Purchase</TableHead>
              <TableHead className="text-right font-semibold text-foreground">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => (
              <TableRow key={group.name} className="border-border/50 hover:bg-muted/30 transition-colors">
                <TableCell className="font-medium">{group.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {group.linkedContributionTitles.length > 0 ? group.linkedContributionTitles.join(", ") : "—"}
                </TableCell>
                <TableCell className="text-right">{group.itemCount}</TableCell>
                <TableCell className="text-right">₱{group.totalAmount.toFixed(2)}</TableCell>
                <TableCell className="text-right text-emerald-600">₱{group.approvedAmount.toFixed(2)}</TableCell>
                <TableCell className="text-right text-amber-600">₱{group.pendingAmount.toFixed(2)}</TableCell>
                <TableCell>{format(new Date(group.latestPurchasedAt), "MMM d, yyyy")}</TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/treasurer/finance/contribution-expenses/${encodeURIComponent(group.name)}`}>Open</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {groups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  No grouped contribution expenses yet.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
