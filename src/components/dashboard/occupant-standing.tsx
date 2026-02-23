import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, CheckCircle2, AlertCircle, Calendar, ArrowRight } from "lucide-react";
import Link from "next/link";

interface OccupantStandingProps {
  balance: {
    total: number;
    maintenance: number;
    fines: number;
    events: number;
  };
  isCleared: boolean;
  nextCleaning?: {
    area: string;
    date: string;
  } | null;
  role: string;
}

export function OccupantStanding({ 
  balance, 
  isCleared,
  nextCleaning,
  role 
}: OccupantStandingProps) {
  const formatPesos = (val: number) => `₱${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className={!isCleared ? "border-amber-500/50" : "border-emerald-500/50"}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center justify-between">
            Financial Standing
            {isCleared ? (
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Cleared
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200">
                <AlertCircle className="mr-1 h-3 w-3" />
                Outstanding
              </Badge>
            )}
          </CardTitle>
          <CardDescription>Your current balance across all ledgers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${balance.total > 0 ? "bg-amber-500/20 text-amber-600" : "bg-emerald-500/20 text-emerald-600"}`}>
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <div className="text-2xl font-bold">{formatPesos(balance.total)}</div>
                <p className="text-xs text-muted-foreground">Total Due</p>
              </div>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href={`/${role}/payments`}>
                Pay Now
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
          
          <div className="grid grid-cols-3 gap-2 pt-2 border-t">
            <div className="text-center">
              <div className="text-[10px] uppercase text-muted-foreground">Main</div>
              <div className="text-sm font-semibold">{formatPesos(balance.maintenance)}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] uppercase text-muted-foreground">Fines</div>
              <div className="text-sm font-semibold text-rose-600">{formatPesos(balance.fines)}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] uppercase text-muted-foreground">Events</div>
              <div className="text-sm font-semibold">{formatPesos(balance.events)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            Next Responsibility
            <Calendar className="h-4 w-4 text-sky-500" />
          </CardTitle>
          <CardDescription>Your upcoming duty or appointment</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {nextCleaning ? (
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-sky-500/20 text-sky-600">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold">{nextCleaning.area}</div>
                <p className="text-xs text-muted-foreground italic">Cleaning Duty: {nextCleaning.date}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-muted-foreground italic text-sm">
              <AlertCircle className="h-5 w-5" />
              No cleaning duties assigned for you this week.
            </div>
          )}
          <Button asChild variant="secondary" size="sm" className="w-full">
            <Link href={`/${role}/cleaning`}>
              View Cleaning Plan
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
