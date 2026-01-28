import { format } from "date-fns";
import { ArrowDownLeft, ArrowUpRight, AlertCircle } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface LedgerEntry {
  id: string;
  posted_at: string;
  ledger: string;
  entry_type: string;
  amount_pesos: number;
  note?: string;
  voided_at?: string;
  event?: { title: string };
  fine?: { rule?: { title: string } };
}

interface LedgerTableProps {
  entries: LedgerEntry[];
  showOccupant?: boolean; // If showing entries for multiple occupants (not used yet, planning for future)
}

export function LedgerTable({ entries }: LedgerTableProps) {
  if (!entries || entries.length === 0) {
    return (
      <div className="flex w-full flex-col items-center justify-center py-10 text-muted-foreground">
        <AlertCircle className="mb-2 h-10 w-10 opacity-50" />
        <p>No transactions found.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[120px]">Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="w-[100px]">Type</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => {
            const isPayment = entry.amount_pesos < 0;
            const isVoided = !!entry.voided_at;

            let desc = entry.note || (isPayment ? "Payment" : "Charge");

            // Enrich description
            if (entry.fine) {
              const ruleTitle = entry.fine.rule?.title;
              desc = ruleTitle ? `Fine: ${ruleTitle}` : (entry.note || "Fine Violation");
            }
            if (entry.event) {
              desc = `Event: ${entry.event.title}`;
            }

            if (isVoided) {
              desc += " (Voided)";
            }

            return (
              <TableRow key={entry.id} className={isVoided ? "opacity-50" : ""}>
                <TableCell className="font-medium">
                  {format(new Date(entry.posted_at), "MMM d, yyyy")}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className={isVoided ? "line-through" : ""}>{desc}</span>
                    {entry.note && entry.note !== desc && (
                      <span className="text-xs text-muted-foreground">{entry.note}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge 
                    variant={isPayment ? "default" : "secondary"}
                    className={isPayment ? "bg-green-600 text-white hover:bg-green-700" : ""}
                  >
                    {isPayment ? "Payment" : "Charge"}
                  </Badge>
                </TableCell>
                <TableCell className={`text-right font-medium ${isPayment ? 'text-green-600' : ''} ${isVoided ? 'line-through decoration-red-500' : ''}`}>
                  {isPayment ? (
                    <span className="flex items-center justify-end gap-1">
                      <ArrowDownLeft className="h-3 w-3" />
                      {Math.abs(entry.amount_pesos).toFixed(2)}
                    </span>
                  ) : (
                    <span className="flex items-center justify-end gap-1">
                      {/* Only show up arrow if it's not 0 or negative (which shouldn't happen for logic, but just in case) */}
                      {entry.amount_pesos > 0 && <ArrowUpRight className="h-3 w-3 text-red-500" />}
                      {entry.amount_pesos.toFixed(2)}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
