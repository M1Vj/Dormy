"use server";

import { getPublicContributionSummaryAction } from "@/app/actions/finance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

import { ShieldCheck, Users, Banknote } from "lucide-react";
import { notFound } from "next/navigation";

export default async function PublicContributionPage({
  params,
}: {
  params: { token: string };
}) {
  const result = await getPublicContributionSummaryAction(params.token);

  if (!result.success || !result.summary) {
    notFound();
  }

  const { title, total_amount, participant_count, dorm_name } = result.summary;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 selection:bg-indigo-500/30">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(79,70,229,0.1),transparent)]" />

      <div className="w-full max-w-md relative animate-in fade-in zoom-in duration-700">
        <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-xl shadow-2xl overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />

          <CardHeader className="text-center pb-2">
            <div className="flex justify-center mb-4">
              <div className="bg-indigo-500/10 p-3 rounded-2xl ring-1 ring-indigo-500/20">
                <Banknote className="h-8 w-8 text-indigo-400" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-white tracking-tight">
              {title}
            </CardTitle>
            <p className="text-slate-400 text-sm font-medium">
              Contribution Summary • {dorm_name}
            </p>
          </CardHeader>

          <CardContent className="space-y-8 pt-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50 text-center space-y-1">
                <div className="flex justify-center mb-1">
                  <Banknote className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-white">
                  ₱{total_amount.toLocaleString()}
                </div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                  Total Collected
                </div>
              </div>

              <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50 text-center space-y-1">
                <div className="flex justify-center mb-1">
                  <Users className="h-4 w-4 text-indigo-400" />
                </div>
                <div className="text-2xl font-bold text-white">
                  {participant_count}
                </div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                  Dormers Paid
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <div className="text-sm font-medium text-slate-300">Collection Progress</div>
                <div className="text-xs text-slate-500 font-mono">Live Update</div>
              </div>
              <Progress value={100} className="h-2 bg-slate-800" />
              <p className="text-[11px] text-slate-500 leading-relaxed text-center italic">
                This summary shows aggregated totals only. No individual contributor details are exposed to protect privacy.
              </p>
            </div>

            <div className="pt-4 flex justify-center">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 rounded-full border border-emerald-500/20 shadow-sm shadow-emerald-500/5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">
                  Verified by Dormy System
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="mt-8 text-center text-slate-600 text-xs font-medium">
          &copy; {new Date().getFullYear()} Dormy Management System
        </p>
      </div>
    </div>
  );
}
