/**
 * Chronoverse Capital — Market Data Core Types
 *
 * Provider-agnostic contracts for the market-data layer.
 * Yahoo Finance, future premium providers, chart engines,
 * and the intelligence layer should communicate through
 * these normalized types.
 */

export type AssetClass =
  | "equity"
  | "index"
  | "forex"
  | "crypto"
  | "commodity"
  | "bond"
  | "etf"
  | "fund"
  | "future"
  | "unknown";

export type MarketDataTier = "free" | "premium";

export type MarketDataStatus =
  | "realtime"
  | "delayed"
  | "end_of_day"
  | "unavailable";

export type CandleInterval =
  | "1m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "4h"
  | "1d"
  | "1wk"
  | "1mo";

export interface MarketSymbol {
  symbol: string;
  displaySymbol?: string;
  name?: string;
  exchange?: string;
  currency?: string;
  assetClass?: AssetClass;
}

export interface MarketQuote {
  symbol: string;
  price: number | null;

  change: number | null;
  changePercent: number | null;

  open: number | null;
  previousClose: number | null;

  high: number | null;
  low: number | null;

  volume: number | null;

  currency?: string;
  exchange?: string;

  timestamp: number;

  status: MarketDataStatus;
  provider: string;
}

export interface MarketCandle {
  time: number;

  open: number;
  high: number;
  low: number;
  close: number;

  volume?: number | null;
}

export interface HistoricalDataRequest {
  symbol: string;
  interval: CandleInterval;
  from?: number;
  to?: number;
}

export interface HistoricalDataResponse {
  symbol: string;
  interval: CandleInterval;
  candles: MarketCandle[];

  provider: string;
  status: MarketDataStatus;
}

export interface MarketDataProvider {
  readonly id: string;
  readonly tier: MarketDataTier;

  getQuote(symbol: string): Promise<MarketQuote>;

  getQuotes(symbols: string[]): Promise<MarketQuote[]>;

  getHistoricalData(
    request: HistoricalDataRequest
  ): Promise<HistoricalDataResponse>;
}

export interface RealtimeMarketUpdate {
  symbol: string;
  price: number;
  timestamp: number;

  volume?: number | null;
}

export interface RealtimeMarketProvider {
  subscribe(
    symbols: string[],
    onUpdate: (update: RealtimeMarketUpdate) => void
  ): Promise<() => void> | (() => void);
}