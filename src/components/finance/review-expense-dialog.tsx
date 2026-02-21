"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

import { reviewExpense } from "@/app/actions/expenses";
import { createSignedUploadUrl } from "@/app/actions/uploads";
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
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const router = useRouter();

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    setReceiptUrl(null);
    setReceiptError(null);
    if (!nextOpen) {
      setComment("");
    }
  };

  const handleAction = (action: "approve" | "reject") => {
    startTransition(async () => {
      await reviewExpense(dormId, expense.id, action, comment);
      handleOpenChange(false);
      router.refresh();
    });
  };

  useEffect(() => {
    if (!open || !expense.receipt_storage_path) return;

    const receiptPath = expense.receipt_storage_path;
    let cancelled = false;

    (async () => {
      const result = await createSignedUploadUrl({
        dormId,
        bucket: "dormy-uploads",
        path: receiptPath,
        expiresInSeconds: 10 * 60,
      });

      if (cancelled) return;

      if ("error" in result) {
        setReceiptUrl(null);
        setReceiptError(result.error ?? "Failed to load receipt.");
        return;
      }

      setReceiptUrl(result.url);
      setReceiptError(null);
    })();

    return () => {
      cancelled = true;
    };
  }, [dormId, expense.receipt_storage_path, open]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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

        {expense.receipt_storage_path ? (
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md border bg-muted">
            {receiptUrl ? (
              <Image
                src={receiptUrl}
                alt="Receipt"
                fill
                sizes="(max-width: 640px) 100vw, 640px"
                className="object-contain"
              />
            ) : receiptError ? (
              <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                {receiptError}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Loading receipt…
              </div>
            )}
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
              isLoading={isPending}
              onClick={() => handleAction("reject")}
            >
              Reject
            </Button>
            <Button
              variant="default"
              className="bg-emerald-600 hover:bg-emerald-700"
              isLoading={isPending}
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
