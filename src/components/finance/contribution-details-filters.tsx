"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ContributionDetailsFiltersProps = {
  contributionId: string;
  initialSearch: string;
  initialStatus: string;
};

export function ContributionDetailsFilters({
  contributionId,
  initialSearch,
  initialStatus,
}: ContributionDetailsFiltersProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState(initialStatus);

  const hasFilters = search.trim().length > 0 || status.trim().length > 0;

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const query = new URLSearchParams();
    const normalizedSearch = search.trim();
    const normalizedStatus = status.trim();

    if (normalizedSearch) {
      query.set("search", normalizedSearch);
    }
    if (normalizedStatus) {
      query.set("status", normalizedStatus);
    }

    const suffix = query.toString();
    const target = suffix
      ? `/treasurer/contributions/${contributionId}?${suffix}`
      : `/treasurer/contributions/${contributionId}`;

    startTransition(() => {
      router.replace(target, { scroll: false });
    });
  };

  const resetFilters = () => {
    setSearch("");
    setStatus("");
    startTransition(() => {
      router.replace(`/treasurer/contributions/${contributionId}`, { scroll: false });
    });
  };

  return (
    <form className="grid gap-2 sm:grid-cols-[1fr_180px_auto]" onSubmit={applyFilters}>
      <Input
        name="search"
        placeholder="Search occupant or ID"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="w-full"
      />
      <select
        name="status"
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={status}
        onChange={(event) => setStatus(event.target.value)}
      >
        <option value="">All statuses</option>
        <option value="paid">Paid</option>
        <option value="partial">Partial</option>
        <option value="unpaid">Unpaid</option>
      </select>
      <div className="flex gap-2">
        <Button type="submit" variant="secondary" size="sm" className="w-full" disabled={isPending}>
          Filter
        </Button>
        {hasFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={resetFilters}
            disabled={isPending}
          >
            Reset
          </Button>
        ) : null}
      </div>
    </form>
  );
}
