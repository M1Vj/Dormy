import Link from "next/link";
import { CalendarDays, Receipt, Wrench } from "lucide-react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function StudentAssistantFinanceHubPage() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Link href="/student_assistant/finance/contributions" className="block rounded-xl outline-none focus:ring-2 focus:ring-primary">
        <Card className="h-full transition-colors hover:bg-muted/50">
          <CardHeader>
            <CalendarDays className="mb-2 h-8 w-8 text-orange-500" />
            <CardTitle>Contributions</CardTitle>
            <CardDescription>Dorm-wide contribution totals for resident visibility and coordination.</CardDescription>
          </CardHeader>
        </Card>
      </Link>

      <Link href="/student_assistant/finance/maintenance" className="block rounded-xl outline-none focus:ring-2 focus:ring-primary">
        <Card className="h-full transition-colors hover:bg-muted/50">
          <CardHeader>
            <Wrench className="mb-2 h-8 w-8 text-blue-500" />
            <CardTitle>Maintenance Fee</CardTitle>
            <CardDescription>Handle maintenance charges, collections, and maintenance expense records.</CardDescription>
          </CardHeader>
        </Card>
      </Link>

      <Link href="/student_assistant/finance/expenses" className="block rounded-xl outline-none focus:ring-2 focus:ring-primary">
        <Card className="h-full transition-colors hover:bg-muted/50">
          <CardHeader>
            <Receipt className="mb-2 h-8 w-8 text-green-500" />
            <CardTitle>Committee Funds</CardTitle>
            <CardDescription>Track committee and dorm expense submissions and review queues.</CardDescription>
          </CardHeader>
        </Card>
      </Link>
    </div>
  );
}
