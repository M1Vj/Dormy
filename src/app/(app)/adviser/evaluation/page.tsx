import Link from "next/link";
import { CheckCircle, Circle, ArrowRight } from "lucide-react";
import { getOccupantsToRate } from "@/app/actions/evaluation";
import { getActiveDormId } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function OccupantEvaluationPage() {
  const dormId = await getActiveDormId();
  if (!dormId) return <div>No active dorm selected.</div>;

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Supabase is not configured for this environment.
      </div>
    );
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <div>Unauthorized</div>;

  const occupants = await getOccupantsToRate(dormId, user.id);

  return (
    <div className="space-y-6 p-8">
      <div className="space-y-1">
        <h2 className="text-3xl font-bold tracking-tight">Peer Evaluation</h2>
        <p className="text-muted-foreground">
          Rate your fellow dorm mates for the current evaluation cycle.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {occupants.map((occupant) => (
          <Card key={occupant.id} className={occupant.is_rated ? "opacity-75" : ""}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{occupant.full_name}</CardTitle>
                {occupant.is_rated ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <CardDescription>{occupant.course ? `Course: ${occupant.course}` : "No course set"}</CardDescription>
            </CardHeader>
            <CardContent>
              {occupant.is_rated ? (
                <div className="flex items-center justify-between">
                  <Badge variant="default">Completed</Badge>
                  <Button variant="ghost" size="sm" disabled>
                    Already Rated
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <Badge variant="outline">Pending</Badge>
                  <Button size="sm" asChild>
                    <Link href={`/adviser/evaluation/${occupant.id}/rate`}>
                      Rate Now <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {occupants.length === 0 && (
          <Card className="col-span-full py-12">
            <CardContent className="text-center text-muted-foreground">
              <p>No active evaluation cycle or no other occupants found.</p>
              <p className="text-sm mt-2">Evaluation is only available when a cycle is marked as ACTIVE.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
