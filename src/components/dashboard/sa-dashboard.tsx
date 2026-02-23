import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, ClipboardList, ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";
import Link from "next/link";

interface SaDashboardProps {
  unverifiedFines: number;
  todayCleaningCount: number;
  role: string;
}

export function SaDashboard({ 
  unverifiedFines, 
  todayCleaningCount,
  role 
}: SaDashboardProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className={unverifiedFines > 0 ? "border-rose-500/50 bg-rose-500/5" : ""}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            Fine Verification
            {unverifiedFines > 0 && (
              <Badge variant="destructive" className="h-5 px-1.5 animate-bounce">
                {unverifiedFines}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>Peer reports requiring your verification</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${unverifiedFines > 0 ? "bg-rose-500/20 text-rose-600" : "bg-muted text-muted-foreground"}`}>
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">{unverifiedFines}</div>
              <p className="text-xs text-muted-foreground italic">Reports pending</p>
            </div>
          </div>
          <Button asChild variant={unverifiedFines > 0 ? "default" : "secondary"} size="sm" className="w-full">
            <Link href={`/${role}/fines`}>
              Verify Reports
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            Cleaning Duty
            {todayCleaningCount > 0 ? (
              <Badge variant="secondary" className="bg-lime-100 text-lime-700 hover:bg-lime-100 border-lime-200">
                Today
              </Badge>
            ) : null}
          </CardTitle>
          <CardDescription>Monitor daily cleaning compliance</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-lime-500/20 text-lime-600">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">{todayCleaningCount}</div>
              <p className="text-xs text-muted-foreground italic">Rooms assigned today</p>
            </div>
          </div>
          <Button asChild variant="secondary" size="sm" className="w-full">
            <Link href={`/${role}/cleaning`}>
              Check Status
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
