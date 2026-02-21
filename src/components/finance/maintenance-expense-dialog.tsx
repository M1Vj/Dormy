"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Receipt } from "lucide-react";

import { submitExpense } from "@/app/actions/expenses";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";

export function MaintenanceExpenseDialog({ dormId }: { dormId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const resetForm = () => {
    setError(null);
    setSuccess(null);
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) setTimeout(resetForm, 200);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const form = e.currentTarget;
    const formData = new FormData(form);

    // Force maintenance_fee category
    formData.set("category", "maintenance_fee");

    startTransition(async () => {
      const result = await submitExpense(dormId, formData);

      if (result.error) {
        setError(result.error);
        return;
      }

      setSuccess("Expense submitted for review.");
      setTimeout(() => {
        setOpen(false);
        resetForm();
        router.refresh();
      }, 1500);
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Receipt className="size-4" />
          Add Expense
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Submit Maintenance Expense</DialogTitle>
          <DialogDescription>
            Submit an expense to deduct from the maintenance fund. It will need to be reviewed and approved.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="exp-title">Title</Label>
            <Input
              id="exp-title"
              name="title"
              required
              placeholder="e.g. Cleaning supplies"
              disabled={isPending || !!success}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="exp-amount">Amount (₱)</Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">₱</span>
                <Input
                  id="exp-amount"
                  name="amount_pesos"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  className="pl-7"
                  placeholder="0.00"
                  disabled={isPending || !!success}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="exp-date">Purchase Date</Label>
              <Input
                id="exp-date"
                name="purchased_at"
                type="date"
                required
                defaultValue={new Date().toISOString().split("T")[0]}
                disabled={isPending || !!success}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="exp-desc">Description (Optional)</Label>
            <Textarea
              id="exp-desc"
              name="description"
              placeholder="Brief description of the expense..."
              rows={2}
              className="resize-none"
              disabled={isPending || !!success}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="exp-receipt">Receipt Photo (Optional)</Label>
            <Input
              id="exp-receipt"
              name="receipt"
              type="file"
              accept="image/*"
              disabled={isPending || !!success}
            />
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

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending || !!success}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !!success}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : success ? (
                "Submitted"
              ) : (
                "Submit Expense"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
