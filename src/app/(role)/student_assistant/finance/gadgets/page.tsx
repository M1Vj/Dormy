import { redirect } from "next/navigation";

import { getActiveDormId } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getGadgetDisplayName } from "@/lib/gadgets";
import { getDormGadgetFee, getGadgetWorkspaceData } from "@/app/actions/gadgets";
import { CollectionFilters } from "@/components/finance/collection-filters";
import { DeactivateGadgetButton } from "@/components/finance/deactivate-gadget-button";
import { GadgetFeeSettingsCard } from "@/components/finance/gadget-fee-settings-card";
import { OccupantGadgetDialog } from "@/components/finance/occupant-gadget-dialog";
import { PaymentDialog } from "@/components/finance/payment-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata = {
  title: "Gadgets | Dormy",
  description: "Manage gadget fees and transactions.",
};

type SearchParams = {
  search?: string | string[];
  status?: string | string[];
};

const normalizeParam = (value?: string | string[]) => {
  if (Array.isArray(value)) {
    return value.length ? value[0] : undefined;
  }
  return value;
};

function formatPesos(value: number) {
  return `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function StudentAssistantGadgetsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sParams = await searchParams;
  const search = normalizeParam(sParams?.search)?.trim() || "";
  const status = normalizeParam(sParams?.status)?.trim() || "";

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Supabase is not configured for this environment.
      </div>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const activeDormId = await getActiveDormId();
  if (!activeDormId) {
    redirect("/dorm-selection");
  }

  const { data: memberships } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("dorm_id", activeDormId);

  const roles = memberships?.map((membership) => membership.role) ?? [];
  const hasAccess = roles.some((role) => new Set(["admin", "student_assistant", "adviser"]).has(role));
  const canManage = roles.some((role) => new Set(["admin", "student_assistant"]).has(role));

  if (!hasAccess) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You do not have access to this page.
      </div>
    );
  }

  const workspace = await getGadgetWorkspaceData(activeDormId, search);
  if ("error" in workspace) {
    return <div className="p-6 text-sm text-destructive">{workspace.error}</div>;
  }
  const gadgetFee = await getDormGadgetFee(activeDormId);
  if ("error" in gadgetFee) {
    return <div className="p-6 text-sm text-destructive">{gadgetFee.error}</div>;
  }

  const rows = workspace.data.filter((row) => {
    if (!status) return true;
    if (status === "outstanding") return row.current_semester_balance > 0;
    if (status === "cleared") return row.current_semester_balance <= 0;
    return true;
  });

  const occupantOptions = workspace.data.map((row) => ({
    id: row.id,
    full_name: row.full_name,
    student_id: row.student_id,
  }));

  const activeGadgetCount = rows.reduce(
    (sum, row) => sum + row.gadgets.filter((gadget) => gadget.is_active).length,
    0
  );
  const totalCurrentSemesterBalance = rows.reduce(
    (sum, row) => sum + row.current_semester_balance,
    0
  );
  const totalAllTimeBalance = rows.reduce((sum, row) => sum + row.total_balance, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Gadget Ledger</h1>
          <p className="text-sm text-muted-foreground">
            Track occupant gadgets as recurring semester charges that affect payments and clearance.
          </p>
        </div>
        {canManage ? (
          <OccupantGadgetDialog
            dormId={activeDormId}
            occupants={occupantOptions}
            semesterFeePesos={gadgetFee.fee_pesos}
            triggerLabel="Add gadget"
          />
        ) : null}
      </div>

      <CollectionFilters
        key={`${search}:${status}`}
        basePath="/student_assistant/finance/gadgets"
        search={search}
        status={status}
        placeholder="Search occupant, room, or gadget..."
        allLabel="All occupants"
      />

      {workspace.migrationRequired ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {workspace.warning}
        </div>
      ) : null}

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Visible Occupants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{rows.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Gadgets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{activeGadgetCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Current Semester Due</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-amber-600">
              {formatPesos(totalCurrentSemesterBalance)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">All-Time Gadget Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatPesos(totalAllTimeBalance)}</div>
          </CardContent>
        </Card>
      </div>

      <GadgetFeeSettingsCard
        dormId={activeDormId}
        feePesos={gadgetFee.fee_pesos}
        canManage={canManage}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Occupant gadget roster</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 md:hidden">
            {rows.length === 0 ? (
              <div className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
                No occupants match this filter.
              </div>
            ) : (
              rows.map((row) => (
                <div key={row.id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{row.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(row.student_id ?? "No student ID") + (row.roomCode ? ` • Room ${row.roomCode}` : "")}
                      </p>
                    </div>
                    <Badge variant={row.current_semester_balance > 0 ? "secondary" : "outline"}>
                      {formatPesos(row.current_semester_balance)}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {row.gadgets.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No gadgets assigned yet.</p>
                    ) : (
                      row.gadgets.map((gadget) => (
                        <div key={gadget.id} className="rounded-md border border-border/60 bg-muted/10 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium">{getGadgetDisplayName(gadget)}</p>
                              <p className="text-xs text-muted-foreground">
                                Semester fee {formatPesos(gadget.effective_fee_pesos)} • Balance {formatPesos(gadget.total_balance)}
                              </p>
                            </div>
                            <Badge variant={gadget.is_active ? "default" : "outline"}>
                              {gadget.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {canManage ? (
                              <OccupantGadgetDialog
                                dormId={activeDormId}
                                occupants={occupantOptions}
                                gadget={gadget}
                                defaultOccupantId={row.id}
                                semesterFeePesos={gadgetFee.fee_pesos}
                                triggerLabel="Edit"
                              />
                            ) : null}
                            {canManage && gadget.is_active ? (
                              <PaymentDialog
                                dormId={activeDormId}
                                occupantId={row.id}
                                category="gadgets"
                                metadata={{
                                  gadget_id: gadget.id,
                                  gadget_type: gadget.gadget_type,
                                  gadget_label: gadget.gadget_label,
                                }}
                                triggerText="Record payment"
                                triggerVariant="outline"
                              />
                            ) : null}
                            {canManage && gadget.is_active ? (
                              <DeactivateGadgetButton
                                dormId={activeDormId}
                                gadgetId={gadget.id}
                                label={getGadgetDisplayName(gadget)}
                              />
                            ) : null}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Occupant</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead>Assigned Gadgets</TableHead>
                  <TableHead className="text-right">Current Sem</TableHead>
                  <TableHead className="text-right">All-Time</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      No occupants match this filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{row.full_name}</div>
                          <div className="text-xs text-muted-foreground">{row.student_id ?? "No student ID"}</div>
                        </div>
                      </TableCell>
                      <TableCell>{row.roomCode ? `Room ${row.roomCode}` : "Unassigned"}</TableCell>
                      <TableCell>
                        {row.gadgets.length === 0 ? (
                          <span className="text-sm text-muted-foreground">No gadgets assigned</span>
                        ) : (
                          <div className="space-y-2">
                            {row.gadgets.map((gadget) => (
                              <div key={gadget.id} className="rounded-md border border-border/60 bg-muted/10 p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="font-medium">{getGadgetDisplayName(gadget)}</p>
                                    <p className="text-xs text-muted-foreground">
                                      Semester fee {formatPesos(gadget.effective_fee_pesos)} • Balance {formatPesos(gadget.total_balance)}
                                    </p>
                                  </div>
                                  <Badge variant={gadget.is_active ? "default" : "outline"}>
                                    {gadget.is_active ? "Active" : "Inactive"}
                                  </Badge>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {canManage ? (
                                    <OccupantGadgetDialog
                                      dormId={activeDormId}
                                      occupants={occupantOptions}
                                      gadget={gadget}
                                      defaultOccupantId={row.id}
                                      semesterFeePesos={gadgetFee.fee_pesos}
                                      triggerLabel="Edit"
                                    />
                                  ) : null}
                                  {canManage && gadget.is_active ? (
                                    <PaymentDialog
                                      dormId={activeDormId}
                                      occupantId={row.id}
                                      category="gadgets"
                                      metadata={{
                                        gadget_id: gadget.id,
                                        gadget_type: gadget.gadget_type,
                                        gadget_label: gadget.gadget_label,
                                      }}
                                      triggerText="Record payment"
                                      triggerVariant="outline"
                                    />
                                  ) : null}
                                  {canManage && gadget.is_active ? (
                                    <DeactivateGadgetButton
                                      dormId={activeDormId}
                                      gadgetId={gadget.id}
                                      label={getGadgetDisplayName(gadget)}
                                    />
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatPesos(row.current_semester_balance)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatPesos(row.total_balance)}
                      </TableCell>
                      <TableCell className="text-right">
                        {canManage ? (
                          <OccupantGadgetDialog
                            dormId={activeDormId}
                            occupants={occupantOptions}
                            defaultOccupantId={row.id}
                            semesterFeePesos={gadgetFee.fee_pesos}
                            triggerLabel="Add gadget"
                          />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
