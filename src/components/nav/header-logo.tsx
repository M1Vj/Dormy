"use client"

import Image from "next/image"
import Link from "next/link"
import { useAuth } from "@/components/providers/auth-provider"

export function HeaderLogo() {
  const { role } = useAuth();
  const safeRole = role || "occupant";

  return (
    <Link href={`/${safeRole}/home`} className="flex items-center gap-2">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/70 bg-muted/35">
        <Image
          src="/brand/dormy-house.png"
          alt="Dormy mark"
          width={20}
          height={20}
          className="h-5 w-5"
          priority
        />
      </span>
      <span className="font-semibold">Dormy</span>
    </Link>
  )
}
