import {
  classifyEngineMarketDataFreshnessV3,
  type ClassifyEngineMarketDataFreshnessV3Input,
  type EngineMarketDataFreshnessV3,
} from "../../engine/marketDataFreshness";

const HOUR_SECONDS = 3_600;
const DAY_SECONDS = 86_400;

function classify(
  overrides: Partial<ClassifyEngineMarketDataFreshnessV3Input> = {},
): EngineMarketDataFreshnessV3 {
  return classifyEngineMarketDataFreshnessV3({
    asset: "gold",
    interval: "1d",
    provider: "fixture",
    status: "realtime",
    latestTimestampSeconds: timestamp("2026-09-04T20:00:00.000Z"),
    evaluatedAt: "2026-09-06T12:00:00.000Z",
    hasUsableData: true,
    ...overrides,
  });
}

function timestamp(value: string): number {
  return Date.parse(value) / 1000;
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

assertEqual(classify(), "within-cadence", "Friday daily close remains current through Sunday");
assertEqual(classify({ asset: "estr", status: "end_of_day" }), "within-cadence",
  "daily ECB rate reference remains current through the weekend");

const fridayReference = timestamp("2026-09-04T00:00:00.000Z");
for (const asset of ["eurusd", "eurjpy", "eurgbp", "eurchf", "estr"] as const) {
  const ecbDaily = (evaluatedAt: string) => classify({
    asset,
    provider: "ecb",
    status: "end_of_day",
    latestTimestampSeconds: fridayReference,
    evaluatedAt,
  });

  assertEqual(ecbDaily("2026-09-04T12:00:00.000Z"), "within-cadence",
    `${asset} same-day reference`);
  assertEqual(ecbDaily("2026-09-05T12:00:00.000Z"), "within-cadence",
    `${asset} Friday reference on Saturday`);
  assertEqual(ecbDaily("2026-09-06T12:00:00.000Z"), "within-cadence",
    `${asset} Friday reference on Sunday`);
  assertEqual(ecbDaily("2026-09-07T23:59:00.000Z"), "within-cadence",
    `${asset} Friday reference through Monday`);
  assertEqual(ecbDaily("2026-09-08T00:00:00.000Z"), "stale",
    `${asset} second weekday begins on Tuesday`);
  assertEqual(ecbDaily("2026-09-08T23:59:00.000Z"), "stale",
    `${asset} Friday reference is stale Tuesday late`);
  assertEqual(ecbDaily("2026-09-09T00:00:00.000Z"), "stale",
    `${asset} stale result does not wait until Wednesday`);
  assertEqual(ecbDaily("2026-09-16T12:00:00.000Z"), "stale",
    `${asset} clearly old reference remains stale`);
  assertEqual(classify({
    asset,
    provider: "ecb",
    status: "end_of_day",
    latestTimestampSeconds: undefined,
  }), "unknown", `${asset} missing observation time`);
  assertEqual(classify({
    asset,
    provider: "ecb",
    status: "end_of_day",
    latestTimestampSeconds: fridayReference,
    evaluatedAt: "invalid",
  }), "unknown", `${asset} invalid assessment time`);
}

assertEqual(
  classify({ evaluatedAt: "2026-09-09T12:00:00.000Z" }),
  "unknown",
  "two completed weekdays without a daily close are uncertain",
);
assertEqual(
  classify({ evaluatedAt: "2026-09-16T12:00:00.000Z" }),
  "stale",
  "more than five completed weekdays is stale",
);

const evaluatedAtSeconds = timestamp("2026-09-09T12:00:00.000Z");
assertEqual(
  classify({
    asset: "bitcoin",
    interval: "1h",
    evaluatedAt: "2026-09-09T12:00:00.000Z",
    latestTimestampSeconds: evaluatedAtSeconds - 2 * HOUR_SECONDS,
  }),
  "within-cadence",
  "continuous crypto accepts two nominal periods",
);
assertEqual(
  classify({
    asset: "bitcoin",
    interval: "1h",
    evaluatedAt: "2026-09-09T12:00:00.000Z",
    latestTimestampSeconds: evaluatedAtSeconds - 2.5 * HOUR_SECONDS,
  }),
  "unknown",
  "continuous crypto enters the uncertainty band",
);
assertEqual(
  classify({
    asset: "bitcoin",
    interval: "1h",
    evaluatedAt: "2026-09-09T12:00:00.000Z",
    latestTimestampSeconds: evaluatedAtSeconds - 4 * HOUR_SECONDS,
  }),
  "stale",
  "continuous crypto becomes stale after three nominal periods",
);

assertEqual(
  classify({
    interval: "1wk",
    evaluatedAt: "2026-09-09T12:00:00.000Z",
    latestTimestampSeconds: evaluatedAtSeconds - 2 * 7 * DAY_SECONDS,
  }),
  "within-cadence",
  "weekly cadence accepts two periods",
);
assertEqual(
  classify({
    interval: "1wk",
    evaluatedAt: "2026-09-09T12:00:00.000Z",
    latestTimestampSeconds: evaluatedAtSeconds - 4 * 7 * DAY_SECONDS,
  }),
  "stale",
  "weekly cadence becomes stale after three periods",
);

assertEqual(
  classify({
    interval: "1h",
    status: "end_of_day",
    evaluatedAt: "2026-09-09T12:00:00.000Z",
    latestTimestampSeconds: evaluatedAtSeconds - HOUR_SECONDS,
  }),
  "unknown",
  "end-of-day status cannot establish intraday freshness",
);
assertEqual(
  classify({ status: "stale" }),
  "stale",
  "explicit stale provider status remains stale",
);
assertEqual(classify({ provider: null }), "unavailable", "missing provider is unavailable");
assertEqual(classify({ hasUsableData: false }), "unavailable", "unusable observations are unavailable");
assertEqual(
  classify({ latestTimestampSeconds: undefined }),
  "unknown",
  "missing latest timestamp is unknown",
);
assertEqual(
  classify({ evaluatedAt: "invalid" }),
  "unknown",
  "invalid evaluation time is unknown",
);
assertEqual(
  classify({
    evaluatedAt: "2026-09-09T12:00:00.000Z",
    latestTimestampSeconds: evaluatedAtSeconds + 1,
  }),
  "unknown",
  "future observations are unknown",
);

console.log("PASS: Engine V3 cadence-aware Market Data freshness");
