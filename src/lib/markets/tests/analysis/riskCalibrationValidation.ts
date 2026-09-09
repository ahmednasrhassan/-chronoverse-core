export type RiskBandV1 = "low" | "moderate" | "high";
export type RiskSeverityV1 = "low" | "moderate" | "high";
export type RiskRegimeBucketV1 = "LOW-DISPERSION" | "NORMAL-DISPERSION" | "HIGH-DISPERSION";
export type RiskValidationVerdictV1 = "PASS" | "PASS_WITH_LIMITED_EVIDENCE" | "FAIL";
export type RiskBucketVerdictV1 = "PASS" | "FAIL" | "INSUFFICIENT_EVIDENCE";

export interface RiskComponentObservationV1 {
  readonly magnitude: number;
  readonly severity: RiskSeverityV1;
}

export interface RiskCalibrationObservationV1 {
  readonly id: string;
  readonly riskScore: number;
  readonly riskBand: RiskBandV1;
  readonly annualizedVolatility: number;
  readonly components: Readonly<Record<string, RiskComponentObservationV1>>;
  readonly subperiod?: string;
}

export interface RiskCalibrationValidationInputV1 {
  readonly calibration: readonly RiskCalibrationObservationV1[];
  readonly validation: readonly RiskCalibrationObservationV1[];
}

export const RISK_CALIBRATION_VALIDATION_V1_POLICY = Object.freeze({
  lowerQuantile: 0.25,
  upperQuantile: 0.75,
  minimumBucketSize: 100,
  monotonicScoreTolerance: 0.02,
  monotonicHighBandTolerance: 0.05,
  matchedMeanTolerance: 0.1,
  matchedMedianTolerance: 0.1,
  matchedBandShareTolerance: 0.2,
  matchedThresholdCrossingTolerance: 0.2,
  pathologicalCollapseShare: 0.98,
} as const);

interface RiskBandSharesV1 {
  readonly low: number;
  readonly moderate: number;
  readonly high: number;
}

interface RiskBucketSummaryV1 {
  readonly observations: number;
  readonly finiteRiskScores: number;
  readonly meanRiskScore: number | null;
  readonly medianRiskScore: number | null;
  readonly bandShares: RiskBandSharesV1;
  readonly moderateOrHigherShare: number;
  readonly highShare: number;
  readonly subperiodCounts: Readonly<Record<string, number>>;
  readonly componentSeverityShares: Readonly<Record<string, RiskBandSharesV1>>;
}

interface MatchedRegimeResultV1 {
  readonly verdict: RiskBucketVerdictV1;
  readonly calibrationCount: number;
  readonly validationCount: number;
  readonly meanDifference: number | null;
  readonly medianDifference: number | null;
  readonly bandShareDrift: RiskBandSharesV1 | null;
  readonly moderateOrHigherCrossingDrift: number | null;
  readonly highCrossingDrift: number | null;
  readonly failures: readonly string[];
}

interface MonotonicSampleResultV1 {
  readonly verdict: RiskBucketVerdictV1;
  readonly means: Readonly<Record<RiskRegimeBucketV1, number | null>>;
  readonly highBandShares: Readonly<Record<RiskRegimeBucketV1, number>>;
  readonly failures: readonly string[];
}

interface ComponentMonotonicityResultV1 {
  readonly observations: number;
  readonly distinctMagnitudes: number;
  readonly severityShares: RiskBandSharesV1;
  readonly violations: number;
  readonly passed: boolean;
}

interface NonDegeneracyBucketResultV1 {
  readonly verdict: RiskBucketVerdictV1;
  readonly dominantBandShare: number;
  readonly activeComponentCount: number;
  readonly failures: readonly string[];
}

export type RiskCalibrationValidationResultV1 =
  | {
      readonly methodologyVersion: "risk-calibration-validation-v1";
      readonly inputValid: false;
      readonly verdict: "FAIL";
      readonly failures: readonly string[];
      readonly regimeThresholds: null;
    }
  | {
      readonly methodologyVersion: "risk-calibration-validation-v1";
      readonly inputValid: true;
      readonly verdict: RiskValidationVerdictV1;
      readonly failures: readonly string[];
      readonly regimeThresholds: {
        readonly basis: "annualized-volatility";
        readonly lowerQuantile: 0.25;
        readonly upperQuantile: 0.75;
        readonly lowNormalBoundary: number;
        readonly normalHighBoundary: number;
        readonly derivedFrom: "calibration-only";
      };
      readonly samples: {
        readonly calibration: Readonly<Record<RiskRegimeBucketV1, RiskBucketSummaryV1>>;
        readonly validation: Readonly<Record<RiskRegimeBucketV1, RiskBucketSummaryV1>>;
      };
      readonly unconditionalDiagnostics: {
        readonly calibrationBandShares: RiskBandSharesV1;
        readonly validationBandShares: RiskBandSharesV1;
        readonly bandShareDrift: RiskBandSharesV1;
        readonly meanRiskScoreDifference: number;
        readonly medianRiskScoreDifference: number;
        readonly wassersteinLikeScoreDistance: number;
        readonly acceptanceCritical: false;
      };
      readonly matchedRegimes: Readonly<Record<RiskRegimeBucketV1, MatchedRegimeResultV1>>;
      readonly monotonicRiskResponse: {
        readonly calibration: MonotonicSampleResultV1;
        readonly validation: MonotonicSampleResultV1;
        readonly passed: boolean;
      };
      readonly componentMonotonicity: {
        readonly components: Readonly<Record<string, ComponentMonotonicityResultV1>>;
        readonly passed: boolean;
      };
      readonly nonDegeneracy: {
        readonly calibration: Readonly<Record<RiskRegimeBucketV1, NonDegeneracyBucketResultV1>>;
        readonly validation: Readonly<Record<RiskRegimeBucketV1, NonDegeneracyBucketResultV1>>;
        readonly passed: boolean;
      };
    };

const BUCKETS: readonly RiskRegimeBucketV1[] = Object.freeze([
  "LOW-DISPERSION",
  "NORMAL-DISPERSION",
  "HIGH-DISPERSION",
]);
const BANDS: readonly RiskBandV1[] = Object.freeze(["low", "moderate", "high"]);
const SEVERITY_RANK: Readonly<Record<RiskSeverityV1, number>> = Object.freeze({ low: 0, moderate: 1, high: 2 });

/**
 * Analysis-only, causal Risk calibration validation.
 *
 * Quartiles are deliberately used instead of thirds: the middle 50% forms a
 * broad normal regime, while the outer quarters retain enough observations for
 * stable matched-regime comparisons. Both cut points are frozen from the
 * calibration sample before any validation observation is assigned.
 */
export function validateRiskCalibrationV1(
  input: RiskCalibrationValidationInputV1,
): RiskCalibrationValidationResultV1 {
  const inputFailures = validateInput(input);
  if (inputFailures.length > 0) {
    return Object.freeze({
      methodologyVersion: "risk-calibration-validation-v1",
      inputValid: false,
      verdict: "FAIL",
      failures: Object.freeze(inputFailures),
      regimeThresholds: null,
    });
  }

  const calibrationVolatility = input.calibration.map((item) => item.annualizedVolatility);
  const lowNormalBoundary = quantile(calibrationVolatility, RISK_CALIBRATION_VALIDATION_V1_POLICY.lowerQuantile);
  const normalHighBoundary = quantile(calibrationVolatility, RISK_CALIBRATION_VALIDATION_V1_POLICY.upperQuantile);
  const thresholds = Object.freeze({
    basis: "annualized-volatility" as const,
    lowerQuantile: 0.25 as const,
    upperQuantile: 0.75 as const,
    lowNormalBoundary: rounded(lowNormalBoundary),
    normalHighBoundary: rounded(normalHighBoundary),
    derivedFrom: "calibration-only" as const,
  });

  const calibrationBuckets = bucketObservations(input.calibration, thresholds);
  const validationBuckets = bucketObservations(input.validation, thresholds);
  const calibrationSummaries = summarizeBuckets(calibrationBuckets);
  const validationSummaries = summarizeBuckets(validationBuckets);
  const matchedRegimes = matchedRegimeResults(calibrationSummaries, validationSummaries);
  const calibrationMonotonicity = monotonicSampleResult(calibrationSummaries);
  const validationMonotonicity = monotonicSampleResult(validationSummaries);
  const componentMonotonicity = componentMonotonicityResult([...input.calibration, ...input.validation]);
  const calibrationNonDegeneracy = nonDegeneracyResults(calibrationSummaries);
  const validationNonDegeneracy = nonDegeneracyResults(validationSummaries);

  const failures: string[] = [];
  for (const bucket of BUCKETS) {
    if (matchedRegimes[bucket].verdict === "FAIL") failures.push(`matched-regime.${bucket}`);
    if (calibrationNonDegeneracy[bucket].verdict === "FAIL") failures.push(`non-degeneracy.calibration.${bucket}`);
    if (validationNonDegeneracy[bucket].verdict === "FAIL") failures.push(`non-degeneracy.validation.${bucket}`);
  }
  if (calibrationMonotonicity.verdict === "FAIL") failures.push("monotonic-risk-response.calibration");
  if (validationMonotonicity.verdict === "FAIL") failures.push("monotonic-risk-response.validation");
  if (!componentMonotonicity.passed) failures.push("component-severity-monotonicity");

  const limitedEvidence = BUCKETS.some((bucket) =>
    matchedRegimes[bucket].verdict === "INSUFFICIENT_EVIDENCE" ||
    calibrationNonDegeneracy[bucket].verdict === "INSUFFICIENT_EVIDENCE" ||
    validationNonDegeneracy[bucket].verdict === "INSUFFICIENT_EVIDENCE") ||
    calibrationMonotonicity.verdict === "INSUFFICIENT_EVIDENCE" ||
    validationMonotonicity.verdict === "INSUFFICIENT_EVIDENCE";
  const verdict: RiskValidationVerdictV1 = failures.length > 0
    ? "FAIL"
    : limitedEvidence ? "PASS_WITH_LIMITED_EVIDENCE" : "PASS";

  return Object.freeze({
    methodologyVersion: "risk-calibration-validation-v1",
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
      passed: BUCKETS.every((bucket) => calibrationNonDegeneracy[bucket].verdict !== "FAIL" &&
        validationNonDegeneracy[bucket].verdict !== "FAIL"),
    }),
  });
}

export function assignRiskRegimeV1(
  annualizedVolatility: number,
  thresholds: { readonly lowNormalBoundary: number; readonly normalHighBoundary: number },
): RiskRegimeBucketV1 {
  if (annualizedVolatility <= thresholds.lowNormalBoundary) return "LOW-DISPERSION";
  if (annualizedVolatility >= thresholds.normalHighBoundary) return "HIGH-DISPERSION";
  return "NORMAL-DISPERSION";
}

function validateInput(input: RiskCalibrationValidationInputV1): string[] {
  const failures: string[] = [];
  if (input.calibration.length === 0) failures.push("calibration sample is empty");
  if (input.validation.length === 0) failures.push("validation sample is empty");
  const expectedComponents = input.calibration[0] === undefined
    ? [] : Object.keys(input.calibration[0].components).sort();
  for (const [sample, observations] of [["calibration", input.calibration], ["validation", input.validation]] as const) {
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
  return failures;
}

function bucketObservations(
  observations: readonly RiskCalibrationObservationV1[],
  thresholds: { readonly lowNormalBoundary: number; readonly normalHighBoundary: number },
) {
  const result: Record<RiskRegimeBucketV1, RiskCalibrationObservationV1[]> = {
    "LOW-DISPERSION": [], "NORMAL-DISPERSION": [], "HIGH-DISPERSION": [],
  };
  for (const item of observations) result[assignRiskRegimeV1(item.annualizedVolatility, thresholds)].push(item);
  return result;
}

function summarizeBuckets(buckets: Record<RiskRegimeBucketV1, RiskCalibrationObservationV1[]>) {
  return Object.freeze(Object.fromEntries(BUCKETS.map((bucket) => [bucket, summarize(buckets[bucket])]))) as
    Readonly<Record<RiskRegimeBucketV1, RiskBucketSummaryV1>>;
}

function summarize(observations: readonly RiskCalibrationObservationV1[]): RiskBucketSummaryV1 {
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
    subperiodCounts: Object.freeze(Object.fromEntries([...subperiodCounts].sort(([left], [right]) => left.localeCompare(right)))),
    componentSeverityShares: Object.freeze(Object.fromEntries(componentNames.map((name) => [name,
      shares(observations.map((item) => item.components[name]!.severity)),
    ]))),
  });
}

function matchedRegimeResults(
  calibration: Readonly<Record<RiskRegimeBucketV1, RiskBucketSummaryV1>>,
  validation: Readonly<Record<RiskRegimeBucketV1, RiskBucketSummaryV1>>,
) {
  return Object.freeze(Object.fromEntries(BUCKETS.map((bucket) => {
    const left = calibration[bucket], right = validation[bucket];
    if (left.observations < RISK_CALIBRATION_VALIDATION_V1_POLICY.minimumBucketSize ||
      right.observations < RISK_CALIBRATION_VALIDATION_V1_POLICY.minimumBucketSize) {
      return [bucket, Object.freeze({
        verdict: "INSUFFICIENT_EVIDENCE" as const,
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
    const failures: string[] = [];
    if (meanDifference > RISK_CALIBRATION_VALIDATION_V1_POLICY.matchedMeanTolerance) failures.push("mean Risk score drift");
    if (medianDifference > RISK_CALIBRATION_VALIDATION_V1_POLICY.matchedMedianTolerance) failures.push("median Risk score drift");
    if (BANDS.some((band) => bandShareDrift[band] > RISK_CALIBRATION_VALIDATION_V1_POLICY.matchedBandShareTolerance)) {
      failures.push("Risk band-share drift");
    }
    if (moderateOrHigherCrossingDrift > RISK_CALIBRATION_VALIDATION_V1_POLICY.matchedThresholdCrossingTolerance) {
      failures.push("moderate threshold-crossing drift");
    }
    if (highCrossingDrift > RISK_CALIBRATION_VALIDATION_V1_POLICY.matchedThresholdCrossingTolerance) {
      failures.push("high threshold-crossing drift");
    }
    return [bucket, Object.freeze({
      verdict: failures.length === 0 ? "PASS" as const : "FAIL" as const,
      calibrationCount: left.observations,
      validationCount: right.observations,
      meanDifference: rounded(meanDifference),
      medianDifference: rounded(medianDifference),
      bandShareDrift,
      moderateOrHigherCrossingDrift: rounded(moderateOrHigherCrossingDrift),
      highCrossingDrift: rounded(highCrossingDrift),
      failures: Object.freeze(failures),
    })];
  }))) as Readonly<Record<RiskRegimeBucketV1, MatchedRegimeResultV1>>;
}

function monotonicSampleResult(
  summaries: Readonly<Record<RiskRegimeBucketV1, RiskBucketSummaryV1>>,
): MonotonicSampleResultV1 {
  const means = Object.freeze(Object.fromEntries(BUCKETS.map((bucket) => [bucket, summaries[bucket].meanRiskScore]))) as
    Readonly<Record<RiskRegimeBucketV1, number | null>>;
  const highBandShares = Object.freeze(Object.fromEntries(BUCKETS.map((bucket) => [bucket, summaries[bucket].highShare]))) as
    Readonly<Record<RiskRegimeBucketV1, number>>;
  if (BUCKETS.some((bucket) => summaries[bucket].observations < RISK_CALIBRATION_VALIDATION_V1_POLICY.minimumBucketSize)) {
    return Object.freeze({ verdict: "INSUFFICIENT_EVIDENCE", means, highBandShares, failures: Object.freeze([]) });
  }
  const failures: string[] = [];
  if (means["LOW-DISPERSION"]! > means["NORMAL-DISPERSION"]! + RISK_CALIBRATION_VALIDATION_V1_POLICY.monotonicScoreTolerance ||
    means["NORMAL-DISPERSION"]! > means["HIGH-DISPERSION"]! + RISK_CALIBRATION_VALIDATION_V1_POLICY.monotonicScoreTolerance) {
    failures.push("mean Risk score is not monotonic by volatility regime");
  }
  if (highBandShares["LOW-DISPERSION"] > highBandShares["NORMAL-DISPERSION"] +
      RISK_CALIBRATION_VALIDATION_V1_POLICY.monotonicHighBandTolerance ||
    highBandShares["NORMAL-DISPERSION"] > highBandShares["HIGH-DISPERSION"] +
      RISK_CALIBRATION_VALIDATION_V1_POLICY.monotonicHighBandTolerance) {
    failures.push("high-band tendency decreases materially in a higher-volatility regime");
  }
  return Object.freeze({
    verdict: failures.length === 0 ? "PASS" : "FAIL",
    means, highBandShares, failures: Object.freeze(failures),
  });
}

function componentMonotonicityResult(observations: readonly RiskCalibrationObservationV1[]) {
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
    const result: ComponentMonotonicityResultV1 = Object.freeze({
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

function nonDegeneracyResults(summaries: Readonly<Record<RiskRegimeBucketV1, RiskBucketSummaryV1>>) {
  return Object.freeze(Object.fromEntries(BUCKETS.map((bucket) => {
    const summary = summaries[bucket];
    if (summary.observations < RISK_CALIBRATION_VALIDATION_V1_POLICY.minimumBucketSize) {
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
    if (dominantBandShare > RISK_CALIBRATION_VALIDATION_V1_POLICY.pathologicalCollapseShare) {
      failures.push("pathological final Risk-band collapse");
    }
    if (activeComponentCount === 0) failures.push("no component severity activation");
    const result: NonDegeneracyBucketResultV1 = Object.freeze({
      verdict: failures.length === 0 ? "PASS" : "FAIL",
      dominantBandShare: rounded(dominantBandShare),
      activeComponentCount,
      failures: Object.freeze(failures),
    });
    return [bucket, result];
  }))) as Readonly<Record<RiskRegimeBucketV1, NonDegeneracyBucketResultV1>>;
}

function unconditionalDiagnostics(
  calibration: readonly RiskCalibrationObservationV1[],
  validation: readonly RiskCalibrationObservationV1[],
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
    medianRiskScoreDifference: rounded(Math.abs(quantile(calibrationScores, 0.5) - quantile(validationScores, 0.5))),
    wassersteinLikeScoreDistance: rounded(wassersteinLikeDistance(calibrationScores, validationScores)),
    acceptanceCritical: false as const,
  });
}

function shares(values: readonly RiskBandV1[] | readonly RiskSeverityV1[]): RiskBandSharesV1 {
  const denominator = values.length === 0 ? 1 : values.length;
  return Object.freeze({
    low: rounded(values.filter((value) => value === "low").length / denominator),
    moderate: rounded(values.filter((value) => value === "moderate").length / denominator),
    high: rounded(values.filter((value) => value === "high").length / denominator),
  });
}

function drift(left: RiskBandSharesV1, right: RiskBandSharesV1): RiskBandSharesV1 {
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
  return Number(value.toFixed(6));
}
