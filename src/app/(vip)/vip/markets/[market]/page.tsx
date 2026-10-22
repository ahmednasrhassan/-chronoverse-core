import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RETIRED_PAGE_METADATA } from "@/config/siteAvailability";

export const metadata: Metadata = RETIRED_PAGE_METADATA;

// The former implementation is preserved in archive/legacy-paid-intelligence/.
// Retire before reading route parameters, identity, or market data.
export default async function VipMarketRoomPage(props: {
  readonly params: Promise<{ readonly market: string }>;
}): Promise<never> {
  void props;
  notFound();
}
