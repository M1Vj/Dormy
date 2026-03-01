"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { CalendarClock, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { createContributionBatch } from "@/app/actions/finance";
import { usePathname } from "next/navigation";
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

function StoreItemField({ index, form, onRemove }: { index: number; form: any; onRemove: () => void }) {
  const { fields: optionFields, append: appendOption, remove: removeOption } = useFieldArray({
    control: form.control,
    name: `storeItems.${index}.options`,
  });

  return (
    <div className="space-y-3 rounded border p-3 bg-card shadow-sm relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1 h-6 w-6 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
      >
        <X className="h-4 w-4" />
      </Button>

      <div className="grid grid-cols-[1fr_120px] gap-3">
        <FormField
          control={form.control}
          name={`storeItems.${index}.name`}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Item Name</FormLabel>
              <FormControl>
                <Input className="h-8 text-sm" placeholder="e.g. Org T-Shirt" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`storeItems.${index}.price`}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Price (₱)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  className="h-8 text-sm"
                  value={field.value}
                  onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="space-y-2 pt-2 border-t">
        <div className="flex items-center justify-between">
          <FormLabel className="text-xs text-muted-foreground">Options / Variations</FormLabel>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-2"
            onClick={() => appendOption({ name: "", choices: "" })}
          >
            <Plus className="h-3 w-3 mr-1" /> Add Option
          </Button>
        </div>

        {optionFields.length === 0 && (
          <div className="text-[10px] text-muted-foreground italic">No options (e.g. Size, Color) added.</div>
        )}

        {optionFields.map((optField, optIndex) => (
          <div key={optField.id} className="grid grid-cols-[100px_1fr_24px] gap-2 items-start">
            <FormField
              control={form.control}
              name={`storeItems.${index}.options.${optIndex}.name`}
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormControl>
                    <Input className="h-7 text-xs" placeholder="e.g. Size" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`storeItems.${index}.options.${optIndex}.choices`}
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormControl>
                    <Input className="h-7 text-xs" placeholder="Comma separated: S, M, L, XL" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => removeOption(optIndex)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

const storeOptionSchema = z.object({
  name: z.string().trim().min(1, "Option name is required (e.g., Size)"),
  choices: z.string().trim().min(1, "Comma-separated choices required"),
});

const storeItemSchema = z.object({
  name: z.string().trim().min(1, "Item name is required"),
  price: z.number().min(0, "Price must be positive"),
  options: z.array(storeOptionSchema),
});

const formSchema = z.object({
  eventId: z.string().nullable().optional(),
  eventTitle: z.string().trim().max(200).optional(),
  title: z.string().trim().min(2, "Title is required").max(120),
  details: z.string().trim().max(1200).optional(),
  amount: z.number().min(0),
  deadline: z.string().optional(),
  includeAlreadyCharged: z.boolean(),
  isStore: z.boolean(),
  storeItems: z.array(storeItemSchema),
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
  const pathname = usePathname();
  const isTreasurer = pathname?.startsWith("/treasurer") || false;

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
      isStore: false,
      storeItems: [],
    },
  });

  const selectedEventId = form.watch("eventId");
  const isEventSelected = !!selectedEventId && selectedEventId !== "none";
  const isStore = form.watch("isStore");

  const { fields: itemFields, append: appendItem, remove: removeItem } = useFieldArray({
    control: form.control,
    name: "storeItems",
  });

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

      // Convert comma-separated string back to array for the backend
      const formattedStoreItems = values.storeItems?.map((item) => ({
        id: crypto.randomUUID(),
        name: item.name,
        price: item.price,
        options: item.options.map((opt) => ({
          name: opt.name,
          choices: opt.choices.split(",").map((c) => c.trim()).filter((c) => c.length > 0),
        })).filter(opt => opt.choices.length > 0),
      })) || [];

      const response = await createContributionBatch(dormId, {
        event_id: isEventSelected ? selectedEventId : null,
        event_title: values.eventTitle?.trim() || null,
        amount: values.isStore ? 0 : values.amount,
        title: values.title,
        details: values.details?.trim() || null,
        deadline: deadlineIso,
        include_already_charged: isEventSelected ? values.includeAlreadyCharged : false,
        is_store: values.isStore,
        store_items: values.isStore ? formattedStoreItems : [],
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
        isStore: false,
        storeItems: [],
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
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto bg-white/95 dark:bg-card/95 backdrop-blur-xl border-muted/50 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Create contribution record</DialogTitle>
          <DialogDescription className="text-sm">
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

            {isTreasurer && (
              <FormField
                control={form.control}
                name="isStore"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={(event) => {
                          field.onChange(event.target.checked);
                          if (!event.target.checked) {
                            form.setValue("storeItems", []);
                          } else if (itemFields.length === 0) {
                            appendItem({ name: "", price: 0, options: [] });
                          }
                        }}
                        className="size-4 rounded border mt-0.5"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Is this a Store Contribution?</FormLabel>
                      <DialogDescription className="text-xs">
                        Enable this if you are selling merchandise (like t-shirts). This allows you to set up items with sizes and choices, instead of a fixed amount per occupant.
                      </DialogDescription>
                    </div>
                  </FormItem>
                )}
              />
            )}

            {!isStore ? (
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
            ) : (
              <div className="space-y-4 rounded-md border p-4 bg-muted/20">
                <div className="flex items-center justify-between">
                  <FormLabel className="text-base font-semibold">Store Items Builder</FormLabel>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => appendItem({ name: "", price: 0, options: [] })}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add Item
                  </Button>
                </div>
                {itemFields.length === 0 && (
                  <div className="text-sm text-muted-foreground italic text-center py-4">
                    No items added. Click "Add Item" to start.
                  </div>
                )}
                {itemFields.map((field, index) => (
                  <StoreItemField
                    key={field.id}
                    index={index}
                    form={form}
                    onRemove={() => removeItem(index)}
                  />
                ))}
              </div>
            )}

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
