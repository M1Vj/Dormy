import { getGadgetDisplayName } from "@/lib/gadgets";
import { DeactivateGadgetButton } from "@/components/finance/deactivate-gadget-button";
import { OccupantGadgetDialog } from "@/components/finance/occupant-gadget-dialog";
import { PaymentDialog } from "@/components/finance/payment-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function formatPesos(value: number) {
  return `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function OccupantGadgetsCard({
  dormId,
  occupant,
  canManage,
  semesterFeePesos,
  warning,
}: {
  dormId: string;
  occupant: {
    id: string;
    full_name: string;
    student_id: string | null;
    current_semester_balance: number;
    total_balance: number;
    gadgets: Array<{
      id: string;
      occupant_id: string;
      gadget_type: string;
      gadget_label: string;
      is_active: boolean;
      effective_fee_pesos: number;
      total_balance: number;
    }>;
  };
  canManage: boolean;
  semesterFeePesos: number;
  warning?: string;
}) {
  const occupantOptions = [
    {
      id: occupant.id,
      full_name: occupant.full_name,
      student_id: occupant.student_id,
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base">Gadgets</CardTitle>
          <p className="text-sm text-muted-foreground">
            Current semester due {formatPesos(occupant.current_semester_balance)} • All-time balance {formatPesos(occupant.total_balance)}
          </p>
        </div>
        {canManage ? (
          <OccupantGadgetDialog
            dormId={dormId}
            occupants={occupantOptions}
            defaultOccupantId={occupant.id}
            semesterFeePesos={semesterFeePesos}
            triggerLabel="Add gadget"
          />
        ) : null}
      </CardHeader>
      <CardContent>
        {warning ? (
          <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {warning}
          </div>
        ) : null}
        {occupant.gadgets.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No gadgets assigned yet.
          </div>
        ) : (
          <div className="space-y-3">
            {occupant.gadgets.map((gadget) => (
              <div key={gadget.id} className="rounded-lg border p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{getGadgetDisplayName(gadget)}</p>
                      <Badge variant={gadget.is_active ? "default" : "outline"}>
                        {gadget.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Semester fee {formatPesos(gadget.effective_fee_pesos)} • Balance {formatPesos(gadget.total_balance)}
                    </p>
                  </div>
                  {canManage && gadget.is_active ? (
                    <div className="flex flex-wrap gap-2">
                      <OccupantGadgetDialog
                        dormId={dormId}
                        occupants={occupantOptions}
                        gadget={gadget}
                        defaultOccupantId={occupant.id}
                        semesterFeePesos={semesterFeePesos}
                        triggerLabel="Edit"
                      />
                      <PaymentDialog
                        dormId={dormId}
                        occupantId={occupant.id}
                        category="gadgets"
                        metadata={{
                          gadget_id: gadget.id,
                          gadget_type: gadget.gadget_type,
                          gadget_label: gadget.gadget_label,
                        }}
                        triggerText="Record payment"
                        triggerVariant="outline"
                      />
                      <DeactivateGadgetButton
                        dormId={dormId}
                        gadgetId={gadget.id}
                        label={getGadgetDisplayName(gadget)}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
