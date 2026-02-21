"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Calculator, CalendarIcon, Loader2 } from "lucide-react";

import { createMaintenanceBatch } from "@/app/actions/finance";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function MaintenanceBulkChargeDialog({ dormId }: { dormId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [date, setDate] = useState<Date>();
  const [amount, setAmount] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const resetForm = () => {
    setDate(undefined);
    setAmount("");
    setDescription("");
    setError(null);
    setSuccess(null);
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setTimeout(resetForm, 200);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setError("Please enter a valid positive amount.");
      return;
    }
    if (!description.trim()) {
      setError("Please describe what this charge is for.");
      return;
    }

    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await createMaintenanceBatch(dormId, {
        amount: Number(amount),
        description: description.trim(),
        deadline: date ? date.toISOString() : null,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setSuccess(`Successfully charged ${result.chargedCount} occupants.`);
      setTimeout(() => {
        setOpen(false);
        resetForm();
        router.refresh();
      }, 2000);
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full h-auto py-2.5 px-4 bg-background">
          <div className="flex flex-col items-start gap-1">
            <div className="flex items-center gap-2 font-medium">
              <Calculator className="size-4" />
              Bulk Charge Maintenance
            </div>
            <span className="text-xs font-normal text-muted-foreground line-clamp-1">
              Charge all active occupants universally
            </span>
          </div>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Bulk Charge Maintenance</DialogTitle>
          <DialogDescription>
            This will create a new maintenance charge for all active occupants in the dorm.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount per Occupant (₱)</Label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">₱</span>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                className="pl-7"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isPending || !!success}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description / Reason</Label>
            <Textarea
              id="description"
              required
              placeholder="e.g. Monthly Maintenance Fee"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isPending || !!success}
              className="resize-none"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Deadline (Optional)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                  disabled={isPending || !!success}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP") : <span>Pick a deadline</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  initialFocus
                  disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                />
              </PopoverContent>
            </Popover>
          </div>

          {error && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-md bg-emerald-500/15 p-3 text-sm text-emerald-600 dark:text-emerald-400">
              {success}
            </div>
          )}

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending || !!success}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !!success} className="w-full sm:w-auto">
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : success ? (
                "Done"
              ) : (
                "Create Charges"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
