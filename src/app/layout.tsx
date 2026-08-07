import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Header from "@/components/navigation/Header";
import Footer from "@/components/navigation/Footer";
import CookieConsent from "@/components/cookiesconsent";
import "./globals.css";
import "katex/dist/katex.min.css";
import { GoogleAnalytics } from "@next/third-parties/google";
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://www.chronoversecapital.com";
const SITE_NAME = "Chronoverse Capital";
const DEFAULT_DESCRIPTION =
  "Premier macroeconomic research, asset allocation intelligence, and institutional financial analysis.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: "./",
  },
  title: {
    default: "Chronoverse Capital | Institutional Macroeconomic Intelligence",
    template: "%s | Chronoverse Capital",
  },
  description: DEFAULT_DESCRIPTION,
  keywords: [
    "Macroeconomics",
    "Finance",
    "Asset Allocation",
    "Research",
    "Chronoverse Capital",
  ],
  authors: [{ name: "Chronoverse Capital Team" }],
  icons: {
    icon: "/favicon.jpeg",
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
        url: "/favicon.jpeg",
        width: 512,
        height: 512,
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
    images: ["/favicon.jpeg"],
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


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#120e0c] text-zinc-100 font-sans">
        <Header />
        {/* Main Content Wrapper */}
        <main className="flex-1 w-full bg-[#120e0c]">
          {children}
        </main>
        <Footer />
        <CookieConsent />
        <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID || "G-DWYKG5J33W"} />
      </body>
    </html>
  );
}