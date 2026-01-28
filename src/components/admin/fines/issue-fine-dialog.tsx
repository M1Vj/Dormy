"use client";

import { useActionState, useId, useMemo, useState } from "react";

import { issueFine } from "@/app/actions/fines";
import { Button } from "@/components/ui/button";

type ButtonProps = React.ComponentProps<typeof Button>;
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
import { Textarea } from "@/components/ui/textarea";

export type FineRuleOption = {
  id: string;
  title?: string | null;
  severity?: string | null;
  default_pesos?: number | string | null;
  default_points?: number | string | null;
  active?: boolean | null;
};

export type OccupantOption = {
  id: string;
  full_name?: string | null;
  student_id?: string | null;
  classification?: string | null;
};

type IssueFineDialogProps = {
  dormId: string;
  occupants: OccupantOption[];
  rules: FineRuleOption[];
  defaultOccupantId?: string;
  triggerLabel?: string;
  triggerVariant?: ButtonProps["variant"];
  triggerSize?: ButtonProps["size"];
};

const initialState = { error: "", success: false };

const getOccupantLabel = (occupant: OccupantOption) => {
  const name = occupant.full_name?.trim() || "Unnamed occupant";
  const studentId = occupant.student_id ? ` (${occupant.student_id})` : "";
  const classification = occupant.classification
    ? ` - ${occupant.classification}`
    : "";
  return `${name}${studentId}${classification}`;
};

const getRuleLabel = (rule: FineRuleOption) => {
  const title = rule.title?.trim() || "Untitled rule";
  const severity = rule.severity ? ` - ${rule.severity}` : "";
  return `${title}${severity}`;
};

const toNumber = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export function IssueFineDialog({
  dormId,
  occupants,
  rules,
  defaultOccupantId,
  triggerLabel = "Issue fine",
  triggerVariant = "default",
  triggerSize = "default",
}: IssueFineDialogProps) {
  const [state, formAction, isPending] = useActionState(
    async (previousState: typeof initialState, formData: FormData) => {
      const occupantId = formData.get("occupant_id");
      if (!occupantId || typeof occupantId !== "string") {
        return { error: "Select an occupant.", success: false };
      }
      const result = await issueFine(dormId, formData);
      if (result?.error) {
        return { error: result.error, success: false };
      }
      return { error: "", success: true };
    },
    initialState
  );

  const listId = useId();

  // Initialize state based on props (assumes props don't change deeply for same dialog instance)
  const initialOccupant = useMemo(
    () => occupants.find((o) => o.id === defaultOccupantId),
    [occupants, defaultOccupantId]
  );

  const [query, setQuery] = useState(
    initialOccupant ? getOccupantLabel(initialOccupant) : ""
  );
  const [selectedId, setSelectedId] = useState(defaultOccupantId ?? "");
  const [open, setOpen] = useState(false);

  const filteredOccupants = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return occupants;
    return occupants.filter((occupant) =>
      getOccupantLabel(occupant).toLowerCase().includes(normalized)
    );
  }, [occupants, query]);

  const [selectedRuleId, setSelectedRuleId] = useState<string>("");
  const [pesos, setPesos] = useState<string>("0");
  const [points, setPoints] = useState<string>("0");

  const handleRuleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newRuleId = event.target.value;
    setSelectedRuleId(newRuleId);

    if (newRuleId) {
      const selectedRule = rules.find((rule) => rule.id === newRuleId);
      if (selectedRule) {
        setPesos(String(toNumber(selectedRule.default_pesos)));
        setPoints(String(toNumber(selectedRule.default_points)));
      }
    }
  };

  const hasOccupants = occupants.length > 0;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant={triggerVariant}
          size={triggerSize}
          disabled={!hasOccupants}
        >
          {triggerLabel}
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Issue fine</SheetTitle>
          <SheetDescription>
            Select an occupant, then fill out the fine details.
          </SheetDescription>
        </SheetHeader>
        <form action={formAction} className="space-y-4 py-6">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${listId}-input`}>
              Occupant
            </label>
            <div className="relative">
              <Input
                id={`${listId}-input`}
                role="combobox"
                aria-expanded={open}
                aria-controls={`${listId}-list`}
                autoComplete="off"
                placeholder={
                  hasOccupants
                    ? "Search by name"
                    : "No occupants available"
                }
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelectedId("");
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => {
                  setTimeout(() => setOpen(false), 150);
                }}
                disabled={!hasOccupants}
              />
              {open && hasOccupants ? (
                <div
                  id={`${listId}-list`}
                  role="listbox"
                  className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-background shadow"
                >
                  {filteredOccupants.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      No occupants match &quot;{query}&quot;.
                    </div>
                  ) : (
                    filteredOccupants.map((occupant) => (
                      <button
                        key={occupant.id}
                        type="button"
                        role="option"
                        aria-selected={occupant.id === selectedId}
                        className="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-muted"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setSelectedId(occupant.id);
                          setQuery(getOccupantLabel(occupant));
                          setOpen(false);
                        }}
                      >
                        {getOccupantLabel(occupant)}
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
            <input type="hidden" name="occupant_id" value={selectedId} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${listId}-rule`}>
              Rule
            </label>
            <select
              id={`${listId}-rule`}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={selectedRuleId}
              onChange={handleRuleChange}
            >
              <option value="">Custom fine (no rule)</option>
              {rules.length === 0 ? (
                <option value="" disabled>
                  No rules available
                </option>
              ) : (
                rules.map((rule) => (
                  <option
                    key={rule.id}
                    value={rule.id}
                    disabled={rule.active === false}
                  >
                    {getRuleLabel(rule)}
                    {rule.active === false ? " (inactive)" : ""}
                  </option>
                ))
              )}
            </select>
            {selectedRuleId ? (
              <input type="hidden" name="rule_id" value={selectedRuleId} />
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor={`${listId}-pesos`}>
                Pesos
              </label>
              <Input
                id={`${listId}-pesos`}
                name="pesos"
                type="number"
                min="0"
                value={pesos}
                onChange={(event) => setPesos(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor={`${listId}-points`}>
                Points
              </label>
              <Input
                id={`${listId}-points`}
                name="points"
                type="number"
                min="0"
                value={points}
                onChange={(event) => setPoints(event.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${listId}-note`}>
              Note
            </label>
            <Textarea
              id={`${listId}-note`}
              name="note"
              placeholder="Optional details for this fine"
            />
          </div>

          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          {state.success ? (
            <p className="text-sm text-primary">Fine issued successfully.</p>
          ) : null}

          <SheetFooter>
            <Button type="submit" disabled={isPending || !selectedId}>
              {isPending ? "Issuing..." : "Issue fine"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
