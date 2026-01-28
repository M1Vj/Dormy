"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { PlusCircle, Loader2 } from "lucide-react";

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
import { createEvaluationTemplate } from "@/app/actions/evaluation";

const formSchema = z.object({
  name: z.string().min(2, "Name is required"),
});

type FormValues = z.infer<typeof formSchema>;

interface Props {
  dormId: string;
  cycleId: string;
}

export function CreateTemplateDialog({ dormId, cycleId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
    },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await createEvaluationTemplate(dormId, {
        cycle_id: cycleId,
        name: values.name,
        rater_group_weights: {
          peer: 0.6,
          adviser: 0.4,
        },
        status: "draft",
      });

      if (result.success && result.id) {
        toast.success("Template created");
        router.push(`/admin/evaluation/${cycleId}/templates/${result.id}`);
        router.refresh();
      } else {
        toast.error(result.error || "Failed to create template");
      }
    });
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusCircle className="mr-2 h-4 w-4" /> Create Template
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Evaluation Template</DialogTitle>
          <DialogDescription>
            Templates define the criteria and scoring weights for a cycle.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Template Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Standard Peer Evaluation" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Template
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
