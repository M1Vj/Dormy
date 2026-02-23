import { redirect } from "next/navigation";
import { format } from "date-fns";

import { getExpenses } from "@/app/actions/expenses";
import { getActiveDormId } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SubmitExpenseDialog } from "@/components/finance/submit-expense-dialog";
import { ReviewExpenseDialog } from "@/components/finance/review-expense-dialog";

type SearchParams = {
  status?: string | string[];
};

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const statusFilter =
    (Array.isArray(params?.status) ? params.status[0] : params?.status) || "all";

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Supabase is not configured for this environment.
      </div>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const dormId = await getActiveDormId();
  if (!dormId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        No active dorm selected.
      </div>
    );
  }

  const { data: memberships } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  const { data: dormData } = await supabase
    .from("dorms")
    .select("attributes")
    .eq("id", dormId)
    .single();

  const roles = memberships?.map(m => m.role) ?? [];
  const dormAttributes = typeof dormData?.attributes === "object" && dormData?.attributes !== null ? dormData.attributes : {};
  const allowTreasurerMaintenance = dormAttributes.treasurer_maintenance_access === true;
  const canSubmit = roles.some(r => new Set(["admin", "treasurer", "officer"]).has(r));
  const canReview = roles.some(r => new Set(["admin", "treasurer"]).has(r));

  const showMaintenanceTab = roles.some(r => new Set(["admin", "adviser", "student_assistant"]).has(r)) ||
    (allowTreasurerMaintenance && roles.some(r => new Set(["treasurer", "officer"]).has(r)));
  const showContributionsTab = roles.some(r => new Set(["admin", "adviser", "treasurer"]).has(r));

  const canView = showMaintenanceTab || showContributionsTab;

  if (!canView) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You do not have access to this page.
      </div>
    );
  }

  const result = await getExpenses(dormId, { status: statusFilter });
  if ("error" in result) {
    return (
      <div className="p-6 text-sm text-destructive">{result.error}</div>
    );
  }

  const expenses = result.data ?? [];

  const totalApproved = expenses
    .filter((e) => e.status === "approved")
    .reduce((sum, e) => sum + Number(e.amount_pesos), 0);

  const totalPending = expenses
    .filter((e) => e.status === "pending")
    .reduce((sum, e) => sum + Number(e.amount_pesos), 0);


  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Expenses</h1>
          <p className="text-sm text-muted-foreground">
            Track dorm purchases and operating expenses with receipt
            documentation.
          </p>
        </div>
        {canSubmit ? <SubmitExpenseDialog dormId={dormId} /> : null}
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Total Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{expenses.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Approved Amount
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-emerald-600">
              ₱{totalApproved.toFixed(2)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-amber-600">
              ₱{totalPending.toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue={showMaintenanceTab ? "maintenance_fee" : "contributions"} className="space-y-4">
        <TabsList>
          {showMaintenanceTab && <TabsTrigger value="maintenance_fee">Maintenance</TabsTrigger>}
          {showContributionsTab && <TabsTrigger value="contributions">Contributions</TabsTrigger>}
        </TabsList>

        {/* Maintenance Fee Tab */}
        {showMaintenanceTab && (
          <TabsContent value="maintenance_fee" className="space-y-4">
            <ExpenseList
              expenses={expenses.filter(e => e.category === "maintenance_fee")}
              canReview={canReview}
              dormId={dormId}
            />
          </TabsContent>
        )}

        {/* Contributions Tab */}
        {showContributionsTab && (
          <TabsContent value="contributions" className="space-y-4">
            <ExpenseList
              expenses={expenses.filter(e => e.category === "contributions")}
              canReview={canReview}
              dormId={dormId}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ExpenseList({ expenses, canReview, dormId }: { expenses: any[], canReview: boolean, dormId: string }) {
  const statusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return (
          <Badge variant="default" className="bg-emerald-600">
            Approved
          </Badge>
        );
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  return (
    <>
      {/* Mobile Cards */}
      <div className="space-y-3 md:hidden">
        {expenses.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No expenses found.
            </CardContent>
          </Card>
        ) : (
          expenses.map((exp) => (
            <Card key={exp.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{exp.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(
                        new Date(exp.purchased_at),
                        "MMM d, yyyy"
                      )}
                    </p>
                  </div>
                  {statusBadge(exp.status)}
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">
                    ₱{Number(exp.amount_pesos).toFixed(2)}
                  </span>
                  {exp.status === "pending" && canReview ? (
                    <ReviewExpenseDialog dormId={dormId} expense={exp} />
                  ) : (
                    <span className="truncate text-xs text-muted-foreground">
                      {exp.description}
                    </span>
                  )}
                </div>
                {exp.approval_comment ? (
                  <p className="text-xs italic text-muted-foreground">
                    &quot;{exp.approval_comment}&quot;
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden rounded-md border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Receipt</TableHead>
              {canReview ? <TableHead>Review</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.map((exp) => (
              <TableRow key={exp.id}>
                <TableCell className="font-medium">{exp.title}</TableCell>
                <TableCell>
                  {format(new Date(exp.purchased_at), "MMM d, yyyy")}
                </TableCell>
                <TableCell className="text-right font-medium">
                  ₱{Number(exp.amount_pesos).toFixed(2)}
                </TableCell>
                <TableCell>{statusBadge(exp.status)}</TableCell>
                <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                  {exp.description || "—"}
                </TableCell>
                <TableCell>
                  {exp.receipt_storage_path ? (
                    <span className="text-xs text-emerald-600">📎 Yes</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                {canReview ? (
                  <TableCell>
                    {exp.status === "pending" ? (
                      <ReviewExpenseDialog dormId={dormId} expense={exp} />
                    ) : null}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
            {expenses.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canReview ? 7 : 6}
                  className="h-24 text-center text-muted-foreground"
                >
                  No expenses found.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
