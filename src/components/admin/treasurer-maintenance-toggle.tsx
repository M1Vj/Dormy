"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { updateDormAttributes } from "@/app/actions/dorm";

export function TreasurerMaintenanceToggle({
  dormId,
  initialState
}: {
  dormId: string;
  initialState: boolean;
}) {
  const [enabled, setEnabled] = useState(initialState);
  const [loading, setLoading] = useState(false);

  const handleToggle = async (checked: boolean) => {
    setEnabled(checked);
    setLoading(true);

    const result = await updateDormAttributes(dormId, {
      treasurer_maintenance_access: checked
    });

    if (result.error) {
      toast.error(result.error);
      setEnabled(!checked); // Revert on error
    } else {
      toast.success("Dorm settings updated");
    }

    setLoading(false);
  };

  return (
    <div className="flex items-center space-x-2">
      <Switch
        id="treasurer-access"
        checked={enabled}
        onCheckedChange={handleToggle}
        disabled={loading}
      />
      <Label htmlFor="treasurer-access" className="flex flex-col space-y-1">
        <span>Treasurer Maintenance Access</span>
        <span className="font-normal text-xs text-muted-foreground">
          Allow treasurers and officers to view and manage maintenance fees and expenses
        </span>
      </Label>
    </div>
  );
}
