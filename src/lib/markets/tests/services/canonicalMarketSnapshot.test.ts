import {
  CANONICAL_MARKET_SNAPSHOT_SCHEMA_VERSION_V1,
  createCanonicalMarketSnapshotV1,
  normalizeCanonicalMarketObservationsV1,
  normalizeCanonicalMarketSnapshotRequestV1,
  planCanonicalMarketSnapshotDependenciesV1,
  type CanonicalHistoricalMarketDataLoaderV1,
  type CanonicalMarketObservationV1,
} from "../../services/canonicalMarketSnapshot";
import { calculateCrossAssetReferenceMoveV1 } from "../../engine/crossAssetFeatures";
import type { MarketAssetId } from "../../core/assets";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertThrows(run: () => unknown, label: string): void {
  let threw = false;

  try {
    run();
  } catch {
    threw = true;
  }

  assertEqual(threw, true, label);
}

function assertAssets(
  actual: readonly MarketAssetId[],
  expected: string,
  label: string,
): void {
  assertEqual(actual.join(","), expected, label);
}

function candles(count = 61) {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 * Math.exp(index * 0.003 + (index % 3 - 1) * 0.002);

    return {
      time: 1_700_000_000 + index * 86_400,
      open: close,
      high: close,
      low: close,
      close,
      value: close,
    };
  });
}

const gap = 4 * 86_400;
const normalized = normalizeCanonicalMarketObservationsV1([
  { timestamp: 300 + gap, close: 3 },
  { timestamp: 100, close: 1 },
  { timestamp: 100, close: 1 },
  { timestamp: 200, close: 2 },
]);

assertEqual(normalized.length, 3, "exact duplicate removal");
assertEqual(normalized.map((point) => point.timestamp).join(","), `100,200,${300 + gap}`, "ascending order");
assertEqual(normalized.at(-1)?.timestamp, 300 + gap, "gaps remain unfilled");
assertEqual(Object.isFrozen(normalized), true, "normalized series is frozen");
assertEqual(
  JSON.stringify(normalizeCanonicalMarketObservationsV1([...normalized].reverse())),
  JSON.stringify(normalized),
  "normalization is deterministic",
);
assertThrows(
  () => normalizeCanonicalMarketObservationsV1([
    { timestamp: 1, close: 10 },
    { timestamp: 1, close: 11 },
  ]),
  "conflicting duplicate rejection",
);

for (const observation of [
  { timestamp: Number.NaN, close: 1 },
  { timestamp: 1, close: Number.POSITIVE_INFINITY },
  { timestamp: 1, close: 0 },
  { timestamp: 1, close: -1 },
] satisfies readonly CanonicalMarketObservationV1[]) {
  assertThrows(
    () => normalizeCanonicalMarketObservationsV1([observation]),
    "invalid observation rejection",
  );
}

const normalizedRequest = normalizeCanonicalMarketSnapshotRequestV1({
  assetIds: ["ethereum", "gold", "ethereum", "bitcoin"],
  interval: "1d",
  history: { kind: "required-observations", requiredObservationCount: 61 },
});

assertAssets(normalizedRequest.assetIds, "gold,bitcoin,ethereum", "canonical request ordering");
assertEqual(normalizedRequest.range, "max", "required-count range default");
assertEqual(normalizedRequest.minimumObservationCount, 61, "required observation count");
assertThrows(
  () => normalizeCanonicalMarketSnapshotRequestV1({
    assetIds: ["not-an-asset" as MarketAssetId],
    interval: "1d",
    history: { kind: "range", range: "1y" },
  }),
  "invalid asset ID rejection",
);
assertThrows(
  () => normalizeCanonicalMarketSnapshotRequestV1({
    assetIds: ["gold"],
    interval: "1d",
    history: { kind: "required-observations", requiredObservationCount: 0 },
  }),
  "invalid history requirement rejection",
);

assertAssets(planCanonicalMarketSnapshotDependenciesV1(["silver"]), "gold,silver", "Silver dependencies");
assertAssets(planCanonicalMarketSnapshotDependenciesV1(["ethereum"]), "bitcoin,ethereum", "Ethereum dependencies");
assertAssets(
  planCanonicalMarketSnapshotDependenciesV1(["ethereum", "silver", "ethereum"]),
  "gold,bitcoin,silver,ethereum",
  "combined dependency de-duplication",
);
assertAssets(planCanonicalMarketSnapshotDependenciesV1(["gold"]), "gold", "Gold has no Cross-Asset reference");
assertAssets(planCanonicalMarketSnapshotDependenciesV1(["oil"]), "oil", "Oil has no Cross-Asset reference");

async function runAsyncSnapshotTests(): Promise<void> {
const calls: string[] = [];
const loader: CanonicalHistoricalMarketDataLoaderV1 = async (
  symbol,
  range,
  interval,
  assetClass,
) => {
  calls.push([symbol, range, interval, assetClass].join("|"));

  if (symbol === "ETH-USD") {
    throw new Error("provider secret must not escape");
  }

  return {
    source: symbol === "GC=F" ? "fallback-live" : "chronoverse",
    provider: symbol === "GC=F" ? "yahoo-finance2" : "premium-test",
    status: "end_of_day",
    provenance: {
      provider: symbol === "GC=F" ? "yahoo-finance2" : "premium-test",
      fetchedAt: 1_800_000_000,
      sourceTimestamp: candles().at(-1)?.time,
    },
    candles: candles(),
  };
};

const snapshot = await createCanonicalMarketSnapshotV1(
  {
    assetIds: ["ethereum", "gold", "gold", "bitcoin"],
    interval: "1d",
    history: {
      kind: "range",
      range: "1y",
      minimumObservationCount: 61,
    },
  },
  {
    loadHistoricalMarketData: loader,
    now: () => new Date("2026-09-06T12:00:00.000Z"),
  },
);

assertEqual(snapshot.schemaVersion, CANONICAL_MARKET_SNAPSHOT_SCHEMA_VERSION_V1, "schema version");
assertEqual(snapshot.computedAt, "2026-09-06T12:00:00.000Z", "deterministic computation time");
assertEqual(snapshot.availability, "partial", "partial snapshot availability");
assertAssets(snapshot.requestedAssetIds, "gold,bitcoin,ethereum", "snapshot asset ordering");
assertEqual(calls.length, 3, "one request per unique asset");
assertEqual(new Set(calls.map((call) => call.split("|")[0])).size, 3, "no duplicate symbol fetch");
assertEqual(calls.every((call) => call.includes("|1y|1d|")), true, "stable historical request arguments");

const gold = snapshot.assets.find((asset) => asset.assetId === "gold");
const bitcoin = snapshot.assets.find((asset) => asset.assetId === "bitcoin");
const ethereum = snapshot.assets.find((asset) => asset.assetId === "ethereum");

assertEqual(gold?.symbol, "GC=F", "canonical provider symbol");
assertEqual(gold?.observationCount, 61, "normalized observation count");
assertEqual(gold?.earliestTimestamp, candles().at(0)?.time, "earliest timestamp");
assertEqual(gold?.latestTimestamp, candles().at(-1)?.time, "latest timestamp");
assertEqual(gold?.provenance?.source, "fallback-live", "fallback provenance");
assertEqual(gold?.provenance?.requestedSymbol, "GC=F", "requested symbol provenance");
assertEqual(ethereum?.availability, "unavailable", "isolated asset failure");
assertEqual(ethereum?.reason, "Historical market data request failed.", "sanitized failure reason");
assertEqual(JSON.stringify(snapshot).includes("provider secret"), false, "provider error is not exposed");

if (gold?.availability !== "available") {
  throw new Error("Gold normalized history should be available.");
}

if (bitcoin?.availability !== "available") {
  throw new Error("Bitcoin normalized history should be available.");
}

for (const [assetId, observations] of [
  ["gold", gold.observations],
  ["bitcoin", bitcoin.observations],
] as const) {
  assertEqual(
    calculateCrossAssetReferenceMoveV1({ observations }).availability,
    "available",
    `${assetId} 61-close Cross-Asset compatibility`,
  );
}

const allAvailable = await createCanonicalMarketSnapshotV1(
  {
    assetIds: ["bitcoin", "gold"],
    interval: "1d",
    history: { kind: "range", range: "1y", minimumObservationCount: 61 },
  },
  {
    loadHistoricalMarketData: async () => ({
      source: "chronoverse",
      provider: "premium-test",
      status: "end_of_day",
      candles: candles(),
    }),
    now: () => new Date("2026-09-06T12:00:00.000Z"),
  },
);

assertEqual(allAvailable.availability, "available", "all-success snapshot availability");

let emptyCalls = 0;
const empty = await createCanonicalMarketSnapshotV1(
  {
    assetIds: [],
    interval: "1d",
    history: { kind: "range", range: "1y" },
  },
  {
    loadHistoricalMarketData: async () => {
      emptyCalls += 1;
      throw new Error("must not run");
    },
    now: () => new Date("2026-09-06T12:00:00.000Z"),
  },
);

assertEqual(empty.availability, "unavailable", "explicit empty request outcome");
assertEqual(empty.assets.length, 0, "empty request assets");
assertEqual(emptyCalls, 0, "empty request makes no fetches");

const insufficient = await createCanonicalMarketSnapshotV1(
  {
    assetIds: ["ethereum", "silver"],
    interval: "1d",
    history: { kind: "required-observations", requiredObservationCount: 62 },
  },
  {
    loadHistoricalMarketData: async () => ({
      source: "chronoverse",
      provider: "premium-test",
      status: "end_of_day",
      candles: candles(61),
    }),
    now: () => new Date("2026-09-06T12:00:00.000Z"),
  },
);

assertEqual(insufficient.availability, "unavailable", "insufficient snapshot availability");
assertEqual(insufficient.assets[0]?.observationCount, 61, "insufficient valid data is retained");
assertEqual(
  insufficient.assets.every((asset) => asset.availability === "unavailable"),
  true,
  "all failed assets remain unavailable",
);

console.log("PASS: Canonical Market Snapshot V1 normalization and loading");
}

void runAsyncSnapshotTests().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
