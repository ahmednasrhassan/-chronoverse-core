import type { MarketCandle } from "../../core/types";
import type {
  MarketstackEodRecord,
  MarketstackEodResponse,
} from "./types";

/**
 * Convert one raw Marketstack EOD record
 * into Chronoverse normalized MarketCandle data.
 */
export function mapMarketstackRecordToCandle(
  record: MarketstackEodRecord
): MarketCandle | null {
  const open = resolvePrice(
    record.adj_open,
    record.open
  );

  const high = resolvePrice(
    record.adj_high,
    record.high
  );

  const low = resolvePrice(
    record.adj_low,
    record.low
  );

  const close = resolvePrice(
    record.adj_close,
    record.close
  );

  if (
    open === null ||
    high === null ||
    low === null ||
    close === null
  ) {
    return null;
  }

  const time = parseMarketstackDate(record.date);

  if (time === null) {
    return null;
  }

  return {
    time,
    open,
    high,
    low,
    close,
    volume:
      resolveVolume(
        record.adj_volume,
        record.volume
      ),
  };
}

/**
 * Convert a full Marketstack response
 * into Chronoverse normalized candles.
 */
export function mapMarketstackResponseToCandles(
  response: MarketstackEodResponse
): MarketCandle[] {
  return response.data
    .map(mapMarketstackRecordToCandle)
    .filter(
      (candle): candle is MarketCandle =>
        candle !== null
    )
    .sort((a, b) => a.time - b.time);
}

/**
 * Prefer adjusted values when available.
 *
 * This keeps historical charts consistent
 * around splits and other corporate actions.
 */
function resolvePrice(
  adjusted: number | null | undefined,
  raw: number | null
): number | null {
  if (
    typeof adjusted === "number" &&
    Number.isFinite(adjusted)
  ) {
    return adjusted;
  }

  if (
    typeof raw === "number" &&
    Number.isFinite(raw)
  ) {
    return raw;
  }

  return null;
}

function resolveVolume(
  adjusted: number | null | undefined,
  raw: number | null
): number | null {
  if (
    typeof adjusted === "number" &&
    Number.isFinite(adjusted)
  ) {
    return adjusted;
  }

  if (
    typeof raw === "number" &&
    Number.isFinite(raw)
  ) {
    return raw;
  }

  return null;
}

/**
 * Convert Marketstack ISO dates to Unix seconds,
 * which is the Chronoverse market-data standard.
 */
function parseMarketstackDate(
  value: string
): number | null {
  const milliseconds = Date.parse(value);

  if (!Number.isFinite(milliseconds)) {
    return null;
  }

  return Math.floor(milliseconds / 1000);
}