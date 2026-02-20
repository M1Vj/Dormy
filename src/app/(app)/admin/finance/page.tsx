import Link from "next/link"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Wrench, Calendar, Receipt } from "lucide-react"

export default function FinanceDashboard() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
      <Link href="/admin/finance/maintenance" className="block outline-none focus:ring-2 focus:ring-primary rounded-xl">
        <Card className="hover:bg-muted/50 transition-colors h-full">
          <CardHeader>
            <Wrench className="h-8 w-8 text-blue-500 mb-2" />
            <CardTitle>Maintenance</CardTitle>
            <CardDescription>Manage maintenance ledgers and funds</CardDescription>
          </CardHeader>
        </Card>
      </Link>

      <Link href="/admin/finance/events" className="block outline-none focus:ring-2 focus:ring-primary rounded-xl">
        <Card className="hover:bg-muted/50 transition-colors h-full">
          <CardHeader>
            <Calendar className="h-8 w-8 text-orange-500 mb-2" />
            <CardTitle>Events</CardTitle>
            <CardDescription>Track events budgeting and ledgers</CardDescription>
          </CardHeader>
        </Card>
      </Link>

      <Link href="/admin/finance/expenses" className="block outline-none focus:ring-2 focus:ring-primary rounded-xl">
        <Card className="hover:bg-muted/50 transition-colors h-full">
          <CardHeader>
            <Receipt className="h-8 w-8 text-green-500 mb-2" />
            <CardTitle>Expenses</CardTitle>
            <CardDescription>View all dorm expenses and receipts</CardDescription>
          </CardHeader>
        </Card>
      </Link>
    </div>
  )
}
