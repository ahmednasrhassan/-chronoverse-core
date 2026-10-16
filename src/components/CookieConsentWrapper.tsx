"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

const CookieConsent = dynamic(() => import("./cookiesconsent"), {
  ssr: false,
});

export default function CookieConsentWrapper() {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        const consent =
          localStorage.getItem("chrono_cookie_consent") ||
          localStorage.getItem("cookie_consent");
        if (consent) {
          return;
        }
      }
    } catch {
      // تفادي التوقف في حال كان المتصفح يمنع التخزين (Incognito / Strict Storage Blocker)
    }

    const handleInteraction = () => {
      setShouldRender(true);
    };

    window.addEventListener("scroll", handleInteraction, { once: true });
    window.addEventListener("pointerdown", handleInteraction, { once: true });
    window.addEventListener("keydown", handleInteraction, { once: true });

    const timer = setTimeout(() => {
      setShouldRender(true);
    }, 4000);

    return () => {
      window.removeEventListener("scroll", handleInteraction);
      window.removeEventListener("pointerdown", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
      clearTimeout(timer);
    };
  }, []);

  if (!shouldRender) return null;

  return <CookieConsent />;
}
