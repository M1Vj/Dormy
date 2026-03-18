"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { BackButton } from "@/components/ui/back-button";

function getFallbackHref(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length <= 2) {
    return null;
  }

  return `/${segments.slice(0, -1).join("/")}`;
}

export function RoleSubpageBackButton() {
  const pathname = usePathname();

  const fallbackHref = useMemo(() => getFallbackHref(pathname), [pathname]);
  if (!fallbackHref) {
    return null;
  }

  return (
    <div className="mb-4">
      <BackButton fallbackHref={fallbackHref} size="sm" variant="outline" className="gap-2">
        <ArrowLeft className="h-4 w-4" />
        Back
      </BackButton>
    </div>
  );
}
