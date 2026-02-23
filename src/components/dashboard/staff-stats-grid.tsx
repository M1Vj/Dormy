import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardStats } from "@/app/actions/stats";
import { format } from "date-fns";
import { 
  Users, 
  Wallet, 
  Receipt, 
  FileText, 
  CalendarDays,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  Clock
} from "lucide-react";

interface StaffStatsGridProps {
  stats: DashboardStats;
}

export function StaffStatsGrid({ stats }: StaffStatsGridProps) {
  const formatPesos = (val: number) => `₱${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Cash on Hand</CardTitle>
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatPesos(stats.cashOnHand)}</div>
          <p className="text-xs text-muted-foreground">
            Total collections minus approved expenses
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Occupants</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalOccupants}</div>
          <div className="flex items-center pt-1 text-xs text-muted-foreground">
            <span className="text-emerald-600 font-medium mr-1">{stats.occupantsCleared}</span> cleared
            <span className="mx-1">/</span>
            <span className="text-rose-600 font-medium mr-1">{stats.occupantsNotCleared}</span> pending
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Collectibles</CardTitle>
          <ArrowUpRight className="h-4 w-4 text-rose-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-rose-600">{formatPesos(stats.totalCollectibles)}</div>
          <p className="text-xs text-muted-foreground">
            Sum of all outstanding balances
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Events</CardTitle>
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalEvents}</div>
          <p className="text-xs text-muted-foreground">
            Events recorded this semester
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
