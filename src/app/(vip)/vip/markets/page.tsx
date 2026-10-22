import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RETIRED_PAGE_METADATA } from "@/config/siteAvailability";

export const metadata: Metadata = RETIRED_PAGE_METADATA;

// Preserve the disabled route without loading the archived market-room stack.
export default async function VipMarketsPage(): Promise<never> {
  notFound();
}
