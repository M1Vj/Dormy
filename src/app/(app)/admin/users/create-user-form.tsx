"use client";

import { useActionState } from "react";

import { createUser } from "@/app/actions/admin";
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

const baseRoleOptions = [
  { value: "student_assistant", label: "Student Assistant" },
  { value: "treasurer", label: "Treasurer" },
  { value: "adviser", label: "Adviser" },
  { value: "assistant_adviser", label: "Assistant Adviser" },
  { value: "officer", label: "Officer" },
  { value: "occupant", label: "Occupant" },
];

type ProvisionerRole = "admin" | "adviser";

type DormOption = {
  id: string;
  name: string;
};

const initialState = { error: "", success: false };

export function CreateUserForm({
  dorms,
  provisionerRole,
}: {
  dorms: DormOption[];
  provisionerRole: ProvisionerRole;
}) {
  const roleOptions =
    provisionerRole === "admin"
      ? baseRoleOptions
      : baseRoleOptions.filter((role) => role.value !== "adviser");

  const [state, formAction, isPending] = useActionState(
    async (previousState: typeof initialState, formData: FormData) => {
      const result = await createUser(formData);
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
        <Button suppressHydrationWarning>Create User</Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Create user</SheetTitle>
          <SheetDescription>
            Provision a new account and assign a role.
          </SheetDescription>
        </SheetHeader>
        <form action={formAction} className="space-y-4 py-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="firstName">
                First name
              </label>
              <Input id="firstName" name="firstName" required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="lastName">
                Last name
              </label>
              <Input id="lastName" name="lastName" required />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="email">
              Email
            </label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="password">
              Temporary password
            </label>
            <Input id="password" name="password" type="password" required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="role">
              Role
            </label>
            <select
              id="role"
              name="role"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={roleOptions[0]?.value}
            >
              {roleOptions.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="dormId">
              Dorm
            </label>
            <select
              id="dormId"
              name="dormId"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={dorms[0]?.id}
            >
              {dorms.map((dorm) => (
                <option key={dorm.id} value={dorm.id}>
                  {dorm.name}
                </option>
              ))}
            </select>
          </div>
          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          {state.success ? (
            <p className="text-sm text-primary">User created successfully.</p>
          ) : null}
          <SheetFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating..." : "Create user"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
