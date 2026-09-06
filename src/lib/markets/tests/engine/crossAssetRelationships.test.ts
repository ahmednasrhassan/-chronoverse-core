import type { MarketAssetId } from "../../core/assets";
import {
  activeCrossAssetRelationshipsV1,
  defineCrossAssetRelationshipsV1,
  getActiveCrossAssetRelationshipsV1,
  type CrossAssetRelationshipDefinitionV1,
} from "../../engine/crossAssetRelationships";

const horizon = { interval: "daily", observations: 20 } as const;

function relationship(
  overrides: Partial<CrossAssetRelationshipDefinitionV1> = {},
): CrossAssetRelationshipDefinitionV1 {
  return {
    id: "test-edge",
    targetAssetId: "silver",
    referenceAssetId: "gold",
    expectedSign: "direct",
    weight: 1,
    horizon,
    ...overrides,
  };
}

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

assertEqual(activeCrossAssetRelationshipsV1.length, 2, "approved edge count");
assertEqual(
  activeCrossAssetRelationshipsV1.map((edge) => edge.id).join(","),
  "ethereum-bitcoin-20d,silver-gold-20d",
  "deterministic registry order",
);

const ethereum = getActiveCrossAssetRelationshipsV1("ethereum");
const silver = getActiveCrossAssetRelationshipsV1("silver");

assertEqual(ethereum.length, 1, "Ethereum relationship count");
assertEqual(ethereum[0]?.referenceAssetId, "bitcoin", "Ethereum <- Bitcoin");
assertEqual(ethereum[0]?.weight, 1, "Ethereum model weight");
assertEqual(silver.length, 1, "Silver relationship count");
assertEqual(silver[0]?.referenceAssetId, "gold", "Silver <- Gold");
assertEqual(silver[0]?.horizon.observations, 20, "Silver horizon");
assertEqual(
  activeCrossAssetRelationshipsV1.some(
    (edge) => edge.targetAssetId === edge.referenceAssetId,
  ),
  false,
  "no self edges",
);

for (const [targetAssetId, referenceAssetId] of [
  ["gold", "dxy"],
  ["gold", "us10y"],
  ["oil", "dxy"],
  ["eurusd", "dxy"],
  ["dxy", "eurusd"],
] satisfies readonly [MarketAssetId, MarketAssetId][]) {
  assertEqual(
    activeCrossAssetRelationshipsV1.some(
      (edge) =>
        edge.targetAssetId === targetAssetId &&
        edge.referenceAssetId === referenceAssetId,
    ),
    false,
    `Macro-owned edge ${targetAssetId} <- ${referenceAssetId}`,
  );
}

assertEqual(getActiveCrossAssetRelationshipsV1("gold").length, 0, "no Gold model");

assertThrows(
  () => defineCrossAssetRelationshipsV1([
    relationship({ id: "duplicate" }),
    relationship({ id: "duplicate", referenceAssetId: "bitcoin" }),
  ]),
  "duplicate id rejection",
);
assertThrows(
  () => defineCrossAssetRelationshipsV1([
    relationship({ id: "one" }),
    relationship({ id: "two" }),
  ]),
  "duplicate pair rejection",
);
assertThrows(
  () => defineCrossAssetRelationshipsV1([relationship({ weight: 0 })]),
  "zero weight rejection",
);
assertThrows(
  () => defineCrossAssetRelationshipsV1([relationship({ weight: Number.NaN })]),
  "non-finite weight rejection",
);
assertThrows(
  () => defineCrossAssetRelationshipsV1([
    relationship({ targetAssetId: "silver", referenceAssetId: "silver" }),
  ]),
  "self-edge rejection",
);
assertThrows(
  () => defineCrossAssetRelationshipsV1([
    relationship({ targetAssetId: "invalid" as MarketAssetId }),
  ]),
  "invalid asset rejection",
);
assertThrows(
  () => defineCrossAssetRelationshipsV1([
    relationship({ expectedSign: "conditional" as "direct" }),
  ]),
  "unsupported sign rejection",
);
assertThrows(
  () => defineCrossAssetRelationshipsV1([
    relationship({ horizon: { interval: "daily", observations: 0 } }),
  ]),
  "invalid horizon rejection",
);

console.log("PASS: Cross-Asset V1 relationship registry");
