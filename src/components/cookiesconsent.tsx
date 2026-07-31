'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);

  // Cookie Categories State
  const [preferences, setPreferences] = useState({
    necessary: true, // Always required
    analytics: true,
    marketing: false,
  });

  useEffect(() => {
    // Check if user has already made a choice
    const consent = localStorage.getItem('chrono_cookie_consent');
    if (!consent) {
      setShowBanner(true);
    }
  }, []);

  const handleAcceptAll = () => {
    const fullConsent = { necessary: true, analytics: true, marketing: true };
    localStorage.setItem('chrono_cookie_consent', JSON.stringify(fullConsent));
    setShowBanner(false);
  };

  const handleRejectAll = () => {
    const minConsent = { necessary: true, analytics: false, marketing: false };
    localStorage.setItem('chrono_cookie_consent', JSON.stringify(minConsent));
    setShowBanner(false);
  };

  const handleSavePreferences = () => {
    localStorage.setItem('chrono_cookie_consent', JSON.stringify(preferences));
    setShowBanner(false);
    setShowPreferences(false);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6 bg-[#0a0a0c]/95 backdrop-blur-md border-t border-zinc-800 text-zinc-300 shadow-2xl font-sans">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-6">
        
        {/* Main Banner Message */}
        {!showPreferences ? (
          <>
            <div className="space-y-2 text-center lg:text-left">
              <h3 className="text-sm font-bold tracking-wider text-white uppercase">
                Privacy & Cookie Preferences
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed max-w-3xl">
                We use cookies to enhance your browsing experience, serve personalized market insights, and analyze our traffic in compliance with GDPR. By clicking &quot;Accept All&quot;, you consent to our use of cookies. Read our{' '}
                <Link href="/privacy-policy" className="text-[#c87d55] underline hover:text-white transition">
                  Privacy Policy
                </Link>.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-3 w-full lg:w-auto shrink-0">
              <button
                onClick={() => setShowPreferences(true)}
                className="px-4 py-2 text-xs font-semibold text-zinc-300 bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 rounded transition"
              >
                Preferences
              </button>
              <button
                onClick={handleRejectAll}
                className="px-4 py-2 text-xs font-semibold text-zinc-300 bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 rounded transition"
              >
                Reject All
              </button>
              <button
                onClick={handleAcceptAll}
                className="px-5 py-2 text-xs font-bold text-zinc-950 bg-[#c87d55] hover:bg-[#d88d65] rounded shadow transition"
              >
                Accept All
              </button>
            </div>
          </>
        ) : (
          /* Preferences Modal / View */
          <div className="w-full space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-white uppercase">Cookie Settings</h3>
              <button
                onClick={() => setShowPreferences(false)}
                className="text-xs text-zinc-400 hover:text-white"
              >
                ✕ Close
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              {/* Essential */}
              <div className="p-3 bg-zinc-900/60 rounded border border-zinc-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-white">Essential</span>
                  <span className="text-[10px] text-emerald-400 font-mono uppercase">Always Active</span>
                </div>
                <p className="text-zinc-500 text-[11px]">Required for the website to function securely.</p>
              </div>

              {/* Analytics */}
              <div className="p-3 bg-zinc-900/60 rounded border border-zinc-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-white">Analytics</span>
                  <input
                    type="checkbox"
                    checked={preferences.analytics}
                    onChange={(e) => setPreferences({ ...preferences, analytics: e.target.checked })}
                    className="accent-[#c87d55] cursor-pointer"
                  />
                </div>
                <p className="text-zinc-500 text-[11px]">Helps us understand how visitors interact with the platform.</p>
              </div>

              {/* Marketing */}
              <div className="p-3 bg-zinc-900/60 rounded border border-zinc-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-white">Marketing</span>
                  <input
                    type="checkbox"
                    checked={preferences.marketing}
                    onChange={(e) => setPreferences({ ...preferences, marketing: e.target.checked })}
                    className="accent-[#c87d55] cursor-pointer"
                  />
                </div>
                <p className="text-zinc-500 text-[11px]">Used to deliver relevant insights and sponsor offers.</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={handleSavePreferences}
                className="px-5 py-2 text-xs font-bold text-zinc-950 bg-[#c87d55] hover:bg-[#d88d65] rounded shadow transition"
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