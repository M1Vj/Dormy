"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { CalendarClock, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { createContributionBatch } from "@/app/actions/finance";
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

const formSchema = z.object({
  eventId: z.string().nullable().optional(),
  amount: z.number().positive("Amount must be greater than 0"),
  description: z.string().trim().min(2, "Description is required"),
  deadline: z.string().optional(),
  includeAlreadyCharged: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

export function ContributionBatchDialog({
  dormId,
  eventId,
  events = [],
  trigger,
}: {
  dormId: string;
  eventId?: string;
  events?: { id: string; title: string }[];
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      eventId: eventId ?? "none",
      amount: 0,
      description: "Event contribution",
      deadline: "",
      includeAlreadyCharged: false,
    },
  });

  const selectedEventId = form.watch("eventId");
  const isEventSelected = !!selectedEventId && selectedEventId !== "none";

  async function onSubmit(values: FormValues) {
    setIsPending(true);
    try {
      let deadlineIso: string | null = null;
      if (values.deadline) {
        const parsed = new Date(values.deadline);
        if (Number.isNaN(parsed.getTime())) {
          toast.error("Provide a valid deadline date and time.");
          return;
        }
        deadlineIso = parsed.toISOString();
      }

      const response = await createContributionBatch(dormId, {
        event_id: isEventSelected ? selectedEventId : null,
        amount: values.amount,
        description: values.description,
        deadline: deadlineIso,
        include_already_charged: isEventSelected ? values.includeAlreadyCharged : false,
      });

      if (response && "error" in response) {
        toast.error(response.error);
        return;
      }

      const count = response && "chargedCount" in response ? response.chargedCount : null;
      toast.success(
        count ? `Payable event created for ${count} occupants.` : "Payable event created."
      );
      setOpen(false);
      form.reset({
        eventId: eventId ?? "none",
        amount: 0,
        description: "Event contribution",
        deadline: "",
        includeAlreadyCharged: false,
      });
    } catch {
      toast.error("Failed to create payable event.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" variant="outline">
            <CalendarClock className="mr-2 h-4 w-4" />
            Create contribution
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Create contribution</DialogTitle>
          <DialogDescription>
            Treasurer-only workflow: issue contribution charges with an optional deadline.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {events.length > 0 && (
              <FormField
                control={form.control}
                name="eventId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Link to Event (Optional)</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || "none"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select an event" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {events.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount (₱)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      value={field.value}
                      onChange={(event) => field.onChange(parseFloat(event.target.value) || 0)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Event shirt, registration, etc." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="deadline"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Deadline (optional)</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {isEventSelected && (
              <FormField
                control={form.control}
                name="includeAlreadyCharged"
                render={({ field }) => (
                  <FormItem>
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={(event) => field.onChange(event.target.checked)}
                        className="size-4 rounded border"
                      />
                      Include occupants already charged for this event
                    </label>
                  </FormItem>
                )}
              />
            )}

            <DialogFooter>
              <Button type="submit" isLoading={isPending}>
                Create contribution
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
