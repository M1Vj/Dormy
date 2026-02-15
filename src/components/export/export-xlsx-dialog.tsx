"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ExportDormOption = {
  id: string;
  name: string;
};

export type ExportSelectField = {
  key: string;
  label: string;
  required?: boolean;
  options: Array<{ value: string; label: string }>;
};

export function ExportXlsxDialog({
  report,
  title,
  description,
  triggerLabel = "Export XLSX",
  defaultDormId,
  dormOptions = [],
  includeDormSelector = false,
  defaultParams = {},
  selectFields = [],
}: {
  report:
    | "fines-ledger"
    | "occupant-statement"
    | "maintenance-ledger"
    | "event-contributions"
    | "evaluation-rankings";
  title: string;
  description: string;
  triggerLabel?: string;
  defaultDormId: string;
  dormOptions?: ExportDormOption[];
  includeDormSelector?: boolean;
  defaultParams?: Record<string, string>;
  selectFields?: ExportSelectField[];
}) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dormId, setDormId] = useState(defaultDormId);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of selectFields) {
      initial[field.key] = field.options[0]?.value ?? "";
    }
    return initial;
  });

  const hasMissingRequired = useMemo(
    () => selectFields.some((field) => field.required && !fieldValues[field.key]),
    [fieldValues, selectFields]
  );

  const canChooseDorm = includeDormSelector && dormOptions.length > 0;

  const download = () => {
    if (hasMissingRequired) {
      return;
    }

    const query = new URLSearchParams();

    if (startDate) {
      query.set("start", startDate);
    }
    if (endDate) {
      query.set("end", endDate);
    }
    if (canChooseDorm && dormId) {
      query.set("dorm_id", dormId);
    }

    for (const [key, value] of Object.entries(defaultParams)) {
      if (value) {
        query.set(key, value);
      }
    }

    for (const field of selectFields) {
      const value = fieldValues[field.key];
      if (value) {
        query.set(field.key, value);
      }
    }

    const querySuffix = query.toString() ? `?${query.toString()}` : "";
    window.location.href = `/api/exports/${report}${querySuffix}`;
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Download className="mr-2 size-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="export_start_date">Start date</Label>
              <Input
                id="export_start_date"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="export_end_date">End date</Label>
              <Input
                id="export_end_date"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
          </div>

          {canChooseDorm ? (
            <div className="space-y-1.5">
              <Label htmlFor="export_dorm_id">Dorm</Label>
              <select
                id="export_dorm_id"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={dormId}
                onChange={(event) => setDormId(event.target.value)}
              >
                {dormOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {selectFields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={`export_${field.key}`}>{field.label}</Label>
              <select
                id={`export_${field.key}`}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={fieldValues[field.key] ?? ""}
                onChange={(event) =>
                  setFieldValues((previous) => ({
                    ...previous,
                    [field.key]: event.target.value,
                  }))
                }
              >
                {!field.required ? <option value="">All</option> : null}
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button onClick={download} disabled={hasMissingRequired}>
            Download `.xlsx`
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
