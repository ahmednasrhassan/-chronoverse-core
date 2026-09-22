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

const fridayReference = timestamp("2026-09-04T00:00:00.000Z");
for (const asset of ["eurusd", "eurjpy", "eurgbp", "eurchf"] as const) {
  const ecbDaily = (evaluatedAt: string) => classify({
    asset,
    provider: "ecb",
    status: "end_of_day",
    latestTimestampSeconds: fridayReference,
    evaluatedAt,
  });

  assertEqual(ecbDaily("2026-09-04T13:59:00.000Z"), "within-cadence",
    `${asset} same-day before 16:00 CEST`);
  assertEqual(ecbDaily("2026-09-04T14:00:00.000Z"), "within-cadence",
    `${asset} same-day at 16:00 CEST`);
  assertEqual(ecbDaily("2026-09-05T12:00:00.000Z"), "within-cadence",
    `${asset} Friday reference on Saturday`);
  assertEqual(ecbDaily("2026-09-06T12:00:00.000Z"), "within-cadence",
    `${asset} Friday reference on Sunday`);
  assertEqual(ecbDaily("2026-09-07T13:59:00.000Z"), "within-cadence",
    `${asset} before Monday's 16:00 CEST publication`);
  assertEqual(ecbDaily("2026-09-07T14:00:00.000Z"), "unknown",
    `${asset} Monday's publication window is not yet assessable`);
  assertEqual(ecbDaily("2026-09-07T14:59:00.000Z"), "unknown",
    `${asset} remains uncertain immediately before 17:00 CEST`);
  assertEqual(ecbDaily("2026-09-07T15:00:00.000Z"), "stale",
    `${asset} remains old after Monday's publication window`);
  assertEqual(ecbDaily("2026-09-08T23:59:00.000Z"), "stale",
    `${asset} Friday reference is stale Tuesday late`);
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

assertEqual(classify({
  asset: "eurusd", provider: "ecb", status: "end_of_day",
  latestTimestampSeconds: timestamp("2026-09-07T00:00:00.000Z"),
  evaluatedAt: "2026-09-07T14:00:00.000Z",
}), "within-cadence", "new Monday FX reference is current after publication");
assertEqual(classify({
  asset: "eurusd", provider: "ecb", status: "end_of_day",
  latestTimestampSeconds: timestamp("2026-01-09T00:00:00.000Z"),
  evaluatedAt: "2026-01-12T14:59:00.000Z",
}), "within-cadence", "winter FX before 16:00 CET");
assertEqual(classify({
  asset: "eurusd", provider: "ecb", status: "end_of_day",
  latestTimestampSeconds: timestamp("2026-01-09T00:00:00.000Z"),
  evaluatedAt: "2026-01-12T15:00:00.000Z",
}), "unknown", "winter FX at the start of the 16:00 CET window");
assertEqual(classify({
  asset: "eurusd", provider: "ecb", status: "end_of_day",
  latestTimestampSeconds: timestamp("2026-01-09T00:00:00.000Z"),
  evaluatedAt: "2026-01-12T16:00:00.000Z",
}), "stale", "winter FX after the publication window");

const estrDaily = (evaluatedAt: string, reference = fridayReference) => classify({
  asset: "estr", provider: "ecb", status: "end_of_day",
  latestTimestampSeconds: reference, evaluatedAt,
});
assertEqual(estrDaily("2026-09-07T12:00:00.000Z"), "within-cadence",
  "Friday rate reference remains current Monday");
assertEqual(estrDaily("2026-09-08T00:00:00.000Z"), "within-cadence",
  "Tuesday UTC midnight precedes the next rate publication");
assertEqual(estrDaily("2026-09-08T05:59:00.000Z"), "within-cadence",
  "Friday rate reference current before 08:00 CEST");
assertEqual(estrDaily("2026-09-08T06:00:00.000Z"), "unknown",
  "Friday rate reference uncertain during Tuesday publication window");
assertEqual(estrDaily("2026-09-08T06:59:00.000Z"), "unknown",
  "Friday rate reference remains uncertain before 09:00 CEST");
assertEqual(estrDaily("2026-09-08T07:00:00.000Z"), "stale",
  "Friday rate reference stale after Tuesday 09:00 CEST");
assertEqual(estrDaily("2026-09-08T06:00:00.000Z",
  timestamp("2026-09-07T00:00:00.000Z")), "within-cadence",
  "Monday reference is current at Tuesday's standard publication");
assertEqual(estrDaily("2026-09-08T06:00:00.000Z",
  timestamp("2026-09-03T00:00:00.000Z")), "stale",
  "older Thursday reference is stale even during Tuesday's grace period");
assertEqual(estrDaily("2026-09-08T23:59:00.000Z"), "stale",
  "Friday rate reference stale Tuesday late");
assertEqual(estrDaily("2026-01-13T06:59:00.000Z",
  timestamp("2026-01-09T00:00:00.000Z")), "within-cadence",
  "winter rate before 08:00 CET");
assertEqual(estrDaily("2026-01-13T07:00:00.000Z",
  timestamp("2026-01-09T00:00:00.000Z")), "unknown",
  "winter rate at the start of the 08:00 CET window");
assertEqual(estrDaily("2026-01-13T08:00:00.000Z",
  timestamp("2026-01-09T00:00:00.000Z")), "stale",
  "winter rate after the 09:00 CET window");

const christmasFriday = timestamp("2023-12-22T00:00:00.000Z");
assertEqual(classify({
  asset: "eurusd", provider: "ecb", status: "end_of_day",
  latestTimestampSeconds: christmasFriday,
  evaluatedAt: "2023-12-25T17:00:00.000Z",
}), "within-cadence", "FX expects no Christmas Day update");
assertEqual(classify({
  asset: "eurusd", provider: "ecb", status: "end_of_day",
  latestTimestampSeconds: christmasFriday,
  evaluatedAt: "2023-12-26T17:00:00.000Z",
}), "within-cadence", "FX expects no Boxing Day update");
assertEqual(classify({
  asset: "eurusd", provider: "ecb", status: "end_of_day",
  latestTimestampSeconds: christmasFriday,
  evaluatedAt: "2023-12-27T14:59:00.000Z",
}), "within-cadence", "FX waits through next TARGET day before publication");
assertEqual(classify({
  asset: "eurusd", provider: "ecb", status: "end_of_day",
  latestTimestampSeconds: christmasFriday,
  evaluatedAt: "2023-12-27T15:00:00.000Z",
}), "unknown", "FX next TARGET publication window is uncertain");
assertEqual(classify({
  asset: "eurusd", provider: "ecb", status: "end_of_day",
  latestTimestampSeconds: christmasFriday,
  evaluatedAt: "2023-12-27T16:00:00.000Z",
}), "stale", "FX becomes stale after next TARGET publication window");
assertEqual(estrDaily("2023-12-27T07:00:00.000Z", christmasFriday),
  "within-cadence", "Friday rate published after Christmas closing days");
assertEqual(estrDaily("2023-12-28T06:59:00.000Z", christmasFriday),
  "within-cadence", "rate waits for next reference publication");
assertEqual(estrDaily("2023-12-28T07:00:00.000Z", christmasFriday),
  "unknown", "rate next TARGET publication window is uncertain");
assertEqual(estrDaily("2023-12-28T08:00:00.000Z", christmasFriday),
  "stale", "rate becomes stale after next TARGET publication window");

const beforeEaster = timestamp("2026-04-02T00:00:00.000Z");
assertEqual(classify({
  asset: "eurusd", provider: "ecb", status: "end_of_day",
  latestTimestampSeconds: beforeEaster,
  evaluatedAt: "2026-04-07T13:59:00.000Z",
}), "within-cadence", "FX skips Good Friday and Easter Monday");
assertEqual(classify({
  asset: "eurusd", provider: "ecb", status: "end_of_day",
  latestTimestampSeconds: beforeEaster,
  evaluatedAt: "2026-04-07T14:00:00.000Z",
}), "unknown", "FX Easter publication window is uncertain");
assertEqual(classify({
  asset: "eurusd", provider: "ecb", status: "end_of_day",
  latestTimestampSeconds: beforeEaster,
  evaluatedAt: "2026-04-07T15:00:00.000Z",
}), "stale", "FX expects next reference after Easter's publication window");
assertEqual(estrDaily("2026-04-07T06:00:00.000Z", beforeEaster),
  "within-cadence", "Thursday rate reference is published after Easter");
assertEqual(estrDaily("2026-04-08T06:00:00.000Z", beforeEaster),
  "unknown", "rate Easter publication window is uncertain");
assertEqual(estrDaily("2026-04-08T07:00:00.000Z", beforeEaster),
  "stale", "rate expects Tuesday reference after Wednesday's window");

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
