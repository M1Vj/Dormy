import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Receipt, Wallet, ArrowRight, TrendingUp } from "lucide-react";
import Link from "next/link";

interface TreasurerDashboardProps {
  totalCharged: number;
  totalPaid: number;
  pendingExpenses: number;
  role: string;
}

export function TreasurerDashboard({ 
  totalCharged, 
  totalPaid, 
  pendingExpenses,
  role 
}: TreasurerDashboardProps) {
  const collectionRate = totalCharged > 0 ? (totalPaid / totalCharged) * 100 : 0;
  const formatPesos = (val: number) => `₱${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            Collection Progress
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardTitle>
          <CardDescription>Overall payment collection for this semester</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{formatPesos(totalPaid)} / {formatPesos(totalCharged)}</span>
            <span className="font-medium">{collectionRate.toFixed(1)}%</span>
          </div>
          <Progress value={collectionRate} className="h-2 bg-muted [&>div]:bg-emerald-500" />
          <div className="flex gap-2">
            <Button asChild size="sm" className="w-full">
              <Link href={`/${role}/finance/events`}>
                <Receipt className="mr-2 h-4 w-4" />
                Contributions
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href={`/${role}/payments`}>
                <Wallet className="mr-2 h-4 w-4" />
                Record
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className={pendingExpenses > 0 ? "border-rose-500/50 bg-rose-500/5" : ""}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            Expense Requests
            {pendingExpenses > 0 && (
              <span className="flex h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
            )}
          </CardTitle>
          <CardDescription>Submitted receipts awaiting your review</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${pendingExpenses > 0 ? "bg-rose-500/20 text-rose-600" : "bg-muted text-muted-foreground"}`}>
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">{pendingExpenses}</div>
              <p className="text-xs text-muted-foreground italic">Pending approval</p>
            </div>
          </div>
          <Button asChild variant={pendingExpenses > 0 ? "default" : "secondary"} size="sm" className="w-full">
            <Link href={`/${role}/finance/expenses`}>
              Audit Expenses
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
