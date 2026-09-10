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

function block(
  label: string,
  meanAnnualizedVolatility: number,
  meanRiskScore: number,
  upperRiskQuantile: number,
  bandShares: RiskBandSharesV2,
  loweredCutPointsBandShares: RiskBandSharesV2,
  raisedCutPointsBandShares: RiskBandSharesV2,
  sufficientEvidence = true,
  sampleSize = 300,
): RiskHistoricalBlockSummaryV2 {
  return {
    label,
    sampleSize,
    meanAnnualizedVolatility,
    meanRiskScore,
    upperRiskQuantile,
    bandShares,
    sufficientEvidence,
    thresholdSensitivity: {
      loweredCutPointsBandShares,
      raisedCutPointsBandShares,
    },
  };
}

function soundHistoricalBlocks(): readonly RiskHistoricalBlockSummaryV2[] {
  return [
    block(
      "calm",
      5,
      0.25,
      0.42,
      { low: 0.6, moderate: 0.3, high: 0.1 },
      { low: 0.5, moderate: 0.32, high: 0.18 },
      { low: 0.7, moderate: 0.25, high: 0.05 },
    ),
    block(
      "normal",
      10,
      0.45,
      0.65,
      { low: 0.3, moderate: 0.45, high: 0.25 },
      { low: 0.22, moderate: 0.43, high: 0.35 },
      { low: 0.4, moderate: 0.45, high: 0.15 },
    ),
    block(
      "stressed",
      20,
      0.65,
      0.85,
      { low: 0.1, moderate: 0.35, high: 0.55 },
      { low: 0.05, moderate: 0.25, high: 0.7 },
      { low: 0.15, moderate: 0.45, high: 0.4 },
    ),
  ];
}

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

const calibration = rangeSample("calibration");
const validation = rangeSample("validation");
const historicalBlocks = soundHistoricalBlocks();
const baseline = validateRiskCalibrationV2({ calibration, validation, historicalBlocks });

assert(baseline.inputValid, "baseline input should be valid");
assert(baseline.methodologyVersion === "risk-calibration-validation-v2", "V2 methodology version");
assert(baseline.verdict === "PASS", `semantic example should pass, received ${baseline.verdict}`);
assert(baseline.regimeThresholds.derivedFrom === "calibration-only", "threshold provenance");
assert(baseline.regimeThresholds.lowNormalBoundary === 100.75, "calibration lower quartile");
assert(baseline.regimeThresholds.normalHighBoundary === 300.25, "calibration upper quartile");
assert(baseline.componentMonotonicity.passed, "monotonic component severity should pass");
assert(baseline.historicalRobustness.verdict === "PASS", "ordered historical blocks should pass");
assert(baseline.thresholdSensitivity.verdict === "PASS", "stable threshold sensitivity should pass");
assert(baseline.thresholdSensitivity.cutPointNeighborhood === 0.025, "fixed sensitivity neighborhood");

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
assert(
  JSON.stringify(validationShiftResult.regimeThresholds) === JSON.stringify(baseline.regimeThresholds),
  "validation data must not alter frozen regime metadata",
);

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
const componentResult = validateRiskCalibrationV2({
  calibration,
  validation: componentViolation,
  historicalBlocks,
});
assert(componentResult.inputValid && componentResult.verdict === "FAIL",
  "component severity reversal should fail");
assert(componentResult.failures.includes("component-severity-monotonicity"),
  "component failure reason");

const inverted = rangeSample("inverted", "inverted");
const invertedResult = validateRiskCalibrationV2({
  calibration: inverted,
  validation: inverted,
  historicalBlocks,
});
assert(invertedResult.inputValid && invertedResult.verdict === "FAIL",
  "aggregate Risk ordering reversal should fail");
assert(invertedResult.failures.some((failure) => failure.startsWith("monotonic-risk-response")),
  "aggregate ordering failure reason");

const reversedBlocks = historicalBlocks.map((item, index) => ({
  ...item,
  meanRiskScore: [0.7, 0.45, 0.2][index]!,
}));
const reversedBlockResult = validateRiskCalibrationV2({
  calibration,
  validation,
  historicalBlocks: reversedBlocks,
});
assert(reversedBlockResult.inputValid && reversedBlockResult.verdict === "FAIL",
  "materially reversed historical block ordering should fail");
assert(reversedBlockResult.failures.includes("historical-robustness"),
  "historical ordering failure reason");

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
assert(distributionShiftResult.inputValid, "distribution-shift input should be valid");
assert(distributionShiftResult.verdict === "PASS",
  "distribution drift alone must not fail semantic acceptance");
assert(distributionShiftResult.matchedRegimes["LOW-DISPERSION"].verdict === "FAIL",
  "large same-volatility-bucket drift should remain visible");
assert(distributionShiftResult.matchedRegimes["LOW-DISPERSION"].acceptanceCritical === false,
  "matched distribution drift must be diagnostic only");
assert(Math.max(...Object.values(
  distributionShiftResult.matchedRegimes["LOW-DISPERSION"].bandShareDrift!,
)) > 0.2, "fixture should demonstrate large diagnostic band drift");

const sparseBlocks = [
  historicalBlocks[0]!,
  historicalBlocks[1]!,
  { ...historicalBlocks[2]!, sufficientEvidence: false, sampleSize: 50 },
];
const sparseResult = validateRiskCalibrationV2({
  calibration,
  validation,
  historicalBlocks: sparseBlocks,
});
assert(sparseResult.inputValid && sparseResult.verdict === "PASS_WITH_LIMITED_EVIDENCE",
  "sparse block evidence should return limited evidence");
assert(sparseResult.historicalRobustness.verdict === "INSUFFICIENT_EVIDENCE",
  "sparse historical robustness evidence");

const nonFinite = [...validation];
nonFinite[10] = { ...nonFinite[10]!, riskScore: Number.NaN };
const nonFiniteResult = validateRiskCalibrationV2({ calibration, validation: nonFinite, historicalBlocks });
assert(!nonFiniteResult.inputValid && nonFiniteResult.verdict === "FAIL",
  "non-finite Risk score should fail");

const collapsed = validation.map((item) => ({ ...item, riskScore: 0.5, riskBand: "moderate" as const }));
const collapseResult = validateRiskCalibrationV2({ calibration: collapsed, validation: collapsed, historicalBlocks });
assert(collapseResult.inputValid && collapseResult.verdict === "FAIL",
  "pathological band collapse should fail");
assert(collapseResult.failures.some((failure) => failure.startsWith("non-degeneracy")),
  "collapse failure reason");

const reversedSensitivityBlocks = historicalBlocks.map((item, index) => ({
  ...item,
  thresholdSensitivity: {
    ...item.thresholdSensitivity,
    raisedCutPointsBandShares: [
      { low: 0.1, moderate: 0.2, high: 0.7 },
      { low: 0.3, moderate: 0.3, high: 0.4 },
      { low: 0.6, moderate: 0.3, high: 0.1 },
    ][index]!,
  },
}));
const reversedSensitivityResult = validateRiskCalibrationV2({
  calibration,
  validation,
  historicalBlocks: reversedSensitivityBlocks,
});
assert(reversedSensitivityResult.inputValid && reversedSensitivityResult.verdict === "FAIL",
  "threshold sensitivity ordering reversal should fail");
assert(reversedSensitivityResult.failures.includes("threshold-sensitivity"),
  "threshold reversal failure reason");

const collapsedSensitivityBlocks = historicalBlocks.map((item, index) => index === 1
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
  "threshold sensitivity collapse should fail");
assert(collapsedSensitivityResult.failures.includes("threshold-sensitivity"),
  "threshold collapse failure reason");

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
assert(boundaryResult.matchedRegimes["LOW-DISPERSION"].meanDifference === 0.1,
  "exact mean boundary should be normalized to 0.1");
assert(boundaryResult.matchedRegimes["LOW-DISPERSION"].medianDifference === 0.1,
  "exact median boundary should be normalized to 0.1");
assert(boundaryResult.matchedRegimes["LOW-DISPERSION"].verdict === "PASS",
  "binary floating-point noise at an exact tolerance must not fail");

const repeat = validateRiskCalibrationV2({ calibration, validation, historicalBlocks });
assert(JSON.stringify(repeat) === JSON.stringify(baseline),
  "repeated run should be byte-for-byte deterministic");

console.log("PASS: Risk calibration validation V2 methodology (15 deterministic cases)");
