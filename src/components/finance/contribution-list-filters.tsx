"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SemesterOption = {
  id: string;
  label: string;
};

type ContributionListFiltersProps = {
  defaultSemesterId: string;
  initialSearch: string;
  initialSemesterId: string;
  semesters: SemesterOption[];
};

export function ContributionListFilters({
  defaultSemesterId,
  initialSearch,
  initialSemesterId,
  semesters,
}: ContributionListFiltersProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(initialSearch);
  const [semesterId, setSemesterId] = useState(initialSemesterId || defaultSemesterId);

  const hasFilters =
    search.trim().length > 0 ||
    (semesterId.trim().length > 0 && semesterId !== defaultSemesterId);

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const query = new URLSearchParams();
    const normalizedSearch = search.trim();

    if (normalizedSearch) {
      query.set("search", normalizedSearch);
    }
    if (semesterId && semesterId !== defaultSemesterId) {
      query.set("semester", semesterId);
    }

    const suffix = query.toString();
    const target = suffix ? `/treasurer/contributions?${suffix}` : "/treasurer/contributions";

    startTransition(() => {
      router.replace(target, { scroll: false });
    });
  };

  const resetFilters = () => {
    setSearch("");
    setSemesterId(defaultSemesterId);
    startTransition(() => {
      router.replace("/treasurer/contributions", { scroll: false });
    });
  };

  return (
    <form className="flex w-full flex-col gap-2 sm:flex-row sm:items-center" onSubmit={applyFilters}>
      <Input
        name="search"
        placeholder="Search contribution..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="h-9 w-full bg-background sm:w-60"
      />
      <select
        name="semester"
        value={semesterId}
        onChange={(event) => setSemesterId(event.target.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm md:w-60"
      >
        {semesters.map((semester) => (
          <option key={semester.id} value={semester.id}>
            {semester.label}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <Button type="submit" variant="secondary" size="sm" className="h-9" disabled={isPending}>
          Apply
        </Button>
        {hasFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9"
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
