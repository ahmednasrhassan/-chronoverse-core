import { calculateGoldMacroScore } from "../../assets/gold/macroScore";
import { evaluatePreparedGoldV1 } from "../../assets/gold/productionCutover";
import { calculateGoldRegimeMemory } from "../../assets/gold/regimeMemory";
import {
  calculateMarketRegimeMemory,
  createMarketRegimeSnapshot,
  type MarketRegimeSnapshot,
} from "../../core/regimeMemory";
import { integrateCanonicalDecisionLifecycleV3 } from
  "../../engine/decisionLifecycleRuntime";
import {
  enrichEngineRegimeV1,
  PERSISTENT_REGIME_HISTORY_MISSING_V1,
} from "../../engine/regimeEnrichment";
import {
  assertDeep,
  assertEqual,
  CUTOVER_COMPUTED_AT,
  cutoverEvaluation,
  cutoverHistory,
} from "../productionCutoverFixtures";

const macro = calculateGoldMacroScore({
  realYield10Y: { date: "2026-09-04", value: 0.5 },
  nominalYield10Y: { date: "2026-09-04", value: 3.2 },
  dollarIndexProxy: { date: "2026-09-04", value: 104 },
  inflationExpectation10Y: { date: "2026-09-04", value: 2.6 },
});
const raw = evaluatePreparedGoldV1(
  cutoverEvaluation("gold", cutoverHistory(240, 1_800)),
  macro,
);

if (raw.availability !== "available") {
  throw new Error("Expected an available raw Gold runtime.");
}
const availableRaw = raw;

const current = createMarketRegimeSnapshot({
  timestamp: availableRaw.engineResult.evaluatedAt,
  state: availableRaw.intelligence.state,
  confidence: availableRaw.intelligence.confidence,
  signalDirection: availableRaw.intelligence.signal.direction,
  signalConfidence: availableRaw.intelligence.signal.confidence,
  macroBias: macro.bias,
  macroConfidence: macro.confidence,
  riskLevel: availableRaw.intelligence.risk.level,
  riskScore: availableRaw.intelligence.risk.score,
});
const previous: typeof current = Object.freeze({
  ...current,
  timestamp: "2026-09-07T11:00:00.000Z",
  confidence: Math.max(0, current.confidence - 0.05),
});
const before = JSON.stringify({ engineResult: availableRaw.engineResult, current, previous });
const decisionBefore = JSON.stringify(availableRaw.engineResult.decision);

async function run(): Promise<void> {
let reads = 0;
let appends = 0;
let appendedPrevious: MarketRegimeSnapshot | null | undefined;
const success = await enrichEngineRegimeV1({
  engineResult: availableRaw.engineResult,
  current,
  calculateMemory: calculateGoldRegimeMemory,
  readLatest: async () => {
    reads += 1;
    return previous;
  },
  append: async (_candidate, prior) => {
    appends += 1;
    appendedPrevious = prior;
  },
});

assertEqual(success.engineResult.regime.availability, "available", "success Regime");
assertEqual(success.persistence.status, "persisted", "success persistence");
assertEqual(reads, 1, "success read count");
assertEqual(appends, 1, "success append count");
assertEqual(appendedPrevious, previous, "append receives pre-read previous");
assertEqual(success.regimeMemory.previous, previous, "memory receives previous");
assertEqual(success.regimeMemory.current.timestamp, CUTOVER_COMPUTED_AT, "fixed timestamp");

reads = 0;
appends = 0;
const readFailure = await enrichEngineRegimeV1({
  engineResult: availableRaw.engineResult,
  current,
  calculateMemory: calculateGoldRegimeMemory,
  readLatest: async () => {
    reads += 1;
    throw new Error("offline read failure");
  },
  append: async () => {
    appends += 1;
  },
});

assertEqual(readFailure.engineResult.regime.availability, "partial", "read failure Regime");
assertEqual(readFailure.persistence.status, "degraded", "read failure persistence");
assertEqual(
  readFailure.persistence.status === "degraded" ? readFailure.persistence.stage : null,
  "read",
  "read failure stage",
);
assertEqual(reads, 1, "read failure count");
assertEqual(appends, 0, "no append after failed read");
assertEqual(readFailure.regimeMemory.previous, null, "read fallback previous");
assertDeep(readFailure.engineResult.decision, availableRaw.engineResult.decision, "read failure Decision");

async function appendFailure(label: string) {
  let localReads = 0;
  let localAppends = 0;
  const result = await enrichEngineRegimeV1({
    engineResult: availableRaw.engineResult,
    current,
    calculateMemory: calculateGoldRegimeMemory,
    readLatest: async () => {
      localReads += 1;
      return previous;
    },
    append: async () => {
      localAppends += 1;
      throw new Error(label);
    },
  });

  assertEqual(result.engineResult.regime.availability, "partial", `${label} Regime`);
  assertEqual(result.persistence.status, "degraded", `${label} persistence`);
  assertEqual(
    result.persistence.status === "degraded" ? result.persistence.stage : null,
    "append",
    `${label} stage`,
  );
  assertEqual(localReads, 1, `${label} read count`);
  assertEqual(localAppends, 1, `${label} append count`);
  assertEqual(result.regimeMemory.previous, previous, `${label} memory retained`);
  assertDeep(result.engineResult.decision, availableRaw.engineResult.decision, `${label} Decision`);
  if (result.engineResult.regime.availability !== "partial") {
    throw new Error(`${label}: expected partial Regime.`);
  }
  assertDeep(
    result.engineResult.regime.missing,
    [PERSISTENT_REGIME_HISTORY_MISSING_V1],
    `${label} stable missing code`,
  );
  return result;
}

const appendDegraded = await appendFailure("append failure");
await appendFailure("trim/write failure");

let decisionSnapshotComputedAt: string | null = null;
const lifecycle = await integrateCanonicalDecisionLifecycleV3({
  assetId: appendDegraded.engineResult.asset,
  computedAt: appendDegraded.engineResult.evaluatedAt,
  currentDecision: appendDegraded.engineResult.decision,
  advanceSnapshot: async (snapshot) => {
    decisionSnapshotComputedAt = snapshot.computedAt;
    return { status: "initialized", previous: null };
  },
});
assertEqual(
  decisionSnapshotComputedAt,
  CUTOVER_COMPUTED_AT,
  "Decision snapshot timestamp identity",
);
assertEqual(
  appendDegraded.engineResult.decision,
  availableRaw.engineResult.decision,
  "Regime degradation preserves Decision reference",
);
assertDeep(lifecycle.decision, availableRaw.engineResult.decision, "lifecycle Decision preserved");
assertEqual(lifecycle.decisionLifecycle.availability, "partial", "lifecycle remains consumable");
if (lifecycle.decisionLifecycle.availability !== "partial") {
  throw new Error("Expected partial initialized lifecycle.");
}
assertEqual(lifecycle.decisionLifecycle.data.comparison, "initialized", "lifecycle initialized");
if (
  availableRaw.engineResult.decision.availability !== "partial" ||
  lifecycle.decisionLifecycle.data.comparison !== "initialized"
) {
  throw new Error("Expected partial current Decision and initialized lifecycle.");
}
assertDeep(
  lifecycle.decisionLifecycle.data.current,
  availableRaw.engineResult.decision.data,
  "lifecycle current Decision data",
);
assertDeep(
  [...lifecycle.decisionLifecycle.missing].sort(),
  [...availableRaw.engineResult.decision.missing].sort(),
  "lifecycle missing evidence",
);
assertEqual(JSON.stringify(availableRaw.engineResult.decision), decisionBefore, "Decision byte identity");
assertEqual(JSON.stringify({ engineResult: availableRaw.engineResult, current, previous }), before, "inputs unchanged");

let timestampRejected = false;
try {
  await enrichEngineRegimeV1({
    engineResult: availableRaw.engineResult,
    current: { ...current, timestamp: "2026-09-07T12:00:01.000Z" },
    calculateMemory: (candidate, prior) =>
      calculateMarketRegimeMemory(candidate, prior, () => 0),
    readLatest: async () => null,
    append: async () => undefined,
  });
} catch (error) {
  timestampRejected = error instanceof TypeError;
}
assertEqual(timestampRejected, true, "timestamp mismatch rejected");

console.log("PASS: Outer Regime Enrichment V1");
}

void run();
