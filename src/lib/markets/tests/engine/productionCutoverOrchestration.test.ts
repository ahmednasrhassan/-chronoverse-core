import { calculateGoldMacroScore } from "../../assets/gold/macroScore";
import {
  evaluatePreparedGoldV1,
  prepareGoldMacroEvidenceV1,
} from "../../assets/gold/productionCutover";
import { goldProfile } from "../../assets/gold/profile";
import { calculateOilMacro } from "../../assets/oil/macro";
import {
  evaluatePreparedOilV1,
  prepareOilMacroEvidenceV1,
} from "../../assets/oil/productionCutover";
import { calculateMarketIntelligence } from "../../core/marketIntelligence";
import {
  assertDeep,
  assertEqual,
  CUTOVER_COMPUTED_AT,
  cutoverEvaluation,
  cutoverHistory,
} from "../productionCutoverFixtures";

const goldMacro = calculateGoldMacroScore({
  realYield10Y: { date: "2026-09-04", value: 0.5 },
  nominalYield10Y: null,
  dollarIndexProxy: { date: "2026-09-02", value: 104 },
  inflationExpectation10Y: { date: "2026-09-01", value: 2.6 },
});
const goldPreparedMacro = prepareGoldMacroEvidenceV1(goldMacro);
assertEqual(goldPreparedMacro.applicability, "applicable", "partial Gold Macro applicable");
assertEqual(goldPreparedMacro.section.availability, "partial", "partial Gold Macro retained");

for (const count of [0, 199]) {
  const result = evaluatePreparedGoldV1(
    cutoverEvaluation("gold", cutoverHistory(count, 1_800)),
    goldMacro,
  );
  assertEqual(result.availability, "unavailable", `Gold ${count} unavailable`);
}

const history200 = cutoverHistory(200, 1_800);
const result200 = evaluatePreparedGoldV1(
  cutoverEvaluation("gold", history200),
  goldMacro,
);
assertEqual(result200.availability, "available", "Gold 200 ready");
if (result200.availability !== "available") {
  throw new Error("Expected Gold 200 output.");
}
assertEqual(result200.engineResult.evaluatedAt, CUTOVER_COMPUTED_AT, "Gold prepared/Engine timestamp identity");
assertEqual(result200.engineResult.marketData.historicalWindow?.receivedPoints, 200, "Gold 200 source count");

const history601 = cutoverHistory(601, 1_800);
const result601 = evaluatePreparedGoldV1(
  cutoverEvaluation("gold", history601),
  goldMacro,
);
assertEqual(result601.availability, "available", "Gold 601 ready");
if (result601.availability !== "available") {
  throw new Error("Expected Gold 601 output.");
}
assertEqual(result601.engineResult.marketData.historicalWindow?.receivedPoints, 601, "Gold 601 source count");
assertDeep(
  result601.intelligence.technical,
  calculateMarketIntelligence({
    profile: goldProfile,
    closes: history601.slice(-600).map((item) => item.close),
  }).technical,
  "Gold 601 analytics use latest 600",
);

const oilUnavailableMacro = calculateOilMacro({
  inventoriesChangePct: null,
  productionChangePct: null,
  globalDemandChangePct: null,
  usdChangePct: null,
});
const oilPreparedMacro = prepareOilMacroEvidenceV1(oilUnavailableMacro);
assertEqual(oilPreparedMacro.applicability, "applicable", "unavailable Oil Macro applicable");
assertEqual(oilPreparedMacro.section.availability, "unavailable", "unavailable Oil Macro retained");
const oil = evaluatePreparedOilV1(
  cutoverEvaluation("oil", cutoverHistory(200, 65)),
  oilUnavailableMacro,
);
assertEqual(oil.availability, "available", "Oil Technical-led output remains available");
if (oil.availability !== "available") {
  throw new Error("Expected available Oil output.");
}
assertEqual(oil.engineResult.evaluatedAt, CUTOVER_COMPUTED_AT, "Oil prepared/Engine timestamp identity");

console.log("PASS: Gold/Oil Cutover Orchestration Foundation V1");
