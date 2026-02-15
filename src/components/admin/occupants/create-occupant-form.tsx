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
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground" htmlFor="full_name">
          Full name
        </label>
        <Input id="full_name" name="full_name" required className="w-52" />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground" htmlFor="student_id">
          Student ID
        </label>
        <Input id="student_id" name="student_id" className="w-36" />
      </div>
      <div className="space-y-1">
        <label
          className="text-xs text-muted-foreground"
          htmlFor="classification"
        >
          Classification
        </label>
        <Input id="classification" name="classification" className="w-40" />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground" htmlFor="joined_at">
          Joined date
        </label>
        <Input id="joined_at" name="joined_at" type="date" className="w-40" />
      </div>
      <Button type="submit" size="sm" disabled={isPending}>
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
