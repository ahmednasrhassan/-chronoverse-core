import type { MarketAssetId } from "../core/assets";
import type { CandleInterval, MarketDataStatus } from "../core/types";

export type EngineMarketDataFreshnessV3 =
  | "within-cadence"
  | "unknown"
  | "stale"
  | "unavailable";

export interface ClassifyEngineMarketDataFreshnessV3Input {
  readonly asset: MarketAssetId | "estr";
  readonly interval: CandleInterval;
  readonly provider: string | null;
  readonly status: MarketDataStatus;
  readonly latestTimestampSeconds?: number;
  readonly evaluatedAt: string;
  readonly hasUsableData: boolean;
}

const DAY_SECONDS = 86_400;

const NOMINAL_INTERVAL_SECONDS: Readonly<Record<CandleInterval, number>> =
  Object.freeze({
    "1m": 60,
    "5m": 5 * 60,
    "15m": 15 * 60,
    "30m": 30 * 60,
    "1h": 60 * 60,
    "4h": 4 * 60 * 60,
    "1d": DAY_SECONDS,
    "1wk": 7 * DAY_SECONDS,
    "1mo": 31 * DAY_SECONDS,
  });

/** Pure Engine-owned normalization of observation freshness against requested cadence. */
export function classifyEngineMarketDataFreshnessV3(
  input: ClassifyEngineMarketDataFreshnessV3Input,
): EngineMarketDataFreshnessV3 {
  if (
    input.provider === null ||
    input.status === "unavailable" ||
    !input.hasUsableData
  ) {
    return "unavailable";
  }

  const evaluatedAtSeconds = Date.parse(input.evaluatedAt) / 1000;
  const latestTimestampSeconds = input.latestTimestampSeconds;

  if (
    !Number.isFinite(evaluatedAtSeconds) ||
    latestTimestampSeconds === undefined ||
    !Number.isFinite(latestTimestampSeconds) ||
    latestTimestampSeconds > evaluatedAtSeconds
  ) {
    return "unknown";
  }

  if (input.status === "stale") {
    return "stale";
  }

  if (input.status === "end_of_day" && isIntraday(input.interval)) {
    return "unknown";
  }

  const ageSeconds = evaluatedAtSeconds - latestTimestampSeconds;

  if (input.interval === "1wk" || input.interval === "1mo") {
    return classifyByNominalPeriods(ageSeconds, NOMINAL_INTERVAL_SECONDS[input.interval]);
  }

  if (isContinuousCrypto(input.asset)) {
    return classifyByNominalPeriods(ageSeconds, NOMINAL_INTERVAL_SECONDS[input.interval]);
  }

  if (input.interval === "1d") {
    const interveningWeekdays = countCompletedInterveningUtcWeekdays(
      latestTimestampSeconds,
      evaluatedAtSeconds,
    );

    if (interveningWeekdays <= 1) return "within-cadence";
    if (interveningWeekdays <= 5) return "unknown";
    return "stale";
  }

  if (ageSeconds <= 2 * NOMINAL_INTERVAL_SECONDS[input.interval]) {
    return "within-cadence";
  }

  return ageSeconds > 7 * DAY_SECONDS ? "stale" : "unknown";
}

function classifyByNominalPeriods(
  ageSeconds: number,
  nominalPeriodSeconds: number,
): EngineMarketDataFreshnessV3 {
  if (ageSeconds <= 2 * nominalPeriodSeconds) return "within-cadence";
  if (ageSeconds <= 3 * nominalPeriodSeconds) return "unknown";
  return "stale";
}

function isContinuousCrypto(asset: MarketAssetId | "estr"): boolean {
  return asset === "bitcoin" || asset === "ethereum";
}

function isIntraday(interval: CandleInterval): boolean {
  return interval !== "1d" && interval !== "1wk" && interval !== "1mo";
}

function countCompletedInterveningUtcWeekdays(
  latestTimestampSeconds: number,
  evaluatedAtSeconds: number,
): number {
  const cursor = new Date(latestTimestampSeconds * 1000);
  cursor.setUTCHours(0, 0, 0, 0);
  cursor.setUTCDate(cursor.getUTCDate() + 1);

  const evaluationDate = new Date(evaluatedAtSeconds * 1000);
  evaluationDate.setUTCHours(0, 0, 0, 0);

  let weekdays = 0;

  while (cursor < evaluationDate) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) weekdays += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return weekdays;
}
