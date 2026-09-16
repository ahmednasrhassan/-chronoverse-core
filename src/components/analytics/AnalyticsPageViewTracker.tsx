"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import {
  advancePageViewTransitionV1,
  buildAnalyticsPagePathV1,
  trackPageViewV1,
} from "@/lib/analytics/client";

export default function AnalyticsPageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const previousPath = useRef<string | null>(null);
  const currentPath = buildAnalyticsPagePathV1(
    pathname,
    searchParams.toString(),
  );

  useEffect(() => {
    const transition = advancePageViewTransitionV1(
      previousPath.current,
      currentPath,
    );
    previousPath.current = transition.currentPath;

    if (transition.shouldTrack) {
      trackPageViewV1(transition.currentPath, transition.previousPath);
    }
  }, [currentPath]);

  return null;
}
