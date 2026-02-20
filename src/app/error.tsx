"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            The request failed unexpectedly. Try again or return to the app home.
          </p>
          <div className="flex items-center gap-2">
            <Button onClick={reset}>Try again</Button>
            <Button asChild variant="outline">
              <Link href="/occupant/events">Go to events</Link>
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
