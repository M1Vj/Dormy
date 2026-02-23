import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Receipt, Star } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";

interface CommitteeWidgetProps {
  committee: {
    id: string;
    name: string;
    role: string;
    finance: any[];
    upcomingEvents: any[];
    pendingExpenses: any[];
  };
  role: string;
}

export function CommitteeWidget({
  committee,
  role
}: CommitteeWidgetProps) {
  const totalCharged = committee.finance.reduce((sum, f) => sum + Number(f.charged_pesos), 0);
  const totalCollected = committee.finance.reduce((sum, f) => sum + Number(f.collected_pesos), 0);
  const collectionRate = totalCharged > 0 ? (totalCollected / totalCharged) * 100 : 0;

  return (
    <Card className="overflow-hidden border-l-4 border-l-orange-500">
      <CardHeader className="bg-muted/30 pb-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              {committee.name}
              <Badge variant="outline" className="capitalize text-[10px] h-5">{committee.role}</Badge>
            </CardTitle>
            <CardDescription>Committee focus and financial health</CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/${role}/committees`}>View Committee</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid divide-y md:grid-cols-3 md:divide-y-0 md:divide-x">
          {/* Finance Section */}
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Receipt className="h-3 w-3" />
              Fund Status
            </div>
            <div className="space-y-1">
              <div className="text-2xl font-bold">₱{totalCollected.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground italic">
                Collected from events
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Collection Progress</span>
                <span>{collectionRate.toFixed(0)}%</span>
              </div>
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500 transition-all"
                  style={{ width: `${collectionRate}%` }}
                />
              </div>
            </div>
          </div>

          {/* Events Section */}
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <CalendarDays className="h-3 w-3" />
              Upcoming Activities
            </div>
            <div className="space-y-2">
              {committee.upcomingEvents.length > 0 ? (
                committee.upcomingEvents.map(event => (
                  <div key={event.id} className="text-sm">
                    <div className="font-medium truncate">{event.title}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {format(new Date(event.starts_at), "MMM d, h:mm a")}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground italic py-2">
                  No activities scheduled.
                </div>
              )}
            </div>
          </div>

          {/* Needs Attention Section */}
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Star className="h-3 w-3" />
              Pending Review
            </div>
            <div className="space-y-2">
              {committee.pendingExpenses.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Expenses</span>
                    <Badge variant="destructive">{committee.pendingExpenses.length}</Badge>
                  </div>
                  <Button asChild size="sm" variant="secondary" className="w-full text-xs h-8">
                    <Link href={`/${role}/finance/expenses`}>Audit Requests</Link>
                  </Button>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground italic py-2">
                  All clear! No pending requests.
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
