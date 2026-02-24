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
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="name">
                Dorm name
              </label>
              <Input id="name" name="name" placeholder="Molave Residence Hall" required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="slug">
                Dorm code
              </label>
              <Input
                id="slug"
                name="slug"
                placeholder="molave-hall"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="description">
              Description
            </label>
            <Input id="description" name="description" placeholder="A brief description of the dormitory..." />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="capacity">
                Total Capacity
              </label>
              <Input id="capacity" name="capacity" type="number" placeholder="100" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="address">
                Address
              </label>
              <Input id="address" name="address" placeholder="Campus St, University Area" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="sex">
              Dorm type
            </label>
            <select
              id="sex"
              name="sex"
              defaultValue="coed"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="male">Male only</option>
              <option value="female">Female only</option>
              <option value="coed">Coed (both)</option>
            </select>
          </div>

          <p className="text-xs text-muted-foreground">
            Dorm code is used in URLs and should be lowercase with dashes.
          </p>

          {state.error ? (
            <p className="text-sm text-destructive font-medium">{state.error}</p>
          ) : null}
          {state.success ? (
            <p className="text-sm text-primary font-medium">Dorm created successfully!</p>
          ) : null}

          <SheetFooter className="pt-4">
            <Button type="submit" isLoading={isPending} className="w-full">
              Create dorm
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
