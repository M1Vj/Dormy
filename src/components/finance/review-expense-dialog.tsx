"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

import { reviewExpense } from "@/app/actions/expenses";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export function ReviewExpenseDialog({
  dormId,
  expense,
}: {
  dormId: string;
  expense: {
    id: string;
    title: string;
    amount_pesos: number;
    receipt_storage_path: string | null;
  };
}) {
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleAction = (action: "approve" | "reject") => {
    startTransition(async () => {
      await reviewExpense(dormId, expense.id, action, comment);
      setOpen(false);
      setComment("");
      router.refresh();
    });
  };

  const receiptUrl = expense.receipt_storage_path
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/dormy-uploads/${expense.receipt_storage_path}`
    : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Review
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Review Expense</DialogTitle>
          <DialogDescription>
            Approve or reject this expense request.
            <br />
            <strong>{expense.title}</strong> — ₱
            {Number(expense.amount_pesos).toFixed(2)}
          </DialogDescription>
        </DialogHeader>

        {receiptUrl ? (
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md border bg-muted">
            <Image
              src={receiptUrl}
              alt="Receipt"
              fill
              className="object-contain"
            />
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center rounded-md border bg-muted text-sm text-muted-foreground">
            No receipt photo provided.
          </div>
        )}

        <div className="space-y-4 pt-4">
          <Textarea
            placeholder="Add a comment (optional)..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() => handleAction("reject")}
            >
              Reject
            </Button>
            <Button
              variant="default"
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={isPending}
              onClick={() => handleAction("approve")}
            >
              Approve
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
