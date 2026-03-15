"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CollectionFiltersProps = {
  basePath: string;
  search: string;
  status: string;
  placeholder: string;
  allLabel?: string;
  outstandingLabel?: string;
  clearedLabel?: string;
};

export function CollectionFilters({
  basePath,
  search,
  status,
  placeholder,
  allLabel = "All balances",
  outstandingLabel = "Outstanding only",
  clearedLabel = "Cleared only",
}: CollectionFiltersProps) {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState(search);
  const [statusValue, setStatusValue] = useState(status);
  const deferredSearch = useDeferredValue(searchValue);
  const deferredStatus = useDeferredValue(statusValue);

  useEffect(() => {
    const params = new URLSearchParams();
    if (deferredSearch.trim()) params.set("search", deferredSearch.trim());
    if (deferredStatus.trim()) params.set("status", deferredStatus.trim());
    const next = params.toString() ? `${basePath}?${params.toString()}` : basePath;
    router.replace(next, { scroll: false });
  }, [basePath, deferredSearch, deferredStatus, router]);

  const hasFilters = searchValue.trim().length > 0 || statusValue.trim().length > 0;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Input
        name="search"
        placeholder={placeholder}
        value={searchValue}
        onChange={(event) => setSearchValue(event.target.value)}
        className="sm:max-w-xs"
      />
      <select
        name="status"
        value={statusValue}
        onChange={(event) => setStatusValue(event.target.value)}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm sm:w-[170px]"
      >
        <option value="">{allLabel}</option>
        <option value="outstanding">{outstandingLabel}</option>
        <option value="cleared">{clearedLabel}</option>
      </select>
      {hasFilters ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setSearchValue("");
            setStatusValue("");
            router.replace(basePath, { scroll: false });
          }}
        >
          Reset
        </Button>
      ) : null}
    </div>
  );
}
