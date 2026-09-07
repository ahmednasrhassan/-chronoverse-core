import { calculateGoldIntelligence } from "../../assets/gold/intelligence";
import { calculateGoldMacroScore } from "../../assets/gold/macroScore";
import {
  evaluatePreparedGoldV1,
  mapGoldCompatibilityV1,
  prepareGoldMacroEvidenceV1,
} from "../../assets/gold/productionCutover";
import {
  calculateGoldRegimeMemory,
  createGoldRegimeSnapshot,
} from "../../assets/gold/regimeMemory";
import {
  assertDeep,
  assertEqual,
  cutoverEvaluation,
  cutoverHistory,
} from "../productionCutoverFixtures";

const observations = cutoverHistory(260, 1_800);
const closes = observations.map((item) => item.close);
const macro = calculateGoldMacroScore({
  realYield10Y: { date: "2026-09-04", value: 0.5 },
  nominalYield10Y: { date: "2026-09-03", value: 3.2 },
  dollarIndexProxy: { date: "2026-09-02", value: 104 },
  inflationExpectation10Y: { date: "2026-09-01", value: 2.6 },
});
const raw = evaluatePreparedGoldV1(
  cutoverEvaluation("gold", observations),
  macro,
);

if (raw.availability !== "available") {
  throw new Error("Expected available Gold cutover output.");
}

const legacy = calculateGoldIntelligence({ closes, macro });
const current = createGoldRegimeSnapshot(legacy, raw.engineResult.evaluatedAt);
const regimeMemory = calculateGoldRegimeMemory(current, null);
const engineResult = {
  ...raw.engineResult,
  regime: { availability: "available" as const, memory: regimeMemory },
};
const before = JSON.stringify({
  intelligence: raw.intelligence,
  engineResult,
  macro,
  regimeMemory,
});
const mapped = mapGoldCompatibilityV1({
  intelligence: raw.intelligence,
  engineResult,
  macro,
  regimeMemory,
});

assertDeep(
  Object.keys(mapped).sort(),
  [
    "confidence",
    "engineResult",
    "indicators",
    "macro",
    "price",
    "regimeMemory",
    "risk",
    "signal",
    "state",
    "summary",
    "warnings",
  ],
  "Gold public keys",
);
assertDeep(mapped.indicators, legacy.indicators, "Gold indicator mapping");
assertEqual(mapped.risk, raw.intelligence.risk, "Gold Risk identity");
assertEqual(mapped.signal, raw.intelligence.signal, "Gold Signal identity");
assertEqual(mapped.state, raw.intelligence.state, "Gold state");
assertEqual(mapped.confidence, raw.intelligence.confidence, "Gold confidence");
assertEqual(mapped.macro, macro, "Gold Macro sidecar identity");
assertEqual(mapped.regimeMemory, regimeMemory, "Gold Regime identity");
assertEqual(mapped.engineResult, engineResult, "Gold Engine identity");
assertEqual(mapped.summary, legacy.summary, "Gold summary");
assertDeep(mapped.warnings, legacy.warnings, "Gold warnings");
assertEqual("technical" in mapped, false, "Gold internal Technical omitted");
assertEqual(JSON.stringify({ intelligence: raw.intelligence, engineResult, macro, regimeMemory }), before, "Gold inputs unchanged");
assertDeep(
  mapGoldCompatibilityV1({ intelligence: raw.intelligence, engineResult, macro, regimeMemory }),
  mapped,
  "Gold mapper deterministic",
);

const unavailableMacro = calculateGoldMacroScore({
  realYield10Y: null,
  nominalYield10Y: null,
  dollarIndexProxy: null,
  inflationExpectation10Y: null,
});
const unavailablePrepared = prepareGoldMacroEvidenceV1(unavailableMacro);
assertEqual(unavailablePrepared.applicability, "applicable", "Gold unavailable remains applicable");
assertEqual(unavailablePrepared.section.availability, "unavailable", "Gold unavailable Engine Macro");
const unavailableRaw = evaluatePreparedGoldV1(
  cutoverEvaluation("gold", observations),
  unavailableMacro,
);
if (unavailableRaw.availability !== "available") {
  throw new Error("Expected Technical-led Gold output with unavailable Macro.");
}
const unavailableEngine = {
  ...unavailableRaw.engineResult,
  regime: { availability: "available" as const, memory: regimeMemory },
};
const unavailableMapped = mapGoldCompatibilityV1({
  intelligence: unavailableRaw.intelligence,
  engineResult: unavailableEngine,
  macro: unavailableMacro,
  regimeMemory,
});
assertEqual(unavailableMapped.macro, unavailableMacro, "unavailable Gold Macro sidecar");
assertDeep(
  unavailableMapped.macro.factors,
  {
    realYield10Y: null,
    nominalYield10Y: null,
    dollarIndexProxy: null,
    inflationExpectation10Y: null,
  },
  "unavailable Gold factor details",
);

console.log("PASS: Gold Production Cutover Foundation V1");
