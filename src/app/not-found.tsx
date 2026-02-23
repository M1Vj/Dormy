import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6">
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="text-sm text-muted-foreground">
          The page you requested does not exist or is no longer available.
        </p>
        <Button variant="outline" asChild>
          <Link href="/">Back to App</Link>
        </Button>
      </div>
    </div>
  );
}
