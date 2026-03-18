"use client";

import { ReceiptText } from "lucide-react";

import { ContributionBatchPaymentDialog } from "@/components/finance/contribution-batch-payment-dialog";
import { ContributionPayableOverrideDialog } from "@/components/finance/contribution-payable-override-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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

function formatDeadline(value: string | null) {
  if (!value) {
    return "No deadline";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "No deadline";
  }

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function TreasurerOccupantContributionDialog({
  dormId,
  occupantId,
  occupantName,
  studentId,
  roomCode,
  contributions,
  triggerClassName,
}: {
  dormId: string;
  occupantId: string;
  occupantName: string;
  studentId?: string | null;
  roomCode?: string | null;
  contributions: UnpaidContributionSummary[];
  triggerClassName?: string;
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
        <Button
          type="button"
          variant="ghost"
          data-testid="treasurer-occupant-unpaid-trigger"
          aria-label={`Open unpaid contributions for ${occupantName}`}
          className={triggerClassName}
        >
          <span className="truncate">{occupantName}</span>
          {studentId ? <span className="block text-xs text-muted-foreground">{studentId}</span> : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl bg-white/95 dark:bg-card/95 backdrop-blur-xl border-muted/50 shadow-2xl">
        <DialogHeader className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <DialogTitle className="text-xl font-semibold">{occupantName} Unpaid Contributions</DialogTitle>
              <DialogDescription className="text-sm">
                Review remaining contribution balances for this occupant and take payment or payable actions without leaving the room overview.
              </DialogDescription>
              <div className="flex flex-wrap items-center gap-2">
                {roomCode ? <Badge variant="outline">Room {roomCode}</Badge> : null}
                {studentId ? <Badge variant="secondary">{studentId}</Badge> : null}
                <Badge variant="destructive">{contributions.length} unpaid item{contributions.length === 1 ? "" : "s"}</Badge>
              </div>
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
          <div className="space-y-3">
            {contributions.map((contribution) => (
              <div key={contribution.id} className="rounded-xl border border-border/50 bg-background/70 p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <ReceiptText className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">{contribution.title}</p>
                    </div>
                    {contribution.details ? (
                      <p className="text-sm text-muted-foreground">{contribution.details}</p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {contribution.eventTitle ? <span>{contribution.eventTitle}</span> : null}
                      <span>Deadline: {formatDeadline(contribution.deadline)}</span>
                    </div>
                  </div>

                  <Badge variant="destructive" className="shrink-0">
                    Remaining {formatPesos(contribution.remaining)}
                  </Badge>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border bg-muted/20 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Payable</p>
                    <p className="text-sm font-semibold">{formatPesos(contribution.payable)}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/20 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Paid</p>
                    <p className="text-sm font-semibold text-emerald-600">{formatPesos(contribution.paid)}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/20 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Remaining</p>
                    <p className="text-sm font-semibold text-rose-600">{formatPesos(contribution.remaining)}</p>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <ContributionPayableOverrideDialog
                    dormId={dormId}
                    contributionId={contribution.id}
                    occupantId={occupantId}
                    currentPayable={contribution.payable}
                    variant="outline"
                    className="min-w-40"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
