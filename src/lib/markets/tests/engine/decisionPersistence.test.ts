import { assetRegistry } from "../../core/assets";
import type {
  EngineDecisionSectionV3,
} from "../../engine/contracts";
import {
  DECISION_ENGINE_RESULT_VERSION,
  DECISION_SNAPSHOT_SCHEMA_VERSION,
  areDecisionSnapshotsSemanticallyEqual,
  buildCanonicalDecisionSnapshot,
  buildDecisionSnapshotKey,
  compareDecisionSnapshotTime,
  parseDecisionSnapshot,
  type CanonicalDecisionSnapshot,
} from "../../engine/decisionPersistence";

const EARLIER = "2026-01-01T00:00:00.000Z";
const LATER = "2026-01-02T00:00:00.000Z";

function available(
  score: number,
  stance: "bullish" | "bearish" | "neutral",
): EngineDecisionSectionV3 {
  return {
    availability: "available",
    data: { score, stance },
  };
}

function partial(
  score: number,
  stance: "bullish" | "bearish" | "neutral",
  missing: readonly string[],
): EngineDecisionSectionV3 {
  return {
    availability: "partial",
    data: { score, stance },
    missing,
  };
}

function snapshot(
  decision: EngineDecisionSectionV3,
  computedAt = EARLIER,
  assetId: keyof typeof assetRegistry = "gold",
): CanonicalDecisionSnapshot {
  return buildCanonicalDecisionSnapshot({
    assetId,
    computedAt,
    decision,
  });
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, label: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);

  if (actualJson !== expectedJson) {
    throw new Error(`${label}: expected ${expectedJson}, received ${actualJson}`);
  }
}

function assertThrows(callback: () => unknown, label: string): void {
  let threw = false;

  try {
    callback();
  } catch {
    threw = true;
  }

  assertEqual(threw, true, label);
}

// Exhaustively derive keys from the canonical registry.
for (const assetId of Object.keys(assetRegistry) as (keyof typeof assetRegistry)[]) {
  assertEqual(
    buildDecisionSnapshotKey(assetId),
    `chronoverse:decision:engine-v3:snapshot-v1:${assetId}`,
    `${assetId} key`,
  );
}

const bullish = snapshot(available(0.7, "bullish"));
const bearish = snapshot(available(-0.4, "bearish"));
const neutral = snapshot(available(0, "neutral"));

assertEqual(bullish.decision.data.stance, "bullish", "available bullish");
assertEqual(bearish.decision.data.stance, "bearish", "available bearish");
assertEqual(neutral.decision.data.stance, "neutral", "exact neutral zero");
assertEqual(bullish.schemaVersion, DECISION_SNAPSHOT_SCHEMA_VERSION, "schema version");
assertEqual(
  bullish.engineResultVersion,
  DECISION_ENGINE_RESULT_VERSION,
  "engine result version",
);

const normalizedPartial = snapshot(
  partial(0.3, "bullish", [" macro ", "technical", "macro", "", "  "]),
);

if (normalizedPartial.decision.availability !== "partial") {
  throw new Error("Partial fixture was not persisted as partial.");
}

assertDeepEqual(
  normalizedPartial.decision.missing,
  ["macro", "technical"],
  "partial missing normalization",
);

assertThrows(
  () => snapshot(partial(0.3, "bullish", ["", "  "])),
  "partial with no normalized missing",
);

for (const [score, stance, label] of [
  [0.2, "bearish", "positive bearish mismatch"],
  [-0.2, "bullish", "negative bullish mismatch"],
  [0, "bullish", "zero bullish mismatch"],
  [0, "bearish", "zero bearish mismatch"],
  [Number.NaN, "bullish", "NaN score"],
  [Number.POSITIVE_INFINITY, "bullish", "infinite score"],
  [1.01, "bullish", "score above one"],
  [-1.01, "bearish", "score below negative one"],
] as const) {
  assertThrows(
    () => snapshot(available(score, stance)),
    label,
  );
}

assertThrows(
  () => snapshot(available(0.2, "bullish"), "not-a-timestamp"),
  "malformed timestamp",
);
assertThrows(
  () => snapshot({ availability: "unavailable", reason: "missing" }),
  "unavailable rejected",
);
assertThrows(
  () => snapshot({ availability: "not-computed" }),
  "not-computed rejected",
);

assertEqual(parseDecisionSnapshot(bullish)?.decision.data.score, 0.7, "valid parse");
assertEqual(
  parseDecisionSnapshot({ ...bullish, schemaVersion: 2 }),
  null,
  "wrong schema version",
);
assertEqual(
  parseDecisionSnapshot({ ...bullish, engineResultVersion: "2" }),
  null,
  "wrong engine result version",
);
assertEqual(
  parseDecisionSnapshot({ ...bullish, assetId: "invalid" }),
  null,
  "invalid asset id",
);
assertEqual(
  parseDecisionSnapshot({ ...bullish, computedAt: "invalid" }),
  null,
  "invalid parsed timestamp",
);
assertEqual(
  parseDecisionSnapshot({ ...bullish, decision: { availability: "unavailable" } }),
  null,
  "incompatible availability",
);

const sameDecisionLater = snapshot(available(0.7, "bullish"), LATER);
assertEqual(
  areDecisionSnapshotsSemanticallyEqual(bullish, sameDecisionLater),
  true,
  "semantic equality ignores computedAt",
);
assertEqual(
  areDecisionSnapshotsSemanticallyEqual(bullish, snapshot(available(0.6, "bullish"))),
  false,
  "semantic score inequality",
);
assertEqual(
  areDecisionSnapshotsSemanticallyEqual(
    bullish,
    {
      ...bullish,
      decision: {
        availability: "available",
        data: { score: 0.7, stance: "bearish" },
      },
    } as CanonicalDecisionSnapshot,
  ),
  false,
  "semantic stance inequality",
);
assertEqual(
  areDecisionSnapshotsSemanticallyEqual(
    bullish,
    snapshot(partial(0.7, "bullish", ["macro"])),
  ),
  false,
  "semantic availability inequality",
);
assertEqual(
  areDecisionSnapshotsSemanticallyEqual(
    snapshot(partial(0.7, "bullish", ["macro"])),
    snapshot(partial(0.7, "bullish", ["technical"])),
  ),
  false,
  "semantic missing inequality",
);
assertEqual(
  areDecisionSnapshotsSemanticallyEqual(
    bullish,
    { ...bullish, schemaVersion: 2 } as unknown as CanonicalDecisionSnapshot,
  ),
  false,
  "incompatible versions are unequal",
);

assertEqual(compareDecisionSnapshotTime(sameDecisionLater, bullish), "newer", "newer time");
assertEqual(compareDecisionSnapshotTime(bullish, bullish), "same-time", "same time");
assertEqual(compareDecisionSnapshotTime(bullish, sameDecisionLater), "older", "older time");

for (const malformed of [
  null,
  undefined,
  true,
  1,
  "snapshot",
  [],
  {},
  { schemaVersion: 1 },
  { ...bullish, decision: null },
  { ...bullish, decision: { availability: "partial", data: bullish.decision.data } },
  { ...bullish, decision: { availability: "partial", data: bullish.decision.data, missing: [] } },
]) {
  let parsed: CanonicalDecisionSnapshot | null | undefined;

  try {
    parsed = parseDecisionSnapshot(malformed);
  } catch (error) {
    throw new Error(`Parser threw for malformed value: ${String(error)}`);
  }

  assertEqual(parsed, null, "malformed value rejected without throwing");
}

const throwingValue = Object.defineProperty({}, "schemaVersion", {
  get() {
    throw new Error("external getter failure");
  },
});
assertEqual(parseDecisionSnapshot(throwingValue), null, "throwing external value rejected");

console.log("PASS: Engine V3 Decision Persistence foundation");
