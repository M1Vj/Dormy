"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { deactivateOccupantGadget } from "@/app/actions/gadgets";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function DeactivateGadgetButton({
  dormId,
  gadgetId,
  label,
}: {
  dormId: string;
  gadgetId: string;
  label: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
          Remove
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove gadget?</AlertDialogTitle>
          <AlertDialogDescription>
            This stops future semester charges for <span className="font-medium text-foreground">{label}</span> but keeps historical finance records intact.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(event) => {
              event.preventDefault();
              startTransition(async () => {
                const result = await deactivateOccupantGadget(dormId, gadgetId);
                if ("error" in result) {
                  toast.error(result.error ?? "Unable to remove gadget.");
                  return;
                }
                toast.success("Gadget removed.");
                router.refresh();
              });
            }}
          >
            {isPending ? "Removing..." : "Remove gadget"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
