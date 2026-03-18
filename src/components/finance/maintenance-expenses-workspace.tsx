import { format } from "date-fns";

import { ReviewExpenseDialog } from "@/components/finance/review-expense-dialog";
import { MaintenanceExpenseDialog } from "@/components/finance/maintenance-expense-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type MaintenanceExpenseRow = {
  id: string;
  title: string;
  amount_pesos: number | string;
  purchased_at: string;
  description: string | null;
  status: "pending" | "approved" | "rejected";
  approval_comment: string | null;
  receipt_storage_path: string | null;
};

function getStatusBadge(status: MaintenanceExpenseRow["status"]) {
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
}

export function MaintenanceExpensesWorkspace({
  dormId,
  expenses,
  canSubmit,
  canReview,
  totalMaintenanceExpenses,
  netMaintenanceFund,
}: {
  dormId: string;
  expenses: MaintenanceExpenseRow[];
  canSubmit: boolean;
  canReview: boolean;
  totalMaintenanceExpenses: number;
  netMaintenanceFund: number;
}) {
  const approvedCount = expenses.filter((expense) => expense.status === "approved").length;
  const pendingCount = expenses.filter((expense) => expense.status === "pending").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Maintenance Expenses</h2>
          <p className="text-sm text-muted-foreground">
            Submit, review, and track expenses deducted from the maintenance fund.
          </p>
        </div>
        {canSubmit ? <MaintenanceExpenseDialog dormId={dormId} /> : null}
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{expenses.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-amber-600">{pendingCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Approved Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{approvedCount}</div>
            <p className="text-xs text-muted-foreground">₱{totalMaintenanceExpenses.toFixed(2)} deducted</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Net Maintenance Fund</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-semibold ${netMaintenanceFund < 0 ? "text-rose-600" : "text-emerald-600"}`}>
              ₱{netMaintenanceFund.toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3 md:hidden">
        {expenses.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No maintenance expenses found.
            </CardContent>
          </Card>
        ) : (
          expenses.map((expense) => (
            <Card key={expense.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{expense.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(expense.purchased_at), "MMM d, yyyy")}
                    </p>
                  </div>
                  {getStatusBadge(expense.status)}
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-rose-600">
                    -₱{Number(expense.amount_pesos).toFixed(2)}
                  </span>
                  {expense.status === "pending" && canReview ? (
                    <ReviewExpenseDialog
                      dormId={dormId}
                      expense={{
                        id: expense.id,
                        title: expense.title,
                        amount_pesos: Number(expense.amount_pesos),
                        receipt_storage_path: expense.receipt_storage_path,
                      }}
                    />
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">{expense.description || "—"}</p>
                {expense.approval_comment ? (
                  <p className="text-xs italic text-muted-foreground">
                    &quot;{expense.approval_comment}&quot;
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))
        )}
      </div>

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
            {expenses.map((expense) => (
              <TableRow key={expense.id}>
                <TableCell className="font-medium">{expense.title}</TableCell>
                <TableCell>{format(new Date(expense.purchased_at), "MMM d, yyyy")}</TableCell>
                <TableCell className="text-right font-medium text-rose-600">
                  -₱{Number(expense.amount_pesos).toFixed(2)}
                </TableCell>
                <TableCell>{getStatusBadge(expense.status)}</TableCell>
                <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">
                  {expense.description || "—"}
                </TableCell>
                <TableCell>
                  {expense.receipt_storage_path ? (
                    <span className="text-xs text-emerald-600">Attached</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                {canReview ? (
                  <TableCell>
                    {expense.status === "pending" ? (
                      <ReviewExpenseDialog
                        dormId={dormId}
                        expense={{
                          id: expense.id,
                          title: expense.title,
                          amount_pesos: Number(expense.amount_pesos),
                          receipt_storage_path: expense.receipt_storage_path,
                        }}
                      />
                    ) : null}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
            {expenses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canReview ? 7 : 6} className="h-24 text-center text-muted-foreground">
                  No maintenance expenses found.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
