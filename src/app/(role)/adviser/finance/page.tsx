import Link from "next/link";
import { CalendarDays, Receipt, Wrench } from "lucide-react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdviserFinanceHubPage() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Link href="/adviser/contributions" className="block rounded-xl outline-none focus:ring-2 focus:ring-primary">
        <Card className="h-full transition-colors hover:bg-muted/50">
          <CardHeader>
            <CalendarDays className="mb-2 h-8 w-8 text-orange-500" />
            <CardTitle>Contributions</CardTitle>
            <CardDescription>Dorm-wide contribution totals and event-linked collection overview.</CardDescription>
          </CardHeader>
        </Card>
      </Link>

      <Link href="/adviser/finance/maintenance" className="block rounded-xl outline-none focus:ring-2 focus:ring-primary">
        <Card className="h-full transition-colors hover:bg-muted/50">
          <CardHeader>
            <Wrench className="mb-2 h-8 w-8 text-blue-500" />
            <CardTitle>Maintenance Fee</CardTitle>
            <CardDescription>Manage maintenance charges, collections, and maintenance expenses.</CardDescription>
          </CardHeader>
        </Card>
      </Link>

      <Link href="/adviser/finance/expenses" className="block rounded-xl outline-none focus:ring-2 focus:ring-primary">
        <Card className="h-full transition-colors hover:bg-muted/50">
          <CardHeader>
            <Receipt className="mb-2 h-8 w-8 text-green-500" />
            <CardTitle>Committee Funds</CardTitle>
            <CardDescription>Review dorm and committee expense submissions and approvals.</CardDescription>
          </CardHeader>
        </Card>
      </Link>
    </div>
  );
}
