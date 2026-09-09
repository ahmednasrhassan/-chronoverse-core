import {
  assignRiskRegimeV1,
  validateRiskCalibrationV1,
  type RiskBandV1,
  type RiskCalibrationObservationV1,
} from "./riskCalibrationValidation";

type ScoreMode = "monotonic" | "inverted";

function riskBand(score: number): RiskBandV1 {
  return score >= 0.67 ? "high" : score >= 0.34 ? "moderate" : "low";
}

function observation(
  id: string,
  annualizedVolatility: number,
  sequence: number,
  mode: ScoreMode = "monotonic",
): RiskCalibrationObservationV1 {
  const regimeBase = annualizedVolatility <= 100 ? 0.25 : annualizedVolatility <= 300 ? 0.5 : 0.75;
  const base = mode === "monotonic" ? regimeBase : 1 - regimeBase;
  const score = Math.max(0, Math.min(1, base + [-0.25, -0.125, 0, 0.125, 0.25][sequence % 5]!));
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
  return Array.from({ length: 400 }, (_, index) => observation(`${prefix}-${index}`, index + 1, index, mode));
}

function groupedSample(prefix: string, counts: readonly [number, number, number]) {
  const result: RiskCalibrationObservationV1[] = [];
  let sequence = 0;
  const append = (count: number, start: number, width: number) => {
    for (let index = 0; index < count; index += 1) {
      result.push(observation(`${prefix}-${sequence}`, start + (index % width), index));
      sequence += 1;
    }
  };
  append(counts[0], 1, 100);
  append(counts[1], 101, 200);
  append(counts[2], 301, 100);
  return result;
}

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

const calibration = rangeSample("calibration");
const validation = rangeSample("validation");
const baseline = validateRiskCalibrationV1({ calibration, validation });
assert(baseline.inputValid, "baseline input should be valid");
assert(baseline.verdict === "PASS", `monotonic example should pass, received ${baseline.verdict}`);
assert(baseline.regimeThresholds.derivedFrom === "calibration-only", "threshold provenance");
assert(baseline.regimeThresholds.lowNormalBoundary === 100.75, "calibration lower quartile");
assert(baseline.regimeThresholds.normalHighBoundary === 300.25, "calibration upper quartile");

const shiftedValidation = validation.map((item) => ({ ...item, annualizedVolatility: item.annualizedVolatility * 10 }));
const validationShiftResult = validateRiskCalibrationV1({ calibration, validation: shiftedValidation });
assert(validationShiftResult.inputValid, "shifted validation input should be valid");
assert(JSON.stringify(validationShiftResult.regimeThresholds) === JSON.stringify(baseline.regimeThresholds),
  "validation data must not alter regime boundaries");

const thresholds = baseline.regimeThresholds;
assert(assignRiskRegimeV1(thresholds.lowNormalBoundary, thresholds) === "LOW-DISPERSION", "lower boundary assignment");
assert(assignRiskRegimeV1(thresholds.lowNormalBoundary + 0.000001, thresholds) === "NORMAL-DISPERSION",
  "normal assignment");
assert(assignRiskRegimeV1(thresholds.normalHighBoundary, thresholds) === "HIGH-DISPERSION", "upper boundary assignment");

const inverted = rangeSample("inverted", "inverted");
const invertedResult = validateRiskCalibrationV1({ calibration: inverted, validation: inverted });
assert(invertedResult.inputValid && invertedResult.verdict === "FAIL", "inverted Risk ordering should fail");
assert(invertedResult.failures.some((failure) => failure.startsWith("monotonic-risk-response")),
  "inverted ordering failure reason");

const unstableValidation = validation.map((item) => {
  const riskScore = Math.min(1, item.riskScore + 0.3);
  return { ...item, riskScore, riskBand: riskBand(riskScore) };
});
const unstableResult = validateRiskCalibrationV1({ calibration, validation: unstableValidation });
assert(unstableResult.inputValid && unstableResult.verdict === "FAIL", "same-regime severe instability should fail");
assert(unstableResult.failures.some((failure) => failure.startsWith("matched-regime.")),
  "matched-regime failure reason");

const compositionShift = validateRiskCalibrationV1({
  calibration,
  validation: groupedSample("composition", [400, 200, 100]),
});
assert(compositionShift.inputValid && compositionShift.verdict === "PASS",
  "regime-valid composition shift should pass");
assert(Math.max(...Object.values(compositionShift.unconditionalDiagnostics.bandShareDrift)) > 0.1,
  "fixture should demonstrate material unconditional drift");
assert(compositionShift.unconditionalDiagnostics.acceptanceCritical === false,
  "unconditional diagnostics must not be acceptance-critical");

const sparse = validateRiskCalibrationV1({
  calibration,
  validation: groupedSample("sparse", [120, 220, 10]),
});
assert(sparse.inputValid && sparse.verdict === "PASS_WITH_LIMITED_EVIDENCE",
  "sparse regime should return limited evidence");
assert(sparse.matchedRegimes["HIGH-DISPERSION"].verdict === "INSUFFICIENT_EVIDENCE",
  "sparse regime bucket verdict");

const nonFinite = [...validation];
nonFinite[10] = { ...nonFinite[10]!, riskScore: Number.NaN };
const nonFiniteResult = validateRiskCalibrationV1({ calibration, validation: nonFinite });
assert(!nonFiniteResult.inputValid && nonFiniteResult.verdict === "FAIL", "non-finite Risk score should fail");

const componentViolation = [...validation];
const target = componentViolation.findIndex((item) => item.components.volatility.magnitude >= 2);
assert(target >= 0, "component violation fixture target");
componentViolation[target] = {
  ...componentViolation[target]!,
  components: {
    ...componentViolation[target]!.components,
    volatility: { ...componentViolation[target]!.components.volatility, severity: "low" },
  },
};
const componentResult = validateRiskCalibrationV1({ calibration, validation: componentViolation });
assert(componentResult.inputValid && componentResult.verdict === "FAIL", "component monotonicity violation should fail");
assert(componentResult.failures.includes("component-severity-monotonicity"), "component failure reason");

const repeat = validateRiskCalibrationV1({ calibration, validation });
assert(JSON.stringify(repeat) === JSON.stringify(baseline), "repeated run should be byte-for-byte deterministic");

console.log("PASS: Risk calibration validation V1 methodology (11 deterministic cases)");
