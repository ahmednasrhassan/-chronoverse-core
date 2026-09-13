import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type {
  MarketProductVipDeepProjectionV1,
  MarketProjectionProductIdV1,
} from "../../projections/types";
import type { HistoricalChartSeriesV1 } from
  "../../services/historicalChartSeries";
import {
  VIP_FX_MARKET_ROOM_IDS_V1,
  assembleAuthorizedVipMarketRoomV1,
  type VipMarketRoomDeliveryDependenciesV1,
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
  productId: MarketProjectionProductIdV1,
): MarketProductVipDeepProjectionV1 {
  return {
    tier: "vip-deep",
    availability: "available",
    productId,
    productKind: productId === "estr" ? "rate" : "fx",
    provenance: { sourceTimestamp: ANCHOR },
  } as unknown as MarketProductVipDeepProjectionV1;
}

function availableHistory(
  productId: MarketProjectionProductIdV1,
  range: "max" | "5d" | "2y",
): HistoricalChartSeriesV1 {
  const from = range === "max"
    ? ANCHOR - 2_500 * DAY
    : ANCHOR - (range === "2y" ? 730 : 5) * DAY;
  const isRate = productId === "estr";

  return {
    version: "historical-chart-series-v1",
    availability: "available",
    productId,
    valueKind: isRate ? "interest-rate-percent" : "fx-reference-rate",
    unit: isRate ? "percent" : "USD per EUR",
    requested: { range, from, to: ANCHOR },
    resolved: {
      interval: "1d",
      observedFrom: from,
      observedTo: ANCHOR,
      completeness: "complete",
    },
    points: [
      { timestamp: from, value: isRate ? -0.5 : 1.1 },
      { timestamp: ANCHOR, value: isRate ? 2.19 : 1.2 },
    ],
    provenance: {
      provider: "ecb",
      sourceLabel: "European Central Bank",
      sourceSeriesId: isRate
        ? "EST.B.EU000A2X2A25.WT"
        : "EXR.D.USD.EUR.SP00.A",
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
  overrides: Partial<VipMarketRoomDeliveryDependenciesV1> = {},
): VipMarketRoomDeliveryDependenciesV1 {
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
      return availableHistory(productId, range as "max" | "5d" | "2y");
    },
    ...overrides,
  };
}

async function verifyEstrAuthorizationAndDelivery(): Promise<void> {
  const events: string[] = [];
  const room = await assembleAuthorizedVipMarketRoomV1(
    "estr",
    dependencies(events),
  );

  assertEqual(room?.productId, "estr", "€STR room selected");
  assertDeepEqual(events, [
    "auth",
    "deep:estr",
    `history:estr:max:${ANCHOR}`,
    `history:estr:5d:${ANCHOR}`,
  ], "authorization, €STR Deep, then anchored history order");

  if (room?.productId !== "estr") {
    throw new Error("Expected assembled €STR room.");
  }

  assertEqual(
    room.history.maximum?.availability,
    "available",
    "official inception envelope available",
  );
  assertEqual(
    room.history.maximum?.availability === "available"
      ? room.history.maximum.points[0]?.value
      : null,
    -0.5,
    "negative official rate survives delivery",
  );
  const serialized = JSON.stringify(room);
  assertEqual(serialized.includes("observationMetadata"), false,
    "observation metadata sidecar is not serialized");
  assertEqual(serialized.includes('"rp"'), false,
    "RP sidecar is not serialized");
  assertEqual(serialized.includes('"cm"'), false,
    "CM sidecar is not serialized");
}

async function verifyUnauthorizedBoundary(): Promise<void> {
  const events: string[] = [];
  let rejected = false;

  try {
    await assembleAuthorizedVipMarketRoomV1("estr", dependencies(events, {
      authorize: async () => {
        events.push("auth");
        throw new Error("VIP required");
      },
    }));
  } catch {
    rejected = true;
  }

  assertEqual(rejected, true, "unauthorized €STR room rejects");
  assertDeepEqual(events, ["auth"], "unauthorized path performs no data read");
}

async function verifyFiveProductRouteScope(): Promise<void> {
  for (const productId of VIP_FX_MARKET_ROOM_IDS_V1) {
    const events: string[] = [];
    const room = await assembleAuthorizedVipMarketRoomV1(
      productId,
      dependencies(events),
    );

    assertEqual(room?.productId, productId, `${productId} remains routed`);
    assertEqual(events.includes(`history:${productId}:2y:${ANCHOR}`), true,
      `${productId} retains the FX 2Y envelope`);
    assertEqual(events.includes(`history:${productId}:max:${ANCHOR}`), false,
      `${productId} does not receive the €STR MAX envelope`);
  }

  for (const invalid of ["gold", "bitcoin", "dxy", "EURSTR", ""] as const) {
    const events: string[] = [];
    const room = await assembleAuthorizedVipMarketRoomV1(
      invalid,
      dependencies(events),
    );

    assertEqual(room, null, `${invalid} rejected`);
    assertDeepEqual(events, ["auth"], `${invalid} validates only after auth`);
  }
}

async function verifyIndependentDegradation(): Promise<void> {
  const historyOnlyEvents: string[] = [];
  const historyOnly = await assembleAuthorizedVipMarketRoomV1(
    "estr",
    dependencies(historyOnlyEvents, {
      loadDeep: async () => {
        historyOnlyEvents.push("deep:failed");
        throw new Error("Deep unavailable");
      },
    }),
  );

  assertEqual(historyOnly?.productId, "estr", "history-only room selected");
  if (historyOnly?.productId !== "estr") {
    throw new Error("Expected history-only €STR room.");
  }
  assertEqual(historyOnly.deep, null, "Deep failure remains isolated");
  assertEqual(historyOnly.history.maximum?.availability, "available",
    "history survives Deep failure");
  assertEqual(historyOnlyEvents.includes("history:estr:max:undefined"), true,
    "history loads without a fabricated Deep anchor");

  const deepOnly = await assembleAuthorizedVipMarketRoomV1(
    "estr",
    dependencies([], {
      loadHistorical: async () => {
        throw new Error("History unavailable");
      },
    }),
  );

  assertEqual(deepOnly?.productId, "estr", "Deep-only room selected");
  if (deepOnly?.productId !== "estr") {
    throw new Error("Expected Deep-only €STR room.");
  }
  assertEqual(deepOnly.deep?.availability, "available",
    "Deep survives history failure");
  assertEqual(deepOnly.history.maximum, null, "MAX failure is explicit");
  assertEqual(deepOnly.history.fiveDay, null, "5D failure is explicit");
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

  for (const required of [
    "assembleAuthorizedVipMarketRoomV1",
    "enforceVipPageAccessV1(requireVipV1, redirect)",
    "getFiveProductVipDeepProjectionV1",
    "getHistoricalChartSeriesV1",
    "VipEstrMarketRoom",
    'room.productId === "estr"',
    "VipFxMarketRoom",
    "notFound()",
  ]) {
    assertEqual(route.includes(required), true, `route includes ${required}`);
  }
  assertEqual(
    service.indexOf("await dependencies.authorize()") <
      service.indexOf("isVipFxMarketRoomIdV1(productCandidate)"),
    true,
    "authorization precedes five-product validation",
  );
  assertEqual(service.includes('loadHistorical(productId, "max", options)'), true,
    "€STR delivery requests exact MAX history");
  assertEqual(service.includes('loadHistorical(productId, "5d", options)'), true,
    "€STR delivery requests exact conditional 5D history");
}

async function main(): Promise<void> {
  await verifyEstrAuthorizationAndDelivery();
  await verifyUnauthorizedBoundary();
  await verifyFiveProductRouteScope();
  await verifyIndependentDegradation();
  verifyProductionComposition();

  console.log("PASS: C4-D VIP €STR Market Room delivery");
}

void main();
