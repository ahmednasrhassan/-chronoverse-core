import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";

import CookieConsentWrapper from "@/components/CookieConsentWrapper";

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

const SITE_URL = "https://chronoversecapital.com";
const SITE_NAME = "Chronoverse Capital";

const DEFAULT_DESCRIPTION =
  "Free Lite and VIP Deep market intelligence for EUR/USD, EUR/JPY, EUR/GBP, EUR/CHF, and €STR, alongside independent market research.";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#050506",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  alternates: {
    types: {
      "application/rss+xml": [
        {
          url: "/rss.xml",
          title: `${SITE_NAME} - RSS Feed`,
        },
      ],
    },
  },

  title: {
    default:
      "Chronoverse Capital | Five-Market Intelligence",
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

  authors: [
    {
      name: "Chronoverse Capital Team",
    },
  ],

  icons: {
    icon: "https://cdn.sanity.io/images/xfs4j01p/production/a03a88e45b450a8f347633edf76d251bd9881fea-1080x1358.jpg",
  },

  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title:
      "Chronoverse Capital | Five-Market Intelligence",
    description: DEFAULT_DESCRIPTION,
    locale: "en_US",

    images: [
      {
        url: "https://cdn.sanity.io/images/xfs4j01p/production/a03a88e45b450a8f347633edf76d251bd9881fea-1080x1358.jpg",
        width: 1080,
        height: 1358,
        alt: SITE_NAME,
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title:
      "Chronoverse Capital | Five-Market Intelligence",
    description: DEFAULT_DESCRIPTION,
    site: "@ChronoVerseCap",
    creator: "@ChronoVerseCap",

    images: [
      "https://cdn.sanity.io/images/xfs4j01p/production/a03a88e45b450a8f347633edf76d251bd9881fea-1080x1358.jpg",
    ],
  },

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

              window.gtag('consent', 'default', {
                analytics_storage: 'denied',
                ad_storage: 'denied',
                ad_user_data: 'denied',
                ad_personalization: 'denied',
                wait_for_update: 500
              });

              window.loadChronoverseAnalytics = function loadChronoverseAnalytics() {
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
                  page_path: window.location.pathname,
                  send_page_view: true
                });

                var s = document.createElement('script');
                s.src =
                  'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
                s.async = true;
                s.dataset.chronoverseAnalytics = 'true';
                document.head.appendChild(s);
              };

              var analyticsAllowed = false;
              try {
                var detailedConsent = localStorage.getItem('chrono_cookie_consent');
                if (detailedConsent) {
                  var parsedConsent = JSON.parse(detailedConsent);
                  analyticsAllowed = parsedConsent && parsedConsent.analytics === true;
                } else {
                  analyticsAllowed = localStorage.getItem('cookie_consent') === 'granted';
                }
              } catch (_) {
                analyticsAllowed = false;
              }

              if (analyticsAllowed) window.loadChronoverseAnalytics();
            `,
          }}
        />
      </head>

      <body className="min-h-full font-sans overflow-x-hidden">
        {children}

        <CookieConsentWrapper />
      </body>
    </html>
  );
}
