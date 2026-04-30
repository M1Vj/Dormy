import Link from "next/link";
import { AlertCircle, Smartphone, Wrench } from "lucide-react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function StudentAssistantFinanceHubPage() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Link href="/student_assistant/finance/maintenance" className="block rounded-xl outline-none focus:ring-2 focus:ring-primary">
        <Card className="h-full transition-colors hover:bg-muted/50">
          <CardHeader>
            <Wrench className="mb-2 h-8 w-8 text-blue-500" />
            <CardTitle>Maintenance Fee</CardTitle>
            <CardDescription>Handle maintenance charges, collections, and maintenance expense records.</CardDescription>
          </CardHeader>
        </Card>
      </Link>

      <Link href="/student_assistant/finance/fines" className="block rounded-xl outline-none focus:ring-2 focus:ring-primary">
        <Card className="h-full transition-colors hover:bg-muted/50">
          <CardHeader>
            <AlertCircle className="mb-2 h-8 w-8 text-red-500" />
            <CardTitle>Fines</CardTitle>
            <CardDescription>Collect fine payments, manage charges, and track outstanding balances across occupants.</CardDescription>
          </CardHeader>
        </Card>
      </Link>

      <Link href="/student_assistant/finance/gadgets" className="block rounded-xl outline-none focus:ring-2 focus:ring-primary">
        <Card className="h-full transition-colors hover:bg-muted/50">
          <CardHeader>
            <Smartphone className="mb-2 h-8 w-8 text-indigo-500" />
            <CardTitle>Gadgets</CardTitle>
            <CardDescription>Manage and review the collection loop and transactions for occupant gadgets.</CardDescription>
          </CardHeader>
        </Card>
      </Link>
    </div>
  );
}
