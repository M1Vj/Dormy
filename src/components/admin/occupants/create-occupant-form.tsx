"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CreateOccupantResult = {
  error?: string;
  success?: boolean;
};

const initialState = { error: "", success: false };

export function CreateOccupantForm({
  action,
}: {
  action: (formData: FormData) => Promise<CreateOccupantResult>;
}) {
  const [state, formAction, isPending] = useActionState(
    async (_previousState: typeof initialState, formData: FormData) => {
      const result = await action(formData);
      if (result?.error) {
        return { error: result.error, success: false };
      }
      return { error: "", success: true };
    },
    initialState
  );

  return (
    <form action={formAction} className="grid w-full gap-2 sm:flex sm:flex-wrap sm:items-end">
      <div className="w-full space-y-1 sm:w-auto">
        <label className="text-xs text-muted-foreground" htmlFor="full_name">
          Full name
        </label>
        <Input id="full_name" name="full_name" required className="w-full sm:w-52" />
      </div>
      <div className="w-full space-y-1 sm:w-auto">
        <label className="text-xs text-muted-foreground" htmlFor="student_id">
          Student ID
        </label>
        <Input id="student_id" name="student_id" className="w-full sm:w-36" />
      </div>
      <div className="w-full space-y-1 sm:w-auto">
        <label
          className="text-xs text-muted-foreground"
          htmlFor="classification"
        >
          Classification
        </label>
        <Input id="classification" name="classification" className="w-full sm:w-40" />
      </div>
      <div className="w-full space-y-1 sm:w-auto">
        <label className="text-xs text-muted-foreground" htmlFor="joined_at">
          Joined date
        </label>
        <Input id="joined_at" name="joined_at" type="date" className="w-full sm:w-40" />
      </div>
      <Button type="submit" size="sm" disabled={isPending} className="w-full sm:w-auto">
        {isPending ? "Adding..." : "Add occupant"}
      </Button>
      {state.error ? (
        <p className="w-full text-xs text-destructive">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="w-full text-xs text-primary">Occupant added.</p>
      ) : null}
    </form>
  );
}
