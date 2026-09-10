import {
  assignRiskRegimeV2,
  validateRiskCalibrationV2,
  type RiskBandSharesV2,
  type RiskBandV2,
  type RiskCalibrationObservationV2,
  type RiskHistoricalBlockSummaryV2,
} from "./riskCalibrationValidation";

type ScoreMode = "monotonic" | "inverted";

function riskBand(score: number): RiskBandV2 {
  return score >= 0.67 ? "high" : score >= 0.34 ? "moderate" : "low";
}

function observation(
  id: string,
  annualizedVolatility: number,
  sequence: number,
  mode: ScoreMode = "monotonic",
): RiskCalibrationObservationV2 {
  const regimeBase = annualizedVolatility <= 100
    ? 0.25 : annualizedVolatility <= 300 ? 0.5 : 0.75;
  const base = mode === "monotonic" ? regimeBase : 1 - regimeBase;
  const score = Math.max(
    0,
    Math.min(1, base + [-0.25, -0.125, 0, 0.125, 0.25][sequence % 5]!),
  );
  const magnitude = (sequence % 9) / 3;
  const severity = magnitude >= 2 ? "high" : magnitude >= 1 ? "moderate" : "low";
  return {
    id,
    riskScore: score,
    riskBand: riskBand(score),
    annualizedVolatility,
    components: {
      volatility: { magnitude, severity },
      momentum: { magnitude: magnitude + 0.01, severity },
    },
    subperiod: sequence < 200 ? "early" : "late",
  };
}

function rangeSample(prefix: string, mode: ScoreMode = "monotonic") {
  return Array.from(
    { length: 400 },
    (_, index) => observation(`${prefix}-${index}`, index + 1, index, mode),
  );
}

function bandShares(high: number): RiskBandSharesV2 {
  const low = Number(((1 - high) * 0.55).toFixed(6));
  return {
    low,
    moderate: Number((1 - low - high).toFixed(6)),
    high,
  };
}

function block(
  label: string,
  meanAnnualizedVolatility: number,
  meanRiskScore: number,
  upperRiskQuantile: number,
  highBandShare: number,
  sufficientEvidence = true,
  sampleSize = 300,
): RiskHistoricalBlockSummaryV2 {
  return {
    label,
    sampleSize,
    meanAnnualizedVolatility,
    meanRiskScore,
    upperRiskQuantile,
    bandShares: bandShares(highBandShare),
    sufficientEvidence,
    thresholdSensitivity: {
      loweredCutPointsBandShares: bandShares(Math.min(0.9, highBandShare + 0.08)),
      raisedCutPointsBandShares: bandShares(Math.max(0.01, highBandShare - 0.04)),
    },
  };
}

function orderedHistoricalBlocks(): readonly RiskHistoricalBlockSummaryV2[] {
  const volatility = [5, 6, 8, 10, 12, 14, 18, 22];
  const meanRisk = [0.2, 0.26, 0.32, 0.38, 0.45, 0.5, 0.6, 0.68];
  const upperRisk = [0.35, 0.42, 0.5, 0.58, 0.65, 0.72, 0.82, 0.9];
  const highShare = [0.05, 0.08, 0.12, 0.18, 0.25, 0.32, 0.48, 0.62];
  return volatility.map((value, index) => block(
    `block-${index + 1}`,
    value,
    meanRisk[index]!,
    upperRisk[index]!,
    highShare[index]!,
  ));
}

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

const calibration = rangeSample("calibration");
const validation = rangeSample("validation");
const historicalBlocks = orderedHistoricalBlocks();
const baseline = validateRiskCalibrationV2({ calibration, validation, historicalBlocks });

assert(baseline.inputValid, "baseline input should be valid");
assert(baseline.methodologyVersion === "risk-calibration-validation-v2", "V2 methodology version");
assert(baseline.verdict === "PASS", `ordered endpoint example should pass, received ${baseline.verdict}`);
assert(baseline.regimeThresholds.derivedFrom === "calibration-only", "threshold provenance");
assert(baseline.regimeThresholds.lowNormalBoundary === 100.75, "calibration lower quartile");
assert(baseline.regimeThresholds.normalHighBoundary === 300.25, "calibration upper quartile");
assert(baseline.componentMonotonicity.passed, "monotonic component severity should pass");
assert(baseline.historicalRobustness.verdict === "PASS", "ordered historical blocks should pass");
assert(baseline.thresholdSensitivity.verdict === "PASS", "stable threshold sensitivity should pass");
assert(baseline.thresholdSensitivity.cutPointNeighborhood === 0.025, "fixed sensitivity neighborhood");
assert(baseline.thresholdSensitivity.endpointHighBandShares.loweredCutPoints!.high >=
  baseline.thresholdSensitivity.endpointHighBandShares.loweredCutPoints!.low,
"lowered-cut endpoint high-band ordering should pass");
assert(baseline.thresholdSensitivity.endpointHighBandShares.raisedCutPoints!.high >=
  baseline.thresholdSensitivity.endpointHighBandShares.raisedCutPoints!.low,
"raised-cut endpoint high-band ordering should pass");
assert(baseline.historicalRobustness.tierConstruction.endpointTierSize === 2,
  "eight blocks use floor(8 / 3) endpoint tiers");
assert(baseline.historicalRobustness.tierConstruction.middleBlocks.length === 4,
  "non-divisible remainder stays in the middle tier");

const localReversalBlocks = historicalBlocks.map((item, index) => {
  if (index < 2 || index > 5) return item;
  const meanRiskScore = [0.56, 0.3, 0.58, 0.35][index - 2]!;
  const upperRiskQuantile = [0.72, 0.48, 0.75, 0.52][index - 2]!;
  const highBandShare = [0.4, 0.15, 0.43, 0.18][index - 2]!;
  return {
    ...item,
    meanRiskScore,
    upperRiskQuantile,
    bandShares: bandShares(highBandShare),
    thresholdSensitivity: {
      loweredCutPointsBandShares: bandShares(highBandShare + 0.08),
      raisedCutPointsBandShares: bandShares(highBandShare - 0.04),
    },
  };
});
const localReversalResult = validateRiskCalibrationV2({
  calibration,
  validation,
  historicalBlocks: localReversalBlocks,
});
assert(localReversalResult.inputValid && localReversalResult.verdict === "PASS",
  "local and middle-block reversals should pass when endpoint tendency is sound");
assert(localReversalResult.historicalRobustness.localReversalDiagnostics.length > 0,
  "local reversals should remain visible diagnostically");
assert(localReversalResult.historicalRobustness.tierConstruction.middleBlocks.length === 4,
  "middle blocks remain reported and non-acceptance-critical");

const meanReversalBlocks = historicalBlocks.map((item, index) => index >= 6
  ? { ...item, meanRiskScore: index === 6 ? 0.1 : 0.12 }
  : item);
const meanReversalResult = validateRiskCalibrationV2({
  calibration,
  validation,
  historicalBlocks: meanReversalBlocks,
});
assert(meanReversalResult.inputValid && meanReversalResult.verdict === "FAIL",
  "endpoint mean Risk reversal should fail");
assert(meanReversalResult.historicalRobustness.failures.some((failure) =>
  failure.includes("mean Risk score")), "endpoint mean failure reason");

const upperReversalBlocks = historicalBlocks.map((item, index) => index >= 6
  ? { ...item, upperRiskQuantile: index === 6 ? 0.2 : 0.25 }
  : item);
const upperReversalResult = validateRiskCalibrationV2({
  calibration,
  validation,
  historicalBlocks: upperReversalBlocks,
});
assert(upperReversalResult.inputValid && upperReversalResult.verdict === "FAIL",
  "endpoint upper-quantile reversal should fail");
assert(upperReversalResult.historicalRobustness.failures.some((failure) =>
  failure.includes("upper Risk quantile")), "endpoint upper-quantile failure reason");

const highBandReversalBlocks = historicalBlocks.map((item, index) => {
  const highBandShare = index < 2 ? 0.55 : index >= 6 ? 0.08 : item.bandShares.high;
  return index < 2 || index >= 6 ? { ...item, bandShares: bandShares(highBandShare) } : item;
});
const highBandReversalResult = validateRiskCalibrationV2({
  calibration,
  validation,
  historicalBlocks: highBandReversalBlocks,
});
assert(highBandReversalResult.inputValid && highBandReversalResult.verdict === "FAIL",
  "endpoint high-band reversal should fail");
assert(highBandReversalResult.historicalRobustness.failures.some((failure) =>
  failure.includes("high-band share")), "endpoint high-band failure reason");

const sensitivityReversalBlocks = historicalBlocks.map((item, index) => {
  const raisedHighShare = index < 2 ? 0.6 : index >= 6 ? 0.1
    : item.thresholdSensitivity.raisedCutPointsBandShares.high;
  return {
    ...item,
    thresholdSensitivity: {
      ...item.thresholdSensitivity,
      raisedCutPointsBandShares: bandShares(raisedHighShare),
    },
  };
});
const sensitivityReversalResult = validateRiskCalibrationV2({
  calibration,
  validation,
  historicalBlocks: sensitivityReversalBlocks,
});
assert(sensitivityReversalResult.inputValid && sensitivityReversalResult.verdict === "FAIL",
  "genuine endpoint threshold-sensitivity reversal should fail");
assert(sensitivityReversalResult.failures.includes("threshold-sensitivity"),
  "threshold endpoint reversal failure reason");

const collapsedSensitivityBlocks = historicalBlocks.map((item, index) => index === 3
  ? {
      ...item,
      thresholdSensitivity: {
        ...item.thresholdSensitivity,
        loweredCutPointsBandShares: { low: 0.005, moderate: 0.005, high: 0.99 },
      },
    }
  : item);
const collapsedSensitivityResult = validateRiskCalibrationV2({
  calibration,
  validation,
  historicalBlocks: collapsedSensitivityBlocks,
});
assert(collapsedSensitivityResult.inputValid && collapsedSensitivityResult.verdict === "FAIL",
  "threshold-sensitivity collapse should fail even in a middle block");
assert(collapsedSensitivityResult.failures.includes("threshold-sensitivity"),
  "threshold collapse failure reason");

const sparseResult = validateRiskCalibrationV2({
  calibration,
  validation,
  historicalBlocks: historicalBlocks.slice(0, 5),
});
assert(sparseResult.inputValid && sparseResult.verdict === "PASS_WITH_LIMITED_EVIDENCE",
  "fewer than two blocks per endpoint tier should return limited evidence");
assert(sparseResult.historicalRobustness.tierConstruction.endpointTierSize === 1,
  "five-block floor-third construction should be deterministic");

const shuffledBlocks = [
  historicalBlocks[5]!, historicalBlocks[1]!, historicalBlocks[7]!, historicalBlocks[3]!,
  historicalBlocks[0]!, historicalBlocks[6]!, historicalBlocks[2]!, historicalBlocks[4]!,
];
const shuffledResult = validateRiskCalibrationV2({ calibration, validation, historicalBlocks: shuffledBlocks });
assert(shuffledResult.inputValid, "shuffled block input should be valid");
assert(JSON.stringify(shuffledResult.historicalRobustness.tierConstruction) ===
  JSON.stringify(baseline.historicalRobustness.tierConstruction),
"endpoint grouping should be deterministic regardless of caller order");

const changedRiskBlocks = historicalBlocks.map((item, index) => ({
  ...item,
  meanRiskScore: index % 2 === 0 ? 0.8 : 0.2,
  upperRiskQuantile: index % 2 === 0 ? 0.9 : 0.3,
  bandShares: bandShares(index % 2 === 0 ? 0.7 : 0.1),
}));
const changedRiskResult = validateRiskCalibrationV2({
  calibration,
  validation,
  historicalBlocks: changedRiskBlocks,
});
assert(changedRiskResult.inputValid, "changed Risk block input should be valid");
assert(JSON.stringify(changedRiskResult.historicalRobustness.tierConstruction) ===
  JSON.stringify(baseline.historicalRobustness.tierConstruction),
"Risk outputs must not change volatility-defined endpoint membership");

const shiftedValidation = validation.map((item) => ({
  ...item,
  annualizedVolatility: item.annualizedVolatility * 10,
}));
const validationShiftResult = validateRiskCalibrationV2({
  calibration,
  validation: shiftedValidation,
  historicalBlocks,
});
assert(validationShiftResult.inputValid, "shifted validation input should be valid");
assert(JSON.stringify(validationShiftResult.regimeThresholds) === JSON.stringify(baseline.regimeThresholds),
  "validation data must not alter frozen regime metadata");

const thresholds = baseline.regimeThresholds;
assert(assignRiskRegimeV2(thresholds.lowNormalBoundary, thresholds) === "LOW-DISPERSION",
  "lower boundary assignment");
assert(assignRiskRegimeV2(thresholds.lowNormalBoundary + 0.000001, thresholds) === "NORMAL-DISPERSION",
  "normal assignment");
assert(assignRiskRegimeV2(thresholds.normalHighBoundary, thresholds) === "HIGH-DISPERSION",
  "upper boundary assignment");

const componentViolation = [...validation];
const componentTarget = componentViolation.findIndex((item) =>
  item.components.volatility.magnitude >= 2);
assert(componentTarget >= 0, "component violation fixture target");
componentViolation[componentTarget] = {
  ...componentViolation[componentTarget]!,
  components: {
    ...componentViolation[componentTarget]!.components,
    volatility: {
      ...componentViolation[componentTarget]!.components.volatility,
      severity: "low",
    },
  },
};
const componentResult = validateRiskCalibrationV2({ calibration, validation: componentViolation, historicalBlocks });
assert(componentResult.inputValid && componentResult.verdict === "FAIL",
  "component severity reversal should fail");
assert(componentResult.failures.includes("component-severity-monotonicity"),
  "component failure reason");

const inverted = rangeSample("inverted", "inverted");
const invertedResult = validateRiskCalibrationV2({ calibration: inverted, validation: inverted, historicalBlocks });
assert(invertedResult.inputValid && invertedResult.verdict === "FAIL",
  "aggregate Risk ordering reversal should fail");

const distributionShiftedValidation = validation.map((item) => {
  if (item.annualizedVolatility > 100) return item;
  const riskScore = Math.min(1, item.riskScore + 0.25);
  return { ...item, riskScore, riskBand: riskBand(riskScore) };
});
const distributionShiftResult = validateRiskCalibrationV2({
  calibration,
  validation: distributionShiftedValidation,
  historicalBlocks,
});
assert(distributionShiftResult.inputValid && distributionShiftResult.verdict === "PASS",
  "matched-distribution drift alone must not fail semantic acceptance");
assert(distributionShiftResult.matchedRegimes["LOW-DISPERSION"].verdict === "FAIL" &&
  distributionShiftResult.matchedRegimes["LOW-DISPERSION"].acceptanceCritical === false,
"large matched drift should remain diagnostic only");

const nonFinite = [...validation];
nonFinite[10] = { ...nonFinite[10]!, riskScore: Number.NaN };
const nonFiniteResult = validateRiskCalibrationV2({ calibration, validation: nonFinite, historicalBlocks });
assert(!nonFiniteResult.inputValid && nonFiniteResult.verdict === "FAIL",
  "non-finite Risk score should fail");

const collapsed = validation.map((item) => ({
  ...item,
  riskScore: 0.5,
  riskBand: "moderate" as const,
}));
const collapseResult = validateRiskCalibrationV2({ calibration: collapsed, validation: collapsed, historicalBlocks });
assert(collapseResult.inputValid && collapseResult.verdict === "FAIL",
  "pathological final-band collapse should fail");
assert(collapseResult.failures.some((failure) => failure.startsWith("non-degeneracy")),
  "collapse failure reason");

const boundaryCalibration = calibration.map((item, index) => {
  if (item.annualizedVolatility > 100) return item;
  const riskScore = index % 2 === 0 ? 0.2 : 0.68;
  return { ...item, riskScore, riskBand: riskBand(riskScore) };
});
const boundaryValidation = validation.map((item, index) => {
  if (item.annualizedVolatility > 100) return item;
  const riskScore = index % 2 === 0 ? 0.3 : 0.78;
  return { ...item, riskScore, riskBand: riskBand(riskScore) };
});
const boundaryResult = validateRiskCalibrationV2({
  calibration: boundaryCalibration,
  validation: boundaryValidation,
  historicalBlocks,
});
assert(boundaryResult.inputValid, "exact-boundary input should be valid");
assert(boundaryResult.matchedRegimes["LOW-DISPERSION"].meanDifference === 0.1 &&
  boundaryResult.matchedRegimes["LOW-DISPERSION"].medianDifference === 0.1,
"exact floating-point boundaries should normalize to 0.1");
assert(boundaryResult.matchedRegimes["LOW-DISPERSION"].verdict === "PASS",
  "binary floating-point noise at an exact tolerance must pass");

const repeat = validateRiskCalibrationV2({ calibration, validation, historicalBlocks });
assert(JSON.stringify(repeat) === JSON.stringify(baseline),
  "repeated run should be byte-for-byte deterministic");

console.log("PASS: Risk calibration validation V2 endpoint-tier methodology (18 deterministic cases)");
