"use client";

import { useState } from "react";
import { toast } from "sonner";

import { toggleFinanceHistoricalEditOverride } from "@/app/actions/dorm";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function SemesterOverrideToggle({
  dormId,
  initialState,
}: {
  dormId: string;
  initialState: boolean;
}) {
  const [enabled, setEnabled] = useState(initialState);
  const [isLoading, setIsLoading] = useState(false);

  const onToggle = async (checked: boolean) => {
    setEnabled(checked);
    setIsLoading(true);
    const result = await toggleFinanceHistoricalEditOverride(dormId, checked);
    if (result && "error" in result) {
      setEnabled(!checked);
      toast.error(result.error);
    } else {
      toast.success("Finance semester override updated");
    }
    setIsLoading(false);
  };

  return (
    <div className="flex items-center space-x-2">
      <Switch
        id="finance-semester-override"
        checked={enabled}
        onCheckedChange={onToggle}
        disabled={isLoading}
      />
      <Label htmlFor="finance-semester-override" className="flex flex-col space-y-1">
        <span>Allow editing non-current semesters</span>
        <span className="text-xs font-normal text-muted-foreground">
          When off, archived semester finance stays view-only.
        </span>
      </Label>
    </div>
  );
}
