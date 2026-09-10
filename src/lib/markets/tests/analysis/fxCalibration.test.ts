import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  ECB_FX_FAMILY_PRODUCTS_V1,
  runEcbFxFamilyCalibrationStudyV1,
} from "./ecbFxFamilyCalibration.study";
import {
  FX_CALIBRATION_METHODOLOGY_VERSION_V1,
  FX_MINIMUM_SPLIT_OBSERVATIONS_V1,
  FX_TECHNICAL_WARMUP_V1,
} from "./fxCalibration";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const first = runEcbFxFamilyCalibrationStudyV1();
const second = runEcbFxFamilyCalibrationStudyV1();
const expectedEvidence = Object.freeze({
  eurjpy: Object.freeze({
    signal: Object.freeze([0.8, -0.8, 0.3, 0.0002, 0.0035, 1.2, 3.2, 0.6, 0.85]),
    risk: Object.freeze([0.2, 0.25, 0.5, 12.5, 18.5, 41, 61, 2.1, 4.1, 0.4325, 2.2, 4.4, 5.1, 9.5]),
    regime: Object.freeze([7.645678, 13.314382]),
    acceptance: "FAIL",
    signalVerdict: "PASS",
    riskVerdict: "FAIL",
    riskFailures: Object.freeze(["matched-regime.HIGH-DISPERSION"]),
  }),
  eurgbp: Object.freeze({
    signal: Object.freeze([0.8, -0.8, 0.3, 0.0001, 0.0001, 0.8, 2.1, 0.6, 0.85]),
    risk: Object.freeze([0.2, 0.25, 0.5, 8.5, 12, 40, 60, 1.5, 2.7, 0.0015, 1.5, 2.9, 3.1, 6.1]),
    regime: Object.freeze([5.222135, 8.920078]),
    acceptance: "FAIL",
    signalVerdict: "PASS",
    riskVerdict: "FAIL",
    riskFailures: Object.freeze(["matched-regime.NORMAL-DISPERSION"]),
  }),
  eurchf: Object.freeze({
    signal: Object.freeze([0.75, -0.8, 0.3, 0.0001, 0.0001, 0.4, 1.2, 0.55, 0.85]),
    risk: Object.freeze([0.2, 0.25, 0.45, 5, 10, 40, 59, 0.8, 1.8, 0.002, 0.8, 2, 1.8, 4.4]),
    regime: Object.freeze([2.572445, 5.424139]),
    acceptance: "FAIL",
    signalVerdict: "PASS",
    riskVerdict: "FAIL",
    riskFailures: Object.freeze(["matched-regime.HIGH-DISPERSION"]),
  }),
} as const);

assert(JSON.stringify(first) === JSON.stringify(second),
  "family study must be byte-for-byte deterministic");
assert(first.acquisition.requestedSeries.length === 3,
  "exactly three family series acquired");
assert(first.acquisition.eurusdReacquired === false, "EUR/USD not reacquired");
assert(first.acquisition.repeatedNetworkAcquisition === false,
  "study reruns use fixtures only");
assert(first.acquisition.rawArtifactSha256 ===
  "9db65db9bf2ec7701985b6a35452b1ed99d203b9d876447c1e7e506670bf8379",
"raw acquisition hash frozen");

for (const [index, study] of first.studies.entries()) {
  const expected = ECB_FX_FAMILY_PRODUCTS_V1[index]!;
  assert(study.methodologyVersion === FX_CALIBRATION_METHODOLOGY_VERSION_V1,
    `${study.productId} methodology version`);
  assert(study.productId === expected.productId, `${study.productId} product order`);
  assert(study.source.seriesId === expected.seriesId, `${study.productId} series ID`);
  assert(study.source.seriesKey === expected.seriesKey, `${study.productId} series key`);
  assert(study.source.quotation === expected.quotation, `${study.productId} quotation`);
  assert(study.source.unit === expected.unit, `${study.productId} unit`);
  assert(study.source.inverted === false, `${study.productId} not inverted`);
  assert(study.source.fixtureSha256 === expected.fixtureSha256,
    `${study.productId} fixture hash`);
  assert(study.source.rawObservationCount === 7_152,
    `${study.productId} raw observation count`);
  assert(study.source.explicitMissingValueRows === 62,
    `${study.productId} explicit blank count`);
  assert(study.source.normalizedObservationCount === 7_090,
    `${study.productId} normalized count`);
  assert(study.source.firstObservationDate === "1999-01-04",
    `${study.productId} first observation`);
  assert(study.source.lastObservationDate === "2026-09-10",
    `${study.productId} last observation`);
  assert(study.technicalWindows.warmup === FX_TECHNICAL_WARMUP_V1 &&
    study.technicalWindows.finiteAfterWarmup,
  `${study.productId} finite after warm-up`);
  assert(study.split.calibrationUsableCount >= FX_MINIMUM_SPLIT_OBSERVATIONS_V1 &&
    study.split.validationUsableCount >= FX_MINIMUM_SPLIT_OBSERVATIONS_V1,
  `${study.productId} adequate chronological split`);
  assert(study.split.shuffled === false &&
    study.split.rollingIndicatorContinuityPreserved,
  `${study.productId} causal split`);
  assert(study.frozenCandidate.derivedFrom === "calibration-only",
    `${study.productId} frozen calibration provenance`);
  assert(study.signalValidation.deterministic,
    `${study.productId} Signal deterministic`);
  assert(study.riskValidation.inputValid,
    `${study.productId} Risk validation input valid`);
  assert(study.riskValidation.regimeThresholds.derivedFrom === "calibration-only",
    `${study.productId} Risk regime boundaries are causal`);
  const candidate = study.frozenCandidate;
  const evidence = {
    signal: [
      candidate.signal.bullishThreshold,
      candidate.signal.bearishThreshold,
      candidate.signal.neutralThreshold,
      candidate.signal.calibration!.ema.toleranceRatio,
      candidate.signal.calibration!.macd.epsilon,
      candidate.signal.calibration!.roc.directionalThreshold,
      candidate.signal.calibration!.roc.strongThreshold,
      candidate.signal.calibration!.strength.moderateThreshold,
      candidate.signal.calibration!.strength.strongThreshold,
    ],
    risk: [
      candidate.risk.low,
      candidate.risk.moderate,
      candidate.risk.high,
      candidate.risk.calibration!.volatility.moderateThreshold,
      candidate.risk.calibration!.volatility.highThreshold,
      candidate.risk.calibration!.rsi.stretchedLow,
      candidate.risk.calibration!.rsi.stretchedHigh,
      candidate.risk.calibration!.roc.moderateThreshold,
      candidate.risk.calibration!.roc.highThreshold,
      candidate.risk.calibration!.macd.highThreshold,
      candidate.risk.calibration!.emaMedium.moderateThreshold,
      candidate.risk.calibration!.emaMedium.highThreshold,
      candidate.risk.calibration!.emaSlow.moderateThreshold,
      candidate.risk.calibration!.emaSlow.highThreshold,
    ],
    regime: [
      study.riskValidation.regimeThresholds.lowNormalBoundary,
      study.riskValidation.regimeThresholds.normalHighBoundary,
    ],
    acceptance: study.acceptance.verdict,
    signalVerdict: study.signalValidation.verdict,
    riskVerdict: study.riskValidation.verdict,
    riskFailures: study.riskValidation.failures,
  };
  assert(JSON.stringify(evidence) ===
    JSON.stringify(expectedEvidence[study.productId]),
  `${study.productId} frozen empirical evidence`);
  assert(study.publicationGapAudit.filledObservations === 0 &&
    !study.publicationGapAudit.interpolation &&
    !study.publicationGapAudit.forwardFill &&
    !study.publicationGapAudit.syntheticDates,
  `${study.productId} publication gaps preserved`);
  assert(study.publicationGapAudit.noClassificationArtifact,
    `${study.productId} no post-gap classification artifact`);
  assert(study.deterministic, `${study.productId} deterministic result`);
  assert(["PASS", "PASS WITH LIMITED EVIDENCE", "FAIL"].includes(
    study.acceptance.verdict), `${study.productId} explicit acceptance verdict`);
}

const analysisDirectory = fileURLToPath(new URL("./", import.meta.url));
const source = ["fxCalibration.ts", "ecbFxFamilyCalibration.study.ts"]
  .map((file) => readFileSync(`${analysisDirectory}${file}`, "utf8"))
  .join("\n").toLowerCase();
assert(!source.includes("fetch("), "study performs no network calls");
assert(!source.includes("yahoo"), "study has no Yahoo dependency");
assert(!source.includes("synthetic ohlc"), "study creates no synthetic OHLC");
assert(first.familyAnalysis.productionChangesAuthorized === false,
  "analysis does not authorize production changes");

console.log("PASS: ECB FX Family Calibration Study V1 deterministic invariants");
