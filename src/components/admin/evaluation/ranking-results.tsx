"use client";

import { useEffect, useState } from "react";
import { getEvaluationSummary } from "@/app/actions/evaluation";
import { EvaluationSummary } from "@/lib/types/evaluation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface Props {
  cycleId: string;
}

export function RankingResults({ cycleId }: Props) {
  const [results, setResults] = useState<EvaluationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await getEvaluationSummary(cycleId);
        setResults(data);
      } catch {
        setError("Failed to load ranking results");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [cycleId]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <div className="text-center py-12 text-destructive">{error}</div>;
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]">Rank</TableHead>
            <TableHead>Occupant</TableHead>
            <TableHead>Peer Score</TableHead>
            <TableHead>SA Score</TableHead>
            <TableHead>Total Fines</TableHead>
            <TableHead className="text-right font-bold">Final Score</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((row, index) => {
            const isTop30 = index < results.length * 0.3;
            return (
              <TableRow key={row.occupant_id} className={isTop30 ? "bg-green-50/50 dark:bg-green-900/10" : ""}>
                <TableCell className="font-bold">{index + 1}</TableCell>
                <TableCell>
                  <div className="font-medium">{row.full_name}</div>
                  {isTop30 && <Badge variant="default" className="text-[10px] h-4 mt-0.5">TOP 30%</Badge>}
                </TableCell>
                <TableCell>{row.peer_score ? Number(row.peer_score).toFixed(2) : "N/A"}</TableCell>
                <TableCell>{Number(row.sa_score).toFixed(2)}</TableCell>
                <TableCell className="text-destructive font-medium">{row.total_fine_points} pts</TableCell>
                <TableCell className="text-right font-bold text-lg">
                  {Number(row.final_score).toFixed(2)}
                </TableCell>
              </TableRow>
            );
          })}
          {results.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                No scores computed yet. Ensure a template is active and has submissions.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <div className="text-xs text-muted-foreground px-2">
        * Final Score = (Weighted Rating Score + SA Score) / 2.
        SA Score = 100 - Fine Points (minimum 0).
      </div>
    </div>
  );
}
