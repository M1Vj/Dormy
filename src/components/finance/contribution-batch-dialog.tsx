"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { CalendarClock } from "lucide-react";
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
  eventTitle: z.string().trim().max(200).optional(),
  title: z.string().trim().min(2, "Title is required").max(120),
  details: z.string().trim().max(1200).optional(),
  amount: z.number().positive("Amount must be greater than 0"),
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
      eventTitle: "",
      title: "Contribution",
      details: "",
      amount: 0,
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
        event_title: values.eventTitle?.trim() || null,
        amount: values.amount,
        title: values.title,
        details: values.details?.trim() || null,
        deadline: deadlineIso,
        include_already_charged: isEventSelected ? values.includeAlreadyCharged : false,
      });

      if (response && "error" in response) {
        toast.error(response.error);
        return;
      }

      const count = response && "chargedCount" in response ? response.chargedCount : null;
      toast.success(
        count ? `Contribution created for ${count} occupants.` : "Contribution created."
      );
      setOpen(false);
      form.reset({
        eventId: eventId ?? "none",
        eventTitle: "",
        title: "Contribution",
        details: "",
        amount: 0,
        deadline: "",
        includeAlreadyCharged: false,
      });
    } catch {
      toast.error("Failed to create contribution.");
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
          <DialogTitle>Create contribution record</DialogTitle>
          <DialogDescription>
            Create a contribution for all active occupants with optional event linkage and deadline.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Semester shirt fund" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
              name="details"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Details</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="What this contribution covers and important context."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
              name="eventTitle"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Linked Event Title (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Use when no exact event record is linked" {...field} />
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
