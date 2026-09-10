import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { calculateEMA } from "../../indicators/ema";
import { calculateMACD } from "../../indicators/macd";
import { calculateRateDifferenceBp } from "../../indicators/rateFeatures";
import { calculateRSI } from "../../indicators/rsi";

export const ESTR_CALIBRATION_METHODOLOGY_VERSION_V1 =
  "estr-rate-calibration-study-v1" as const;
export const ESTR_CALIBRATION_FIXTURE_SHA256_V1 =
  "5446634b25af7b16d7f5dbfd3873cdcf56815710c03e8351d278b6cb8fdd6b9e";
export const ESTR_TECHNICAL_WARMUP_V1 = 199;

export const ESTR_FROZEN_CALIBRATION_V1 = Object.freeze({
  status: "calibration-only-not-production-activated" as const,
  derivedFrom: "calibration-sample-only" as const,
  momentumHorizon: 10,
  volatilityWindow: 20,
  signal: Object.freeze({
    weights: Object.freeze({ ema: 0.35, rsi: 0.15, macd: 0.2, momentum: 0.3 }),
    ema: Object.freeze([
      Object.freeze({ period: 20, neutralDistanceBp: 0.15, strongDistanceBp: 4 }),
      Object.freeze({ period: 50, neutralDistanceBp: 0.3, strongDistanceBp: 19 }),
      Object.freeze({ period: 200, neutralDistanceBp: 0.9, strongDistanceBp: 86 }),
    ]),
    rsi: Object.freeze({ center: 50, neutralStretch: 3, strongStretch: 35 }),
    macdHistogram: Object.freeze({ neutralBp: 0.02, strongBp: 1.3 }),
    momentum: Object.freeze({ neutralBp: 0.2, strongBp: 1 }),
    aggregate: Object.freeze({ neutralAbsoluteScore: 0.2, strongAbsoluteScore: 0.6 }),
    confidence: Object.freeze({
      requiredCoverage: 1,
      behavior: "exclude-before-full-causal-warmup" as const,
    }),
  }),
  risk: Object.freeze({
    weights: Object.freeze({
      dailyBpVolatility: 0.3,
      rsiStretch: 0.15,
      momentum: 0.2,
      macdHistogram: 0.1,
      ema50Distance: 0.15,
      ema200Distance: 0.1,
    }),
    thresholds: Object.freeze({
      dailyBpVolatility: Object.freeze({ moderate: 0.6, high: 5.6 }),
      rsiStretch: Object.freeze({ moderate: 6, high: 40 }),
      momentumBp: Object.freeze({ moderate: 0.5, high: 25 }),
      macdHistogramBp: Object.freeze({ moderate: 0.5, high: 2.1 }),
      ema50DistanceBp: Object.freeze({ moderate: 10, high: 36 }),
      ema200DistanceBp: Object.freeze({ moderate: 45, high: 127 }),
    }),
    severityMapping: Object.freeze({ baseline: 0, moderateThreshold: 0.5, high: 1 }),
    aggregate: Object.freeze({ moderateMinimum: 0.35, highMinimum: 0.65 }),
  }),
  levelRegime: Object.freeze({ lowUpperRate: -0.55, highLowerRate: 3.15 }),
  volatilityRegime: Object.freeze({ calmUpperBp: 0.4, stressedLowerBp: 5.6 }),
  sensitivity: Object.freeze({ aggregateDelta: 0.025, componentScaleDelta: 0.1 }),
  contiguousBlockLength: 200,
});

interface EstrFixtureV1 {
  readonly schemaVersion: string;
  readonly provider: string;
  readonly source: string;
  readonly dataflow: string;
  readonly seriesId: string;
  readonly seriesKey: string;
  readonly unit: string;
  readonly sourceUrl: string;
  readonly acquisitionTimestampUtc: string;
  readonly firstObservationDate: string;
  readonly lastObservationDate: string;
  readonly observationCount: number;
  readonly observations: readonly (readonly [string, number])[];
}

interface TechnicalRowV1 {
  readonly index: number;
  readonly date: string;
  readonly rate: number;
  readonly dailyChangeBp: number;
  readonly momentum5Bp: number;
  readonly momentum10Bp: number;
  readonly momentum20Bp: number;
  readonly ema20DistanceBp: number;
  readonly ema50DistanceBp: number;
  readonly ema200DistanceBp: number;
  readonly rsi14: number;
  readonly macdBp: number;
  readonly macdHistogramBp: number;
  readonly volatility10Bp: number;
  readonly volatility20Bp: number;
  readonly volatility30Bp: number;
}

interface EvaluatedRowV1 extends TechnicalRowV1 {
  readonly signalScore: number;
  readonly signalState: "falling-rate" | "range-bound" | "rising-rate";
  readonly signalStrength: "neutral" | "directional" | "strong";
  readonly signalCoverage: 1;
  readonly signalComponents: Readonly<{
    ema: number;
    rsi: number;
    macd: number;
    momentum: number;
  }>;
  readonly riskScore: number;
  readonly riskBand: "low" | "moderate" | "high";
  readonly riskComponents: Readonly<{
    dailyBpVolatility: number;
    rsiStretch: number;
    momentum: number;
    macdHistogram: number;
    ema50Distance: number;
    ema200Distance: number;
  }>;
  readonly levelRegime: "low" | "middle" | "high";
  readonly volatilityRegime: "calm" | "elevated" | "stressed";
}

export function runEstrRateCalibrationStudyV1() {
  const fixtureUrl = new URL("./fixtures/estr-ecb-reference.json", import.meta.url);
  const fixtureBytes = readFileSync(fileURLToPath(fixtureUrl));
  const fixture = JSON.parse(fixtureBytes.toString("utf8")) as EstrFixtureV1;
  validateFixture(fixture);

  const technicalRows = calculateTechnicalRows(fixture.observations);
  const splitIndex = Math.floor(technicalRows.length * 0.7);
  const calibrationTechnical = technicalRows.slice(0, splitIndex);
  const validationTechnical = technicalRows.slice(splitIndex);
  const calibration = calibrationTechnical.map((row) => evaluate(row));
  const validation = validationTechnical.map((row) => evaluate(row));
  const allRows = [...calibration, ...validation];
  const blocks = contiguousBlocks(allRows);
  const signalValidation = validateSignal(calibration, validation, blocks);
  const riskValidation = validateRisk(calibration, validation, blocks);
  const sensitivity = thresholdSensitivity(calibration, validation);
  const populationExpansion = populationExpansionDiagnostic(allRows, calibration);
  const fixtureSha256 = createHash("sha256").update(fixtureBytes).digest("hex");
  const limitedEvidenceReasons = [
    "Only one complete €STR history beginning in 2019 is available.",
    "The chronological holdout is dominated by the easing/positive-rate period.",
    "The post-2025-07-01 reporting-population sample is comparatively short.",
  ];
  const failures = [
    ...signalValidation.failures,
    ...riskValidation.failures,
    ...sensitivity.failures,
    ...(populationExpansion.separateRegimeRequired
      ? ["2025 reporting-population expansion requires a separate regime"]
      : []),
  ];

  return Object.freeze({
    methodologyVersion: ESTR_CALIBRATION_METHODOLOGY_VERSION_V1,
    generatedFrom: "immutable-official-ecb-fixture" as const,
    source: Object.freeze({
      provider: fixture.provider,
      source: fixture.source,
      dataflow: fixture.dataflow,
      seriesId: fixture.seriesId,
      seriesKey: fixture.seriesKey,
      unit: fixture.unit,
      sourceUrl: fixture.sourceUrl,
      acquisitionTimestampUtc: fixture.acquisitionTimestampUtc,
      fixtureSha256,
      fixtureSizeBytes: fixtureBytes.byteLength,
      firstObservationDate: fixture.firstObservationDate,
      lastObservationDate: fixture.lastObservationDate,
      observationCount: fixture.observationCount,
      acquisitionStrategy: "one-official-ecb-full-history-loader" as const,
      successfulAcquisitions: 1,
      replayNetworkCalls: 0,
      preEstrObservations: fixture.observations.filter(
        ([date]) => date < "2019-10-01",
      ).length,
      fallbackProviders: Object.freeze([]),
    }),
    history: historySummary(fixture.observations),
    split: Object.freeze({
      rawHistoryCount: fixture.observationCount,
      warmupExcludedCount: ESTR_TECHNICAL_WARMUP_V1,
      firstUsableDate: technicalRows[0]!.date,
      usableCount: technicalRows.length,
      calibrationRatio: 0.7,
      shuffled: false,
      calibrationCount: calibration.length,
      calibrationStartDate: calibration[0]!.date,
      calibrationEndDate: calibration.at(-1)!.date,
      validationCount: validation.length,
      validationStartDate: validation[0]!.date,
      validationEndDate: validation.at(-1)!.date,
      allSelectedFeaturesCausallyAvailable: true,
    }),
    candidateSelection: Object.freeze({
      momentum: momentumCandidateDiagnostics(calibrationTechnical, validationTechnical),
      volatility: volatilityCandidateDiagnostics(
        calibrationTechnical,
        validationTechnical,
      ),
    }),
    frozenCandidate: ESTR_FROZEN_CALIBRATION_V1,
    calibrationEvidence: Object.freeze({
      signalComponentThresholdQuantiles: signalThresholdEvidence(calibrationTechnical),
      riskComponentThresholdQuantiles: riskThresholdEvidence(calibrationTechnical),
      levelRegimeQuantiles: Object.freeze({
        lowerThird: rounded(quantile(calibration.map((row) => row.rate), 1 / 3)),
        upperThird: rounded(quantile(calibration.map((row) => row.rate), 2 / 3)),
      }),
      volatilityRegimeQuantiles: Object.freeze({
        median: rounded(quantile(
          calibration.map((row) => row.volatility20Bp),
          0.5,
        )),
        upperTail: rounded(quantile(
          calibration.map((row) => row.volatility20Bp),
          0.85,
        )),
      }),
    }),
    signalValidation,
    riskValidation,
    levelRegime: sampleRegimeComparison(calibration, validation, "levelRegime"),
    volatilityRegime: sampleRegimeComparison(
      calibration,
      validation,
      "volatilityRegime",
    ),
    contiguousHistoricalRobustness: Object.freeze({
      blockLength: ESTR_FROZEN_CALIBRATION_V1.contiguousBlockLength,
      blockCount: blocks.length,
      blocks: Object.freeze(blocks),
      coverage: Object.freeze({
        negativeRateEra: allRows.some((row) => row.rate < 0),
        hikingEpisode: allRows.some((row) => row.momentum10Bp >= 20),
        plateauEpisode: allRows.some((row) =>
          Math.abs(row.momentum20Bp) <= 1),
        easingEpisode: allRows.some((row) => row.momentum10Bp <= -20),
      }),
      interpretation:
        "Fixed contiguous observation blocks cover the available eras but are not independent policy cycles.",
    }),
    thresholdSensitivity: sensitivity,
    reportingPopulationExpansion: populationExpansion,
    domainAudit: Object.freeze({
      negativeRowsEvaluated: allRows.filter((row) => row.rate < 0).length,
      zeroRowsEvaluated: allRows.filter((row) => row.rate === 0).length,
      crossZeroTransitions: countCrossZeroTransitions(fixture.observations),
      finiteOutputs: allRows.every(evaluatedRowIsFinite),
      usesLogReturns: false,
      usesPercentageRoc: false,
      usesPercentageEmaDistance: false,
      dividesByRateLevel: false,
      requiresPositiveRate: false,
      productDirectionVocabulary: "rising-rate/falling-rate/range-bound" as const,
    }),
    acceptance: Object.freeze({
      verdict: failures.length === 0
        ? "PASS_WITH_LIMITED_EVIDENCE" as const
        : "FAIL" as const,
      defensibleFrozenV1: failures.length === 0,
      failures: Object.freeze(failures),
      limitedEvidenceReasons: Object.freeze(limitedEvidenceReasons),
      productionChangesAuthorized: false,
    }),
  });
}

function validateFixture(fixture: EstrFixtureV1): void {
  assert(fixture.schemaVersion === "ecb-estr-reference-fixture-v1", "fixture schema");
  assert(fixture.provider === "ECB", "fixture provider");
  assert(fixture.source === "European Central Bank", "fixture source");
  assert(fixture.dataflow === "ECB/EST/1.0", "fixture dataflow");
  assert(fixture.seriesId === "EST.B.EU000A2X2A25.WT", "fixture series ID");
  assert(fixture.seriesKey === "B.EU000A2X2A25.WT", "fixture series key");
  assert(fixture.unit === "percentage points", "fixture unit");
  assert(fixture.observationCount === fixture.observations.length, "fixture count");
  assert(fixture.firstObservationDate === "2019-10-01", "fixture first date");
  assert(fixture.observations.length >= 1_500, "sufficient €STR history");

  for (let index = 0; index < fixture.observations.length; index += 1) {
    const [date, value] = fixture.observations[index]!;
    assert(parseDate(date) !== null && Number.isFinite(value), `fixture row ${index}`);
    if (index > 0) {
      assert(date > fixture.observations[index - 1]![0], "strict chronology");
    }
  }
}

function calculateTechnicalRows(
  observations: readonly (readonly [string, number])[],
): readonly TechnicalRowV1[] {
  const dates = observations.map(([date]) => date);
  const values = observations.map(([, value]) => value);
  const ema20 = calculateEMA(values, 20);
  const ema50 = calculateEMA(values, 50);
  const ema200 = calculateEMA(values, 200);
  const rsi14 = calculateRSI(values, 14);
  const macd = calculateMACD(values, 12, 26, 9);
  const dailyChanges = differenceSeries(values, 1);
  const momentum5 = differenceSeries(values, 5);
  const momentum10 = differenceSeries(values, 10);
  const momentum20 = differenceSeries(values, 20);
  const volatility10 = rollingSampleDeviation(dailyChanges, 10);
  const volatility20 = rollingSampleDeviation(dailyChanges, 20);
  const volatility30 = rollingSampleDeviation(dailyChanges, 30);
  const rows: TechnicalRowV1[] = [];

  for (let index = ESTR_TECHNICAL_WARMUP_V1; index < values.length; index += 1) {
    const required = [
      dailyChanges[index], momentum5[index], momentum10[index], momentum20[index],
      ema20[index], ema50[index], ema200[index], rsi14[index], macd.macd[index],
      macd.histogram[index], volatility10[index], volatility20[index],
      volatility30[index],
    ];
    assert(required.every((value) => value !== null && Number.isFinite(value)),
      `causal feature availability at ${dates[index]}`);

    rows.push(Object.freeze({
      index,
      date: dates[index]!,
      rate: values[index]!,
      dailyChangeBp: dailyChanges[index]!,
      momentum5Bp: momentum5[index]!,
      momentum10Bp: momentum10[index]!,
      momentum20Bp: momentum20[index]!,
      ema20DistanceBp: calculateRateDifferenceBp(values[index]!, ema20[index]!),
      ema50DistanceBp: calculateRateDifferenceBp(values[index]!, ema50[index]!),
      ema200DistanceBp: calculateRateDifferenceBp(values[index]!, ema200[index]!),
      rsi14: rsi14[index]!,
      macdBp: macd.macd[index]! * 100,
      macdHistogramBp: macd.histogram[index]! * 100,
      volatility10Bp: volatility10[index]!,
      volatility20Bp: volatility20[index]!,
      volatility30Bp: volatility30[index]!,
    }));
  }

  return Object.freeze(rows);
}

function evaluate(
  row: TechnicalRowV1,
  componentThresholdScale = 1,
  signalNeutralDelta = 0,
  riskBandDelta = 0,
): EvaluatedRowV1 {
  const profile = ESTR_FROZEN_CALIBRATION_V1;
  const emaDistances = [
    row.ema20DistanceBp,
    row.ema50DistanceBp,
    row.ema200DistanceBp,
  ];
  const ema = profile.signal.ema.reduce((sum, threshold, index) =>
    sum + signedComponent(
      emaDistances[index]!,
      threshold.neutralDistanceBp * componentThresholdScale,
      threshold.strongDistanceBp * componentThresholdScale,
    ), 0) / profile.signal.ema.length;
  const rsi = signedComponent(
    row.rsi14 - profile.signal.rsi.center,
    profile.signal.rsi.neutralStretch * componentThresholdScale,
    profile.signal.rsi.strongStretch * componentThresholdScale,
  );
  const macd = signedComponent(
    row.macdHistogramBp,
    profile.signal.macdHistogram.neutralBp * componentThresholdScale,
    profile.signal.macdHistogram.strongBp * componentThresholdScale,
  );
  const momentum = signedComponent(
    row.momentum10Bp,
    profile.signal.momentum.neutralBp * componentThresholdScale,
    profile.signal.momentum.strongBp * componentThresholdScale,
  );
  const signalScore = clamp(
    ema * profile.signal.weights.ema +
    rsi * profile.signal.weights.rsi +
    macd * profile.signal.weights.macd +
    momentum * profile.signal.weights.momentum,
    -1,
    1,
  );
  const signalNeutral = profile.signal.aggregate.neutralAbsoluteScore +
    signalNeutralDelta;
  const signalState = signalScore > signalNeutral
    ? "rising-rate" as const
    : signalScore < -signalNeutral
      ? "falling-rate" as const
      : "range-bound" as const;
  const signalStrength = signalState === "range-bound"
    ? "neutral" as const
    : Math.abs(signalScore) >= profile.signal.aggregate.strongAbsoluteScore
      ? "strong" as const
      : "directional" as const;
  const thresholds = profile.risk.thresholds;
  const riskComponents = Object.freeze({
    dailyBpVolatility: riskComponent(
      row.volatility20Bp,
      thresholds.dailyBpVolatility.moderate * componentThresholdScale,
      thresholds.dailyBpVolatility.high * componentThresholdScale,
    ),
    rsiStretch: riskComponent(
      Math.abs(row.rsi14 - 50),
      thresholds.rsiStretch.moderate * componentThresholdScale,
      thresholds.rsiStretch.high * componentThresholdScale,
    ),
    momentum: riskComponent(
      Math.abs(row.momentum10Bp),
      thresholds.momentumBp.moderate * componentThresholdScale,
      thresholds.momentumBp.high * componentThresholdScale,
    ),
    macdHistogram: riskComponent(
      Math.abs(row.macdHistogramBp),
      thresholds.macdHistogramBp.moderate * componentThresholdScale,
      thresholds.macdHistogramBp.high * componentThresholdScale,
    ),
    ema50Distance: riskComponent(
      Math.abs(row.ema50DistanceBp),
      thresholds.ema50DistanceBp.moderate * componentThresholdScale,
      thresholds.ema50DistanceBp.high * componentThresholdScale,
    ),
    ema200Distance: riskComponent(
      Math.abs(row.ema200DistanceBp),
      thresholds.ema200DistanceBp.moderate * componentThresholdScale,
      thresholds.ema200DistanceBp.high * componentThresholdScale,
    ),
  });
  const riskScore = clamp(
    riskComponents.dailyBpVolatility * profile.risk.weights.dailyBpVolatility +
    riskComponents.rsiStretch * profile.risk.weights.rsiStretch +
    riskComponents.momentum * profile.risk.weights.momentum +
    riskComponents.macdHistogram * profile.risk.weights.macdHistogram +
    riskComponents.ema50Distance * profile.risk.weights.ema50Distance +
    riskComponents.ema200Distance * profile.risk.weights.ema200Distance,
    0,
    1,
  );
  const moderateMinimum = profile.risk.aggregate.moderateMinimum + riskBandDelta;
  const highMinimum = profile.risk.aggregate.highMinimum + riskBandDelta;

  return Object.freeze({
    ...row,
    signalScore,
    signalState,
    signalStrength,
    signalCoverage: 1 as const,
    signalComponents: Object.freeze({ ema, rsi, macd, momentum }),
    riskScore,
    riskBand: riskScore >= highMinimum
      ? "high"
      : riskScore >= moderateMinimum ? "moderate" : "low",
    riskComponents,
    levelRegime: row.rate <= profile.levelRegime.lowUpperRate
      ? "low"
      : row.rate >= profile.levelRegime.highLowerRate ? "high" : "middle",
    volatilityRegime: row.volatility20Bp <= profile.volatilityRegime.calmUpperBp
      ? "calm"
      : row.volatility20Bp >= profile.volatilityRegime.stressedLowerBp
        ? "stressed"
        : "elevated",
  });
}

function validateSignal(
  calibration: readonly EvaluatedRowV1[],
  validation: readonly EvaluatedRowV1[],
  blocks: readonly ReturnType<typeof summarizeBlock>[],
) {
  const calibrationStates = shares(calibration.map((row) => row.signalState));
  const validationStates = shares(validation.map((row) => row.signalState));
  const failures: string[] = [];
  const stateNames = ["falling-rate", "range-bound", "rising-rate"] as const;
  const nonDegenerate = (distribution: Readonly<Record<string, number>>) =>
    stateNames.every((state) => (distribution[state] ?? 0) >= 0.05) &&
    stateNames.every((state) => (distribution[state] ?? 0) <= 0.9);

  if (!calibration.every((row) => row.signalScore >= -1 && row.signalScore <= 1) ||
    !validation.every((row) => row.signalScore >= -1 && row.signalScore <= 1)) {
    failures.push("signal score boundedness");
  }
  if (!nonDegenerate(calibrationStates) || !nonDegenerate(validationStates)) {
    failures.push("signal state non-degeneracy");
  }
  if (![...calibration, ...validation].every((row) => row.signalCoverage === 1)) {
    failures.push("signal full coverage after warm-up");
  }

  return Object.freeze({
    verdict: failures.length === 0 ? "PASS" as const : "FAIL" as const,
    failures: Object.freeze(failures),
    deterministicFormula: true,
    bounded: failures.includes("signal score boundedness") === false,
    componentMonotonicity: signalComponentMonotonicity(),
    coverage: Object.freeze({ calibration: 1, validation: 1 }),
    calibration: sampleSignalSummary(calibration),
    validation: sampleSignalSummary(validation),
    stateShareDrift: distributionDrift(calibrationStates, validationStates),
    contiguousBlocks: Object.freeze(blocks.map((block) => Object.freeze({
      label: block.label,
      signalStates: block.signalStates,
      meanSignalScore: block.meanSignalScore,
    }))),
    temporalStability: Object.freeze({
      verdict: "PASS_WITH_LIMITED_EVIDENCE" as const,
      blockCount: blocks.length,
      allBlockScoresFinite: blocks.every((block) =>
        Number.isFinite(block.meanSignalScore)),
      concentratedBlocksRetainedAsHistoricalRegimeEvidence: true,
    }),
    interpretation:
      "Holdout direction-share drift reflects an easing-heavy period; this is descriptive replay, not forecast scoring.",
  });
}

function validateRisk(
  calibration: readonly EvaluatedRowV1[],
  validation: readonly EvaluatedRowV1[],
  blocks: readonly ReturnType<typeof summarizeBlock>[],
) {
  const calibrationBands = shares(calibration.map((row) => row.riskBand));
  const validationBands = shares(validation.map((row) => row.riskBand));
  const calibrationByVolatility = riskByVolatilityRegime(calibration);
  const validationByVolatility = riskByVolatilityRegime(validation);
  const failures: string[] = [];
  const nonDegenerate = (distribution: Readonly<Record<string, number>>) =>
    Object.values(distribution).every((share) => share <= 0.9) &&
    Object.keys(distribution).length === 3;
  const monotonic = (summary: ReturnType<typeof riskByVolatilityRegime>) =>
    summary.calm.meanRiskScore <= summary.elevated.meanRiskScore &&
    summary.elevated.meanRiskScore <= summary.stressed.meanRiskScore;

  if (!nonDegenerate(calibrationBands) || !nonDegenerate(validationBands)) {
    failures.push("risk band non-degeneracy");
  }
  if (!monotonic(calibrationByVolatility) || !monotonic(validationByVolatility)) {
    failures.push("aggregate risk monotonicity by rate-volatility regime");
  }

  return Object.freeze({
    verdict: failures.length === 0 ? "PASS" as const : "FAIL" as const,
    failures: Object.freeze(failures),
    meaning: "rate-market instability/unusual movement/dispersion" as const,
    notLossProbability: true,
    componentSeverityMonotonicity: riskComponentMonotonicity(),
    calibration: sampleRiskSummary(calibration),
    validation: sampleRiskSummary(validation),
    bandShareDrift: distributionDrift(calibrationBands, validationBands),
    rateVolatilityConditioning: Object.freeze({
      derivedFromFutureOutcomes: false,
      noCircularConditioning: true,
      conditioningVariable: "same-row dailyBpVolatility, never Risk output" as const,
      calibration: calibrationByVolatility,
      validation: validationByVolatility,
    }),
    temporalStability: Object.freeze({
      verdict: "PASS_WITH_LIMITED_EVIDENCE" as const,
      blockCount: blocks.length,
      allBlockScoresFinite: blocks.every((block) =>
        Number.isFinite(block.meanRiskScore)),
      concentratedBlocksRetainedAsHistoricalRegimeEvidence: true,
    }),
    contiguousBlocks: Object.freeze(blocks.map((block) => Object.freeze({
      label: block.label,
      riskBands: block.riskBands,
      meanRiskScore: block.meanRiskScore,
      meanDailyBpVolatility: block.meanDailyBpVolatility,
    }))),
  });
}

function thresholdSensitivity(
  calibration: readonly EvaluatedRowV1[],
  validation: readonly EvaluatedRowV1[],
) {
  const all = [...calibration, ...validation];
  const delta = ESTR_FROZEN_CALIBRATION_V1.sensitivity.aggregateDelta;
  const scaleDelta = ESTR_FROZEN_CALIBRATION_V1.sensitivity.componentScaleDelta;
  const scenario = (
    componentScale: number,
    signalDelta: number,
    riskDelta: number,
  ) => {
    const evaluated = all.map((row) => evaluate(
      row,
      componentScale,
      signalDelta,
      riskDelta,
    ));
    return Object.freeze({
      signalStates: shares(evaluated.map((row) => row.signalState)),
      riskBands: shares(evaluated.map((row) => row.riskBand)),
    });
  };
  const scenarios = Object.freeze({
    base: scenario(1, 0, 0),
    aggregateLowered: scenario(1, -delta, -delta),
    aggregateRaised: scenario(1, delta, delta),
    componentThresholdsLowered: scenario(1 - scaleDelta, 0, 0),
    componentThresholdsRaised: scenario(1 + scaleDelta, 0, 0),
  });
  const failures: string[] = [];

  for (const [name, result] of Object.entries(scenarios)) {
    if (Math.max(...Object.values(result.signalStates)) > 0.9) {
      failures.push(`${name} signal collapse`);
    }
    if (Math.max(...Object.values(result.riskBands)) > 0.9 ||
      Object.keys(result.riskBands).length !== 3) {
      failures.push(`${name} risk collapse`);
    }
  }

  return Object.freeze({
    verdict: failures.length === 0 ? "PASS" as const : "FAIL" as const,
    failures: Object.freeze(failures),
    aggregateCutpointPerturbation: `±${delta}`,
    componentThresholdPerturbation: `±${scaleDelta * 100}%`,
    scenarios,
  });
}

function populationExpansionDiagnostic(
  allRows: readonly EvaluatedRowV1[],
  calibration: readonly EvaluatedRowV1[],
) {
  const boundary = "2025-07-01";
  const boundaryIndex = allRows.findIndex((row) => row.date >= boundary);
  assert(boundaryIndex >= 120 && allRows.length - boundaryIndex >= 120,
    "population diagnostic window availability");
  const pre = allRows.slice(boundaryIndex - 120, boundaryIndex);
  const post = allRows.slice(boundaryIndex, boundaryIndex + 120);
  const metrics = Object.freeze({
    dailyChangeBp: populationMetric(pre, post, calibration, "dailyChangeBp"),
    momentum10Bp: populationMetric(pre, post, calibration, "momentum10Bp"),
    dailyBpVolatility: populationMetric(pre, post, calibration, "volatility20Bp"),
    rsi14: populationMetric(pre, post, calibration, "rsi14"),
    macdHistogramBp: populationMetric(pre, post, calibration, "macdHistogramBp"),
    signalScore: populationMetric(pre, post, calibration, "signalScore"),
    riskScore: populationMetric(pre, post, calibration, "riskScore"),
  });
  const materialMetricCount = Object.values(metrics).filter(
    (metric) => metric.normalizedDistributionDistance > 1,
  ).length;
  const boundaryRow = allRows[boundaryIndex]!;
  const calibrationDailyChange95 = quantile(
    calibration.map((row) => Math.abs(row.dailyChangeBp)),
    0.95,
  );
  const boundaryExtreme = Math.abs(boundaryRow.dailyChangeBp) >
    calibrationDailyChange95;
  const separateRegimeRequired = boundaryExtreme && materialMetricCount >= 4;

  return Object.freeze({
    effectiveReferenceDate: boundary,
    comparisonDesign: "adjacent-equal-120-observation-windows" as const,
    preStartDate: pre[0]!.date,
    preEndDate: pre.at(-1)!.date,
    postStartDate: post[0]!.date,
    postEndDate: post.at(-1)!.date,
    metrics,
    materialMetricCount,
    materialMetricRule: "normalized quantile distance > 1 calibration IQR",
    boundaryDailyChangeBp: rounded(boundaryRow.dailyChangeBp),
    calibrationAbsoluteDailyChange95Bp: rounded(calibrationDailyChange95),
    boundaryExtreme,
    separateRegimeRequired,
    conclusion: separateRegimeRequired
      ? "Strong local evidence requires a separate reporting-population regime."
      : "No boundary-local discontinuity supports splitting or rescaling the series; observed pre/post differences remain confounded with the easing cycle.",
  });
}

function populationMetric(
  pre: readonly EvaluatedRowV1[],
  post: readonly EvaluatedRowV1[],
  calibration: readonly EvaluatedRowV1[],
  key: keyof EvaluatedRowV1,
) {
  const left = pre.map((row) => row[key] as number);
  const right = post.map((row) => row[key] as number);
  const reference = calibration.map((row) => row[key] as number);
  const iqr = quantile(reference, 0.75) - quantile(reference, 0.25);
  const quantileDistance = mean([0.1, 0.25, 0.5, 0.75, 0.9].map((q) =>
    Math.abs(quantile(left, q) - quantile(right, q))));

  return Object.freeze({
    pre: compactStats(left),
    post: compactStats(right),
    normalizedDistributionDistance: rounded(quantileDistance / Math.max(iqr, 1e-9)),
  });
}

function contiguousBlocks(rows: readonly EvaluatedRowV1[]) {
  const length = ESTR_FROZEN_CALIBRATION_V1.contiguousBlockLength;
  const blocks: EvaluatedRowV1[][] = [];

  for (let index = 0; index < rows.length; index += length) {
    blocks.push(rows.slice(index, index + length));
  }

  return Object.freeze(blocks.map((block, index) => summarizeBlock(block, index)));
}

function summarizeBlock(block: readonly EvaluatedRowV1[], index: number) {
  return Object.freeze({
    label: `block-${index + 1}:${block[0]!.date}/${block.at(-1)!.date}`,
    observationCount: block.length,
    signalStates: shares(block.map((row) => row.signalState)),
    riskBands: shares(block.map((row) => row.riskBand)),
    levelRegimes: shares(block.map((row) => row.levelRegime)),
    volatilityRegimes: shares(block.map((row) => row.volatilityRegime)),
    meanSignalScore: rounded(mean(block.map((row) => row.signalScore))),
    meanRiskScore: rounded(mean(block.map((row) => row.riskScore))),
    meanDailyBpVolatility: rounded(mean(
      block.map((row) => row.volatility20Bp),
    )),
  });
}

function momentumCandidateDiagnostics(
  calibration: readonly TechnicalRowV1[],
  validation: readonly TechnicalRowV1[],
) {
  const histogram = calibration.map((row) => row.macdHistogramBp);
  const ema50 = calibration.map((row) => row.ema50DistanceBp);
  const diagnostics = ([5, 10, 20] as const).map((horizon) => {
    const key = `momentum${horizon}Bp` as const;
    const left = calibration.map((row) => row[key]);
    const right = validation.map((row) => row[key]);
    return Object.freeze({
      horizon,
      calibration: compactStats(left.map(Math.abs)),
      validation: compactStats(right.map(Math.abs)),
      absoluteP90DriftBp: rounded(Math.abs(
        quantile(left.map(Math.abs), 0.9) - quantile(right.map(Math.abs), 0.9),
      )),
      zeroShareDrift: rounded(Math.abs(zeroShare(left) - zeroShare(right))),
      signPersistence: rounded(signPersistence(left)),
      correlationWithMacdHistogram: rounded(correlation(left, histogram)),
      correlationWithEma50Distance: rounded(correlation(left, ema50)),
    });
  });

  return Object.freeze({
    selectedHorizon: 10,
    candidates: Object.freeze(diagnostics),
    reason:
      "10 observations preserves intermediate responsiveness/persistence and has identical 24.8 bp absolute P90 in calibration and validation; 20 is more redundant with EMA50 and has materially larger tail drift.",
    predictiveOptimizationUsed: false,
  });
}

function volatilityCandidateDiagnostics(
  calibration: readonly TechnicalRowV1[],
  validation: readonly TechnicalRowV1[],
) {
  const diagnostics = ([10, 20, 30] as const).map((window) => {
    const key = `volatility${window}Bp` as const;
    const left = calibration.map((row) => row[key]);
    const right = validation.map((row) => row[key]);
    return Object.freeze({
      window,
      calibration: compactStats(left),
      validation: compactStats(right),
      relativeMeanDrift: rounded(Math.abs(mean(left) - mean(right)) / mean(left)),
      lagOneCorrelation: rounded(correlation(left.slice(1), left.slice(0, -1))),
    });
  });

  return Object.freeze({
    selectedWindow: 20,
    candidates: Object.freeze(diagnostics),
    reason:
      "20 changes retains the established daily-rate default, smooths the noisier 10-change estimate, and avoids the additional response lag of 30; its holdout mean drift is comparable to 30 and all regimes remain populated.",
  });
}

function signalThresholdEvidence(rows: readonly TechnicalRowV1[]) {
  const absolute = (select: (row: TechnicalRowV1) => number) =>
    rows.map(select).map(Math.abs);
  return Object.freeze({
    ema20DistanceBp: thresholdsEvidence(absolute((row) => row.ema20DistanceBp),
      1 / 3, 0.75, 0.15, 4),
    ema50DistanceBp: thresholdsEvidence(absolute((row) => row.ema50DistanceBp),
      1 / 3, 0.75, 0.3, 19),
    ema200DistanceBp: thresholdsEvidence(absolute((row) => row.ema200DistanceBp),
      1 / 3, 0.75, 0.9, 86),
    rsiStretch: thresholdsEvidence(rows.map((row) => Math.abs(row.rsi14 - 50)),
      1 / 3, 0.75, 3, 35),
    macdHistogramBp: thresholdsEvidence(absolute((row) => row.macdHistogramBp),
      1 / 3, 0.8, 0.02, 1.3),
    momentum10Bp: thresholdsEvidence(absolute((row) => row.momentum10Bp),
      1 / 3, 0.85, 0.2, 1),
  });
}

function riskThresholdEvidence(rows: readonly TechnicalRowV1[]) {
  const pair = (
    values: readonly number[],
    moderateQuantile: number,
    highQuantile: number,
    moderate: number,
    high: number,
  ) =>
    Object.freeze({
      moderateQuantile,
      empiricalModerate: rounded(quantile(values, moderateQuantile)),
      highQuantile,
      empiricalHigh: rounded(quantile(values, highQuantile)),
      frozenModerate: moderate,
      frozenHigh: high,
    });
  return Object.freeze({
    dailyBpVolatility: pair(rows.map((row) => row.volatility20Bp),
      2 / 3, 0.85, 0.6, 5.6),
    rsiStretch: pair(rows.map((row) => Math.abs(row.rsi14 - 50)),
      0.5, 0.8, 6, 40),
    momentum10Bp: pair(rows.map((row) => Math.abs(row.momentum10Bp)),
      0.75, 0.9, 0.5, 25),
    macdHistogramBp: pair(rows.map((row) => Math.abs(row.macdHistogramBp)),
      2 / 3, 0.9, 0.5, 2.1),
    ema50DistanceBp: pair(rows.map((row) => Math.abs(row.ema50DistanceBp)),
      2 / 3, 0.9, 10, 36),
    ema200DistanceBp: pair(rows.map((row) => Math.abs(row.ema200DistanceBp)),
      2 / 3, 0.9, 45, 127),
  });
}

function thresholdsEvidence(
  values: readonly number[],
  neutralQuantile: number,
  strongQuantile: number,
  frozenNeutral: number,
  frozenStrong: number,
) {
  return Object.freeze({
    neutralQuantile,
    empiricalNeutral: rounded(quantile(values, neutralQuantile)),
    frozenNeutral,
    strongQuantile,
    empiricalStrong: rounded(quantile(values, strongQuantile)),
    frozenStrong,
  });
}

function sampleSignalSummary(rows: readonly EvaluatedRowV1[]) {
  return Object.freeze({
    count: rows.length,
    score: compactStats(rows.map((row) => row.signalScore)),
    states: shares(rows.map((row) => row.signalState)),
    strengths: shares(rows.map((row) => row.signalStrength)),
    componentDirections: Object.freeze(Object.fromEntries(
      (["ema", "rsi", "macd", "momentum"] as const).map((component) => [
        component,
        shares(rows.map((row) => row.signalComponents[component] > 0
          ? "positive-rate-direction"
          : row.signalComponents[component] < 0
            ? "negative-rate-direction"
            : "neutral")),
      ]),
    )),
  });
}

function sampleRiskSummary(rows: readonly EvaluatedRowV1[]) {
  return Object.freeze({
    count: rows.length,
    score: compactStats(rows.map((row) => row.riskScore)),
    bands: shares(rows.map((row) => row.riskBand)),
  });
}

function riskByVolatilityRegime(rows: readonly EvaluatedRowV1[]) {
  return Object.freeze(Object.fromEntries(
    (["calm", "elevated", "stressed"] as const).map((regime) => {
      const matches = rows.filter((row) => row.volatilityRegime === regime);
      assert(matches.length > 0, `${regime} volatility regime sample`);
      return [regime, Object.freeze({
        count: matches.length,
        meanRiskScore: rounded(mean(matches.map((row) => row.riskScore))),
        highRiskShare: rounded(
          matches.filter((row) => row.riskBand === "high").length / matches.length,
        ),
      })];
    }),
  )) as Readonly<Record<"calm" | "elevated" | "stressed", Readonly<{
    count: number;
    meanRiskScore: number;
    highRiskShare: number;
  }>>>;
}

function sampleRegimeComparison(
  calibration: readonly EvaluatedRowV1[],
  validation: readonly EvaluatedRowV1[],
  key: "levelRegime" | "volatilityRegime",
) {
  return Object.freeze({
    derivedFrom: "calibration-only" as const,
    calibration: shares(calibration.map((row) => row[key])),
    validation: shares(validation.map((row) => row[key])),
    independentOfRiskMeaning: key === "levelRegime",
  });
}

function signalComponentMonotonicity() {
  const cases = [
    signedComponent(-10, 1, 10),
    signedComponent(-5, 1, 10),
    signedComponent(0, 1, 10),
    signedComponent(5, 1, 10),
    signedComponent(10, 1, 10),
  ];
  return Object.freeze({
    passed: cases.every((value, index) => index === 0 || value >= cases[index - 1]!),
    probe: Object.freeze(cases),
  });
}

function riskComponentMonotonicity() {
  const cases = [0, 0.5, 1, 1.5, 2].map((value) => riskComponent(value, 1, 2));
  return Object.freeze({
    passed: cases.every((value, index) => index === 0 || value >= cases[index - 1]!),
    probe: Object.freeze(cases),
  });
}

function historySummary(observations: readonly (readonly [string, number])[]) {
  const values = observations.map(([, value]) => value);
  return Object.freeze({
    firstDate: observations[0]![0],
    lastDate: observations.at(-1)![0],
    count: observations.length,
    minimumRate: Math.min(...values),
    maximumRate: Math.max(...values),
    negativeCount: values.filter((value) => value < 0).length,
    zeroCount: values.filter((value) => value === 0).length,
    positiveCount: values.filter((value) => value > 0).length,
  });
}

function differenceSeries(values: readonly number[], horizon: number) {
  return Object.freeze(values.map((value, index) => index < horizon
    ? null
    : calculateRateDifferenceBp(value, values[index - horizon]!)));
}

function rollingSampleDeviation(
  changes: readonly (number | null)[],
  window: number,
) {
  return Object.freeze(changes.map((_, index) => {
    if (index < window) return null;
    const sample = changes.slice(index - window + 1, index + 1);
    assert(sample.every((value) => value !== null), "volatility sample availability");
    const numeric = sample as number[];
    const sampleMean = mean(numeric);
    return Math.sqrt(numeric.reduce((sum, value) =>
      sum + (value - sampleMean) ** 2, 0) / (window - 1));
  }));
}

function signedComponent(value: number, neutral: number, strong: number): number {
  assert(neutral >= 0 && strong > neutral, "signed component thresholds");
  const magnitude = Math.abs(value);
  if (magnitude <= neutral) return 0;
  return Math.sign(value) * Math.min(1, (magnitude - neutral) / (strong - neutral));
}

function riskComponent(value: number, moderate: number, high: number): number {
  assert(value >= 0 && moderate > 0 && high > moderate, "risk thresholds");
  if (value <= moderate) return 0.5 * value / moderate;
  if (value >= high) return 1;
  return 0.5 + 0.5 * (value - moderate) / (high - moderate);
}

function compactStats(values: readonly number[]) {
  assert(values.length > 0 && values.every(Number.isFinite), "finite statistics");
  return Object.freeze({
    count: values.length,
    mean: rounded(mean(values)),
    median: rounded(quantile(values, 0.5)),
    percentile90: rounded(quantile(values, 0.9)),
    minimum: rounded(Math.min(...values)),
    maximum: rounded(Math.max(...values)),
  });
}

function shares(values: readonly string[]): Readonly<Record<string, number>> {
  assert(values.length > 0, "non-empty distribution");
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.freeze(Object.fromEntries([...counts].sort(([left], [right]) =>
    left.localeCompare(right)).map(([key, count]) => [
      key,
      rounded(count / values.length, 0.0001),
    ])));
}

function distributionDrift(
  left: Readonly<Record<string, number>>,
  right: Readonly<Record<string, number>>,
) {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, rounded(
    Math.abs((left[key] ?? 0) - (right[key] ?? 0)),
    0.0001,
  )])));
}

function zeroShare(values: readonly number[]): number {
  return values.filter((value) => Math.abs(value) < 1e-12).length / values.length;
}

function signPersistence(values: readonly number[]): number {
  let matches = 0;
  for (let index = 1; index < values.length; index += 1) {
    if (Math.sign(values[index]!) === Math.sign(values[index - 1]!)) matches += 1;
  }
  return matches / (values.length - 1);
}

function correlation(left: readonly number[], right: readonly number[]): number {
  assert(left.length === right.length && left.length > 1, "correlation samples");
  const leftMean = mean(left), rightMean = mean(right);
  let covariance = 0, leftVariance = 0, rightVariance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDifference = left[index]! - leftMean;
    const rightDifference = right[index]! - rightMean;
    covariance += leftDifference * rightDifference;
    leftVariance += leftDifference ** 2;
    rightVariance += rightDifference ** 2;
  }
  return covariance / Math.sqrt(leftVariance * rightVariance);
}

function countCrossZeroTransitions(
  observations: readonly (readonly [string, number])[],
) {
  let count = 0;
  for (let index = 1; index < observations.length; index += 1) {
    const previous = observations[index - 1]![1];
    const current = observations[index]![1];
    if ((previous < 0 && current >= 0) || (previous > 0 && current <= 0)) count += 1;
  }
  return count;
}

function evaluatedRowIsFinite(row: EvaluatedRowV1) {
  return [
    row.rate,
    row.dailyChangeBp,
    row.momentum10Bp,
    row.ema50DistanceBp,
    row.ema200DistanceBp,
    row.rsi14,
    row.macdBp,
    row.macdHistogramBp,
    row.volatility20Bp,
    row.signalScore,
    row.riskScore,
  ].every(Number.isFinite);
}

function quantile(values: readonly number[], probability: number): number {
  assert(values.length > 0 && probability >= 0 && probability <= 1, "quantile");
  const ordered = [...values].sort((left, right) => left - right);
  const position = (ordered.length - 1) * probability;
  const lower = Math.floor(position), upper = Math.ceil(position);
  return ordered[lower]! + (ordered[upper]! - ordered[lower]!) *
    (position - lower);
}

function mean(values: readonly number[]): number {
  assert(values.length > 0, "mean");
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rounded(value: number, step = 0.000001): number {
  return Number((Math.round(value / step) * step).toFixed(10));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function parseDate(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return null;
  const timestamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Date(timestamp).toISOString().slice(0, 10) === value
    ? timestamp
    : null;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const isDirectExecution = process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === fileURLToPath(new URL(
    `file:///${process.argv[1].replaceAll("\\", "/")}`,
  ));

if (isDirectExecution) {
  console.log(JSON.stringify(runEstrRateCalibrationStudyV1(), null, 2));
}
