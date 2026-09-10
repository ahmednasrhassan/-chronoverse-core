import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  ESTR_CALIBRATION_FIXTURE_SHA256_V1,
  ESTR_CALIBRATION_METHODOLOGY_VERSION_V1,
  ESTR_FROZEN_CALIBRATION_V1,
  ESTR_TECHNICAL_WARMUP_V1,
  runEstrRateCalibrationStudyV1,
} from "./estrRateCalibration.study";

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

const first = runEstrRateCalibrationStudyV1();
const second = runEstrRateCalibrationStudyV1();

assert(JSON.stringify(first) === JSON.stringify(second),
  "study replay must be byte-for-byte deterministic");
assert(first.methodologyVersion === ESTR_CALIBRATION_METHODOLOGY_VERSION_V1,
  "methodology version");
assert(first.generatedFrom === "immutable-official-ecb-fixture", "fixture provenance");
assert(first.source.fixtureSha256 === ESTR_CALIBRATION_FIXTURE_SHA256_V1,
  "official fixture hash");
assert(first.source.provider === "ECB" &&
  first.source.source === "European Central Bank", "official provider identity");
assert(first.source.dataflow === "ECB/EST/1.0" &&
  first.source.seriesId === "EST.B.EU000A2X2A25.WT" &&
  first.source.seriesKey === "B.EU000A2X2A25.WT", "exact €STR identity");
assert(first.source.sourceUrl ===
  "https://data-api.ecb.europa.eu/service/data/EST/B.EU000A2X2A25.WT+RP+CM?format=csvdata&detail=full" &&
  first.source.fixtureSizeBytes === 38_386, "exact bootstrap evidence artifact");
assert(first.source.preEstrObservations === 0 &&
  first.source.fallbackProviders.length === 0, "live €STR only");
assert(first.source.successfulAcquisitions === 1 &&
  first.source.replayNetworkCalls === 0, "single acquisition and offline replay");

assert(JSON.stringify(first.history) === JSON.stringify({
  firstDate: "2019-10-01",
  lastDate: "2026-09-09",
  count: 1_778,
  minimumRate: -0.593,
  maximumRate: 3.913,
  negativeCount: 759,
  zeroCount: 0,
  positiveCount: 1_019,
}), "frozen official history evidence");
assert(first.split.warmupExcludedCount === ESTR_TECHNICAL_WARMUP_V1 &&
  first.split.warmupExcludedCount === 199, "causal EMA200 warm-up");
assert(first.split.usableCount === 1_579 &&
  first.split.firstUsableDate === "2020-07-14", "usable history");
assert(first.split.calibrationCount === 1_105 &&
  first.split.calibrationStartDate === "2020-07-14" &&
  first.split.calibrationEndDate === "2024-10-29", "calibration split");
assert(first.split.validationCount === 474 &&
  first.split.validationStartDate === "2024-10-30" &&
  first.split.validationEndDate === "2026-09-09", "validation split");
assert(first.split.shuffled === false &&
  first.split.allSelectedFeaturesCausallyAvailable, "causal chronological split");

assert(first.candidateSelection.momentum.selectedHorizon === 10,
  "selected momentum horizon");
const momentum = first.candidateSelection.momentum.candidates;
assert(momentum.length === 3 && momentum.map((item) => item.horizon).join(",") ===
  "5,10,20", "constrained momentum candidate set");
assert(momentum[1]!.calibration.percentile90 === 24.8 &&
  momentum[1]!.validation.percentile90 === 24.8 &&
  momentum[1]!.absoluteP90DriftBp === 0, "10-observation holdout robustness");
assert(momentum[1]!.signPersistence === 0.615036 &&
  momentum[1]!.correlationWithEma50Distance === 0.751381,
"10-observation persistence/redundancy evidence");
assert(momentum[2]!.absoluteP90DriftBp === 24.3 &&
  momentum[2]!.correlationWithEma50Distance === 0.882555,
"20-observation tail drift/redundancy evidence");
assert(first.candidateSelection.momentum.predictiveOptimizationUsed === false,
  "no predictive target optimization");

assert(first.candidateSelection.volatility.selectedWindow === 20,
  "selected volatility window");
const volatility = first.candidateSelection.volatility.candidates;
assert(volatility.length === 3 && volatility.map((item) => item.window).join(",") ===
  "10,20,30", "constrained volatility candidate set");
assert(volatility[1]!.relativeMeanDrift === 0.244191 &&
  volatility[1]!.lagOneCorrelation === 0.938596,
"20-observation volatility stability evidence");

const frozen = first.frozenCandidate;
assert(frozen === ESTR_FROZEN_CALIBRATION_V1, "single frozen candidate identity");
assert(frozen.status === "calibration-only-not-production-activated" &&
  frozen.derivedFrom === "calibration-sample-only", "calibration isolation");
assert(JSON.stringify(frozen.signal.weights) === JSON.stringify({
  ema: 0.35, rsi: 0.15, macd: 0.2, momentum: 0.3,
}), "Signal weights");
assert(Math.abs(Object.values(frozen.signal.weights).reduce((sum, value) =>
  sum + value, 0) - 1) < 1e-12, "Signal weights sum to one");
assert(JSON.stringify(frozen.signal.ema) === JSON.stringify([
  { period: 20, neutralDistanceBp: 0.15, strongDistanceBp: 4 },
  { period: 50, neutralDistanceBp: 0.3, strongDistanceBp: 19 },
  { period: 200, neutralDistanceBp: 0.9, strongDistanceBp: 86 },
]), "Signal EMA thresholds");
assert(JSON.stringify(frozen.signal.rsi) === JSON.stringify({
  center: 50, neutralStretch: 3, strongStretch: 35,
}), "Signal RSI thresholds");
assert(JSON.stringify(frozen.signal.macdHistogram) === JSON.stringify({
  neutralBp: 0.02, strongBp: 1.3,
}), "Signal MACD thresholds");
assert(JSON.stringify(frozen.signal.momentum) === JSON.stringify({
  neutralBp: 0.2, strongBp: 1,
}), "Signal momentum thresholds");
assert(frozen.signal.aggregate.neutralAbsoluteScore === 0.2 &&
  frozen.signal.aggregate.strongAbsoluteScore === 0.6 &&
  frozen.signal.confidence.requiredCoverage === 1 &&
  frozen.signal.confidence.behavior === "exclude-before-full-causal-warmup",
"Signal aggregate/coverage semantics");
const signalEvidence = first.calibrationEvidence.signalComponentThresholdQuantiles;
assert(signalEvidence.ema20DistanceBp.empiricalNeutral === 0.154596 &&
  signalEvidence.ema20DistanceBp.empiricalStrong === 3.837828 &&
  signalEvidence.ema50DistanceBp.empiricalNeutral === 0.281783 &&
  signalEvidence.ema50DistanceBp.empiricalStrong === 18.923359 &&
  signalEvidence.ema200DistanceBp.empiricalNeutral === 0.886325 &&
  signalEvidence.ema200DistanceBp.empiricalStrong === 85.799415,
"Signal EMA calibration quantiles");
assert(signalEvidence.rsiStretch.empiricalNeutral === 3.155683 &&
  signalEvidence.rsiStretch.empiricalStrong === 35.386106 &&
  signalEvidence.macdHistogramBp.empiricalNeutral === 0.021972 &&
  signalEvidence.macdHistogramBp.empiricalStrong === 1.29098 &&
  signalEvidence.momentum10Bp.empiricalNeutral === 0.2 &&
  signalEvidence.momentum10Bp.empiricalStrong === 1,
"Signal oscillator/momentum calibration quantiles");

assert(first.signalValidation.verdict === "PASS" &&
  first.signalValidation.failures.length === 0, "Signal validation");
assert(first.signalValidation.bounded &&
  first.signalValidation.componentMonotonicity.passed, "Signal invariants");
assert(JSON.stringify(first.signalValidation.calibration.states) === JSON.stringify({
  "falling-rate": 0.076,
  "range-bound": 0.6407,
  "rising-rate": 0.2833,
}), "calibration Signal distribution");
assert(JSON.stringify(first.signalValidation.validation.states) === JSON.stringify({
  "falling-rate": 0.2975,
  "range-bound": 0.6392,
  "rising-rate": 0.0633,
}), "validation Signal distribution");
assert(first.signalValidation.coverage.calibration === 1 &&
  first.signalValidation.coverage.validation === 1, "Signal coverage");
assert(first.signalValidation.temporalStability.verdict ===
  "PASS_WITH_LIMITED_EVIDENCE" &&
  first.signalValidation.temporalStability.allBlockScoresFinite,
"honest Signal temporal-stability verdict");

assert(JSON.stringify(frozen.risk.weights) === JSON.stringify({
  dailyBpVolatility: 0.3,
  rsiStretch: 0.15,
  momentum: 0.2,
  macdHistogram: 0.1,
  ema50Distance: 0.15,
  ema200Distance: 0.1,
}), "Risk weights");
assert(Math.abs(Object.values(frozen.risk.weights).reduce((sum, value) =>
  sum + value, 0) - 1) < 1e-12, "Risk weights sum to one");
assert(JSON.stringify(frozen.risk.thresholds) === JSON.stringify({
  dailyBpVolatility: { moderate: 0.6, high: 5.6 },
  rsiStretch: { moderate: 6, high: 40 },
  momentumBp: { moderate: 0.5, high: 25 },
  macdHistogramBp: { moderate: 0.5, high: 2.1 },
  ema50DistanceBp: { moderate: 10, high: 36 },
  ema200DistanceBp: { moderate: 45, high: 127 },
}), "Risk component thresholds");
assert(frozen.risk.aggregate.moderateMinimum === 0.35 &&
  frozen.risk.aggregate.highMinimum === 0.65 &&
  frozen.risk.severityMapping.baseline === 0 &&
  frozen.risk.severityMapping.moderateThreshold === 0.5 &&
  frozen.risk.severityMapping.high === 1, "Risk aggregate/severity semantics");
const riskEvidence = first.calibrationEvidence.riskComponentThresholdQuantiles;
assert(riskEvidence.dailyBpVolatility.empiricalModerate === 0.564638 &&
  riskEvidence.dailyBpVolatility.empiricalHigh === 5.621428 &&
  riskEvidence.rsiStretch.empiricalModerate === 5.819238 &&
  riskEvidence.rsiStretch.empiricalHigh === 39.368877,
"Risk volatility/RSI calibration quantiles");
assert(riskEvidence.momentum10Bp.empiricalModerate === 0.5 &&
  riskEvidence.momentum10Bp.empiricalHigh === 24.8 &&
  riskEvidence.macdHistogramBp.empiricalModerate === 0.471057 &&
  riskEvidence.macdHistogramBp.empiricalHigh === 2.14383,
"Risk momentum/MACD calibration quantiles");
assert(riskEvidence.ema50DistanceBp.empiricalModerate === 10.403043 &&
  riskEvidence.ema50DistanceBp.empiricalHigh === 35.675278 &&
  riskEvidence.ema200DistanceBp.empiricalModerate === 44.469266 &&
  riskEvidence.ema200DistanceBp.empiricalHigh === 126.808594,
"Risk EMA calibration quantiles");
assert(first.riskValidation.verdict === "PASS" &&
  first.riskValidation.failures.length === 0, "Risk validation");
assert(first.riskValidation.componentSeverityMonotonicity.passed &&
  first.riskValidation.notLossProbability, "Risk semantics");
assert(JSON.stringify(first.riskValidation.calibration.bands) === JSON.stringify({
  high: 0.2253, low: 0.6145, moderate: 0.1602,
}), "calibration Risk distribution");
assert(JSON.stringify(first.riskValidation.validation.bands) === JSON.stringify({
  high: 0.2553, low: 0.5401, moderate: 0.2046,
}), "validation Risk distribution");
assert(Math.max(...Object.values(first.riskValidation.bandShareDrift)) === 0.0744,
  "Risk validation drift bound");
const riskRegimes = first.riskValidation.rateVolatilityConditioning;
assert(riskRegimes.noCircularConditioning &&
  riskRegimes.derivedFromFutureOutcomes === false, "non-circular Risk conditioning");
for (const sample of [riskRegimes.calibration, riskRegimes.validation]) {
  assert(sample.calm.meanRiskScore <= sample.elevated.meanRiskScore &&
    sample.elevated.meanRiskScore <= sample.stressed.meanRiskScore,
  "aggregate Risk monotonicity");
}

assert(frozen.levelRegime.lowUpperRate === -0.55 &&
  frozen.levelRegime.highLowerRate === 3.15, "level-regime thresholds");
assert(first.calibrationEvidence.levelRegimeQuantiles.lowerThird === -0.563 &&
  first.calibrationEvidence.levelRegimeQuantiles.upperThird === 3.147,
"level thresholds use calibration distribution");
assert(frozen.volatilityRegime.calmUpperBp === 0.4 &&
  frozen.volatilityRegime.stressedLowerBp === 5.6,
"volatility-regime thresholds");
assert(first.calibrationEvidence.volatilityRegimeQuantiles.median === 0.407657 &&
  first.calibrationEvidence.volatilityRegimeQuantiles.upperTail === 5.621428,
"volatility thresholds use calibration distribution");

const robustness = first.contiguousHistoricalRobustness;
assert(robustness.blockCount === 8 && robustness.blockLength === 200,
  "contiguous block design");
assert(robustness.blocks.slice(0, -1).every((block) =>
  block.observationCount === 200) && robustness.blocks.at(-1)!.observationCount === 179,
"contiguous block coverage");
assert(Object.values(robustness.coverage).every(Boolean),
  "negative/hiking/plateau/easing coverage");
assert(first.riskValidation.temporalStability.verdict ===
  "PASS_WITH_LIMITED_EVIDENCE", "honest temporal-stability verdict");

assert(first.thresholdSensitivity.verdict === "PASS" &&
  first.thresholdSensitivity.failures.length === 0, "threshold sensitivity");
assert(first.thresholdSensitivity.aggregateCutpointPerturbation === "±0.025" &&
  first.thresholdSensitivity.componentThresholdPerturbation === "±10%",
"exact sensitivity neighborhoods");
for (const scenario of Object.values(first.thresholdSensitivity.scenarios)) {
  assert(Math.max(...Object.values(scenario.signalStates)) <= 0.9,
    "sensitivity Signal non-collapse");
  assert(Math.max(...Object.values(scenario.riskBands)) <= 0.9 &&
    Object.keys(scenario.riskBands).length === 3, "sensitivity Risk non-collapse");
}

const population = first.reportingPopulationExpansion;
assert(population.effectiveReferenceDate === "2025-07-01" &&
  population.comparisonDesign === "adjacent-equal-120-observation-windows",
"reporting-population diagnostic design");
assert(population.preStartDate === "2025-01-09" &&
  population.preEndDate === "2025-06-30" &&
  population.postStartDate === "2025-07-01" &&
  population.postEndDate === "2025-12-15", "population diagnostic windows");
assert(Object.keys(population.metrics).join(",") ===
  "dailyChangeBp,momentum10Bp,dailyBpVolatility,rsi14,macdHistogramBp,signalScore,riskScore",
"population diagnostic feature set");
assert(population.materialMetricCount === 4 &&
  population.boundaryDailyChangeBp === 0 &&
  population.calibrationAbsoluteDailyChange95Bp === 1 &&
  population.boundaryExtreme === false &&
  population.separateRegimeRequired === false, "no boundary-local break evidence");

assert(first.domainAudit.negativeRowsEvaluated === 560 &&
  first.domainAudit.zeroRowsEvaluated === 0 &&
  first.domainAudit.crossZeroTransitions === 1, "signed-domain replay");
assert(first.domainAudit.finiteOutputs &&
  !first.domainAudit.usesLogReturns &&
  !first.domainAudit.usesPercentageRoc &&
  !first.domainAudit.usesPercentageEmaDistance &&
  !first.domainAudit.dividesByRateLevel &&
  !first.domainAudit.requiresPositiveRate, "rate-domain math invariants");
assert(first.domainAudit.productDirectionVocabulary ===
  "rising-rate/falling-rate/range-bound", "rate-direction vocabulary");

assert(first.acceptance.verdict === "PASS_WITH_LIMITED_EVIDENCE" &&
  first.acceptance.defensibleFrozenV1 && first.acceptance.failures.length === 0,
"defensible limited-evidence V1");
assert(first.acceptance.productionChangesAuthorized === false,
  "production activation remains unauthorized");

const analysisDirectory = fileURLToPath(new URL("./", import.meta.url));
const source = readFileSync(
  `${analysisDirectory}estrRateCalibration.study.ts`,
  "utf8",
).toLowerCase();
assert(!source.includes("fetch("), "replay performs no network calls");
assert(!source.includes("yahoo") && !source.includes("fred"), "no fallback source");
assert(!source.includes("math.log"), "no logarithmic rate math");
assert(!source.includes("pre-€str"), "no pre-€STR merge");

console.log(JSON.stringify({
  verdict: first.acceptance.verdict,
  history: first.history,
  split: first.split,
  selectedMomentumHorizon: first.candidateSelection.momentum.selectedHorizon,
  selectedVolatilityWindow: first.candidateSelection.volatility.selectedWindow,
  signalStates: {
    calibration: first.signalValidation.calibration.states,
    validation: first.signalValidation.validation.states,
  },
  riskBands: {
    calibration: first.riskValidation.calibration.bands,
    validation: first.riskValidation.validation.bands,
  },
  populationExpansionRequiresSeparateRegime:
    first.reportingPopulationExpansion.separateRegimeRequired,
}, null, 2));
console.log("PASS: €STR Rate Calibration Study V1 deterministic invariants");
