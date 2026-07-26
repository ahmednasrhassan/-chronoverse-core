import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "ChronoVerse Capital | Institutional Macroeconomic Intelligence",
    template: "%s | ChronoVerse Capital",
  },
  description:
    "Premier macroeconomic research, asset allocation intelligence, and institutional financial insights.",
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
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#120e0c] text-zinc-100 selection:bg-[#c87d55]/30 selection:text-zinc-100">
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}