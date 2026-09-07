import { calculateOilIntelligence } from "../../assets/oil/intelligence";
import { calculateOilMacro, type OilMacroInput } from "../../assets/oil/macro";
import {
  evaluatePreparedOilV1,
  mapOilCompatibilityV1,
  prepareOilMacroEvidenceV1,
} from "../../assets/oil/productionCutover";
import {
  calculateOilRegimeMemory,
  createOilRegimeSnapshot,
} from "../../assets/oil/regimeMemory";
import {
  assertDeep,
  assertEqual,
  cutoverEvaluation,
  cutoverHistory,
} from "../productionCutoverFixtures";

const observations = cutoverHistory(260, 65);
const closes = observations.map((item) => item.close);
const macroInput: OilMacroInput = {
  inventoriesChangePct: -4,
  productionChangePct: -2,
  globalDemandChangePct: 2,
  usdChangePct: null,
  observedAt: {
    inventories: "2026-W34",
    production: "2026-W33",
    globalDemand: "2026-Q2",
    usd: null,
  },
};
const macro = calculateOilMacro(macroInput);
const raw = evaluatePreparedOilV1(
  cutoverEvaluation("oil", observations),
  macro,
);

if (raw.availability !== "available") {
  throw new Error("Expected available Oil cutover output.");
}

const legacy = calculateOilIntelligence({ closes, macro: macroInput });
const current = createOilRegimeSnapshot(legacy, raw.engineResult.evaluatedAt);
const regimeMemory = calculateOilRegimeMemory(current, null);
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
const mapped = mapOilCompatibilityV1({
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
    "macro",
    "marketData",
    "price",
    "profileId",
    "regimeMemory",
    "risk",
    "signal",
    "state",
    "technical",
  ],
  "Oil public keys",
);
assertEqual(mapped.technical, raw.intelligence.technical, "Oil Technical identity");
assertEqual(mapped.risk, raw.intelligence.risk, "Oil Risk identity");
assertEqual(mapped.signal, raw.intelligence.signal, "Oil Signal identity");
assertEqual(mapped.state, raw.intelligence.state, "Oil state");
assertEqual(mapped.confidence, raw.intelligence.confidence, "Oil confidence");
assertEqual(mapped.macro, macro, "Oil Macro sidecar identity");
assertEqual(mapped.macro.drivers.usd.available, false, "Oil USD unavailable detail");
assertEqual(mapped.macro.drivers.usd.reason, "US dollar data is unavailable.", "Oil USD reason");
assertEqual(mapped.regimeMemory, regimeMemory, "Oil Regime identity");
assertEqual(mapped.engineResult, engineResult, "Oil Engine identity");
assertDeep(
  mapped.marketData,
  {
    provider: engineResult.marketData.provider,
    status: engineResult.marketData.status,
    provenance: engineResult.marketData.provenance,
    window: engineResult.marketData.historicalWindow,
  },
  "Oil marketData mapping",
);
assertEqual(JSON.stringify({ intelligence: raw.intelligence, engineResult, macro, regimeMemory }), before, "Oil inputs unchanged");
assertDeep(
  mapOilCompatibilityV1({ intelligence: raw.intelligence, engineResult, macro, regimeMemory }),
  mapped,
  "Oil mapper deterministic",
);

const unavailableMacro = calculateOilMacro({
  inventoriesChangePct: null,
  productionChangePct: null,
  globalDemandChangePct: null,
  usdChangePct: null,
});
const unavailablePrepared = prepareOilMacroEvidenceV1(unavailableMacro);
assertEqual(unavailablePrepared.applicability, "applicable", "Oil unavailable remains applicable");
assertEqual(unavailablePrepared.section.availability, "unavailable", "Oil unavailable Engine Macro");
assertEqual(unavailableMacro.drivers.usd.available, false, "unavailable Oil USD sidecar");

console.log("PASS: Oil Production Cutover Foundation V1");
