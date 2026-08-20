import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Header from "@/components/navigation/Header";
import Footer from "@/components/navigation/Footer";
import "./globals.css";
import CookieConsentWrapper from "@/components/CookieConsentWrapper";
import Script from "next/script";

// next/font optimization
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
const DEFAULT_DESCRIPTION = "Chronoverse Capital offers institutional-grade macroeconomic intelligence, expert asset allocation strategies, and deep-dive financial market research.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: {
    types: {
      "application/rss+xml": [
        { url: "/rss.xml", title: `${SITE_NAME} - RSS Feed` },
      ],
    },
  },
  title: {
    default: "Chronoverse Capital | Institutional Macroeconomic Intelligence",
    template: "%s | Chronoverse",
  },
  description: DEFAULT_DESCRIPTION, 
  keywords: [
    "Macro",
    "Finance",
    "Asset Allocation",
    "Research",
    "Chronoverse Capital",
  ],
  authors: [{ name: "Chronoverse Capital Team" }],
  icons: {
    icon: "https://cdn.sanity.io/images/xfs4j01p/production/a03a88e45b450a8f347633edf76d251bd9881fea-1080x1358.jpg",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "Chronoverse Capital | Institutional Macroeconomic Intelligence",
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
    title: "Chronoverse Capital | Institutional Macroeconomic Intelligence",
    description: DEFAULT_DESCRIPTION,
    site: "@ChronoVerseCap",
    creator: "@ChronoVerseCap",
    images: ["https://cdn.sanity.io/images/xfs4j01p/production/a03a88e45b450a8f347633edf76d251bd9881fea-1080x1358.jpg"],
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

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID || "G-DWYKG5J33W";

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
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_MEASUREMENT_ID}', {
                page_path: window.location.pathname,
                send_page_view: true
              });

              function loadGtagScript() {
                var s = document.createElement('script');
                s.src = 'https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}';
                s.async = true;
                document.head.appendChild(s);
              }

              if ('requestIdleCallback' in window) {
                window.requestIdleCallback(loadGtagScript);
              } else {
                setTimeout(loadGtagScript, 2000);
              }
            `,
          }}
        />

      </head>
      <body className="min-h-full flex flex-col bg-[#120e0c] text-zinc-100 font-sans">
        <Header />
        <main className="flex-1 w-full bg-[#120e0c]">{children}</main>
        <Footer />
        <CookieConsentWrapper />
      </body>
    </html>
  );
}
