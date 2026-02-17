import Image from "next/image";

export default function AppLoading() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border/70 bg-muted/35">
            <Image
              src="/brand/dormy-house.png"
              alt="Dormy"
              width={22}
              height={22}
              className="h-5 w-5"
              priority
            />
          </span>
          <div className="space-y-1">
            <p className="text-sm font-semibold">Loading Dormy…</p>
            <p className="text-xs text-muted-foreground">
              Fetching your workspace, access, and dorm data.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          <div className="mt-5 h-10 w-full animate-pulse rounded-md bg-muted" />
        </div>
      </div>
    </div>
  );
}

