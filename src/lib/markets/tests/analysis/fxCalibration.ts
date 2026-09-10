import { createHash } from "node:crypto";

import type {
  MarketAssetProfile,
  RiskCalibrationProfile,
  SignalCalibrationProfile,
} from "../../core/assetProfile";
import {
  calculateMarketTechnicalIntelligence,
  type MarketTechnicalSnapshot,
} from "../../core/intelligenceEngine";
import {
  calculateMarketRisk,
  type MarketRiskResult,
} from "../../core/riskEngine";
import {
  calculateMarketSignal,
  type MarketSignalResult,
} from "../../core/signalEngine";
import {
  RISK_CALIBRATION_VALIDATION_V2_POLICY,
  validateRiskCalibrationV2,
  type RiskCalibrationObservationV1,
  type RiskHistoricalBlockSummaryV2,
  type RiskSeverityV1,
} from "./riskCalibrationValidation";

export const FX_CALIBRATION_METHODOLOGY_VERSION_V1 =
  "ecb-fx-calibration-v1" as const;
export const FX_TECHNICAL_WARMUP_V1 = 200;
export const FX_MINIMUM_SPLIT_OBSERVATIONS_V1 = 600;

const QUANTILES = [0.05, 0.25, 0.5, 0.75, 0.95] as const;

export interface EcbFxCalibrationFixtureV1 {
  readonly schemaVersion: "ecb-fx-reference-fixture-v1";
  readonly provider: "ECB";
  readonly source: "European Central Bank";
  readonly dataflow: "EXR";
  readonly seriesId: string;
  readonly seriesKey: string;
  readonly unit: string;
  readonly quotation: string;
  readonly inverted: false;
  readonly acquisitionTimestampUtc: string;
  readonly rawAcquisitionSha256: string;
  readonly rawAcquisitionSizeBytes: number;
  readonly firstObservationDate: string;
  readonly lastObservationDate: string;
  readonly rawObservationCount: number;
  readonly missingValueRowCount: number;
  readonly normalizedObservationCount: number;
  readonly observations: readonly (readonly [string, number])[];
}

export interface EcbFxCalibrationProductV1 {
  readonly productId: "eurjpy" | "eurgbp" | "eurchf";
  readonly seriesId: string;
  readonly seriesKey: string;
  readonly unit: string;
  readonly quotation: string;
  readonly fixtureSha256: string;
}

type Technical = {
  readonly [Key in keyof MarketTechnicalSnapshot]-?:
    NonNullable<MarketTechnicalSnapshot[Key]>;
};

interface TechnicalRow {
  readonly index: number;
  readonly date: string;
  readonly technical: Technical;
}

interface EvaluatedRow extends TechnicalRow {
  readonly signal: MarketSignalResult;
  readonly risk: MarketRiskResult;
}

export function runEcbFxCalibrationStudyV1(input: {
  readonly product: EcbFxCalibrationProductV1;
  readonly fixture: EcbFxCalibrationFixtureV1;
  readonly fixtureBytes: Uint8Array;
  readonly baseProfile: MarketAssetProfile;
}) {
  const observations = normalizeFixture(input);
  const splitIndex = Math.floor(observations.length * 0.7);
  const technicalRows = buildTechnicalRows(observations, input.baseProfile);
  const calibrationTechnical = technicalRows.filter((row) => row.index < splitIndex);
  const validationTechnical = technicalRows.filter((row) => row.index >= splitIndex);

  assert(calibrationTechnical.length >= FX_MINIMUM_SPLIT_OBSERVATIONS_V1,
    "Calibration sample is too small after warm-up.");
  assert(validationTechnical.length >= FX_MINIMUM_SPLIT_OBSERVATIONS_V1,
    "Validation sample is too small after warm-up.");

  const candidateSeed = deriveCalibrationCandidate(
    calibrationTechnical,
    input.baseProfile,
  );
  const rawCalibration = evaluate(calibrationTechnical, candidateSeed);
  const frozenProfile = deriveClassificationBands(candidateSeed, rawCalibration);
  const calibration = evaluate(calibrationTechnical, frozenProfile);
  const validation = evaluate(validationTechnical, frozenProfile);
  const repeatedValidation = evaluate(validationTechnical, frozenProfile);
  const deterministic = JSON.stringify(validation) === JSON.stringify(repeatedValidation);
  const robustnessBlocks = threeYearRobustnessBlocks(
    [...calibration.rows, ...validation.rows],
    frozenProfile,
  );
  const riskValidation = validateRiskCalibrationV2({
    calibration: riskValidationObservations(calibration.rows, frozenProfile),
    validation: riskValidationObservations(validation.rows, frozenProfile),
    historicalBlocks: riskValidationHistoricalBlocks(robustnessBlocks),
  });
  const signalValidation = validateSignalCalibration(
    calibration,
    validation,
    deterministic,
  );
  const gapAudit = publicationGapAudit(
    observations,
    calibration.rows,
    validation.rows,
  );
  const robustness = assessRobustness(robustnessBlocks);
  const finiteAfterWarmup = [...calibration.rows, ...validation.rows].every(
    (row) => allFinite(row.technical) && Number.isFinite(row.signal.score) &&
      Number.isFinite(row.signal.confidence) && Number.isFinite(row.risk.score),
  );
  const acceptance = assessAcceptance({
    profile: frozenProfile,
    finiteAfterWarmup,
    deterministic,
    signalValidation,
    riskValidation,
    gapAudit,
  });

  return Object.freeze({
    methodologyVersion: FX_CALIBRATION_METHODOLOGY_VERSION_V1,
    productId: input.product.productId,
    source: Object.freeze({
      provider: input.fixture.provider,
      source: input.fixture.source,
      dataflow: input.fixture.dataflow,
      seriesId: input.fixture.seriesId,
      seriesKey: input.fixture.seriesKey,
      quotation: input.fixture.quotation,
      unit: input.fixture.unit,
      inverted: input.fixture.inverted,
      acquisitionTimestampUtc: input.fixture.acquisitionTimestampUtc,
      rawAcquisitionSha256: input.fixture.rawAcquisitionSha256,
      rawAcquisitionSizeBytes: input.fixture.rawAcquisitionSizeBytes,
      fixtureSha256: input.product.fixtureSha256,
      fixtureSizeBytes: input.fixtureBytes.byteLength,
      rawObservationCount: input.fixture.rawObservationCount,
      explicitMissingValueRows: input.fixture.missingValueRowCount,
      normalizedObservationCount: observations.length,
      firstObservationDate: observations[0]!.date,
      lastObservationDate: observations.at(-1)!.date,
    }),
    technicalWindows: Object.freeze({
      ema: Object.freeze([20, 50, 200]),
      rsi: 14,
      macd: Object.freeze([12, 26, 9]),
      roc: 10,
      volatility: 20,
      annualization: 252,
      warmup: FX_TECHNICAL_WARMUP_V1,
      finiteAfterWarmup,
      usable: finiteAfterWarmup,
    }),
    split: Object.freeze({
      rule: "chronological-oldest-70-calibration-newest-30-validation",
      splitIndex,
      calibrationRawCount: splitIndex,
      validationRawCount: observations.length - splitIndex,
      calibrationUsableCount: calibration.rows.length,
      validationUsableCount: validation.rows.length,
      calibrationRange: Object.freeze([
        calibration.rows[0]!.date,
        calibration.rows.at(-1)!.date,
      ]),
      validationRange: Object.freeze([
        validation.rows[0]!.date,
        validation.rows.at(-1)!.date,
      ]),
      shuffled: false,
      rollingIndicatorContinuityPreserved: true,
    }),
    calibrationDistributions: distributionReport(calibrationTechnical),
    frozenCandidate: Object.freeze({
      derivedFrom: "calibration-only",
      signal: frozenProfile.signal,
      risk: frozenProfile.risk,
    }),
    evaluation: Object.freeze({
      calibration: evaluationSummary(calibration),
      validation: evaluationSummary(validation),
    }),
    signalValidation,
    riskValidation,
    unconditionalRiskDriftDiagnostic:
      riskValidation.inputValid
        ? riskValidation.unconditionalDiagnostics
        : null,
    robustness: Object.freeze({ blocks: robustnessBlocks, verdict: robustness }),
    publicationGapAudit: gapAudit,
    deterministic,
    acceptance,
    productionReadiness: acceptance.accepted
      ? "A. CALIBRATION READY — safe for separate profile-adoption slice"
      : "B. NEEDS REVISED STUDY",
  });
}

function normalizeFixture(input: {
  readonly product: EcbFxCalibrationProductV1;
  readonly fixture: EcbFxCalibrationFixtureV1;
  readonly fixtureBytes: Uint8Array;
}) {
  const { fixture, product } = input;
  const actualHash = createHash("sha256").update(input.fixtureBytes).digest("hex");
  assert(fixture.schemaVersion === "ecb-fx-reference-fixture-v1", "Invalid fixture schema.");
  assert(actualHash === product.fixtureSha256, "Fixture SHA-256 mismatch.");
  assert(fixture.provider === "ECB" && fixture.source === "European Central Bank",
    "Invalid fixture source.");
  assert(fixture.dataflow === "EXR" && fixture.seriesId === product.seriesId &&
    fixture.seriesKey === product.seriesKey, "Invalid ECB series identity.");
  assert(fixture.unit === product.unit && fixture.quotation === product.quotation &&
    fixture.inverted === false, "Invalid quotation identity.");
  assert(/^[a-f0-9]{64}$/.test(fixture.rawAcquisitionSha256), "Invalid raw SHA-256.");
  assert(Number.isInteger(fixture.rawAcquisitionSizeBytes) &&
    fixture.rawAcquisitionSizeBytes > 0, "Invalid raw artifact size.");
  const acquiredAt = Date.parse(fixture.acquisitionTimestampUtc);
  assert(Number.isFinite(acquiredAt), "Invalid acquisition timestamp.");
  const byDate = new Map<string, number>();

  for (const [date, value] of fixture.observations) {
    const timestamp = parseDate(date);
    assert(timestamp <= acquiredAt, `Future observation: ${date}`);
    assert(Number.isFinite(value) && value > 0, `Invalid value: ${date}`);
    const existing = byDate.get(date);
    assert(existing === undefined || existing === value,
      `Conflicting duplicate: ${date}`);
    byDate.set(date, value);
  }

  const result = [...byDate]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, value]) => Object.freeze({ date, value }));
  assert(fixture.rawObservationCount ===
    fixture.missingValueRowCount + fixture.observations.length,
  "Raw observation count mismatch.");
  assert(fixture.normalizedObservationCount === result.length,
    "Normalized observation count mismatch.");
  assert(result[0]?.date === fixture.firstObservationDate &&
    result.at(-1)?.date === fixture.lastObservationDate,
  "Observation bounds mismatch.");
  return Object.freeze(result);
}

function buildTechnicalRows(
  input: readonly { readonly date: string; readonly value: number }[],
  profile: MarketAssetProfile,
) {
  const rows: TechnicalRow[] = [];
  for (let index = FX_TECHNICAL_WARMUP_V1 - 1; index < input.length; index += 1) {
    const window = input.slice(Math.max(0, index - profile.historyLimit + 1), index + 1);
    const technical = calculateMarketTechnicalIntelligence({
      profile,
      closes: window.map((observation) => observation.value),
    });
    assert(allFinite(technical), `Non-finite Technical output at ${input[index]!.date}`);
    rows.push(Object.freeze({
      index,
      date: input[index]!.date,
      technical: technical as Technical,
    }));
  }
  return Object.freeze(rows);
}

function deriveCalibrationCandidate(
  rows: readonly TechnicalRow[],
  baseProfile: MarketAssetProfile,
): MarketAssetProfile {
  const metric = (select: (technical: Technical) => number) =>
    rows.map((row) => select(row.technical));
  const absolute = (values: readonly number[]) => values.map(Math.abs);
  const volatility = metric((item) => item.annualizedVolatility);
  const rsi = metric((item) => item.rsi);
  const roc = absolute(metric((item) => item.roc));
  const histogram = absolute(metric((item) => item.macdHistogram));
  const emaMedium = absolute(metric((item) => item.priceVsEmaMedium));
  const emaSlow = absolute(metric((item) => item.priceVsEmaSlow));
  const fastRelativeDistance = rows.map(({ technical }) =>
    Math.abs(technical.price - technical.emaFast) / technical.emaFast);
  const signalCalibration: SignalCalibrationProfile = {
    weights: { ema: 0.25, rsi: 0.25, macd: 0.25, roc: 0.25 },
    ema: {
      toleranceRatio: Math.max(0.0001,
        rounded(quantile(fastRelativeDistance, 0.01), 0.0001)),
      minimumTolerance: 0.000001,
      allAveragesMultiplier: 0.55,
      moderateBiasMultiplier: 0.25,
    },
    rsi: { extremeMultiplier: 0.75 },
    macd: {
      epsilon: Math.max(0.0001, rounded(quantile(histogram, 0.01), 0.0001)),
      zeroBiasMultiplier: 0.6,
    },
    roc: {
      directionalThreshold: Math.max(0.1, rounded(quantile(roc, 0.45), 0.1)),
      strongThreshold: Math.max(0.2, rounded(quantile(roc, 0.85), 0.1)),
      strongMultiplier: 1,
      directionalMultiplier: 0.75,
      mildMultiplier: 0.35,
    },
    strength: { moderateThreshold: 0.4, strongThreshold: 0.75 },
    confidence: { base: 0.4, directional: 0.6, riskPenalty: 0.35 },
  };
  const riskCalibration: RiskCalibrationProfile = {
    weights: {
      volatility: 0.2,
      rsi: 0.15,
      roc: 0.2,
      macd: 0.15,
      emaMedium: 0.15,
      emaSlow: 0.15,
    },
    volatility: thresholdPair(volatility, 0.7, 0.92, 0.5),
    rsi: {
      stretchedLow: rounded(quantile(rsi, 0.2), 1),
      stretchedHigh: rounded(quantile(rsi, 0.8), 1),
      severity: severity(),
    },
    roc: thresholdPair(roc, 0.7, 0.92, 0.1),
    macd: {
      highThreshold: Math.max(0.0005,
        rounded(quantile(histogram, 0.85), 0.0005)),
      lowSeverity: 0.2,
      highSeverity: 1,
    },
    emaMedium: thresholdPair(emaMedium, 0.7, 0.92, 0.1),
    emaSlow: thresholdPair(emaSlow, 0.7, 0.92, 0.1),
  };
  return {
    ...baseProfile,
    signal: {
      bullishThreshold: 0.99,
      bearishThreshold: -0.99,
      neutralThreshold: 0,
      calibration: signalCalibration,
    },
    risk: { low: 0.15, moderate: 0.55, high: 0.9, calibration: riskCalibration },
  };
}

function deriveClassificationBands(
  profile: MarketAssetProfile,
  calibration: ReturnType<typeof evaluate>,
): MarketAssetProfile {
  const scores = calibration.rows.map((row) => row.signal.score);
  const positive = scores.filter((value) => value > 0);
  const negative = scores.filter((value) => value < 0).map(Math.abs);
  const magnitude = scores.map(Math.abs);
  const risks = calibration.rows.map((row) => row.risk.score);
  const neutral = Math.max(0.05, rounded(quantile(magnitude, 0.2), 0.05));
  const bullish = Math.max(neutral + 0.05,
    rounded(quantile(positive, 0.6), 0.05));
  const bearish = -Math.max(neutral + 0.05,
    rounded(quantile(negative, 0.6), 0.05));
  const moderateStrength = Math.max(neutral + 0.05,
    rounded(quantile(magnitude, 0.4), 0.05));
  const strongStrength = Math.max(moderateStrength + 0.05,
    rounded(quantile(magnitude, 0.75), 0.05));
  const low = rounded(quantile(risks, 0.2), 0.05);
  const moderate = Math.max(low + 0.05, rounded(quantile(risks, 0.4), 0.05));
  const high = Math.max(moderate + 0.05, rounded(quantile(risks, 0.8), 0.05));
  return {
    ...profile,
    signal: {
      ...profile.signal,
      bullishThreshold: bullish,
      bearishThreshold: bearish,
      neutralThreshold: neutral,
      calibration: {
        ...profile.signal.calibration!,
        strength: {
          moderateThreshold: moderateStrength,
          strongThreshold: strongStrength,
        },
      },
    },
    risk: { ...profile.risk, low, moderate, high },
  };
}

function evaluate(rows: readonly TechnicalRow[], profile: MarketAssetProfile) {
  const evaluated: EvaluatedRow[] = rows.map((row) => {
    const risk = calculateMarketRisk({ profile, indicators: row.technical });
    const signal = calculateMarketSignal({
      profile,
      indicators: { ...row.technical, riskScore: risk.score },
    });
    assert(Number.isFinite(risk.score) && Number.isFinite(signal.score) &&
      Number.isFinite(signal.confidence), `Non-finite Engine result at ${row.date}`);
    return Object.freeze({ ...row, risk, signal });
  });
  return Object.freeze({
    rows: Object.freeze(evaluated),
    bands: Object.freeze({
      signal: shares(evaluated.map((row) => row.signal.direction)),
      strength: shares(evaluated.map((row) => row.signal.strength)),
      risk: shares(evaluated.map((row) => row.risk.level)),
    }),
    confidence: stats(evaluated.map((row) => row.signal.confidence)),
    signalComponents: signalComponentReport(rows, profile),
    riskComponents: riskComponentShares(rows, profile),
    meanRiskScore: rounded(mean(evaluated.map((row) => row.risk.score)), 0.000001),
  });
}

function evaluationSummary(evaluation: ReturnType<typeof evaluate>) {
  return Object.freeze({
    observations: evaluation.rows.length,
    bands: evaluation.bands,
    confidence: evaluation.confidence,
    signalComponents: evaluation.signalComponents,
    riskComponents: evaluation.riskComponents,
    meanRiskScore: evaluation.meanRiskScore,
  });
}

function validateSignalCalibration(
  calibration: ReturnType<typeof evaluate>,
  validation: ReturnType<typeof evaluate>,
  deterministic: boolean,
) {
  const failures: string[] = [];
  const drift = Object.freeze({
    signal: bandDrift(calibration.bands.signal, validation.bands.signal),
    strength: bandDrift(calibration.bands.strength, validation.bands.strength),
  });
  for (const [group, values] of Object.entries(drift)) {
    for (const [band, result] of Object.entries(values)) {
      if (result.absoluteDrift > 0.1) failures.push(`${group}.${band}.drift`);
      if (result.calibration > 0.9 && result.validation > 0.9) {
        failures.push(`${group}.${band}.dominance`);
      }
    }
  }
  for (const component of Object.keys(calibration.signalComponents)) {
    const left = calibration.signalComponents[component]!;
    const right = validation.signalComponents[component]!;
    if (Math.max(...Object.values(left)) > 0.95 &&
      Math.max(...Object.values(right)) > 0.95) {
      failures.push(`component.${component}.degeneracy`);
    }
  }
  if (!deterministic) failures.push("non-deterministic");
  return Object.freeze({
    verdict: failures.length === 0 ? "PASS" as const : "FAIL" as const,
    failures: Object.freeze(failures),
    bandShareDrift: drift,
    confidence: Object.freeze({
      calibration: calibration.confidence,
      validation: validation.confidence,
    }),
    componentActivation: Object.freeze({
      calibration: calibration.signalComponents,
      validation: validation.signalComponents,
    }),
    nonDegenerate: !failures.some((failure) => failure.includes("dominance") ||
      failure.includes("degeneracy")),
    deterministic,
  });
}

function riskValidationObservations(
  rows: readonly EvaluatedRow[],
  profile: MarketAssetProfile,
): readonly RiskCalibrationObservationV1[] {
  const calibration = profile.risk.calibration!;
  return Object.freeze(rows.map((row) => Object.freeze({
    id: `${row.index}:${row.date}`,
    riskScore: row.risk.score,
    riskBand: row.risk.level,
    annualizedVolatility: row.technical.annualizedVolatility,
    subperiod: subperiodLabel(row.date),
    components: Object.freeze({
      volatility: Object.freeze(componentObservation(
        row.technical.annualizedVolatility,
        calibration.volatility.moderateThreshold,
        calibration.volatility.highThreshold,
      )),
      rsi: Object.freeze(rsiRiskObservation(row.technical.rsi, profile)),
      roc: Object.freeze(componentObservation(
        Math.abs(row.technical.roc),
        calibration.roc.moderateThreshold,
        calibration.roc.highThreshold,
      )),
      macd: Object.freeze({
        magnitude: Math.abs(row.technical.macdHistogram),
        severity: Math.abs(row.technical.macdHistogram) >=
          calibration.macd.highThreshold ? "high" as const : "low" as const,
      }),
      emaMedium: Object.freeze(componentObservation(
        Math.abs(row.technical.priceVsEmaMedium),
        calibration.emaMedium.moderateThreshold,
        calibration.emaMedium.highThreshold,
      )),
      emaSlow: Object.freeze(componentObservation(
        Math.abs(row.technical.priceVsEmaSlow),
        calibration.emaSlow.moderateThreshold,
        calibration.emaSlow.highThreshold,
      )),
    }),
  })));
}

function componentObservation(
  magnitude: number,
  moderateThreshold: number,
  highThreshold: number,
) {
  return { magnitude, severity: severity3(magnitude, moderateThreshold, highThreshold) };
}

function rsiRiskObservation(rsi: number, profile: MarketAssetProfile) {
  const calibration = profile.risk.calibration!.rsi;
  const { oversold, overbought } = profile.technical.rsi;
  if (rsi <= oversold) {
    return { magnitude: 2 + (oversold - rsi) / Math.max(oversold, 1), severity: "high" as const };
  }
  if (rsi >= overbought) {
    return { magnitude: 2 + (rsi - overbought) / Math.max(100 - overbought, 1), severity: "high" as const };
  }
  if (rsi < calibration.stretchedLow) {
    return {
      magnitude: 1 + (calibration.stretchedLow - rsi) /
        (calibration.stretchedLow - oversold),
      severity: "moderate" as const,
    };
  }
  if (rsi > calibration.stretchedHigh) {
    return {
      magnitude: 1 + (rsi - calibration.stretchedHigh) /
        (overbought - calibration.stretchedHigh),
      severity: "moderate" as const,
    };
  }
  const center = (calibration.stretchedLow + calibration.stretchedHigh) / 2;
  const halfWidth = (calibration.stretchedHigh - calibration.stretchedLow) / 2;
  return {
    magnitude: Math.abs(rsi - center) / halfWidth,
    severity: "low" as const,
  };
}

function publicationGapAudit(
  observations: readonly { readonly date: string }[],
  calibration: readonly EvaluatedRow[],
  validation: readonly EvaluatedRow[],
) {
  const gaps = gapStatistics(observations);
  const summarize = (rows: readonly EvaluatedRow[], minimumGapDays: number) => {
    const afterGap = rows.filter((row) => row.index > 0 &&
      calendarDays(observations[row.index - 1]!.date, observations[row.index]!.date) >=
        minimumGapDays);
    const finiteOutputs = afterGap.filter((row) => allFinite(row.technical) &&
      Number.isFinite(row.signal.score) && Number.isFinite(row.signal.confidence) &&
      Number.isFinite(row.risk.score)).length;
    return Object.freeze({
      observations: afterGap.length,
      finiteOutputs,
      signal: shares(afterGap.map((row) => row.signal.direction)),
      risk: shares(afterGap.map((row) => row.risk.level)),
    });
  };
  const calibrationAny = summarize(calibration, 2);
  const validationAny = summarize(validation, 2);
  const calibrationExtended = summarize(calibration, 4);
  const validationExtended = summarize(validation, 4);
  const nonDegenerate = (result: ReturnType<typeof summarize>) =>
    result.observations === 0 ||
    Object.values(result.signal).every((share) => share <= 0.95) &&
      Object.values(result.risk).every((share) => share <= 0.95);
  return Object.freeze({
    ...gaps,
    filledObservations: 0,
    interpolation: false,
    forwardFill: false,
    syntheticDates: false,
    postGap: Object.freeze({
      calibration: Object.freeze({ anyGap: calibrationAny, extendedGap: calibrationExtended }),
      validation: Object.freeze({ anyGap: validationAny, extendedGap: validationExtended }),
    }),
    noClassificationArtifact:
      calibrationAny.finiteOutputs === calibrationAny.observations &&
      validationAny.finiteOutputs === validationAny.observations &&
      calibrationExtended.finiteOutputs === calibrationExtended.observations &&
      validationExtended.finiteOutputs === validationExtended.observations &&
      nonDegenerate(calibrationExtended) && nonDegenerate(validationExtended),
  });
}

function threeYearRobustnessBlocks(
  rows: readonly EvaluatedRow[],
  profile: MarketAssetProfile,
) {
  const groups = new Map<string, EvaluatedRow[]>();
  for (const row of rows) {
    const label = subperiodLabel(row.date);
    groups.set(label, [...(groups.get(label) ?? []), row]);
  }
  return Object.freeze(Object.fromEntries([...groups].map(([label, values]) => [
    label,
    (() => {
      const scores = values.map((row) => row.risk.score);
      return Object.freeze({
        observations: values.length,
        status: values.length >= FX_MINIMUM_SPLIT_OBSERVATIONS_V1
          ? "sufficient" as const : "partial" as const,
        range: Object.freeze([values[0]!.date, values.at(-1)!.date]),
        meanAnnualizedVolatility: rounded(mean(values.map(
          (row) => row.technical.annualizedVolatility)), 0.000001),
        meanRiskScore: rounded(mean(scores), 0.000001),
        upperRiskQuantile: rounded(quantile(scores, 0.75), 0.000001),
        risk: riskBandShares(scores, profile.risk.moderate, profile.risk.high),
        thresholdSensitivity: Object.freeze({
          cutPointNeighborhood:
            RISK_CALIBRATION_VALIDATION_V2_POLICY.thresholdCutPointNeighborhood,
          loweredCutPointsBandShares: riskBandShares(
            scores,
            profile.risk.moderate -
              RISK_CALIBRATION_VALIDATION_V2_POLICY.thresholdCutPointNeighborhood,
            profile.risk.high -
              RISK_CALIBRATION_VALIDATION_V2_POLICY.thresholdCutPointNeighborhood,
          ),
          raisedCutPointsBandShares: riskBandShares(
            scores,
            profile.risk.moderate +
              RISK_CALIBRATION_VALIDATION_V2_POLICY.thresholdCutPointNeighborhood,
            profile.risk.high +
              RISK_CALIBRATION_VALIDATION_V2_POLICY.thresholdCutPointNeighborhood,
          ),
        }),
        signal: shares(values.map((row) => row.signal.direction)),
      });
    })(),
  ])));
}

function riskValidationHistoricalBlocks(
  blocks: ReturnType<typeof threeYearRobustnessBlocks>,
): readonly RiskHistoricalBlockSummaryV2[] {
  return Object.freeze(Object.entries(blocks).map(([label, block]) =>
    Object.freeze({
      label,
      sampleSize: block.observations,
      meanAnnualizedVolatility: block.meanAnnualizedVolatility,
      meanRiskScore: block.meanRiskScore,
      upperRiskQuantile: block.upperRiskQuantile,
      bandShares: block.risk,
      sufficientEvidence: block.status === "sufficient",
      thresholdSensitivity: Object.freeze({
        loweredCutPointsBandShares:
          block.thresholdSensitivity.loweredCutPointsBandShares,
        raisedCutPointsBandShares:
          block.thresholdSensitivity.raisedCutPointsBandShares,
      }),
    })));
}

function assessRobustness(blocks: ReturnType<typeof threeYearRobustnessBlocks>) {
  const sufficient = Object.entries(blocks).filter(([, block]) =>
    block.status === "sufficient");
  if (sufficient.length < 2) {
    return Object.freeze({
      verdict: "PASS_WITH_LIMITED_EVIDENCE" as const,
      reason: "Fewer than two complete three-year blocks.",
    });
  }
  const ordered = [...sufficient].sort((left, right) =>
    left[1].meanAnnualizedVolatility - right[1].meanAnnualizedVolatility);
  const low = ordered[0]!;
  const high = ordered.at(-1)!;
  const sensible = high[1].meanRiskScore >= low[1].meanRiskScore;
  return Object.freeze({
    verdict: sensible ? "PASS" as const : "FAIL" as const,
    lowDispersionBlock: low[0],
    highDispersionBlock: high[0],
    lowMeanVolatility: low[1].meanAnnualizedVolatility,
    highMeanVolatility: high[1].meanAnnualizedVolatility,
    lowMeanRiskScore: low[1].meanRiskScore,
    highMeanRiskScore: high[1].meanRiskScore,
    sensibleRiskOrdering: sensible,
  });
}

function assessAcceptance(input: {
  readonly profile: MarketAssetProfile;
  readonly finiteAfterWarmup: boolean;
  readonly deterministic: boolean;
  readonly signalValidation: ReturnType<typeof validateSignalCalibration>;
  readonly riskValidation: ReturnType<typeof validateRiskCalibrationV2>;
  readonly gapAudit: ReturnType<typeof publicationGapAudit>;
}) {
  const failures: string[] = [];
  if (!input.finiteAfterWarmup) failures.push("non-finite outputs after warm-up");
  if (!input.deterministic) failures.push("non-deterministic evaluation");
  if (!calibrationInvariants(input.profile)) failures.push("calibration invariants");
  if (input.signalValidation.verdict === "FAIL") {
    failures.push(...input.signalValidation.failures.map((failure) =>
      `signal-validation.${failure}`));
  }
  if (input.riskValidation.verdict === "FAIL") {
    failures.push(...input.riskValidation.failures.map((failure) =>
      `risk-validation.${failure}`));
  }
  if (!input.gapAudit.noClassificationArtifact) {
    failures.push("ECB publication-gap classification artifact");
  }
  const limited = input.riskValidation.inputValid &&
    input.riskValidation.verdict === "PASS_WITH_LIMITED_EVIDENCE";
  const verdict = failures.length > 0
    ? "FAIL" as const
    : limited ? "PASS WITH LIMITED EVIDENCE" as const : "PASS" as const;
  return Object.freeze({
    accepted: verdict !== "FAIL",
    verdict,
    failures: Object.freeze(failures),
  });
}

function calibrationInvariants(profile: MarketAssetProfile) {
  const signal = profile.signal.calibration!;
  const risk = profile.risk.calibration!;
  const signalWeights = Object.values(signal.weights);
  const riskWeights = Object.values(risk.weights);
  const finiteNonNegative = (values: readonly number[]) =>
    values.every((value) => Number.isFinite(value) && value >= 0);
  const severityOrdered = (value: {
    readonly low: number;
    readonly moderate: number;
    readonly high: number;
  }) => finiteNonNegative([value.low, value.moderate, value.high]) &&
    value.low <= value.moderate && value.moderate <= value.high;
  const thresholdOrdered = (value: {
    readonly moderateThreshold: number;
    readonly highThreshold: number;
  }) => finiteNonNegative([value.moderateThreshold, value.highThreshold]) &&
    value.moderateThreshold < value.highThreshold;
  return finiteNonNegative([...signalWeights, ...riskWeights]) &&
    mean(signalWeights) > 0 && mean(riskWeights) > 0 &&
    profile.signal.neutralThreshold >= 0 &&
    profile.signal.bearishThreshold < -profile.signal.neutralThreshold &&
    profile.signal.bullishThreshold > profile.signal.neutralThreshold &&
    signal.roc.directionalThreshold < signal.roc.strongThreshold &&
    signal.strength.moderateThreshold < signal.strength.strongThreshold &&
    profile.risk.low < profile.risk.moderate &&
    profile.risk.moderate < profile.risk.high && profile.risk.high <= 1 &&
    thresholdOrdered(risk.volatility) && severityOrdered(risk.volatility.severity) &&
    profile.technical.rsi.oversold < risk.rsi.stretchedLow &&
    risk.rsi.stretchedLow < risk.rsi.stretchedHigh &&
    risk.rsi.stretchedHigh < profile.technical.rsi.overbought &&
    severityOrdered(risk.rsi.severity) && thresholdOrdered(risk.roc) &&
    severityOrdered(risk.roc.severity) &&
    risk.macd.lowSeverity <= risk.macd.highSeverity &&
    thresholdOrdered(risk.emaMedium) && severityOrdered(risk.emaMedium.severity) &&
    thresholdOrdered(risk.emaSlow) && severityOrdered(risk.emaSlow.severity);
}

function distributionReport(rows: readonly TechnicalRow[]) {
  const metric = (select: (technical: Technical) => number) =>
    stats(rows.map((row) => select(row.technical)));
  return Object.freeze({
    annualizedVolatility: metric((technical) => technical.annualizedVolatility),
    rsi: metric((technical) => technical.rsi),
    absoluteRoc: stats(rows.map((row) => Math.abs(row.technical.roc))),
    absoluteMacdHistogram: stats(rows.map((row) =>
      Math.abs(row.technical.macdHistogram))),
    absoluteEma50Distance: stats(rows.map((row) =>
      Math.abs(row.technical.priceVsEmaMedium))),
    absoluteEma200Distance: stats(rows.map((row) =>
      Math.abs(row.technical.priceVsEmaSlow))),
  });
}

function riskComponentShares(
  rows: readonly TechnicalRow[],
  profile: MarketAssetProfile,
) {
  const calibration = profile.risk.calibration!;
  return Object.freeze({
    volatility: shares(rows.map((row) => severity3(
      row.technical.annualizedVolatility,
      calibration.volatility.moderateThreshold,
      calibration.volatility.highThreshold,
    ))),
    rsi: shares(rows.map((row) => rsiRiskObservation(
      row.technical.rsi,
      profile,
    ).severity)),
    roc: shares(rows.map((row) => severity3(
      Math.abs(row.technical.roc),
      calibration.roc.moderateThreshold,
      calibration.roc.highThreshold,
    ))),
    macd: shares(rows.map((row) => Math.abs(row.technical.macdHistogram) >=
      calibration.macd.highThreshold ? "high" : "low")),
    emaMedium: shares(rows.map((row) => severity3(
      Math.abs(row.technical.priceVsEmaMedium),
      calibration.emaMedium.moderateThreshold,
      calibration.emaMedium.highThreshold,
    ))),
    emaSlow: shares(rows.map((row) => severity3(
      Math.abs(row.technical.priceVsEmaSlow),
      calibration.emaSlow.moderateThreshold,
      calibration.emaSlow.highThreshold,
    ))),
  });
}

function signalComponentReport(
  rows: readonly TechnicalRow[],
  profile: MarketAssetProfile,
) {
  const names = ["ema", "rsi", "macd", "roc"] as const;
  const values = rows.map((row) => signalContributions(row.technical, profile));
  return Object.freeze(Object.fromEntries(names.map((name) => [
    name,
    shares(values.map((value) => value[name] > 0
      ? "positive" : value[name] < 0 ? "negative" : "neutral")),
  ])));
}

function signalContributions(technical: Technical, profile: MarketAssetProfile) {
  const calibration = profile.signal.calibration!;
  const tolerance = (reference: number) => Math.max(
    Math.abs(reference) * calibration.ema.toleranceRatio,
    calibration.ema.minimumTolerance,
  );
  const above = (value: number, reference: number) =>
    value > reference + tolerance(reference);
  const below = (value: number, reference: number) =>
    value < reference - tolerance(reference);
  const bullish = [
    above(technical.price, technical.emaFast),
    above(technical.price, technical.emaMedium),
    above(technical.price, technical.emaSlow),
  ].filter(Boolean).length;
  const bearish = [
    below(technical.price, technical.emaFast),
    below(technical.price, technical.emaMedium),
    below(technical.price, technical.emaSlow),
  ].filter(Boolean).length;
  const fullyBullish = above(technical.price, technical.emaFast) &&
    above(technical.emaFast, technical.emaMedium) &&
    above(technical.emaMedium, technical.emaSlow);
  const fullyBearish = below(technical.price, technical.emaFast) &&
    below(technical.emaFast, technical.emaMedium) &&
    below(technical.emaMedium, technical.emaSlow);
  const ema = fullyBullish ? calibration.weights.ema
    : fullyBearish ? -calibration.weights.ema
    : bullish === 3 ? calibration.weights.ema * calibration.ema.allAveragesMultiplier
    : bearish === 3 ? -calibration.weights.ema * calibration.ema.allAveragesMultiplier
    : bullish >= 2 ? calibration.weights.ema * calibration.ema.moderateBiasMultiplier
    : bearish >= 2 ? -calibration.weights.ema * calibration.ema.moderateBiasMultiplier : 0;
  const rsi = technical.rsi >= profile.technical.rsi.overbought
    ? calibration.weights.rsi * calibration.rsi.extremeMultiplier
    : technical.rsi >= profile.technical.rsi.neutralHigh ? calibration.weights.rsi
    : technical.rsi > profile.technical.rsi.neutralLow ? 0
    : technical.rsi > profile.technical.rsi.oversold ? -calibration.weights.rsi
    : -calibration.weights.rsi * calibration.rsi.extremeMultiplier;
  const macd = technical.macd > calibration.macd.epsilon &&
    technical.macd > technical.macdSignal + calibration.macd.epsilon &&
    technical.macdHistogram > calibration.macd.epsilon
    ? calibration.weights.macd
    : technical.macd < -calibration.macd.epsilon &&
      technical.macd < technical.macdSignal - calibration.macd.epsilon &&
      technical.macdHistogram < -calibration.macd.epsilon
    ? -calibration.weights.macd
    : technical.macd > calibration.macd.epsilon
    ? calibration.weights.macd * calibration.macd.zeroBiasMultiplier
    : technical.macd < -calibration.macd.epsilon
    ? -calibration.weights.macd * calibration.macd.zeroBiasMultiplier : 0;
  const magnitude = Math.abs(technical.roc);
  const multiplier = magnitude >= calibration.roc.strongThreshold
    ? calibration.roc.strongMultiplier
    : magnitude > calibration.roc.directionalThreshold
    ? calibration.roc.directionalMultiplier
    : magnitude > 0 ? calibration.roc.mildMultiplier : 0;
  return Object.freeze({
    ema,
    rsi,
    macd,
    roc: Math.sign(technical.roc) * calibration.weights.roc * multiplier,
  });
}

function gapStatistics(input: readonly { readonly date: string }[]) {
  let gapPairs = 0;
  let omittedCalendarDays = 0;
  let omittedWeekdays = 0;
  let largestCalendarGapDays = 0;
  for (let index = 1; index < input.length; index += 1) {
    const previous = parseDate(input[index - 1]!.date);
    const current = parseDate(input[index]!.date);
    const days = Math.round((current - previous) / 86_400_000);
    largestCalendarGapDays = Math.max(largestCalendarGapDays, days);
    if (days <= 1) continue;
    gapPairs += 1;
    omittedCalendarDays += days - 1;
    for (let cursor = previous + 86_400_000; cursor < current; cursor += 86_400_000) {
      const weekday = new Date(cursor).getUTCDay();
      if (weekday !== 0 && weekday !== 6) omittedWeekdays += 1;
    }
  }
  return Object.freeze({
    gapPairs,
    omittedCalendarDays,
    omittedWeekdays,
    largestCalendarGapDays,
  });
}

function bandDrift(
  calibration: Readonly<Record<string, number>>,
  validation: Readonly<Record<string, number>>,
) {
  return Object.freeze(Object.fromEntries([...new Set([
    ...Object.keys(calibration),
    ...Object.keys(validation),
  ])].sort().map((band) => {
    const left = calibration[band] ?? 0;
    const right = validation[band] ?? 0;
    return [band, Object.freeze({
      calibration: left,
      validation: right,
      absoluteDrift: rounded(Math.abs(left - right), 0.0001),
    })];
  })));
}

function stats(values: readonly number[]) {
  assert(values.length > 0 && values.every(Number.isFinite),
    "Statistics contain non-finite values.");
  const average = mean(values);
  return Object.freeze({
    finiteCount: values.length,
    mean: rounded(average, 0.000001),
    median: rounded(quantile(values, 0.5), 0.000001),
    quantiles: Object.freeze(Object.fromEntries(QUANTILES.map((q) => [
      String(q * 100),
      rounded(quantile(values, q), 0.000001),
    ]))),
  });
}

function thresholdPair(
  values: readonly number[],
  moderateQuantile: number,
  highQuantile: number,
  step: number,
) {
  const moderateThreshold = Math.max(step,
    rounded(quantile(values, moderateQuantile), step));
  const highThreshold = Math.max(moderateThreshold + step,
    rounded(quantile(values, highQuantile), step));
  return { moderateThreshold, highThreshold, severity: severity() };
}

function severity() {
  return { low: 0.2, moderate: 0.6, high: 1 };
}

function severity3(
  value: number,
  moderateThreshold: number,
  highThreshold: number,
): RiskSeverityV1 {
  return value >= highThreshold ? "high"
    : value >= moderateThreshold ? "moderate" : "low";
}

function shares(values: readonly string[]): Readonly<Record<string, number>> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.freeze(Object.fromEntries([...counts]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => [key, rounded(count / values.length, 0.0001)])));
}

function riskBandShares(
  scores: readonly number[],
  moderateCutPoint: number,
  highCutPoint: number,
) {
  const counts = { low: 0, moderate: 0, high: 0 };
  for (const score of scores) {
    const band = score >= highCutPoint ? "high"
      : score >= moderateCutPoint ? "moderate" : "low";
    counts[band] += 1;
  }
  const low = rounded(counts.low / scores.length, 0.000001);
  const moderate = rounded(counts.moderate / scores.length, 0.000001);
  return Object.freeze({
    low,
    moderate,
    high: rounded(1 - low - moderate, 0.000001),
  });
}

function subperiodLabel(date: string) {
  const year = Number(date.slice(0, 4));
  const start = 1999 + Math.floor((year - 1999) / 3) * 3;
  return `${start}-${start + 2}`;
}

function calendarDays(left: string, right: string) {
  return Math.round((parseDate(right) - parseDate(left)) / 86_400_000);
}

function allFinite(value: MarketTechnicalSnapshot): boolean {
  return Object.values(value).every((item) => item !== null && Number.isFinite(item));
}

function mean(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function quantile(values: readonly number[], q: number) {
  assert(values.length > 0, "Cannot calculate an empty quantile.");
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
}

function rounded(value: number, step: number) {
  return Number((Math.round(value / step) * step).toFixed(10));
}

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  assert(match !== null, `Malformed date: ${value}`);
  const timestamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  assert(new Date(timestamp).toISOString().slice(0, 10) === value,
    `Invalid calendar date: ${value}`);
  return timestamp;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
