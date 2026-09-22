import type { MarketAssetId } from "../core/assets";
import type { CandleInterval, MarketDataStatus } from "../core/types";
import {
  isTargetBusinessDateV1,
  previousTargetBusinessDateV1,
} from "./targetBusinessCalendar";

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
// ECB clock times are interpreted as Frankfurt civil time: CET/CEST.
const ECB_CLOCK = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const ECB_FX_EXPECTED_PUBLICATION_MINUTE = 16 * 60;
const ECB_ESTR_EXPECTED_PUBLICATION_MINUTE = 8 * 60;
// ECB says FX is usually published around 16:00, without an exact deadline.
// Treat 16:00–17:00 as a conservative assessment grace period, not a sourced
// release timestamp. €STR normally publishes at 08:00 and may be corrected
// at 09:00; reference-date metadata alone cannot resolve that interval.
const ECB_FX_ASSESSMENT_WINDOW_END_MINUTE = 17 * 60;
const ECB_ESTR_ASSESSMENT_WINDOW_END_MINUTE = 9 * 60;

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
    const ecbCadence = ecbLaunchCadence(input);
    if (ecbCadence !== null) {
      return classifyEcbReferenceFreshness(
        ecbCadence,
        latestTimestampSeconds,
        evaluatedAtSeconds,
      );
    }

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

function ecbLaunchCadence(
  input: ClassifyEngineMarketDataFreshnessV3Input,
): "fx" | "estr" | null {
  if (input.provider !== "ecb" || input.status !== "end_of_day") return null;
  if (input.asset === "estr") return "estr";
  return input.asset === "eurusd" || input.asset === "eurjpy" ||
      input.asset === "eurgbp" || input.asset === "eurchf"
    ? "fx"
    : null;
}

function classifyEcbReferenceFreshness(
  cadence: "fx" | "estr",
  latestTimestampSeconds: number,
  evaluatedAtSeconds: number,
): EngineMarketDataFreshnessV3 {
  const observation = new Date(latestTimestampSeconds * 1_000);
  if (!Number.isFinite(observation.getTime())) return "unknown";

  const localParts = ECB_CLOCK.formatToParts(new Date(evaluatedAtSeconds * 1_000));
  const part = (type: "year" | "month" | "day" | "hour" | "minute") =>
    Number(localParts.find((item) => item.type === type)!.value);
  const publicationDate = new Date(Date.UTC(
    part("year"), part("month") - 1, part("day"),
  ));
  const localMinute = part("hour") * 60 + part("minute");
  const expectedMinute = cadence === "fx"
    ? ECB_FX_EXPECTED_PUBLICATION_MINUTE
    : ECB_ESTR_EXPECTED_PUBLICATION_MINUTE;
  const windowEndMinute = cadence === "fx"
    ? ECB_FX_ASSESSMENT_WINDOW_END_MINUTE
    : ECB_ESTR_ASSESSMENT_WINDOW_END_MINUTE;
  const publicationWindowStarted =
    isTargetBusinessDateV1(publicationDate) && localMinute >= expectedMinute;
  const previousPublicationDate = previousTargetBusinessDateV1(publicationDate);
  const lastExpectedPublicationDate = publicationWindowStarted
    ? publicationDate
    : previousPublicationDate;
  const expectedReferenceDate = cadence === "fx"
    ? lastExpectedPublicationDate
    : previousTargetBusinessDateV1(lastExpectedPublicationDate);
  const observedReferenceDate = Date.UTC(
    observation.getUTCFullYear(),
    observation.getUTCMonth(),
    observation.getUTCDate(),
  );

  if (observedReferenceDate >= expectedReferenceDate.getTime()) {
    return "within-cadence";
  }

  if (publicationWindowStarted && localMinute < windowEndMinute) {
    const priorReferenceDate = cadence === "fx"
      ? previousPublicationDate
      : previousTargetBusinessDateV1(previousPublicationDate);
    if (observedReferenceDate >= priorReferenceDate.getTime()) return "unknown";
  }

  return "stale";
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
