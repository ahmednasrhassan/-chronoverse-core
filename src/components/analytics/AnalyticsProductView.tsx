"use client";

import { useEffect } from "react";

import {
  ANALYTICS_READY_EVENT_V1,
  trackProductViewV1,
  type AnalyticsProductAccessStateV1,
  type AnalyticsProductIdV1,
} from "@/lib/analytics/client";

interface AnalyticsProductViewProps {
  readonly contentId: AnalyticsProductIdV1;
  readonly accessState: AnalyticsProductAccessStateV1;
}

export default function AnalyticsProductView({
  contentId,
  accessState,
}: AnalyticsProductViewProps) {
  useEffect(() => {
    let sent = false;
    const sendOnce = () => {
      if (!sent && trackProductViewV1(contentId, accessState)) {
        sent = true;
      }
    };

    sendOnce();
    window.addEventListener(ANALYTICS_READY_EVENT_V1, sendOnce);

    return () => {
      window.removeEventListener(ANALYTICS_READY_EVENT_V1, sendOnce);
    };
  }, [accessState, contentId]);

  return null;
}
