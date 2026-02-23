"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { submitExpense } from "@/app/actions/expenses";
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
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";

export function SubmitExpenseDialog({
  dormId,
  committeeId,
  defaultCategory = "maintenance_fee",
  defaultGroupTitle = "",
  defaultContributionTitle = "",
  trigger,
  triggerLabel = "Submit Expense",
}: {
  dormId: string;
  committeeId?: string;
  defaultCategory?: "maintenance_fee" | "contributions";
  defaultGroupTitle?: string;
  defaultContributionTitle?: string;
  trigger?: React.ReactNode;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [category, setCategory] = useState<"maintenance_fee" | "contributions">(defaultCategory);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const handleSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await submitExpense(dormId, formData);
      if ("error" in result) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setOpen(false);
      formRef.current?.reset();
      setCategory(defaultCategory);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            {triggerLabel}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{triggerLabel}</DialogTitle>
          <DialogDescription>
            {committeeId
              ? "Submit a committee expense request with optional receipt photo."
              : "Record a dorm purchase or operating expense with optional receipt photo."}
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} action={handleSubmit} className="space-y-4">
          {committeeId ? (
            <input type="hidden" name="committee_id" value={committeeId} />
          ) : null}

          <input type="hidden" name="category" value={category} />

          <div className="space-y-2">
            <Label htmlFor="title">Item Title *</Label>
            <Input
              id="title"
              name="title"
              placeholder={category === "contributions" ? "e.g., Print tarpaulin" : "e.g., Cleaning supplies"}
              required
              minLength={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="amount_pesos">Amount (₱) *</Label>
              <Input
                id="amount_pesos"
                name="amount_pesos"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category_ui">Category *</Label>
              <Select value={category} onValueChange={(value) => setCategory(value as "maintenance_fee" | "contributions")}>
                <SelectTrigger id="category_ui">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="maintenance_fee">Maintenance Fee</SelectItem>
                  <SelectItem value="contributions">Contributions</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="purchased_at">Date Purchased *</Label>
            <Input id="purchased_at" name="purchased_at" type="date" required />
          </div>

          {category === "contributions" ? (
            <div className="space-y-4 rounded-md border p-3">
              <p className="text-sm font-medium">Contribution Expense Transparency</p>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="expense_group_title">Expense Group *</Label>
                  <Input
                    id="expense_group_title"
                    name="expense_group_title"
                    defaultValue={defaultGroupTitle}
                    placeholder="e.g., Foundation Week Purchases"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contribution_reference_title">Linked Contribution Title</Label>
                  <Input
                    id="contribution_reference_title"
                    name="contribution_reference_title"
                    defaultValue={defaultContributionTitle}
                    placeholder="e.g., Foundation Week Contribution"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="vendor_name">Vendor / Supplier</Label>
                  <Input id="vendor_name" name="vendor_name" placeholder="Store or supplier name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="official_receipt_no">Receipt / Invoice No.</Label>
                  <Input id="official_receipt_no" name="official_receipt_no" placeholder="OR-000123" />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input id="quantity" name="quantity" type="number" min="0.01" step="0.01" placeholder="1" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unit_cost_pesos">Unit Cost (₱)</Label>
                  <Input id="unit_cost_pesos" name="unit_cost_pesos" type="number" min="0.01" step="0.01" placeholder="0.00" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment_method">Payment Method</Label>
                  <Input id="payment_method" name="payment_method" placeholder="Cash / GCash / Bank" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="purchased_by">Purchased By</Label>
                <Input id="purchased_by" name="purchased_by" placeholder="Person who purchased" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="transparency_notes">Transparency Notes</Label>
                <Textarea
                  id="transparency_notes"
                  name="transparency_notes"
                  placeholder="Purpose, approval context, and any remarks for audit transparency"
                  rows={3}
                />
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="What was purchased and why"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="receipt">Receipt Photo</Label>
            <Input id="receipt" name="receipt" type="file" accept="image/*" />
            <p className="text-xs text-muted-foreground">Auto-optimized to WebP before upload</p>
          </div>

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isPending}>
              Submit
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
