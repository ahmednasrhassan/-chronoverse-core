import type { Metadata } from "next";
import { redirect } from "next/navigation";

import VipOverviewSurface from "@/components/vip/VipOverviewSurface";
import { requireVipV1 } from "@/lib/auth/guards";
import { enforceVipPageAccessV1 } from "@/lib/auth/vipPageAccess";
import { selectVipMarketV1 } from
  "@/lib/markets/projections/vipMarketSelection";
import { getFiveProductVipDeepProjectionMapV1 } from
  "@/lib/markets/services/canonicalProductResults";

export const metadata: Metadata = {
  title: "VIP Overview | Chronoverse Capital",
  description:
    "Deep decision intelligence for the Chronoverse five-market universe.",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

interface VipOverviewPageProps {
  readonly searchParams: Promise<{
    readonly market?: string | readonly string[];
  }>;
}

export default async function VipOverviewPage({
  searchParams,
}: VipOverviewPageProps) {
  await enforceVipPageAccessV1(requireVipV1, redirect);

  const projections = await getFiveProductVipDeepProjectionMapV1();
  const selectedMarket = selectVipMarketV1((await searchParams).market);

  return (
    <VipOverviewSurface
      projections={projections}
      selectedMarket={selectedMarket}
    />
  );
}
