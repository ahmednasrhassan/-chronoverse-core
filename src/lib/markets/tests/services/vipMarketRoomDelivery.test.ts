import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { MarketProductVipDeepProjectionV1 } from
  "../../projections/types";
import type {
  HistoricalChartSeriesV1,
} from "../../services/historicalChartSeries";
import {
  VIP_FX_MARKET_ROOM_IDS_V1,
  assembleAuthorizedVipFxMarketRoomV1,
  isVipFxMarketRoomIdV1,
  type VipFxMarketRoomDeliveryDependenciesV1,
  type VipFxMarketRoomIdV1,
} from "../../services/vipMarketRoomDelivery";

const DAY = 86_400;
const ANCHOR = 2_000_000_000;

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, label: string): void {
  assertEqual(JSON.stringify(actual), JSON.stringify(expected), label);
}

function availableDeep(
  productId: VipFxMarketRoomIdV1,
): MarketProductVipDeepProjectionV1 {
  return {
    tier: "vip-deep",
    availability: "available",
    productId,
    productKind: "fx",
    provenance: { sourceTimestamp: ANCHOR },
  } as unknown as MarketProductVipDeepProjectionV1;
}

function availableHistory(
  productId: VipFxMarketRoomIdV1,
  range: "2y" | "5d",
  completeness: "complete" | "partial" = "complete",
): HistoricalChartSeriesV1 {
  const from = range === "2y" ? ANCHOR - 730 * DAY : ANCHOR - 5 * DAY;

  return {
    version: "historical-chart-series-v1",
    availability: "available",
    productId,
    valueKind: "fx-reference-rate",
    unit: "USD per EUR",
    requested: { range, from, to: ANCHOR },
    resolved: {
      interval: "1d",
      observedFrom: from,
      observedTo: ANCHOR,
      completeness,
    },
    points: [
      { timestamp: from, value: 1.1 },
      { timestamp: ANCHOR, value: 1.2 },
    ],
    provenance: {
      provider: "ecb",
      sourceLabel: "European Central Bank",
      sourceSeriesId: "EXR.D.USD.EUR.SP00.A",
      sourceRole: "primary",
      status: "end_of_day",
      fetchedAt: ANCHOR,
      sourceTimestamp: ANCHOR,
      freshness: "not-assessed",
      normalization: "canonical-observation-series-v1",
    },
  };
}

function dependencies(
  events: string[],
  overrides: Partial<VipFxMarketRoomDeliveryDependenciesV1> = {},
): VipFxMarketRoomDeliveryDependenciesV1 {
  return {
    authorize: async () => {
      events.push("auth");
      return undefined;
    },
    loadDeep: async (productId) => {
      events.push(`deep:${productId}`);
      return availableDeep(productId);
    },
    loadHistorical: async (productId, range, options) => {
      events.push(
        `history:${productId}:${range}:${String(options.sourceTimestamp)}`,
      );
      return availableHistory(productId, range as "2y" | "5d");
    },
    ...overrides,
  };
}

async function verifyAuthorizationOrdering(): Promise<void> {
  const events: string[] = [];
  const room = await assembleAuthorizedVipFxMarketRoomV1(
    "eurusd",
    dependencies(events),
  );

  assertEqual(room?.productId, "eurusd", "selected FX room");
  assertDeepEqual(events, [
    "auth",
    "deep:eurusd",
    `history:eurusd:2y:${ANCHOR}`,
    `history:eurusd:5d:${ANCHOR}`,
  ], "authorization, Deep, then anchored history order");
  assertEqual(
    room?.history.twoYear?.availability,
    "available",
    "two-year selected-market envelope",
  );
  assertEqual(
    room?.history.fiveDay?.availability,
    "available",
    "five-day conditional result",
  );
}

async function verifyUnauthorizedDeliveryBoundary(): Promise<void> {
  const events: string[] = [];
  let rejected = false;

  try {
    await assembleAuthorizedVipFxMarketRoomV1("eurusd", dependencies(events, {
      authorize: async () => {
        events.push("auth");
        throw new Error("VIP required");
      },
    }));
  } catch {
    rejected = true;
  }

  assertEqual(rejected, true, "unauthorized room rejects");
  assertDeepEqual(events, ["auth"], "unauthorized room performs no data read");
}

async function verifyFxScope(): Promise<void> {
  assertDeepEqual(
    VIP_FX_MARKET_ROOM_IDS_V1,
    ["eurusd", "eurjpy", "eurgbp", "eurchf"],
    "exact four FX room IDs",
  );

  for (const productId of VIP_FX_MARKET_ROOM_IDS_V1) {
    assertEqual(isVipFxMarketRoomIdV1(productId), true, `${productId} accepted`);
    const room = await assembleAuthorizedVipFxMarketRoomV1(
      productId,
      dependencies([]),
    );
    assertEqual(room?.productId, productId, `${productId} room assembled`);
  }

  for (const invalid of ["estr", "gold", "bitcoin", "eth", "dxy", "EURUSD", ""] as const) {
    const events: string[] = [];
    assertEqual(isVipFxMarketRoomIdV1(invalid), false, `${invalid} rejected`);
    assertEqual(
      await assembleAuthorizedVipFxMarketRoomV1(invalid, dependencies(events)),
      null,
      `${invalid} cannot enter FX renderer`,
    );
    assertDeepEqual(events, ["auth"], `${invalid} validates only after auth`);
  }
}

async function verifyIndependentDegradedStates(): Promise<void> {
  const deepFailureEvents: string[] = [];
  const historyOnly = await assembleAuthorizedVipFxMarketRoomV1(
    "eurusd",
    dependencies(deepFailureEvents, {
      loadDeep: async () => {
        deepFailureEvents.push("deep:failed");
        throw new Error("deep unavailable");
      },
    }),
  );

  assertEqual(historyOnly?.deep, null, "Deep failure remains isolated");
  assertEqual(
    historyOnly?.history.twoYear?.availability,
    "available",
    "history survives Deep failure",
  );
  assertEqual(
    deepFailureEvents.includes("history:eurusd:2y:undefined"),
    true,
    "history loads without a fabricated Deep anchor",
  );

  const historyFailureEvents: string[] = [];
  const deepOnly = await assembleAuthorizedVipFxMarketRoomV1(
    "eurusd",
    dependencies(historyFailureEvents, {
      loadHistorical: async (_productId, range, options) => {
        historyFailureEvents.push(
          `history-failed:${range}:${String(options.sourceTimestamp)}`,
        );
        throw new Error("history unavailable");
      },
    }),
  );

  assertEqual(deepOnly?.deep?.availability, "available", "Deep survives history failure");
  assertEqual(deepOnly?.history.twoYear, null, "two-year failure is explicit");
  assertEqual(deepOnly?.history.fiveDay, null, "five-day failure is explicit");

  const partial = await assembleAuthorizedVipFxMarketRoomV1(
    "eurusd",
    dependencies([], {
      loadHistorical: async (productId, range) =>
        availableHistory(productId, range as "2y" | "5d", "partial"),
    }),
  );
  assertEqual(
    partial?.history.twoYear?.availability === "available"
      ? partial.history.twoYear.resolved.completeness
      : null,
    "partial",
    "partial historical completeness is preserved",
  );
}

function verifyProductionComposition(): void {
  const repositoryRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
  const route = readFileSync(
    `${repositoryRoot}src/app/(vip)/vip/markets/[market]/page.tsx`,
    "utf8",
  );
  const service = readFileSync(
    `${repositoryRoot}src/lib/markets/services/vipMarketRoomDelivery.ts`,
    "utf8",
  );
  const deepTypes = readFileSync(
    `${repositoryRoot}src/lib/markets/projections/types.ts`,
    "utf8",
  );

  for (const required of [
    "assembleAuthorizedVipFxMarketRoomV1",
    "enforceVipPageAccessV1(requireVipV1, redirect)",
    "getFiveProductVipDeepProjectionV1",
    "getHistoricalChartSeriesV1",
    "notFound()",
  ]) {
    assertEqual(route.includes(required), true, `route includes ${required}`);
  }
  assertEqual(
    service.indexOf("await dependencies.authorize()") <
      service.indexOf("isVipFxMarketRoomIdV1(productCandidate)"),
    true,
    "authorization precedes product validation in source",
  );
  assertEqual(
    service.indexOf("await dependencies.authorize()") <
      service.indexOf("dependencies.loadDeep(productId)"),
    true,
    "authorization precedes Deep read in source",
  );
  assertEqual(
    service.indexOf("await dependencies.authorize()") <
      service.indexOf("dependencies.loadHistorical(productId"),
    true,
    "authorization precedes history read in source",
  );
  assertEqual(
    deepTypes.includes("HistoricalChartSeriesV1"),
    false,
    "history is not added to the Deep contract",
  );
}

async function main(): Promise<void> {
  await verifyAuthorizationOrdering();
  await verifyUnauthorizedDeliveryBoundary();
  await verifyFxScope();
  await verifyIndependentDegradedStates();
  verifyProductionComposition();

  console.log("PASS: C4-C VIP FX Market Room delivery");
}

void main();
