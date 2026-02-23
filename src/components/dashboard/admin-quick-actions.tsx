import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { UserPlus, UserCheck, Clock, ArrowRight } from "lucide-react";
import Link from "next/link";

interface AdminQuickActionsProps {
  dormId: string;
  totalOccupants: number;
  capacity: number;
  pendingApplications: number;
  role: string;
}

export function AdminQuickActions({ 
  dormId, 
  totalOccupants, 
  capacity, 
  pendingApplications,
  role 
}: AdminQuickActionsProps) {
  const occupancyRate = capacity > 0 ? (totalOccupants / capacity) * 100 : 0;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">Occupancy</CardTitle>
          <CardDescription>Current resident capacity utilization</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{totalOccupants} / {capacity} Beds Occupied</span>
            <span className="font-medium">{occupancyRate.toFixed(1)}%</span>
          </div>
          <Progress value={occupancyRate} className="h-2" />
          <div className="flex gap-2">
            <Button asChild size="sm" className="w-full">
              <Link href={`/${role}/occupants`}>
                <UserCheck className="mr-2 h-4 w-4" />
                Manage
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href={`/${role}/occupants/invite`}>
                <UserPlus className="mr-2 h-4 w-4" />
                Invite
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className={pendingApplications > 0 ? "border-amber-500/50 bg-amber-500/5" : ""}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            Applications
            {pendingApplications > 0 && (
              <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            )}
          </CardTitle>
          <CardDescription>Pending requests to join the dorm</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${pendingApplications > 0 ? "bg-amber-500/20 text-amber-600" : "bg-muted text-muted-foreground"}`}>
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">{pendingApplications}</div>
              <p className="text-xs text-muted-foreground italic">Waiting for review</p>
            </div>
          </div>
          <Button asChild variant={pendingApplications > 0 ? "default" : "secondary"} size="sm" className="w-full">
            <Link href={`/${role}/applications`}>
              Review Requests
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
