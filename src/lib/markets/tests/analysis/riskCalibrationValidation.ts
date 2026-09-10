export type RiskBandV2 = "low" | "moderate" | "high";
export type RiskSeverityV2 = "low" | "moderate" | "high";
export type RiskRegimeBucketV2 = "LOW-DISPERSION" | "NORMAL-DISPERSION" | "HIGH-DISPERSION";
export type RiskValidationVerdictV2 = "PASS" | "PASS_WITH_LIMITED_EVIDENCE" | "FAIL";
export type RiskGateVerdictV2 = "PASS" | "FAIL" | "INSUFFICIENT_EVIDENCE";

// V1 observation names remain aliases so existing analysis studies can adopt
// the V2 verdict semantics without changing their fixture/evaluation contracts.
export type RiskBandV1 = RiskBandV2;
export type RiskSeverityV1 = RiskSeverityV2;
export type RiskRegimeBucketV1 = RiskRegimeBucketV2;
export type RiskValidationVerdictV1 = RiskValidationVerdictV2;
export type RiskBucketVerdictV1 = RiskGateVerdictV2;

export interface RiskComponentObservationV2 {
  readonly magnitude: number;
  readonly severity: RiskSeverityV2;
}

export type RiskComponentObservationV1 = RiskComponentObservationV2;

export interface RiskCalibrationObservationV2 {
  readonly id: string;
  readonly riskScore: number;
  readonly riskBand: RiskBandV2;
  readonly annualizedVolatility: number;
  readonly components: Readonly<Record<string, RiskComponentObservationV2>>;
  readonly subperiod?: string;
}

export type RiskCalibrationObservationV1 = RiskCalibrationObservationV2;

export interface RiskBandSharesV2 {
  readonly low: number;
  readonly moderate: number;
  readonly high: number;
}

export interface RiskHistoricalBlockSummaryV2 {
  readonly label: string;
  readonly sampleSize: number;
  readonly meanAnnualizedVolatility: number;
  readonly meanRiskScore: number;
  readonly upperRiskQuantile: number;
  readonly bandShares: RiskBandSharesV2;
  readonly sufficientEvidence: boolean;
  /**
   * Caller-computed classifications after moving both operative final Risk cut
   * points by the fixed V2 neighborhood. Scores and block membership stay fixed.
   */
  readonly thresholdSensitivity: {
    readonly loweredCutPointsBandShares: RiskBandSharesV2;
    readonly raisedCutPointsBandShares: RiskBandSharesV2;
  };
}

export interface RiskCalibrationValidationInputV2 {
  readonly calibration: readonly RiskCalibrationObservationV2[];
  readonly validation: readonly RiskCalibrationObservationV2[];
  /** Predeclared contiguous blocks; omission is limited evidence, never PASS. */
  readonly historicalBlocks?: readonly RiskHistoricalBlockSummaryV2[];
}

export type RiskCalibrationValidationInputV1 = RiskCalibrationValidationInputV2;

export const RISK_CALIBRATION_VALIDATION_V2_POLICY = Object.freeze({
  lowerQuantile: 0.25,
  upperQuantile: 0.75,
  minimumBucketSize: 100,
  minimumHistoricalBlockCount: 3,
  monotonicScoreTolerance: 0.02,
  monotonicHighBandTolerance: 0.05,
  matchedMeanTolerance: 0.1,
  matchedMedianTolerance: 0.1,
  matchedBandShareTolerance: 0.2,
  matchedThresholdCrossingTolerance: 0.2,
  pathologicalCollapseShare: 0.98,
  thresholdCutPointNeighborhood: 0.025,
  comparisonDecimalPlaces: 6,
} as const);

export const RISK_CALIBRATION_VALIDATION_V1_POLICY =
  RISK_CALIBRATION_VALIDATION_V2_POLICY;

interface RiskBucketSummaryV2 {
  readonly observations: number;
  readonly finiteRiskScores: number;
  readonly meanRiskScore: number | null;
  readonly medianRiskScore: number | null;
  readonly bandShares: RiskBandSharesV2;
  readonly moderateOrHigherShare: number;
  readonly highShare: number;
  readonly subperiodCounts: Readonly<Record<string, number>>;
  readonly componentSeverityShares: Readonly<Record<string, RiskBandSharesV2>>;
}

interface MatchedRegimeDiagnosticV2 {
  readonly verdict: RiskGateVerdictV2;
  readonly acceptanceCritical: false;
  readonly calibrationCount: number;
  readonly validationCount: number;
  readonly meanDifference: number | null;
  readonly medianDifference: number | null;
  readonly bandShareDrift: RiskBandSharesV2 | null;
  readonly moderateOrHigherCrossingDrift: number | null;
  readonly highCrossingDrift: number | null;
  readonly failures: readonly string[];
}

interface MonotonicSampleResultV2 {
  readonly verdict: RiskGateVerdictV2;
  readonly means: Readonly<Record<RiskRegimeBucketV2, number | null>>;
  readonly highBandShares: Readonly<Record<RiskRegimeBucketV2, number>>;
  readonly failures: readonly string[];
}

interface ComponentMonotonicityResultV2 {
  readonly observations: number;
  readonly distinctMagnitudes: number;
  readonly severityShares: RiskBandSharesV2;
  readonly violations: number;
  readonly passed: boolean;
}

interface NonDegeneracyBucketResultV2 {
  readonly verdict: RiskGateVerdictV2;
  readonly dominantBandShare: number;
  readonly activeComponentCount: number;
  readonly failures: readonly string[];
}

interface HistoricalRobustnessResultV2 {
  readonly verdict: RiskGateVerdictV2;
  readonly sufficientBlockCount: number;
  readonly orderedBlocks: readonly string[];
  readonly failures: readonly string[];
}

interface ThresholdSensitivityResultV2 {
  readonly verdict: RiskGateVerdictV2;
  readonly cutPointNeighborhood: 0.025;
  readonly scenarios: readonly ["lowered-cut-points", "raised-cut-points"];
  readonly failures: readonly string[];
}

export type RiskCalibrationValidationResultV2 =
  | {
      readonly methodologyVersion: "risk-calibration-validation-v2";
      readonly applicableScope: "positive-price-reference-series";
      readonly inputValid: false;
      readonly verdict: "FAIL";
      readonly failures: readonly string[];
      readonly regimeThresholds: null;
    }
  | {
      readonly methodologyVersion: "risk-calibration-validation-v2";
      readonly applicableScope: "positive-price-reference-series";
      readonly inputValid: true;
      readonly verdict: RiskValidationVerdictV2;
      readonly failures: readonly string[];
      readonly regimeThresholds: {
        readonly basis: "annualized-volatility";
        readonly lowerQuantile: 0.25;
        readonly upperQuantile: 0.75;
        readonly lowNormalBoundary: number;
        readonly normalHighBoundary: number;
        readonly derivedFrom: "calibration-only";
        readonly acceptanceRole: "diagnostic-and-aggregate-monotonicity-only";
      };
      readonly samples: {
        readonly calibration: Readonly<Record<RiskRegimeBucketV2, RiskBucketSummaryV2>>;
        readonly validation: Readonly<Record<RiskRegimeBucketV2, RiskBucketSummaryV2>>;
      };
      readonly unconditionalDiagnostics: {
        readonly calibrationBandShares: RiskBandSharesV2;
        readonly validationBandShares: RiskBandSharesV2;
        readonly bandShareDrift: RiskBandSharesV2;
        readonly meanRiskScoreDifference: number;
        readonly medianRiskScoreDifference: number;
        readonly wassersteinLikeScoreDistance: number;
        readonly acceptanceCritical: false;
      };
      readonly matchedRegimes: Readonly<Record<RiskRegimeBucketV2, MatchedRegimeDiagnosticV2>>;
      readonly monotonicRiskResponse: {
        readonly calibration: MonotonicSampleResultV2;
        readonly validation: MonotonicSampleResultV2;
        readonly passed: boolean;
      };
      readonly componentMonotonicity: {
        readonly components: Readonly<Record<string, ComponentMonotonicityResultV2>>;
        readonly passed: boolean;
      };
      readonly nonDegeneracy: {
        readonly calibration: Readonly<Record<RiskRegimeBucketV2, NonDegeneracyBucketResultV2>>;
        readonly validation: Readonly<Record<RiskRegimeBucketV2, NonDegeneracyBucketResultV2>>;
        readonly passed: boolean;
      };
      readonly historicalRobustness: HistoricalRobustnessResultV2;
      readonly thresholdSensitivity: ThresholdSensitivityResultV2;
    };

export type RiskCalibrationValidationResultV1 = RiskCalibrationValidationResultV2;

const BUCKETS: readonly RiskRegimeBucketV2[] = Object.freeze([
  "LOW-DISPERSION",
  "NORMAL-DISPERSION",
  "HIGH-DISPERSION",
]);
const BANDS: readonly RiskBandV2[] = Object.freeze(["low", "moderate", "high"]);
const SEVERITY_RANK: Readonly<Record<RiskSeverityV2, number>> = Object.freeze({
  low: 0,
  moderate: 1,
  high: 2,
});

/**
 * Analysis-only semantic Risk calibration validation for positive price and
 * reference-price series. Calibration-frozen volatility buckets are retained
 * for diagnostics and aggregate monotonicity; cross-era distribution equality
 * inside those buckets is deliberately not an acceptance gate.
 */
export function validateRiskCalibrationV2(
  input: RiskCalibrationValidationInputV2,
): RiskCalibrationValidationResultV2 {
  const inputFailures = validateInput(input);
  if (inputFailures.length > 0) {
    return Object.freeze({
      methodologyVersion: "risk-calibration-validation-v2",
      applicableScope: "positive-price-reference-series",
      inputValid: false,
      verdict: "FAIL",
      failures: Object.freeze(inputFailures),
      regimeThresholds: null,
    });
  }

  const calibrationVolatility = input.calibration.map((item) => item.annualizedVolatility);
  const thresholds = Object.freeze({
    basis: "annualized-volatility" as const,
    lowerQuantile: 0.25 as const,
    upperQuantile: 0.75 as const,
    lowNormalBoundary: rounded(quantile(
      calibrationVolatility,
      RISK_CALIBRATION_VALIDATION_V2_POLICY.lowerQuantile,
    )),
    normalHighBoundary: rounded(quantile(
      calibrationVolatility,
      RISK_CALIBRATION_VALIDATION_V2_POLICY.upperQuantile,
    )),
    derivedFrom: "calibration-only" as const,
    acceptanceRole: "diagnostic-and-aggregate-monotonicity-only" as const,
  });

  const calibrationSummaries = summarizeBuckets(bucketObservations(input.calibration, thresholds));
  const validationSummaries = summarizeBuckets(bucketObservations(input.validation, thresholds));
  const matchedRegimes = matchedRegimeDiagnostics(calibrationSummaries, validationSummaries);
  const calibrationMonotonicity = monotonicSampleResult(calibrationSummaries);
  const validationMonotonicity = monotonicSampleResult(validationSummaries);
  const componentMonotonicity = componentMonotonicityResult([
    ...input.calibration,
    ...input.validation,
  ]);
  const calibrationNonDegeneracy = nonDegeneracyResults(calibrationSummaries);
  const validationNonDegeneracy = nonDegeneracyResults(validationSummaries);
  const historicalRobustness = historicalRobustnessResult(input.historicalBlocks ?? []);
  const thresholdSensitivity = thresholdSensitivityResult(input.historicalBlocks ?? []);

  const failures: string[] = [];
  for (const bucket of BUCKETS) {
    if (calibrationNonDegeneracy[bucket].verdict === "FAIL") {
      failures.push(`non-degeneracy.calibration.${bucket}`);
    }
    if (validationNonDegeneracy[bucket].verdict === "FAIL") {
      failures.push(`non-degeneracy.validation.${bucket}`);
    }
  }
  if (calibrationMonotonicity.verdict === "FAIL") failures.push("monotonic-risk-response.calibration");
  if (validationMonotonicity.verdict === "FAIL") failures.push("monotonic-risk-response.validation");
  if (!componentMonotonicity.passed) failures.push("component-severity-monotonicity");
  if (historicalRobustness.verdict === "FAIL") failures.push("historical-robustness");
  if (thresholdSensitivity.verdict === "FAIL") failures.push("threshold-sensitivity");

  const limitedEvidence = BUCKETS.some((bucket) =>
    calibrationNonDegeneracy[bucket].verdict === "INSUFFICIENT_EVIDENCE" ||
    validationNonDegeneracy[bucket].verdict === "INSUFFICIENT_EVIDENCE") ||
    calibrationMonotonicity.verdict === "INSUFFICIENT_EVIDENCE" ||
    validationMonotonicity.verdict === "INSUFFICIENT_EVIDENCE" ||
    historicalRobustness.verdict === "INSUFFICIENT_EVIDENCE" ||
    thresholdSensitivity.verdict === "INSUFFICIENT_EVIDENCE";
  const verdict: RiskValidationVerdictV2 = failures.length > 0
    ? "FAIL"
    : limitedEvidence ? "PASS_WITH_LIMITED_EVIDENCE" : "PASS";

  return Object.freeze({
    methodologyVersion: "risk-calibration-validation-v2",
    applicableScope: "positive-price-reference-series",
    inputValid: true,
    verdict,
    failures: Object.freeze(failures),
    regimeThresholds: thresholds,
    samples: Object.freeze({ calibration: calibrationSummaries, validation: validationSummaries }),
    unconditionalDiagnostics: unconditionalDiagnostics(input.calibration, input.validation),
    matchedRegimes,
    monotonicRiskResponse: Object.freeze({
      calibration: calibrationMonotonicity,
      validation: validationMonotonicity,
      passed: calibrationMonotonicity.verdict !== "FAIL" && validationMonotonicity.verdict !== "FAIL",
    }),
    componentMonotonicity,
    nonDegeneracy: Object.freeze({
      calibration: calibrationNonDegeneracy,
      validation: validationNonDegeneracy,
      passed: BUCKETS.every((bucket) =>
        calibrationNonDegeneracy[bucket].verdict !== "FAIL" &&
        validationNonDegeneracy[bucket].verdict !== "FAIL"),
    }),
    historicalRobustness,
    thresholdSensitivity,
  });
}

// Existing studies keep compiling while resolving to the V2 methodology.
export const validateRiskCalibrationV1 = validateRiskCalibrationV2;

export function assignRiskRegimeV2(
  annualizedVolatility: number,
  thresholds: { readonly lowNormalBoundary: number; readonly normalHighBoundary: number },
): RiskRegimeBucketV2 {
  if (annualizedVolatility <= thresholds.lowNormalBoundary) return "LOW-DISPERSION";
  if (annualizedVolatility >= thresholds.normalHighBoundary) return "HIGH-DISPERSION";
  return "NORMAL-DISPERSION";
}

export const assignRiskRegimeV1 = assignRiskRegimeV2;

function validateInput(input: RiskCalibrationValidationInputV2): string[] {
  const failures: string[] = [];
  if (input.calibration.length === 0) failures.push("calibration sample is empty");
  if (input.validation.length === 0) failures.push("validation sample is empty");
  const expectedComponents = input.calibration[0] === undefined
    ? [] : Object.keys(input.calibration[0].components).sort();
  for (const [sample, observations] of [
    ["calibration", input.calibration],
    ["validation", input.validation],
  ] as const) {
    for (let index = 0; index < observations.length; index += 1) {
      const item = observations[index]!;
      if (!Number.isFinite(item.riskScore) || item.riskScore < 0 || item.riskScore > 1) {
        failures.push(`${sample}[${index}].riskScore`);
      }
      if (!BANDS.includes(item.riskBand)) failures.push(`${sample}[${index}].riskBand`);
      if (!Number.isFinite(item.annualizedVolatility) || item.annualizedVolatility < 0) {
        failures.push(`${sample}[${index}].annualizedVolatility`);
      }
      const componentNames = Object.keys(item.components).sort();
      if (componentNames.join("|") !== expectedComponents.join("|")) failures.push(`${sample}[${index}].components`);
      for (const name of componentNames) {
        const component = item.components[name]!;
        if (!Number.isFinite(component.magnitude) || component.magnitude < 0) {
          failures.push(`${sample}[${index}].components.${name}.magnitude`);
        }
        if (!(component.severity in SEVERITY_RANK)) failures.push(`${sample}[${index}].components.${name}.severity`);
      }
    }
  }
  validateHistoricalBlocks(input.historicalBlocks ?? [], failures);
  return failures;
}

function validateHistoricalBlocks(blocks: readonly RiskHistoricalBlockSummaryV2[], failures: string[]) {
  const labels = new Set<string>();
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!;
    if (block.label.length === 0 || labels.has(block.label)) failures.push(`historicalBlocks[${index}].label`);
    labels.add(block.label);
    if (!Number.isInteger(block.sampleSize) || block.sampleSize < 0) failures.push(`historicalBlocks[${index}].sampleSize`);
    if (!Number.isFinite(block.meanAnnualizedVolatility) || block.meanAnnualizedVolatility < 0) {
      failures.push(`historicalBlocks[${index}].meanAnnualizedVolatility`);
    }
    if (!unitInterval(block.meanRiskScore)) failures.push(`historicalBlocks[${index}].meanRiskScore`);
    if (!unitInterval(block.upperRiskQuantile)) failures.push(`historicalBlocks[${index}].upperRiskQuantile`);
    if (block.sufficientEvidence && block.sampleSize < RISK_CALIBRATION_VALIDATION_V2_POLICY.minimumBucketSize) {
      failures.push(`historicalBlocks[${index}].sufficientEvidence`);
    }
    validateBandShares(block.bandShares, `historicalBlocks[${index}].bandShares`, failures);
    validateBandShares(block.thresholdSensitivity.loweredCutPointsBandShares,
      `historicalBlocks[${index}].thresholdSensitivity.loweredCutPointsBandShares`, failures);
    validateBandShares(block.thresholdSensitivity.raisedCutPointsBandShares,
      `historicalBlocks[${index}].thresholdSensitivity.raisedCutPointsBandShares`, failures);
  }
}

function validateBandShares(sharesValue: RiskBandSharesV2, path: string, failures: string[]) {
  const values = BANDS.map((band) => sharesValue[band]);
  if (values.some((value) => !unitInterval(value)) ||
    rounded(values.reduce((sum, value) => sum + value, 0)) !== 1) failures.push(path);
}

function unitInterval(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function bucketObservations(
  observations: readonly RiskCalibrationObservationV2[],
  thresholds: { readonly lowNormalBoundary: number; readonly normalHighBoundary: number },
) {
  const result: Record<RiskRegimeBucketV2, RiskCalibrationObservationV2[]> = {
    "LOW-DISPERSION": [], "NORMAL-DISPERSION": [], "HIGH-DISPERSION": [],
  };
  for (const item of observations) result[assignRiskRegimeV2(item.annualizedVolatility, thresholds)].push(item);
  return result;
}

function summarizeBuckets(buckets: Record<RiskRegimeBucketV2, RiskCalibrationObservationV2[]>) {
  return Object.freeze(Object.fromEntries(BUCKETS.map((bucket) => [bucket, summarize(buckets[bucket])]))) as
    Readonly<Record<RiskRegimeBucketV2, RiskBucketSummaryV2>>;
}

function summarize(observations: readonly RiskCalibrationObservationV2[]): RiskBucketSummaryV2 {
  const scores = observations.map((item) => item.riskScore);
  const componentNames = observations[0] === undefined ? [] : Object.keys(observations[0].components).sort();
  const subperiodCounts = new Map<string, number>();
  for (const item of observations) {
    if (item.subperiod !== undefined) subperiodCounts.set(item.subperiod, (subperiodCounts.get(item.subperiod) ?? 0) + 1);
  }
  const bandShares = shares(observations.map((item) => item.riskBand));
  return Object.freeze({
    observations: observations.length,
    finiteRiskScores: scores.filter(Number.isFinite).length,
    meanRiskScore: scores.length === 0 ? null : rounded(mean(scores)),
    medianRiskScore: scores.length === 0 ? null : rounded(quantile(scores, 0.5)),
    bandShares,
    moderateOrHigherShare: rounded(bandShares.moderate + bandShares.high),
    highShare: bandShares.high,
    subperiodCounts: Object.freeze(Object.fromEntries([...subperiodCounts]
      .sort(([left], [right]) => left.localeCompare(right)))),
    componentSeverityShares: Object.freeze(Object.fromEntries(componentNames.map((name) => [name,
      shares(observations.map((item) => item.components[name]!.severity)),
    ]))),
  });
}

function matchedRegimeDiagnostics(
  calibration: Readonly<Record<RiskRegimeBucketV2, RiskBucketSummaryV2>>,
  validation: Readonly<Record<RiskRegimeBucketV2, RiskBucketSummaryV2>>,
) {
  return Object.freeze(Object.fromEntries(BUCKETS.map((bucket) => {
    const left = calibration[bucket], right = validation[bucket];
    if (left.observations < RISK_CALIBRATION_VALIDATION_V2_POLICY.minimumBucketSize ||
      right.observations < RISK_CALIBRATION_VALIDATION_V2_POLICY.minimumBucketSize) {
      return [bucket, Object.freeze({
        verdict: "INSUFFICIENT_EVIDENCE" as const,
        acceptanceCritical: false as const,
        calibrationCount: left.observations,
        validationCount: right.observations,
        meanDifference: null,
        medianDifference: null,
        bandShareDrift: null,
        moderateOrHigherCrossingDrift: null,
        highCrossingDrift: null,
        failures: Object.freeze([]),
      })];
    }
    const meanDifference = Math.abs(left.meanRiskScore! - right.meanRiskScore!);
    const medianDifference = Math.abs(left.medianRiskScore! - right.medianRiskScore!);
    const bandShareDrift = drift(left.bandShares, right.bandShares);
    const moderateOrHigherCrossingDrift = Math.abs(left.moderateOrHigherShare - right.moderateOrHigherShare);
    const highCrossingDrift = Math.abs(left.highShare - right.highShare);
    const diagnosticFailures: string[] = [];
    if (exceedsTolerance(meanDifference, RISK_CALIBRATION_VALIDATION_V2_POLICY.matchedMeanTolerance)) {
      diagnosticFailures.push("mean Risk score drift");
    }
    if (exceedsTolerance(medianDifference, RISK_CALIBRATION_VALIDATION_V2_POLICY.matchedMedianTolerance)) {
      diagnosticFailures.push("median Risk score drift");
    }
    if (BANDS.some((band) => exceedsTolerance(
      bandShareDrift[band], RISK_CALIBRATION_VALIDATION_V2_POLICY.matchedBandShareTolerance,
    ))) diagnosticFailures.push("Risk band-share drift");
    if (exceedsTolerance(moderateOrHigherCrossingDrift,
      RISK_CALIBRATION_VALIDATION_V2_POLICY.matchedThresholdCrossingTolerance)) {
      diagnosticFailures.push("moderate threshold-crossing drift");
    }
    if (exceedsTolerance(highCrossingDrift,
      RISK_CALIBRATION_VALIDATION_V2_POLICY.matchedThresholdCrossingTolerance)) {
      diagnosticFailures.push("high threshold-crossing drift");
    }
    return [bucket, Object.freeze({
      verdict: diagnosticFailures.length === 0 ? "PASS" as const : "FAIL" as const,
      acceptanceCritical: false as const,
      calibrationCount: left.observations,
      validationCount: right.observations,
      meanDifference: rounded(meanDifference),
      medianDifference: rounded(medianDifference),
      bandShareDrift,
      moderateOrHigherCrossingDrift: rounded(moderateOrHigherCrossingDrift),
      highCrossingDrift: rounded(highCrossingDrift),
      failures: Object.freeze(diagnosticFailures),
    })];
  }))) as Readonly<Record<RiskRegimeBucketV2, MatchedRegimeDiagnosticV2>>;
}

function monotonicSampleResult(
  summaries: Readonly<Record<RiskRegimeBucketV2, RiskBucketSummaryV2>>,
): MonotonicSampleResultV2 {
  const means = Object.freeze(Object.fromEntries(BUCKETS.map((bucket) =>
    [bucket, summaries[bucket].meanRiskScore]))) as Readonly<Record<RiskRegimeBucketV2, number | null>>;
  const highBandShares = Object.freeze(Object.fromEntries(BUCKETS.map((bucket) =>
    [bucket, summaries[bucket].highShare]))) as Readonly<Record<RiskRegimeBucketV2, number>>;
  if (BUCKETS.some((bucket) =>
    summaries[bucket].observations < RISK_CALIBRATION_VALIDATION_V2_POLICY.minimumBucketSize)) {
    return Object.freeze({ verdict: "INSUFFICIENT_EVIDENCE", means, highBandShares, failures: Object.freeze([]) });
  }
  const failures: string[] = [];
  if (exceedsTolerance(means["LOW-DISPERSION"]! - means["NORMAL-DISPERSION"]!,
    RISK_CALIBRATION_VALIDATION_V2_POLICY.monotonicScoreTolerance) ||
    exceedsTolerance(means["NORMAL-DISPERSION"]! - means["HIGH-DISPERSION"]!,
      RISK_CALIBRATION_VALIDATION_V2_POLICY.monotonicScoreTolerance)) {
    failures.push("mean Risk score is not monotonic by volatility regime");
  }
  if (exceedsTolerance(highBandShares["LOW-DISPERSION"] - highBandShares["NORMAL-DISPERSION"],
    RISK_CALIBRATION_VALIDATION_V2_POLICY.monotonicHighBandTolerance) ||
    exceedsTolerance(highBandShares["NORMAL-DISPERSION"] - highBandShares["HIGH-DISPERSION"],
      RISK_CALIBRATION_VALIDATION_V2_POLICY.monotonicHighBandTolerance)) {
    failures.push("high-band tendency decreases materially in a higher-volatility regime");
  }
  return Object.freeze({
    verdict: failures.length === 0 ? "PASS" : "FAIL",
    means,
    highBandShares,
    failures: Object.freeze(failures),
  });
}

function componentMonotonicityResult(observations: readonly RiskCalibrationObservationV2[]) {
  const componentNames = Object.keys(observations[0]!.components).sort();
  const components = Object.fromEntries(componentNames.map((name) => {
    const values = observations.map((item) => item.components[name]!).sort((left, right) =>
      left.magnitude - right.magnitude || SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity]);
    let maximumRank = -1, violations = 0;
    const ranksByMagnitude = new Map<number, Set<number>>();
    for (const value of values) {
      const rank = SEVERITY_RANK[value.severity];
      if (rank < maximumRank) violations += 1;
      maximumRank = Math.max(maximumRank, rank);
      const ranks = ranksByMagnitude.get(value.magnitude) ?? new Set<number>();
      ranks.add(rank);
      ranksByMagnitude.set(value.magnitude, ranks);
    }
    for (const ranks of ranksByMagnitude.values()) if (ranks.size > 1) violations += ranks.size - 1;
    const result: ComponentMonotonicityResultV2 = Object.freeze({
      observations: values.length,
      distinctMagnitudes: ranksByMagnitude.size,
      severityShares: shares(values.map((value) => value.severity)),
      violations,
      passed: violations === 0,
    });
    return [name, result];
  }));
  return Object.freeze({
    components: Object.freeze(components),
    passed: Object.values(components).every((item) => item.passed),
  });
}

function nonDegeneracyResults(summaries: Readonly<Record<RiskRegimeBucketV2, RiskBucketSummaryV2>>) {
  return Object.freeze(Object.fromEntries(BUCKETS.map((bucket) => {
    const summary = summaries[bucket];
    if (summary.observations < RISK_CALIBRATION_VALIDATION_V2_POLICY.minimumBucketSize) {
      return [bucket, Object.freeze({
        verdict: "INSUFFICIENT_EVIDENCE" as const,
        dominantBandShare: Math.max(...Object.values(summary.bandShares)),
        activeComponentCount: 0,
        failures: Object.freeze([]),
      })];
    }
    const activeComponentCount = Object.values(summary.componentSeverityShares)
      .filter((severityShares) => Object.values(severityShares).filter((share) => share > 0).length > 1).length;
    const dominantBandShare = Math.max(...Object.values(summary.bandShares));
    const failures: string[] = [];
    if (summary.finiteRiskScores !== summary.observations) failures.push("non-finite Risk score");
    if (exceedsTolerance(dominantBandShare, RISK_CALIBRATION_VALIDATION_V2_POLICY.pathologicalCollapseShare)) {
      failures.push("pathological final Risk-band collapse");
    }
    if (activeComponentCount === 0) failures.push("no component severity activation");
    const result: NonDegeneracyBucketResultV2 = Object.freeze({
      verdict: failures.length === 0 ? "PASS" : "FAIL",
      dominantBandShare: rounded(dominantBandShare),
      activeComponentCount,
      failures: Object.freeze(failures),
    });
    return [bucket, result];
  }))) as Readonly<Record<RiskRegimeBucketV2, NonDegeneracyBucketResultV2>>;
}

function historicalRobustnessResult(blocks: readonly RiskHistoricalBlockSummaryV2[]): HistoricalRobustnessResultV2 {
  const ordered = sufficientBlocks(blocks);
  if (ordered.length < RISK_CALIBRATION_VALIDATION_V2_POLICY.minimumHistoricalBlockCount) {
    return Object.freeze({
      verdict: "INSUFFICIENT_EVIDENCE",
      sufficientBlockCount: ordered.length,
      orderedBlocks: Object.freeze(ordered.map((block) => block.label)),
      failures: Object.freeze([]),
    });
  }
  const failures = [
    ...orderedBlockFailures(ordered, (block) => block.meanRiskScore,
      RISK_CALIBRATION_VALIDATION_V2_POLICY.monotonicScoreTolerance, "mean Risk score"),
    ...orderedBlockFailures(ordered, (block) => block.upperRiskQuantile,
      RISK_CALIBRATION_VALIDATION_V2_POLICY.monotonicScoreTolerance, "upper Risk quantile"),
    ...orderedBlockFailures(ordered, (block) => block.bandShares.high,
      RISK_CALIBRATION_VALIDATION_V2_POLICY.monotonicHighBandTolerance, "high-band share"),
  ];
  for (const block of ordered) {
    if (isPathologicallyCollapsed(block.bandShares)) {
      failures.push(`${block.label}: pathological base Risk-band collapse`);
    }
  }
  return Object.freeze({
    verdict: failures.length === 0 ? "PASS" : "FAIL",
    sufficientBlockCount: ordered.length,
    orderedBlocks: Object.freeze(ordered.map((block) => block.label)),
    failures: Object.freeze(failures),
  });
}

function thresholdSensitivityResult(blocks: readonly RiskHistoricalBlockSummaryV2[]): ThresholdSensitivityResultV2 {
  const ordered = sufficientBlocks(blocks);
  if (ordered.length < RISK_CALIBRATION_VALIDATION_V2_POLICY.minimumHistoricalBlockCount) {
    return Object.freeze({
      verdict: "INSUFFICIENT_EVIDENCE",
      cutPointNeighborhood: 0.025,
      scenarios: Object.freeze(["lowered-cut-points", "raised-cut-points"] as const),
      failures: Object.freeze([]),
    });
  }
  const failures: string[] = [];
  for (const [scenario, select] of [
    ["lowered-cut-points", (block: RiskHistoricalBlockSummaryV2) =>
      block.thresholdSensitivity.loweredCutPointsBandShares],
    ["raised-cut-points", (block: RiskHistoricalBlockSummaryV2) =>
      block.thresholdSensitivity.raisedCutPointsBandShares],
  ] as const) {
    failures.push(...orderedBlockFailures(ordered, (block) => select(block).high,
      RISK_CALIBRATION_VALIDATION_V2_POLICY.monotonicHighBandTolerance,
      `${scenario} high-band share`));
    for (const block of ordered) {
      if (isPathologicallyCollapsed(select(block))) {
        failures.push(`${block.label}: ${scenario} pathological Risk-band collapse`);
      }
    }
  }
  return Object.freeze({
    verdict: failures.length === 0 ? "PASS" : "FAIL",
    cutPointNeighborhood: 0.025,
    scenarios: Object.freeze(["lowered-cut-points", "raised-cut-points"] as const),
    failures: Object.freeze(failures),
  });
}

function sufficientBlocks(blocks: readonly RiskHistoricalBlockSummaryV2[]) {
  return [...blocks].filter((block) => block.sufficientEvidence).sort((left, right) =>
    left.meanAnnualizedVolatility - right.meanAnnualizedVolatility || left.label.localeCompare(right.label));
}

function orderedBlockFailures(
  ordered: readonly RiskHistoricalBlockSummaryV2[],
  select: (block: RiskHistoricalBlockSummaryV2) => number,
  tolerance: number,
  metric: string,
) {
  const failures: string[] = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const calmer = ordered[index - 1]!, stressed = ordered[index]!;
    if (exceedsTolerance(select(calmer) - select(stressed), tolerance)) {
      failures.push(`${calmer.label}->${stressed.label}: materially reversed ${metric}`);
    }
  }
  return failures;
}

function isPathologicallyCollapsed(value: RiskBandSharesV2) {
  return exceedsTolerance(Math.max(...Object.values(value)),
    RISK_CALIBRATION_VALIDATION_V2_POLICY.pathologicalCollapseShare);
}

function unconditionalDiagnostics(
  calibration: readonly RiskCalibrationObservationV2[],
  validation: readonly RiskCalibrationObservationV2[],
) {
  const calibrationScores = calibration.map((item) => item.riskScore);
  const validationScores = validation.map((item) => item.riskScore);
  const calibrationBandShares = shares(calibration.map((item) => item.riskBand));
  const validationBandShares = shares(validation.map((item) => item.riskBand));
  return Object.freeze({
    calibrationBandShares,
    validationBandShares,
    bandShareDrift: drift(calibrationBandShares, validationBandShares),
    meanRiskScoreDifference: rounded(Math.abs(mean(calibrationScores) - mean(validationScores))),
    medianRiskScoreDifference: rounded(Math.abs(
      quantile(calibrationScores, 0.5) - quantile(validationScores, 0.5))),
    wassersteinLikeScoreDistance: rounded(wassersteinLikeDistance(calibrationScores, validationScores)),
    acceptanceCritical: false as const,
  });
}

function shares(values: readonly RiskBandV2[] | readonly RiskSeverityV2[]): RiskBandSharesV2 {
  const denominator = values.length === 0 ? 1 : values.length;
  return Object.freeze({
    low: rounded(values.filter((value) => value === "low").length / denominator),
    moderate: rounded(values.filter((value) => value === "moderate").length / denominator),
    high: rounded(values.filter((value) => value === "high").length / denominator),
  });
}

function drift(left: RiskBandSharesV2, right: RiskBandSharesV2): RiskBandSharesV2 {
  return Object.freeze({
    low: rounded(Math.abs(left.low - right.low)),
    moderate: rounded(Math.abs(left.moderate - right.moderate)),
    high: rounded(Math.abs(left.high - right.high)),
  });
}

function wassersteinLikeDistance(left: readonly number[], right: readonly number[]) {
  let total = 0;
  for (let index = 0; index <= 100; index += 1) {
    const q = index / 100;
    total += Math.abs(quantile(left, q) - quantile(right, q));
  }
  return total / 101;
}

function exceedsTolerance(value: number, tolerance: number) {
  return rounded(value) > rounded(tolerance);
}

function mean(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function quantile(values: readonly number[], q: number) {
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position), upper = Math.ceil(position);
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
}

function rounded(value: number) {
  return Number(value.toFixed(RISK_CALIBRATION_VALIDATION_V2_POLICY.comparisonDecimalPlaces));
}
