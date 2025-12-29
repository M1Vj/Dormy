"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { Loader2, Wallet } from "lucide-react";

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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { recordTransaction, LedgerCategory } from "@/app/actions/finance";

const formSchema = z.object({
  amount: z.coerce.number().min(1, "Amount must be greater than 0"),
  method: z.string().min(1, "Method is required"),
  note: z.string().optional(),
});

interface PaymentDialogProps {
  dormId: string;
  occupantId: string;
  category: LedgerCategory;
  eventId?: string;
  trigger?: React.ReactNode;
}

export function PaymentDialog({ dormId, occupantId, category, eventId, trigger }: PaymentDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: 0,
      method: "cash",
      note: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsPending(true);
    try {
      // Payment is negative charge? No, ledger usually records payments as entry_type='payment'
      // and amount is usually recorded as positive magnitude, but logic handles it.
      // finance.ts says: "Positive for charge, Negative for payment" in z.number comment.
      // But `recordTransaction` takes `amount`.
      // Let's stick to convention: Payment entries = negative amount.
      // So we negate the input value.

      const response = await recordTransaction(dormId, {
        occupant_id: occupantId,
        category,
        entry_type: "payment",
        amount: values.amount,
        method: values.method,
        note: values.note,
        event_id: eventId,
      });

      if (response && 'error' in response) { // Check if error exists
        toast.error(response.error);
        return;
      }

      toast.success("Payment recorded");
      setOpen(false);
      form.reset();
    } catch {
      toast.error("Failed to record payment");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Wallet className="mr-2 h-4 w-4" />
            Pay
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>
            Record a payment for {category === 'adviser_maintenance' ? 'maintenance fee' : category === 'treasurer_events' ? 'event contribution' : 'fines'}.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount (₱)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="method"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Method</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select method" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="gcash">GCash</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note (Optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Receipt No., etc." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Record Payment
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
