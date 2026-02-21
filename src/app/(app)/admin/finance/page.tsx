import Link from "next/link"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Wrench, Calendar, Receipt } from "lucide-react"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getActiveDormId } from "@/lib/dorms"

export default async function FinanceDashboard() {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return null

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const dormId = await getActiveDormId()
  if (!dormId) return null

  const [{ data: membership }, { data: dormData }] = await Promise.all([
    supabase.from("dorm_memberships").select("role").eq("dorm_id", dormId).eq("user_id", user.id).maybeSingle(),
    supabase.from("dorms").select("attributes").eq("id", dormId).single()
  ])

  const role = membership?.role ?? ""
  const allowTreasurerMaintenance = dormData?.attributes?.treasurer_maintenance_access === true

  const canViewMaintenance = new Set(["admin", "adviser", "student_assistant"]).has(role) ||
    (allowTreasurerMaintenance && new Set(["treasurer", "officer"]).has(role))
  const canViewEvents = new Set(["admin", "treasurer"]).has(role)
  const canViewExpenses = new Set(["admin", "treasurer", "officer", "adviser"]).has(role)

  return (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
      {canViewMaintenance && (
        <Link href="/admin/finance/maintenance" className="block outline-none focus:ring-2 focus:ring-primary rounded-xl">
          <Card className="hover:bg-muted/50 transition-colors h-full">
            <CardHeader>
              <Wrench className="h-8 w-8 text-blue-500 mb-2" />
              <CardTitle>Maintenance</CardTitle>
              <CardDescription>Manage maintenance ledgers and funds</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      )}

      {canViewEvents && (
        <Link href="/admin/finance/events" className="block outline-none focus:ring-2 focus:ring-primary rounded-xl">
          <Card className="hover:bg-muted/50 transition-colors h-full">
            <CardHeader>
              <Calendar className="h-8 w-8 text-orange-500 mb-2" />
              <CardTitle>Events</CardTitle>
              <CardDescription>Track events budgeting and ledgers</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      )}

      {canViewExpenses && (
        <Link href="/admin/finance/expenses" className="block outline-none focus:ring-2 focus:ring-primary rounded-xl">
          <Card className="hover:bg-muted/50 transition-colors h-full">
            <CardHeader>
              <Receipt className="h-8 w-8 text-green-500 mb-2" />
              <CardTitle>Expenses</CardTitle>
              <CardDescription>View all dorm expenses and receipts</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      )}
    </div>
  )
}
