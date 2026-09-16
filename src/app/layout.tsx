import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Suspense } from "react";

import CookieConsentWrapper from "@/components/CookieConsentWrapper";
import AnalyticsPageViewTracker from
  "@/components/analytics/AnalyticsPageViewTracker";
import { buildPublicPageMetadata } from "@/lib/seo/metadata";
import { canonicalSiteOrigin } from "@/lib/seo/site-url";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: true,
});

const DEFAULT_TITLE = "Chronoverse Capital | Five-Market Intelligence";
const DEFAULT_DESCRIPTION =
  "Free Lite and VIP Deep market intelligence for EUR/USD, EUR/JPY, EUR/GBP, EUR/CHF, and €STR, alongside independent market research.";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#050506",
};

export const metadata: Metadata = {
  ...buildPublicPageMetadata({
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    pathname: "/",
  }),
  metadataBase: new URL(canonicalSiteOrigin),

  title: {
    default: DEFAULT_TITLE,
    template: "%s | Chronoverse",
  },

  description: DEFAULT_DESCRIPTION,

  keywords: [
    "EUR/USD",
    "EUR/JPY",
    "EUR/GBP",
    "EUR/CHF",
    "€STR",
    "Market Intelligence",
    "Financial Research",
    "Chronoverse Capital",
  ],

  robots: {
    index: true,
    follow: true,

    googleBot: {
      index: true,
      follow: true,
    },
  },
};

const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_ID || "G-DWYKG5J33W";
const GA_MEASUREMENT_ID_JSON = JSON.stringify(GA_MEASUREMENT_ID);

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <Script
          id="perf-google-analytics"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              window.gtag = window.gtag || function gtag(){
                window.dataLayer.push(arguments);
              };

              function hasChronoverseAnalyticsConsent() {
                try {
                  var detailedConsent = localStorage.getItem('chrono_cookie_consent');
                  if (detailedConsent) {
                    var parsedConsent = JSON.parse(detailedConsent);
                    return parsedConsent && parsedConsent.analytics === true;
                  }
                  return localStorage.getItem('cookie_consent') === 'granted';
                } catch (_) {
                  return false;
                }
              }

              function isChronoverseAnalyticsLocation() {
                var pathname = window.location.pathname;
                return window.location.hostname.toLowerCase() === 'chronoversecapital.com'
                  && pathname !== '/studio'
                  && !pathname.startsWith('/studio/')
                  && pathname !== '/api'
                  && !pathname.startsWith('/api/')
                  && pathname !== '/auth'
                  && !pathname.startsWith('/auth/')
                  && pathname !== '/_next'
                  && !pathname.startsWith('/_next/');
              }

              function currentAnalyticsPagePath() {
                var source = new URLSearchParams(window.location.search);
                var safe = new URLSearchParams();
                ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'market']
                  .forEach(function copySafeAnalyticsParameter(key) {
                    source.getAll(key).forEach(function appendSafeAnalyticsParameter(value) {
                      safe.append(key, value);
                    });
                  });
                var query = safe.toString();
                return window.location.pathname + (query ? '?' + query : '');
              }

              window.gtag('consent', 'default', {
                analytics_storage: 'denied',
                ad_storage: 'denied',
                ad_user_data: 'denied',
                ad_personalization: 'denied',
                wait_for_update: 500
              });

              window.loadChronoverseAnalytics = function loadChronoverseAnalytics() {
                if (!hasChronoverseAnalyticsConsent() || !isChronoverseAnalyticsLocation()) return;
                if (window.__chronoverseAnalyticsLoaded) return;
                window.__chronoverseAnalyticsLoaded = true;

                var measurementId = ${GA_MEASUREMENT_ID_JSON};
                window.gtag('consent', 'update', {
                  analytics_storage: 'granted',
                  ad_storage: 'denied',
                  ad_user_data: 'denied',
                  ad_personalization: 'denied'
                });
                window.gtag('js', new Date());
                window.gtag('config', measurementId, {
                  send_page_view: false
                });

                var pagePath = currentAnalyticsPagePath();
                window.gtag('event', 'page_view', {
                  page_path: pagePath,
                  page_location: window.location.origin + pagePath,
                  page_title: document.title,
                  page_referrer: document.referrer
                });

                var s = document.createElement('script');
                s.src =
                  'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
                s.async = true;
                s.dataset.chronoverseAnalytics = 'true';
                document.head.appendChild(s);
                window.dispatchEvent(new Event('chronoverse:analytics-ready'));
              };

              var analyticsAllowed = hasChronoverseAnalyticsConsent();
              if (analyticsAllowed) window.loadChronoverseAnalytics();
            `,
          }}
        />
      </head>

      <body className="min-h-full font-sans overflow-x-hidden">
        {children}

        <Suspense fallback={null}>
          <AnalyticsPageViewTracker />
        </Suspense>
        <CookieConsentWrapper />
      </body>
    </html>
  );
}
