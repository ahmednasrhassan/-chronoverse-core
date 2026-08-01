import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Header from "@/components/navigation/Header";
import Footer from "@/components/navigation/Footer";
import CookieConsent from "@/components/cookiesconsent";
import "./globals.css";
import { GoogleAnalytics } from "@next/third-parties/google";
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.chronoversecapital.com"),
  alternates: {
    canonical: "./",
  },
  title: {
    default: "ChronoVerse Capital | Institutional Macroeconomic Intelligence",
    template: "%s | ChronoVerse Capital",
  },
  description: "Premier macroeconomic research, asset allocation intelligence, and institutional financial analysis.",
  keywords: [
    "Macroeconomics",
    "Finance",
    "Asset Allocation",
    "Research",
    "ChronoVerse Capital",
  ],
  authors: [{ name: "ChronoVerse Capital Team" }],
  icons: {
    icon: "/favicon.jpeg",
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