import type { Metadata } from "next";
import type { ReactNode } from "react";

import Footer from "@/components/navigation/Footer";
import Header from "@/components/navigation/Header";

export const metadata: Metadata = {
  title: "Chronoverse VIP | Deep Intelligence",
  description:
    "Private decision intelligence for the Chronoverse five-market universe.",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function VipLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-[#050506] text-[#F3EBDD]">
      <Header />
      <main className="min-w-0 flex-1 bg-[#050506]">{children}</main>
      <Footer />
    </div>
  );
}
