import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import VipFxMarketRoom from
  "@/components/vip/market-room/VipFxMarketRoom";
import { requireVipV1 } from "@/lib/auth/guards";
import { enforceVipPageAccessV1 } from "@/lib/auth/vipPageAccess";
import { getFiveProductVipDeepProjectionV1 } from
  "@/lib/markets/services/canonicalProductResults";
import { getHistoricalChartSeriesV1 } from
  "@/lib/markets/services/historicalChartSeries";
import { assembleAuthorizedVipFxMarketRoomV1 } from
  "@/lib/markets/services/vipMarketRoomDelivery";

export const metadata: Metadata = {
  title: "VIP FX Market Room | Chronoverse Capital",
  description:
    "Protected ECB reference-rate history and Deep decision intelligence for the Chronoverse FX universe.",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

interface VipFxMarketRoomPageProps {
  readonly params: Promise<{ readonly market: string }>;
}

export default async function VipFxMarketRoomPage({
  params,
}: VipFxMarketRoomPageProps) {
  const { market } = await params;
  const room = await assembleAuthorizedVipFxMarketRoomV1(market, {
    authorize: () => enforceVipPageAccessV1(requireVipV1, redirect),
    loadDeep: getFiveProductVipDeepProjectionV1,
    loadHistorical: getHistoricalChartSeriesV1,
  });

  if (room === null) {
    notFound();
  }

  return <VipFxMarketRoom room={room} />;
}
