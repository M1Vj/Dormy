"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";

import { setEventAttendance } from "@/app/actions/events";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  EventAttendanceEntry,
  EventAttendanceSummary,
} from "@/lib/types/events";

type Props = {
  eventId: string;
  entries: EventAttendanceEntry[];
  summary: EventAttendanceSummary;
  canManage: boolean;
};

function statusTone(status: EventAttendanceEntry["status"]) {
  if (status === "present") return "bg-emerald-100 text-emerald-800";
  if (status === "absent") return "bg-rose-100 text-rose-800";
  if (status === "excused") return "bg-amber-100 text-amber-800";
  return "bg-muted text-muted-foreground";
}

export function EventAttendancePanel({
  eventId,
  entries,
  summary,
  canManage,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [savingOccupantId, setSavingOccupantId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const currentByOccupant = useMemo(
    () =>
      Object.fromEntries(
        entries.map((entry) => [entry.occupant_id, entry.status ?? ""])
      ),
    [entries]
  );

  useEffect(() => {
    setDrafts(currentByOccupant);
  }, [currentByOccupant]);

  const handleSave = (occupantId: string) => {
    setError("");
    setSavingOccupantId(occupantId);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("event_id", eventId);
      formData.set("occupant_id", occupantId);
      const selectedStatus = drafts[occupantId] ?? "";
      if (selectedStatus) {
        formData.set("status", selectedStatus);
      }

      const result = await setEventAttendance(formData);
      if (result?.error) {
        setError(result.error);
        setSavingOccupantId(null);
        return;
      }

      setSavingOccupantId(null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline">Total: {summary.total}</Badge>
        <Badge variant="outline" className="bg-emerald-50 text-emerald-700">
          Present: {summary.present}
        </Badge>
        <Badge variant="outline" className="bg-rose-50 text-rose-700">
          Absent: {summary.absent}
        </Badge>
        <Badge variant="outline" className="bg-amber-50 text-amber-700">
          Excused: {summary.excused}
        </Badge>
        <Badge variant="outline">Unmarked: {summary.unmarked}</Badge>
      </div>

      <div className="space-y-2">
        {entries.length ? (
          entries.map((entry) => {
            const draftValue = drafts[entry.occupant_id] ?? "";
            const unchanged = draftValue === (entry.status ?? "");
            const isSaving =
              isPending && savingOccupantId === entry.occupant_id;

            return (
              <div
                key={entry.occupant_id}
                className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium">{entry.occupant_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.occupant_student_id ?? "No student ID"}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Badge className={statusTone(entry.status)}>
                    {entry.status ? entry.status : "unmarked"}
                  </Badge>
                  {canManage ? (
                    <>
                      <select
                        value={draftValue}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [entry.occupant_id]: event.target.value,
                          }))
                        }
                        className="h-8 rounded-md border bg-background px-2 text-xs"
                        disabled={isPending}
                      >
                        <option value="">Unmarked</option>
                        <option value="present">Present</option>
                        <option value="absent">Absent</option>
                        <option value="excused">Excused</option>
                      </select>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => handleSave(entry.occupant_id)}
                        disabled={unchanged || isPending}
                      >
                        {isSaving ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Save className="size-3.5" />
                        )}
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })
        ) : (
          <p className="text-sm text-muted-foreground">
            No active occupants available for attendance.
          </p>
        )}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
