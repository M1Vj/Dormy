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
    <form className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_220px_auto]" onSubmit={applyFilters}>
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
        <option value="paid_elsewhere">Paid Elsewhere</option>
        <option value="partial">Partial</option>
        <option value="unpaid">Unpaid</option>
        <option value="declined">Declined</option>
      </select>
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          className="w-full sm:w-auto"
          disabled={isPending}
        >
          Filter
        </Button>
        {hasFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full sm:w-auto"
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
