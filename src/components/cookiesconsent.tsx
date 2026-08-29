'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export default function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);

  const [preferences, setPreferences] = useState({
    necessary: true,
    analytics: true,
    marketing: false,
  });

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const consent =
          localStorage.getItem('chrono_cookie_consent') ||
          localStorage.getItem('cookie_consent');
        if (!consent) {
          setShowBanner(true);
        }
      }
    } catch {
      // تفادي التوقف في حال حظر التخزين في وضع التصفح الخفي
    }
  }, []);

  const updateGtagConsent = (analytics: boolean, marketing: boolean) => {
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        analytics_storage: analytics ? 'granted' : 'denied',
        ad_storage: marketing ? 'granted' : 'denied',
        ad_user_data: marketing ? 'granted' : 'denied',
        ad_personalization: marketing ? 'granted' : 'denied',
      });
    }
  };

  const safeSetStorage = (key: string, value: string) => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(key, value);
      }
    } catch {
      // تجاهل أخطاء التخزين الصارم
    }
  };

  const handleAcceptAll = () => {
    const fullConsent = { necessary: true, analytics: true, marketing: true };
    safeSetStorage('chrono_cookie_consent', JSON.stringify(fullConsent));
    safeSetStorage('cookie_consent', 'granted');
    updateGtagConsent(true, true);
    setShowBanner(false);
  };

  const handleRejectAll = () => {
    const minConsent = { necessary: true, analytics: false, marketing: false };
    safeSetStorage('chrono_cookie_consent', JSON.stringify(minConsent));
    safeSetStorage('cookie_consent', 'denied');
    updateGtagConsent(false, false);
    setShowBanner(false);
  };

  const handleSavePreferences = () => {
    safeSetStorage('chrono_cookie_consent', JSON.stringify(preferences));
    safeSetStorage('cookie_consent', 'granted');
    updateGtagConsent(preferences.analytics, preferences.marketing);
    setShowBanner(false);
    setShowPreferences(false);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6 bg-[#050506]/95 backdrop-blur-md border-t border-border text-secondary shadow-2xl font-sans">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-6">
        {!showPreferences ? (
          <>
            <div className="space-y-2 text-center lg:text-left">
              <h3 className="text-sm font-bold tracking-wider text-mauve uppercase">
                Privacy &amp; Cookie Preferences
              </h3>
              <p className="text-xs text-secondary leading-relaxed max-w-3xl">
                We use cookies to enhance your browsing experience, serve personalized market insights, and analyze our traffic in compliance with GDPR. By clicking &quot;Accept All&quot;, you consent to our use of cookies. Read our{' '}
                <Link href="/privacy-policy" className="text-mauve underline hover:text-purple-brand transition">
                  Privacy Policy
                </Link>.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 w-full lg:w-auto shrink-0">
              <button
                type="button"
                onClick={() => setShowPreferences(true)}
                className="px-4 py-2 text-xs font-semibold text-secondary bg-raised/80 hover:bg-raised border border-purple-border rounded transition cursor-pointer"
              >
                Preferences
              </button>
              <button
                type="button"
                onClick={handleRejectAll}
                className="px-4 py-2 text-xs font-semibold text-secondary bg-raised/80 hover:bg-raised border border-purple-border rounded transition cursor-pointer"
              >
                Reject All
              </button>
              <button
                type="button"
                onClick={handleAcceptAll}
                className="px-5 py-2 text-xs font-bold text-[#050506] bg-mauve hover:bg-purple-brand rounded shadow transition cursor-pointer"
              >
                Accept All
              </button>
            </div>
          </>
        ) : (
          <div className="w-full space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="text-sm font-bold text-mauve uppercase">Cookie Settings</h3>
              <button
                type="button"
                onClick={() => setShowPreferences(false)}
                className="text-xs text-secondary hover:text-purple-brand cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-3 bg-raised/60 rounded border border-border">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-primary">Essential</span>
                  <span className="text-[10px] text-emerald-400 font-mono uppercase">Always Active</span>
                </div>
                <p className="text-secondary text-[11px]">Required for the website to function securely.</p>
              </div>

              <div className="p-3 bg-raised/60 rounded border border-border">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-primary">Analytics</span>
                  <input
                    type="checkbox"
                    aria-label="Toggle analytics cookies"
                    checked={preferences.analytics}
                    onChange={(e) => setPreferences({ ...preferences, analytics: e.target.checked })}
                    className="accent-[#A77BD8] cursor-pointer"
                  />
                </div>
                <p className="text-secondary text-[11px]">Helps us understand how visitors interact with the platform.</p>
              </div>

              <div className="p-3 bg-raised/60 rounded border border-border">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-primary">Marketing</span>
                  <input
                    type="checkbox"
                    aria-label="Toggle marketing cookies"
                    checked={preferences.marketing}
                    onChange={(e) => setPreferences({ ...preferences, marketing: e.target.checked })}
                    className="accent-[#A77BD8] cursor-pointer"
                  />
                </div>
                <p className="text-secondary text-[11px]">Used to deliver relevant insights and sponsor offers.</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleSavePreferences}
                className="px-5 py-2 text-xs font-bold text-[#050506] bg-mauve hover:bg-purple-brand rounded shadow transition cursor-pointer"
              >
                Save Preferences
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
