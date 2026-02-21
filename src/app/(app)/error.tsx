"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AppError({
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
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border/70 bg-muted/35">
              <Image src="/brand/dormy-house.png" alt="Dormy" width={22} height={22} className="h-5 w-5" />
            </span>
            <div className="space-y-1">
              <CardTitle className="text-base">Something went wrong</CardTitle>
              <CardDescription>
                Dormy hit an unexpected error while loading this page.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            {error.message || "Unknown error"}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" onClick={reset} className="sm:w-auto">
              Try again
            </Button>
            <Button variant="outline" asChild>
              <Link href="/">Back to Home</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

