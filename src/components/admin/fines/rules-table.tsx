"use client";

import { useActionState } from "react";

import { createFineRule, updateFineRule } from "@/app/actions/fines";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export type FineRule = {
  id: string;
  title?: string | null;
  severity?: string | null;
  default_pesos?: number | string | null;
  default_points?: number | string | null;
  active?: boolean | null;
};

type RulesTableProps = {
  dormId: string;
  rules: FineRule[];
};

const severityOptions = [
  { value: "minor", label: "Minor" },
  { value: "major", label: "Major" },
  { value: "severe", label: "Severe" },
];

const initialState = { error: "", success: false };

const formatNumber = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return "0";
  const parsed = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(parsed)) return "0";
  return new Intl.NumberFormat("en-US").format(parsed);
};

const getSeverityClass = (severity?: string | null) => {
  if (severity === "minor") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  }
  if (severity === "major") {
    return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400";
  }
  if (severity === "severe") {
    return "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-400";
  }
  return "border-muted bg-muted text-muted-foreground";
};

const getStatusClass = (active?: boolean | null) => {
  if (active === false) {
    return "border-muted bg-muted text-muted-foreground";
  }
  return "border-primary/20 bg-primary/10 text-primary";
};

function CreateRuleDialog({ dormId }: { dormId: string }) {
  const [state, formAction, isPending] = useActionState(
    async (previousState: typeof initialState, formData: FormData) => {
      const result = await createFineRule(dormId, formData);
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
        <Button>Add rule</Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Add fine rule</SheetTitle>
          <SheetDescription>
            Define a standard rule for issuing fines.
          </SheetDescription>
        </SheetHeader>
        <form action={formAction} className="space-y-4 py-6">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="rule-title">
              Rule title
            </label>
            <Input id="rule-title" name="title" required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="rule-severity">
              Severity
            </label>
            <select
              id="rule-severity"
              name="severity"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              defaultValue="minor"
            >
              {severityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="rule-pesos">
                Default pesos
              </label>
              <Input
                id="rule-pesos"
                name="default_pesos"
                type="number"
                min="0"
                defaultValue="0"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="rule-points">
                Default points
              </label>
              <Input
                id="rule-points"
                name="default_points"
                type="number"
                min="0"
                defaultValue="0"
                required
              />
            </div>
          </div>
          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          {state.success ? (
            <p className="text-sm text-primary">Rule added successfully.</p>
          ) : null}
          <SheetFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Add rule"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function EditRuleDialog({ dormId, rule }: { dormId: string; rule: FineRule }) {
  const [state, formAction, isPending] = useActionState(
    async (previousState: typeof initialState, formData: FormData) => {
      const result = await updateFineRule(dormId, rule.id, formData);
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
        <Button size="sm" variant="ghost">
          Edit
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Edit rule</SheetTitle>
          <SheetDescription>
            Update rule defaults and toggle availability.
          </SheetDescription>
        </SheetHeader>
        <form action={formAction} className="space-y-4 py-6">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`rule-${rule.id}`}>
              Rule title
            </label>
            <Input
              id={`rule-${rule.id}`}
              name="title"
              defaultValue={rule.title ?? ""}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label
                className="text-sm font-medium"
                htmlFor={`rule-severity-${rule.id}`}
              >
                Severity
              </label>
              <select
                id={`rule-severity-${rule.id}`}
                name="severity"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                defaultValue={rule.severity ?? "minor"}
              >
                {severityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <span className="text-sm font-medium">Status</span>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={rule.active !== false}
                />
                Active
              </label>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label
                className="text-sm font-medium"
                htmlFor={`rule-pesos-${rule.id}`}
              >
                Default pesos
              </label>
              <Input
                id={`rule-pesos-${rule.id}`}
                name="default_pesos"
                type="number"
                min="0"
                defaultValue={
                  rule.default_pesos !== null && rule.default_pesos !== undefined
                    ? String(rule.default_pesos)
                    : "0"
                }
                required
              />
            </div>
            <div className="space-y-2">
              <label
                className="text-sm font-medium"
                htmlFor={`rule-points-${rule.id}`}
              >
                Default points
              </label>
              <Input
                id={`rule-points-${rule.id}`}
                name="default_points"
                type="number"
                min="0"
                defaultValue={
                  rule.default_points !== null &&
                  rule.default_points !== undefined
                    ? String(rule.default_points)
                    : "0"
                }
                required
              />
            </div>
          </div>
          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          {state.success ? (
            <p className="text-sm text-primary">Rule updated.</p>
          ) : null}
          <SheetFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save changes"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function RulesTable({ dormId, rules }: RulesTableProps) {
  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Fine rules</CardTitle>
            <p className="text-sm text-muted-foreground">
              Set default penalties for common violations.
            </p>
          </div>
          <CreateRuleDialog dormId={dormId} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Severity</th>
                <th className="px-3 py-2 font-medium">Default pesos</th>
                <th className="px-3 py-2 font-medium">Default points</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-sm text-muted-foreground"
                  >
                    No rules created yet.
                  </td>
                </tr>
              ) : (
                rules.map((rule) => (
                  <tr key={rule.id} className="border-b">
                    <td className="px-3 py-2 font-medium">
                      {rule.title ?? "Untitled rule"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs capitalize ${getSeverityClass(
                          rule.severity
                        )}`}
                      >
                        {rule.severity ?? "unknown"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {formatNumber(rule.default_pesos)}
                    </td>
                    <td className="px-3 py-2">
                      {formatNumber(rule.default_points)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${getStatusClass(
                          rule.active
                        )}`}
                      >
                        {rule.active === false ? "Inactive" : "Active"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <EditRuleDialog dormId={dormId} rule={rule} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
