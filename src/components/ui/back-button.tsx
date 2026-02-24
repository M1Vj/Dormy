"use client";

import { useRouter } from "next/navigation";
import { Button, type ButtonProps } from "@/components/ui/button";

interface BackButtonProps extends Omit<ButtonProps, "onClick"> {
  fallbackHref?: string;
  children?: React.ReactNode;
}

/**
 * Client-side back button that uses router.back().
 * Falls back to a given href if there's no history.
 */
export function BackButton({
  fallbackHref,
  children = "Back",
  ...props
}: BackButtonProps) {
  const router = useRouter();

  return (
    <Button
      {...props}
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
        } else if (fallbackHref) {
          router.push(fallbackHref);
        }
      }}
    >
      {children}
    </Button>
  );
}
