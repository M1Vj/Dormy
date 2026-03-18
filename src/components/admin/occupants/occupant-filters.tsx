"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type OccupantFiltersProps = {
  basePath: string;
  filters?: {
    search?: string;
    status?: string;
    room?: string;
    level?: string;
  };
};

const statusOptions = [
  { value: "", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "left", label: "Left" },
];

export function OccupantFilters({ basePath, filters }: OccupantFiltersProps) {
  const router = useRouter();
  const [search, setSearch] = useState(filters?.search ?? "");
  const [room, setRoom] = useState(filters?.room ?? "");
  const [level, setLevel] = useState(filters?.level ?? "");
  const [status, setStatus] = useState(filters?.status ?? "");

  const deferredSearch = useDeferredValue(search);
  const deferredRoom = useDeferredValue(room);
  const deferredLevel = useDeferredValue(level);
  const deferredStatus = useDeferredValue(status);
  useEffect(() => {
    const params = new URLSearchParams();
    if (deferredSearch.trim()) params.set("search", deferredSearch.trim());
    if (deferredRoom.trim()) params.set("room", deferredRoom.trim());
    if (deferredLevel.trim()) params.set("level", deferredLevel.trim());
    if (deferredStatus.trim()) params.set("status", deferredStatus.trim());
    const next = params.toString() ? `${basePath}?${params.toString()}` : basePath;
    router.replace(next, { scroll: false });
  }, [basePath, deferredLevel, deferredRoom, deferredSearch, deferredStatus, router]);

  const hasFilters =
    search.trim().length > 0 ||
    room.trim().length > 0 ||
    level.trim().length > 0 ||
    status.trim().length > 0;

  return (
    <div className="grid w-full gap-2 sm:flex sm:flex-wrap sm:items-center">
      <Input
        className="w-full sm:w-48"
        name="search"
        placeholder="Search name or ID"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <Input
        className="w-full sm:w-36"
        name="room"
        placeholder="Room code"
        value={room}
        onChange={(event) => setRoom(event.target.value)}
      />
      <Input
        className="w-full sm:w-28"
        name="level"
        placeholder="Level"
        type="number"
        min="0"
        value={level}
        onChange={(event) => setLevel(event.target.value)}
      />
      <select
        name="status"
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm sm:w-40"
        value={status}
        onChange={(event) => setStatus(event.target.value)}
      >
        {statusOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hasFilters ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="w-full sm:w-auto"
          onClick={() => {
            setSearch("");
            setRoom("");
            setLevel("");
            setStatus("");
            router.replace(basePath, { scroll: false });
          }}
        >
          Reset
        </Button>
      ) : null}
    </div>
  );
}
