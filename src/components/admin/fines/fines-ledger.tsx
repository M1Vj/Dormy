"use client";

import Link from "next/link";
import { useActionState } from "react";

import { voidFine } from "@/app/actions/fines";
import {
  IssueFineDialog,
  type FineRuleOption,
  type OccupantOption,
} from "@/components/admin/fines/issue-fine-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

type RoomRef = {
  code?: string | null;
};

type RoomAssignment = {
  room?: RoomRef | RoomRef[] | null;
};

type FineOccupant = {
  full_name?: string | null;
  room_assignments?: RoomAssignment[] | RoomAssignment | null;
};

type FineRuleRef = {
  title?: string | null;
  severity?: string | null;
};

type FineIssuer = {
  display_name?: string | null;
};

export type FineRow = {
  id: string;
  pesos?: number | string | null;
  points?: number | string | null;
  note?: string | null;
  issued_at?: string | null;
  created_at?: string | null;
  voided_at?: string | null;
  void_reason?: string | null;
  occupant?: FineOccupant | FineOccupant[] | null;
  rule?: FineRuleRef | FineRuleRef[] | null;
  issuer?: FineIssuer | FineIssuer[] | null;
};

type FinesLedgerProps = {
  dormId: string;
  fines: FineRow[];
  rules: FineRuleOption[];
  occupants: OccupantOption[];
  role?: string;
  filters?: {
    search?: string;
    status?: string;
  };
};

const initialState = { error: "", success: false };

const formatNumber = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return "0";
  const parsed = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(parsed)) return "0";
  return new Intl.NumberFormat("en-US").format(parsed);
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
};

const getFirst = <T,>(value?: T | T[] | null) =>
  Array.isArray(value) ? value[0] : value;

const getOccupantName = (occupant?: FineOccupant | FineOccupant[] | null) => {
  const occupantRef = getFirst(occupant);
  return occupantRef?.full_name?.trim() || "Unknown occupant";
};

const getRoomCode = (occupant?: FineOccupant | FineOccupant[] | null) => {
  const occupantRef = getFirst(occupant);
  const assignment = getFirst(occupantRef?.room_assignments ?? null);
  const roomRef = getFirst(assignment?.room ?? null);
  return roomRef?.code ?? null;
};

const getRuleLabel = (rule?: FineRuleRef | FineRuleRef[] | null) => {
  const ruleRef = getFirst(rule);
  if (!ruleRef?.title) return "Custom fine";
  const severity = ruleRef.severity ? ` (${ruleRef.severity})` : "";
  return `${ruleRef.title}${severity}`;
};

const getIssuerName = (issuer?: FineIssuer | FineIssuer[] | null) => {
  const issuerRef = getFirst(issuer);
  return issuerRef?.display_name?.trim() || "-";
};

function VoidFineDialog({
  dormId,
  fineId,
  buttonClassName,
}: {
  dormId: string;
  fineId: string;
  buttonClassName?: string;
}) {
  const [state, formAction, isPending] = useActionState(
    async (previousState: typeof initialState, formData: FormData) => {
      const reason = formData.get("reason");
      if (!reason || typeof reason !== "string" || !reason.trim()) {
        return { error: "Provide a reason for voiding.", success: false };
      }
      const result = await voidFine(dormId, fineId, reason.trim());
      if (result?.error) {
        return { error: result.error, success: false };
      }
      return { error: "", success: true };
    },
    initialState
  );

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button size="sm" variant="destructive" className={buttonClassName}>
          Void
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Void fine</SheetTitle>
          <SheetDescription>
            Provide a reason before voiding this fine.
          </SheetDescription>
        </SheetHeader>
        <form action={formAction} className="space-y-4 py-6">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`void-${fineId}`}>
              Reason
            </label>
            <Textarea id={`void-${fineId}`} name="reason" required />
          </div>
          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          {state.success ? (
            <p className="text-sm text-primary">Fine voided.</p>
          ) : null}
          <SheetFooter>
            <Button type="submit" isLoading={isPending}>
              Void fine
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function FinesLedger({
  dormId,
  fines,
  rules,
  occupants,
  role = "admin",
  filters,
}: FinesLedgerProps) {
  const hasFilters = Boolean(filters?.search) || Boolean(filters?.status);

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Fines ledger</CardTitle>
            <p className="text-sm text-muted-foreground">
              Review fines, issue new penalties, and void entries.
            </p>
          </div>
          <IssueFineDialog dormId={dormId} rules={rules} occupants={occupants} />
        </div>
        <form className="grid gap-2 sm:grid-cols-[1fr_170px_auto_auto] sm:items-center" method="GET">
          <Input
            name="search"
            placeholder="Search occupant, rule, or note"
            defaultValue={filters?.search ?? ""}
          />
          <select
            name="status"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            defaultValue={filters?.status ?? ""}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="voided">Voided</option>
          </select>
          <Button type="submit" variant="secondary" size="sm">
            Filter
          </Button>
          {hasFilters ? (
            <Button asChild type="button" variant="ghost" size="sm">
              <Link href={`/${role}/fines`}>Reset</Link>
            </Button>
          ) : null}
        </form>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 md:hidden">
          {fines.length === 0 ? (
            <div className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
              No fines issued yet.
            </div>
          ) : (
            fines.map((fine) => {
              const roomCode = getRoomCode(fine.occupant);
              const issuedAt = fine.issued_at ?? fine.created_at;
              const isVoided = Boolean(fine.voided_at);

              return (
                <div key={fine.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{getOccupantName(fine.occupant)}</p>
                      <p className="text-xs text-muted-foreground">
                        {roomCode ? `Room ${roomCode}` : "No room"}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${isVoided
                          ? "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-400"
                          : "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        }`}
                    >
                      {isVoided ? "Voided" : "Active"}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1 text-xs">
                    <p>
                      <span className="text-muted-foreground">Rule:</span>{" "}
                      {getRuleLabel(fine.rule)}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Amount:</span>{" "}
                      {formatNumber(fine.pesos)} pesos · {formatNumber(fine.points)} points
                    </p>
                    <p>
                      <span className="text-muted-foreground">Issued:</span>{" "}
                      {formatDate(issuedAt)} · {getIssuerName(fine.issuer)}
                    </p>
                    {fine.note ? (
                      <p>
                        <span className="text-muted-foreground">Note:</span>{" "}
                        {fine.note}
                      </p>
                    ) : null}
                    {isVoided && fine.void_reason ? (
                      <p>
                        <span className="text-muted-foreground">Void reason:</span>{" "}
                        {fine.void_reason}
                      </p>
                    ) : null}
                  </div>
                  <div className="mt-3">
                    {isVoided ? (
                      <Button size="sm" variant="ghost" disabled className="w-full">
                        Voided
                      </Button>
                    ) : (
                      <VoidFineDialog dormId={dormId} fineId={fine.id} buttonClassName="w-full" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className="px-3 py-2 font-medium">Occupant</th>
                <th className="px-3 py-2 font-medium">Rule</th>
                <th className="px-3 py-2 font-medium">Amounts</th>
                <th className="px-3 py-2 font-medium">Issued</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {fines.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-sm text-muted-foreground"
                  >
                    No fines issued yet.
                  </td>
                </tr>
              ) : (
                fines.map((fine) => {
                  const roomCode = getRoomCode(fine.occupant);
                  const issuedAt = fine.issued_at ?? fine.created_at;
                  const isVoided = Boolean(fine.voided_at);

                  return (
                    <tr key={fine.id} className="border-b">
                      <td className="px-3 py-2">
                        <div className="font-medium">
                          {getOccupantName(fine.occupant)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {roomCode ? `Room ${roomCode}` : "No room"}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">
                          {getRuleLabel(fine.rule)}
                        </div>
                        {fine.note ? (
                          <div className="text-xs text-muted-foreground">
                            {fine.note}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">
                          {formatNumber(fine.pesos)} pesos
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatNumber(fine.points)} points
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">
                          {formatDate(issuedAt)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {getIssuerName(fine.issuer)}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${isVoided
                              ? "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-400"
                              : "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            }`}
                        >
                          {isVoided ? "Voided" : "Active"}
                        </span>
                        {isVoided && fine.void_reason ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {fine.void_reason}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {isVoided ? (
                          <Button size="sm" variant="ghost" disabled>
                            Voided
                          </Button>
                        ) : (
                          <VoidFineDialog dormId={dormId} fineId={fine.id} />
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
