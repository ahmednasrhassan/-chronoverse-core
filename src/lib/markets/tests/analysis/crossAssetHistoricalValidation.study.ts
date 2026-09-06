import YahooFinance from "yahoo-finance2";
import {
  analyzeCrossAssetRelationship,
  type DatedClose,
} from "./crossAssetHistoricalValidation";

const yahooFinance = new YahooFinance();
const PERIOD1 = new Date("2000-01-01T00:00:00.000Z");
const PERIOD2 = new Date("2026-09-07T00:00:00.000Z");
const symbols = ["GC=F", "SI=F", "BTC-USD", "ETH-USD"] as const;

interface LoadedSeries {
  readonly symbol: string;
  readonly rawQuoteCount: number;
  readonly invalidQuoteCount: number;
  readonly duplicateDateCount: number;
  readonly observations: readonly DatedClose[];
}

async function load(symbol: typeof symbols[number]): Promise<LoadedSeries> {
  const response = await yahooFinance.chart(symbol, {
    period1: PERIOD1,
    period2: PERIOD2,
    interval: "1d",
  });
  const quotes = response.quotes ?? [];
  const byDate = new Map<string, number>();
  let invalidQuoteCount = 0;
  let duplicateDateCount = 0;

  for (const quote of quotes) {
    const dateValue = quote.date instanceof Date ? quote.date : new Date(quote.date);
    const date = Number.isFinite(dateValue.getTime())
      ? dateValue.toISOString().slice(0, 10)
      : null;
    const close = quote.close;

    if (date === null || typeof close !== "number" || !Number.isFinite(close) || close <= 0) {
      invalidQuoteCount += 1;
      continue;
    }
    if (byDate.has(date)) {
      duplicateDateCount += 1;
      continue;
    }
    byDate.set(date, close);
  }

  return {
    symbol,
    rawQuoteCount: quotes.length,
    invalidQuoteCount,
    duplicateDateCount,
    observations: [...byDate]
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([date, close]) => ({ date, close })),
  };
}

async function main(): Promise<void> {
  const loaded = await Promise.all(symbols.map(load));
  const bySymbol = new Map(loaded.map((series) => [series.symbol, series]));
  const gold = bySymbol.get("GC=F")!;
  const silver = bySymbol.get("SI=F")!;
  const bitcoin = bySymbol.get("BTC-USD")!;
  const ethereum = bySymbol.get("ETH-USD")!;

  const report = {
    generatedAt: new Date().toISOString(),
    requestedRange: {
      period1: PERIOD1.toISOString(),
      period2Exclusive: PERIOD2.toISOString(),
    },
    source: "Yahoo Finance via installed yahoo-finance2 chart client",
    upstreamCalls: symbols.map((symbol) => ({ symbol, interval: "1d", count: 1 })),
    series: loaded.map(({ observations, ...metadata }) => ({
      ...metadata,
      validObservationCount: observations.length,
      startDate: observations[0]?.date ?? null,
      endDate: observations.at(-1)?.date ?? null,
    })),
    studies: [
      analyzeCrossAssetRelationship("silver", "gold", silver.observations, gold.observations),
      analyzeCrossAssetRelationship("ethereum", "bitcoin", ethereum.observations, bitcoin.observations),
    ],
  };

  console.log(JSON.stringify(report, null, 2));
}

void main();
