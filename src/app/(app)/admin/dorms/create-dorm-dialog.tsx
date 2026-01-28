"use client";

import { useActionState } from "react";

import { createDorm } from "@/app/actions/dorm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const initialState = { error: "", success: false };

export function CreateDormDialog() {
  const [state, formAction, isPending] = useActionState(
    async (previousState: typeof initialState, formData: FormData) => {
      const result = await createDorm(formData);
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
        <Button>Create Dorm</Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Create dorm</SheetTitle>
          <SheetDescription>
            Add a new dorm and assign yourself as admin.
          </SheetDescription>
        </SheetHeader>
        <form action={formAction} className="space-y-4 py-6">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="name">
              Dorm name
            </label>
            <Input id="name" name="name" required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="slug">
              Dorm code
            </label>
            <Input
              id="slug"
              name="slug"
              placeholder="molave-mens-hall"
              required
            />
            <p className="text-xs text-muted-foreground">
              Use lowercase letters, numbers, and dashes only.
            </p>
          </div>
          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          {state.success ? (
            <p className="text-sm text-primary">Dorm created successfully.</p>
          ) : null}
          <SheetFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating..." : "Create dorm"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
