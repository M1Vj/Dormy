"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Top-of-viewport progress bar that animates during route transitions.
 * Detects pathname changes and shows a smooth progress animation.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const [isNavigating, setIsNavigating] = useState(false);
  const [progress, setProgress] = useState(0);
  const prevPathRef = useRef(pathname);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (pathname === prevPathRef.current) return;

    prevPathRef.current = pathname;

    // The new route has rendered — finish the bar
    setProgress(100);
    setIsNavigating(true);

    // Hide after the completion animation
    timerRef.current = setTimeout(() => {
      setIsNavigating(false);
      setProgress(0);
    }, 400);

    return () => {
      clearTimeout(timerRef.current);
      clearInterval(intervalRef.current);
    };
  }, [pathname]);

  // Intercept link clicks to start the bar early
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("http") || href.startsWith("mailto:")) return;

      // Resolve relative paths
      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;

      // Start progress
      setIsNavigating(true);
      setProgress(15);

      // Gradually increase progress
      clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            clearInterval(intervalRef.current);
            return prev;
          }
          // Slow down as we get further
          const increment = prev < 50 ? 8 : prev < 70 ? 4 : 2;
          return Math.min(prev + increment, 90);
        });
      }, 200);
    }

    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      clearInterval(intervalRef.current);
    };
  }, []);

  if (!isNavigating && progress === 0) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[9999] h-[3px] pointer-events-none"
      role="progressbar"
      aria-valuenow={progress}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-r-full bg-primary shadow-[0_0_8px_var(--primary)] transition-all duration-300 ease-out"
        style={{
          width: `${progress}%`,
          opacity: progress >= 100 ? 0 : 1,
          transition:
            progress >= 100
              ? "width 200ms ease-out, opacity 400ms ease-out 200ms"
              : "width 300ms ease-out",
        }}
      />
    </div>
  );
}
