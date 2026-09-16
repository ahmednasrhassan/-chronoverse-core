import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import AnalyticsProductView from
  "@/components/analytics/AnalyticsProductView";
import VipEstrMarketRoom from
  "@/components/vip/market-room/VipEstrMarketRoom";
import VipFxMarketRoom from
  "@/components/vip/market-room/VipFxMarketRoom";
import { requireVipV1 } from "@/lib/auth/guards";
import { enforceVipPageAccessV1 } from "@/lib/auth/vipPageAccess";
import { getFiveProductVipDeepProjectionV1 } from
  "@/lib/markets/services/canonicalProductResults";
import { getHistoricalChartSeriesV1 } from
  "@/lib/markets/services/historicalChartSeries";
import { assembleAuthorizedVipMarketRoomV1 } from
  "@/lib/markets/services/vipMarketRoomDelivery";

export const metadata: Metadata = {
  title: "VIP Market Room | Chronoverse Capital",
  description:
    "Protected ECB reference-rate history and Deep intelligence for the Chronoverse market universe.",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

interface VipMarketRoomPageProps {
  readonly params: Promise<{ readonly market: string }>;
}

export default async function VipMarketRoomPage({
  params,
}: VipMarketRoomPageProps) {
  const { market } = await params;
  const access = await enforceVipPageAccessV1(requireVipV1, redirect);
  const room = await assembleAuthorizedVipMarketRoomV1(market, {
    authorize: async () => access,
    loadDeep: getFiveProductVipDeepProjectionV1,
    loadHistorical: getHistoricalChartSeriesV1,
  });

  if (room === null) {
    notFound();
  }

  if (room.productId === "estr") {
    return (
      <>
        {access.state === "vip_active" ? (
          <AnalyticsProductView contentId="estr" accessState="vip_active" />
        ) : null}
        <VipEstrMarketRoom room={room} />
      </>
    );
  }

  return (
    <>
      {access.state === "vip_active" ? (
        <AnalyticsProductView
          contentId={room.productId}
          accessState="vip_active"
        />
      ) : null}
      <VipFxMarketRoom room={room} />
    </>
  );
}
