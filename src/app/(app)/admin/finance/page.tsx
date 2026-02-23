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

  const [{ data: memberships }, { data: dormData }] = await Promise.all([
    supabase.from("dorm_memberships").select("role").eq("dorm_id", dormId).eq("user_id", user.id),
    supabase.from("dorms").select("attributes").eq("id", dormId).single()
  ])

  const roles = memberships?.map(m => m.role) ?? []
  const dormAttributes = typeof dormData?.attributes === "object" && dormData?.attributes !== null ? dormData.attributes : {}
  const allowTreasurerMaintenance = dormAttributes.treasurer_maintenance_access === true

  const canViewMaintenance = roles.some(r => new Set(["admin", "adviser", "student_assistant"]).has(r)) ||
    (allowTreasurerMaintenance && roles.some(r => new Set(["treasurer", "officer"]).has(r)))
  const canViewEvents = roles.some(r => new Set(["admin", "treasurer"]).has(r))
  const canViewExpenses = roles.some(r => new Set(["admin", "treasurer", "officer", "adviser"]).has(r))

  const primaryRole = roles.includes("admin") ? "admin" : roles[0] || "occupant";

  return (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
      {canViewMaintenance && (
        <Link href={`/${primaryRole}/finance/maintenance`} className="block outline-none focus:ring-2 focus:ring-primary rounded-xl">
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
        <Link href={`/${primaryRole}/finance/events`} className="block outline-none focus:ring-2 focus:ring-primary rounded-xl">
          <Card className="hover:bg-muted/50 transition-colors h-full">
            <CardHeader>
              <Calendar className="h-8 w-8 text-orange-500 mb-2" />
              <CardTitle>Contributions</CardTitle>
              <CardDescription>Track contribution budgeting and ledgers</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      )}

      {canViewExpenses && (
        <Link href={`/${primaryRole}/finance/expenses`} className="block outline-none focus:ring-2 focus:ring-primary rounded-xl">
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
