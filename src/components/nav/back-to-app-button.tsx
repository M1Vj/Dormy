"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/components/providers/auth-provider"

export function BackToAppButton({ text = "Back to app" }: { text?: string }) {
  const { role } = useAuth();
  const safeRole = role || "occupant";

  return (
    <Button asChild>
      <Link href={`/${safeRole}/home`}>{text}</Link>
    </Button>
  )
}
