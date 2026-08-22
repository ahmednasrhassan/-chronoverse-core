import type {
  HistoricalDataRequest,
  HistoricalDataResponse,
  MarketQuote,
} from "../premium/provider";

import type {
  PremiumMarketDataProvider,
  PremiumProviderInfo,
} from "../premium/provider";

import { marketstackClient } from "./client";
import { mapMarketstackResponseToCandles } from "./mapper";

/**
 * Chronoverse Marketstack Adapter
 *
 * Marketstack remains an implementation detail.
 * The rest of Chronoverse communicates only through
 * normalized market-data contracts.
 */
export class MarketstackProvider
  implements PremiumMarketDataProvider
{
  readonly id = "marketstack";
  readonly tier = "premium" as const;

  readonly info: PremiumProviderInfo = {
    id: "marketstack",
    name: "Chronoverse Market Data",

    capabilities: {
      realtime: false,
      historical: true,
      websocket: false,

      stocks: true,
      indices: false,
      forex: false,
      crypto: false,
      commodities: false,
      fixedIncome: false,
    },
  };

  isConfigured(): boolean {
    return marketstackClient.isConfigured();
  }

  async getQuote(
    _symbol: string
  ): Promise<MarketQuote> {
    throw new Error(
      "[Chronoverse Markets] Live quote data is not available through the current free provider."
    );
  }

  async getQuotes(
    _symbols: string[]
  ): Promise<MarketQuote[]> {
    throw new Error(
      "[Chronoverse Markets] Live quote data is not available through the current free provider."
    );
  }

  async getHistoricalData(
    request: HistoricalDataRequest
  ): Promise<HistoricalDataResponse> {
    const response = await marketstackClient.getEod(
      request.symbol,
      {
        dateFrom: request.from
          ? toIsoDate(request.from)
          : undefined,

        dateTo: request.to
          ? toIsoDate(request.to)
          : undefined,

        limit: 1000,
      }
    );

    const candles =
      mapMarketstackResponseToCandles(response);

    return {
      symbol: request.symbol,
      interval: request.interval,
      candles,

      provider: this.id,
      status: "end_of_day",
    };
  }
}

function toIsoDate(
  unixSeconds: number
): string {
  return new Date(
    unixSeconds * 1000
  )
    .toISOString()
    .slice(0, 10);
}

export const marketstackProvider =
  new MarketstackProvider();