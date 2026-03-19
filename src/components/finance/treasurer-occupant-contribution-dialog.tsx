"use client";

import { ContributionBatchPaymentDialog } from "@/components/finance/contribution-batch-payment-dialog";
import { ContributionPayableOverrideDialog } from "@/components/finance/contribution-payable-override-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type UnpaidContributionSummary = {
  id: string;
  title: string;
  details: string | null;
  eventTitle: string | null;
  deadline: string | null;
  payable: number;
  paid: number;
  remaining: number;
  isStore: boolean;
  storeItems: unknown[];
};

function formatPesos(value: number) {
  return `₱${Number(value || 0).toFixed(2)}`;
}

export function TreasurerOccupantContributionDialog({
  dormId,
  occupantId,
  occupantName,
  studentId,
  roomCode,
  payable,
  contributions,
}: {
  dormId: string;
  occupantId: string;
  occupantName: string;
  studentId?: string | null;
  roomCode?: string | null;
  payable: number;
  contributions: UnpaidContributionSummary[];
}) {
  const contributionOptions = contributions.map((contribution) => ({
    id: contribution.id,
    title: contribution.title,
    remaining: contribution.remaining,
    receiptSignature: null,
    receiptSubject: null,
    receiptMessage: null,
    receiptLogoUrl: null,
    isStore: contribution.isStore,
    storeItems: contribution.storeItems,
  }));

  const contributionRemaining = Object.fromEntries(
    contributions.map((contribution) => [`${occupantId}:${contribution.id}`, contribution.remaining])
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <TableRow
          data-testid="treasurer-occupant-unpaid-trigger"
          aria-label={`Open unpaid contributions for ${occupantName}`}
          tabIndex={0}
          role="button"
          className={cn(
            "border-b-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 hover:bg-sky-500/5 dark:hover:bg-sky-400/10"
          )}
        >
          <TableCell className="py-2">
            <p className="text-sm font-medium leading-tight">{occupantName}</p>
            {studentId ? <p className="text-xs text-muted-foreground">{studentId}</p> : null}
          </TableCell>
          <TableCell className="py-2 text-right">
            <span className="text-sm font-medium text-destructive">{formatPesos(payable)}</span>
          </TableCell>
        </TableRow>
      </DialogTrigger>
      <DialogContent className="max-h-[78vh] overflow-y-auto sm:max-w-xl" showCloseButton={false}>
        <DialogHeader className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <DialogTitle className="text-xl font-semibold">{occupantName}</DialogTitle>
              <DialogDescription className="text-sm">
                {studentId ? `${studentId} • ` : ""}
                {roomCode ? `Room ${roomCode} • ` : ""}
                Unpaid contributions for this semester.
              </DialogDescription>
            </div>

            {contributions.length > 0 ? (
              <ContributionBatchPaymentDialog
                dormId={dormId}
                contributions={contributionOptions}
                occupants={[{ id: occupantId, fullName: occupantName, studentId }]}
                occupantContributionRemaining={contributionRemaining}
                prefilledOccupantId={occupantId}
                lockOccupant
                triggerText="Record Payment"
                triggerVariant="default"
                triggerClassName="w-full sm:w-auto"
              />
            ) : null}
          </div>
        </DialogHeader>

        {contributions.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            This occupant has no unpaid contribution items right now.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Contribution</TableHead>
                  <TableHead className="text-right">Payable</TableHead>
                  <TableHead className="w-[150px] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contributions.map((contribution) => (
                  <TableRow key={contribution.id}>
                    <TableCell className="font-medium whitespace-normal">{contribution.title}</TableCell>
                    <TableCell className="text-right font-medium text-destructive">
                      {formatPesos(contribution.remaining)}
                    </TableCell>
                    <TableCell className="text-right">
                      <ContributionPayableOverrideDialog
                        dormId={dormId}
                        contributionId={contribution.id}
                        occupantId={occupantId}
                        currentPayable={contribution.payable}
                        variant="outline"
                        className="min-w-36"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter showCloseButton className="pt-2" />
      </DialogContent>
    </Dialog>
  );
}
