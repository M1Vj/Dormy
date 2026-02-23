"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import { overrideRoomLevel } from "@/app/actions/rooms";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const formSchema = z.object({
  level: z.string().refine((val) => {
    if (!val || val.trim() === "") return true;
    const n = Number(val);
    return !Number.isNaN(n) && Number.isInteger(n) && n > 0 && n <= 10;
  }, "Level must be an integer between 1 and 10").optional(),
});

type EditRoomLevelDialogProps = {
  dormId: string;
  roomId: string;
  roomCode: string;
  currentOverride: number | null;
};

export function EditRoomLevelDialog({
  dormId,
  roomId,
  roomCode,
  currentOverride,
}: EditRoomLevelDialogProps) {
  const [open, setOpen] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      level: currentOverride !== null ? String(currentOverride) : "",
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      const parsedOverride = values.level?.trim() ? Number(values.level.trim()) : null;
      const result = await overrideRoomLevel(dormId, roomId, parsedOverride);

      if (result?.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Room level updated successfully.");
      setOpen(false);
    } catch {
      toast.error("Failed to update room level. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-primary shrink-0"
        >
          <Pencil className="h-4 w-4" />
          <span className="sr-only">Edit level for room {roomCode}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Override Room Level</DialogTitle>
          <DialogDescription>
            Change how room {roomCode} is grouped on the display board. Clear the input to reset to the room&apos;s default level.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="level"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Level Display Name</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="e.g., 2" {...field} />
                  </FormControl>
                  <FormDescription>
                    This label will be used to group rooms visually.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={form.formState.isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving..." : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
