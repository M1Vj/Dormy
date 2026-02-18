"use client";

import { useActionState } from "react";

import { assignOccupant } from "@/app/actions/rooms";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export type UnassignedOccupant = {
  id: string;
  full_name?: string | null;
  student_id?: string | null;
  course?: string | null;
};

type AssignOccupantDialogProps = {
  dormId: string;
  roomId: string;
  roomLabel: string;
  occupants: UnassignedOccupant[];
};

const initialState = { error: "", success: false };

const getOccupantLabel = (occupant: UnassignedOccupant) => {
  const name = occupant.full_name?.trim() || "Unnamed occupant";
  const studentId = occupant.student_id ? ` (${occupant.student_id})` : "";
  const course = occupant.course
    ? ` - ${occupant.course}`
    : "";
  return `${name}${studentId}${course}`;
};

export function AssignOccupantDialog({
  dormId,
  roomId,
  roomLabel,
  occupants,
}: AssignOccupantDialogProps) {
  const hasOccupants = occupants.length > 0;
  const [state, formAction, isPending] = useActionState(
    async (previousState: typeof initialState, formData: FormData) => {
      const occupantId = formData.get("occupant_id");
      if (!occupantId || typeof occupantId !== "string") {
        return { error: "Select an occupant to assign.", success: false };
      }
      const result = await assignOccupant(dormId, roomId, occupantId);
      if (result?.error) {
        return { error: result.error, success: false };
      }
      return { error: "", success: true };
    },
    initialState
  );

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button size="sm" variant="secondary">
          Assign occupant
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Assign occupant</SheetTitle>
          <SheetDescription>
            Select an unassigned occupant for {roomLabel}.
          </SheetDescription>
        </SheetHeader>
        <form action={formAction} className="space-y-4 py-6">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`occupant-${roomId}`}>
              Occupant
            </label>
            <select
              id={`occupant-${roomId}`}
              name="occupant_id"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              defaultValue=""
              disabled={!hasOccupants}
              required
            >
              <option value="" disabled>
                {hasOccupants ? "Select an occupant" : "No unassigned occupants"}
              </option>
              {occupants.map((occupant) => (
                <option key={occupant.id} value={occupant.id}>
                  {getOccupantLabel(occupant)}
                </option>
              ))}
            </select>
          </div>
          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          {state.success ? (
            <p className="text-sm text-primary">Occupant assigned.</p>
          ) : null}
          <SheetFooter>
            <Button type="submit" disabled={isPending || !hasOccupants}>
              {isPending ? "Assigning..." : "Assign occupant"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
