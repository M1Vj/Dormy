"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";

import { createOccupantGadget, updateOccupantGadget } from "@/app/actions/gadgets";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type OccupantOption = {
  id: string;
  full_name: string;
  student_id: string | null;
};

type GadgetRecord = {
  id: string;
  occupant_id: string;
  gadget_type: string;
  gadget_label: string;
  is_active: boolean;
};

const gadgetTypeOptions = [
  "Phone",
  "Laptop",
  "Tablet",
  "Printer",
  "Monitor",
  "Fan",
  "Appliance",
  "Other",
];

export function OccupantGadgetDialog({
  dormId,
  occupants,
  gadget,
  defaultOccupantId,
  semesterFeePesos,
  triggerLabel,
}: {
  dormId: string;
  occupants: OccupantOption[];
  gadget?: GadgetRecord;
  defaultOccupantId?: string;
  semesterFeePesos: number;
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [occupantId, setOccupantId] = useState(gadget?.occupant_id ?? defaultOccupantId ?? "");
  const [gadgetType, setGadgetType] = useState(gadget?.gadget_type ?? "Phone");
  const [gadgetLabel, setGadgetLabel] = useState(gadget?.gadget_label ?? "");

  const isEditing = Boolean(gadget);

  const resetForm = () => {
    setError(null);
    setOccupantId(gadget?.occupant_id ?? defaultOccupantId ?? "");
    setGadgetType(gadget?.gadget_type ?? "Phone");
    setGadgetLabel(gadget?.gadget_label ?? "");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetForm();
    }
    setOpen(nextOpen);
  };

  const handleSubmit = () => {
    setError(null);
    startTransition(async () => {
      const payload = {
        occupant_id: occupantId,
        gadget_type: gadgetType,
        gadget_label: gadgetLabel,
      };

      const result =
        isEditing && gadget
          ? await updateOccupantGadget(dormId, {
              gadget_id: gadget.id,
              ...payload,
              is_active: gadget.is_active,
            })
          : await createOccupantGadget(dormId, payload);

      if ("error" in result) {
        setError(result.error ?? "Unable to save gadget.");
        return;
      }

      toast.success(isEditing ? "Gadget updated." : "Gadget added.");
      handleOpenChange(false);
      router.refresh();
    });
  };

  const selectedOccupant = occupants.find((occupant) => occupant.id === occupantId);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {isEditing ? (
          <Button variant="ghost" size="sm">
            <Pencil className="mr-2 h-4 w-4" />
            {triggerLabel ?? "Edit"}
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            {triggerLabel ?? "Add gadget"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg bg-white/95 dark:bg-card/95 backdrop-blur-xl border-muted/50 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {isEditing ? "Edit Occupant Gadget" : "Add Occupant Gadget"}
          </DialogTitle>
          <DialogDescription className="text-sm">
            Save a recurring semester gadget fee that becomes part of the occupant&apos;s finance and clearance profile.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="occupant_id">Occupant</Label>
            <Select value={occupantId} onValueChange={setOccupantId} disabled={Boolean(defaultOccupantId)}>
              <SelectTrigger id="occupant_id">
                <SelectValue placeholder="Select occupant" />
              </SelectTrigger>
              <SelectContent>
                {occupants.map((occupant) => (
                  <SelectItem key={occupant.id} value={occupant.id}>
                    {occupant.full_name}
                    {occupant.student_id ? ` • ${occupant.student_id}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gadget_type">Gadget Type</Label>
            <Select value={gadgetType} onValueChange={setGadgetType}>
              <SelectTrigger id="gadget_type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {gadgetTypeOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gadget_label">Gadget Label</Label>
            <Input
              id="gadget_label"
              value={gadgetLabel}
              onChange={(event) => setGadgetLabel(event.target.value)}
              placeholder="e.g. iPhone 13, Lenovo ThinkPad"
            />
          </div>

          {selectedOccupant ? (
            <div className="rounded-lg border border-border/60 bg-muted/10 p-3 text-sm text-muted-foreground">
              Current target: <span className="font-medium text-foreground">{selectedOccupant.full_name}</span>
            </div>
          ) : null}

          <div className="rounded-lg border border-border/60 bg-muted/10 p-3 text-sm text-muted-foreground">
            Dorm-wide semester fee:{" "}
            <span className="font-medium text-foreground">
              ₱{semesterFeePesos.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              isLoading={isPending}
              disabled={!occupantId || gadgetLabel.trim().length === 0}
              onClick={handleSubmit}
            >
              {isEditing ? "Save changes" : "Add gadget"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
