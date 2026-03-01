"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { useTheme } from "next-themes"

/**
 * Toaster wrapper around sonner that picks up the active next-themes value.
 *
 * NOTE: `useTheme` from next-themes returns `undefined` on the first server
 * render (before hydration) and the real theme afterwards.  When the hook's
 * return value changes between the server and client renders React sees a
 * *different number of rendered hooks* which triggers error #310 ("Rendered
 * more hooks than during the previous render").
 *
 * The `theme ?? "system"` default ensures a stable fallback so the same
 * code-path always runs, keeping the hook call-count identical on every render.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme()

  return (
    <Sonner
      theme={(resolvedTheme as ToasterProps["theme"]) ?? "system"}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
