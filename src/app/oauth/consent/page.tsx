"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function OAuthConsentPage() {
  const router = useRouter();

  useEffect(() => {
    router.push("/home");
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Redirecting...</h1>
        <p className="text-muted-foreground">Please wait while we sign you in.</p>
      </div>
    </div>
  );
}
