"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateDormGadgetFee } from "@/app/actions/gadgets";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function formatPesos(value: number) {
  return `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function GadgetFeeSettingsCard({
  dormId,
  feePesos,
  canManage,
}: {
  dormId: string;
  feePesos: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(feePesos.toFixed(2));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setValue(feePesos.toFixed(2));
  }, [feePesos]);

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateDormGadgetFee(dormId, {
        fee_pesos: value,
      });

      if ("error" in result) {
        setError(result.error ?? "Unable to update the gadget fee.");
        return;
      }

      toast.success("Global gadget fee updated.");
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Global gadget fee</CardTitle>
        <p className="text-sm text-muted-foreground">
          This semester fee applies to every active gadget in the dorm and updates current-semester gadget charges.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {canManage ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="global_gadget_fee">Semester fee</Label>
              <Input
                id="global_gadget_fee"
                type="number"
                min="0"
                step="0.01"
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="button" onClick={handleSave} isLoading={isPending}>
              Save fee
            </Button>
          </>
        ) : (
          <div className="rounded-lg border border-border/60 bg-muted/10 p-3 text-sm text-muted-foreground">
            Current dorm-wide fee: <span className="font-medium text-foreground">{formatPesos(feePesos)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
