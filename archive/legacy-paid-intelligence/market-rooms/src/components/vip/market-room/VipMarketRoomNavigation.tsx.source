import Link from "next/link";

import { LAUNCH_MARKETS_V1 } from "@/config/institutionalNavigation";
import type { MarketProjectionProductIdV1 } from
  "@/lib/markets/projections/types";

interface VipMarketRoomNavigationProps {
  readonly selectedMarket: MarketProjectionProductIdV1;
}

export default function VipMarketRoomNavigation({
  selectedMarket,
}: VipMarketRoomNavigationProps) {
  return (
    <div className="py-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <nav aria-label="VIP workspace" className="flex flex-wrap items-center gap-2 text-[11px]">
          <Link
            href="/vip"
            prefetch={false}
            className="inline-flex min-h-11 items-center rounded-sm px-2 text-[#CFC5B8] hover:text-[#F3EBDD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8]"
          >
            VIP Overview
          </Link>
          <span aria-hidden="true" className="text-[#6F4C91]">/</span>
          <Link
            href="/vip/markets"
            prefetch={false}
            className="inline-flex min-h-11 items-center rounded-sm px-2 text-[#CFC5B8] hover:text-[#F3EBDD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8]"
          >
            Markets directory
          </Link>
        </nav>

        <nav aria-label="VIP Market Rooms" className="max-w-full">
          <div className="flex max-w-full flex-wrap gap-1.5">
            {LAUNCH_MARKETS_V1.map((market) => {
              const isSelected = market.productId === selectedMarket;

              return (
                <Link
                  key={market.productId}
                  href={`/vip/markets/${market.productId}`}
                  prefetch={false}
                  aria-current={isSelected ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center border px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8] ${
                    isSelected
                      ? "border-[#C8A7E8] bg-[#A77BD8]/15 text-[#F3EBDD]"
                      : "border-[#6F4C91]/35 bg-[#09090C] text-[#CFC5B8] hover:border-[#A77BD8] hover:text-[#F3EBDD]"
                  }`}
                >
                  {market.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
