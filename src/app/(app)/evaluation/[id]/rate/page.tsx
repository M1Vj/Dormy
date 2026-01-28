import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  getEvaluationMetrics,
} from "@/app/actions/evaluation";
import { getActiveDormId } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { RatingForm } from "@/components/evaluation/rating-form";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RateOccupantPage({ params }: Props) {
  const { id: rateeId } = await params;
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

  // 1. Get self rater_id
  const { data: self } = await supabase
    .from("occupants")
    .select("id")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .single();

  if (!self) return <div>Occupant profile not found.</div>;

  // 2. Get active template
  const { data: cycle } = await supabase
    .from("evaluation_cycles")
    .select("id")
    .eq("dorm_id", dormId)
    .eq("is_active", true)
    .single();

  if (!cycle) return <div>No active evaluation cycle.</div>;

  const { data: template } = await supabase
    .from("evaluation_templates")
    .select("id, name")
    .eq("cycle_id", cycle.id)
    .eq("status", "active")
    .single();

  if (!template) return <div>No active evaluation template.</div>;

  // 3. Get ratee info
  const { data: ratee } = await supabase
    .from("occupants")
    .select("id, full_name, classification")
    .eq("id", rateeId)
    .eq("dorm_id", dormId)
    .single();

  if (!ratee) notFound();

  // 4. Check if already rated
  const { data: existing } = await supabase
    .from("evaluation_submissions")
    .select("id")
    .eq("template_id", template.id)
    .eq("rater_occupant_id", self.id)
    .eq("ratee_occupant_id", rateeId)
    .single();

  if (existing) {
    redirect("/evaluation");
  }

  // 5. Get metrics
  const metrics = await getEvaluationMetrics(dormId, template.id);

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/evaluation">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight">Evaluate Mates</h2>
          <p className="text-muted-foreground">
            Rating <strong>{ratee.full_name}</strong> for {template.name}
          </p>
        </div>
      </div>

      <RatingForm
        raterId={self.id}
        rateeId={rateeId}
        templateId={template.id}
        metrics={metrics}
      />
    </div>
  );
}
