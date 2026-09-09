import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { MarketAssetProfile, RiskCalibrationProfile, SignalCalibrationProfile } from "../../core/assetProfile";
import { eurusdProfile } from "../../assets/eurusd/profile";
import { calculateMarketTechnicalIntelligence, type MarketTechnicalSnapshot } from "../../core/intelligenceEngine";
import { calculateMarketRisk, type MarketRiskResult } from "../../core/riskEngine";
import { calculateMarketSignal, type MarketSignalResult } from "../../core/signalEngine";

const SERIES_ID = "EXR.D.USD.EUR.SP00.A";
const QUANTILES = [0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99] as const;
const WARMUP = 200;

interface Fixture {
  readonly schemaVersion: "eurusd-ecb-reference-fixture-v1";
  readonly provider: "ECB";
  readonly source: "European Central Bank";
  readonly seriesId: string;
  readonly unit: "USD per EUR";
  readonly quotation: "EUR 1 = X USD";
  readonly inverted: false;
  readonly acquisitionTimestampUtc: string;
  readonly firstObservationDate: string;
  readonly lastObservationDate: string;
  readonly rawObservationCount: number;
  readonly missingValueRowCount: number;
  readonly normalizedObservationCount: number;
  readonly observations: readonly (readonly [string, number])[];
}

type Technical = {
  readonly [Key in keyof MarketTechnicalSnapshot]-?: NonNullable<MarketTechnicalSnapshot[Key]>;
};
interface TechnicalRow { readonly index: number; readonly date: string; readonly dailyLogReturn: number; readonly technical: Technical }
interface EvaluatedRow {
  readonly index: number;
  readonly date: string;
  readonly technical: Technical;
  readonly signal: MarketSignalResult;
  readonly risk: MarketRiskResult;
}

const fixture = JSON.parse(readFileSync(fileURLToPath(new URL(
  "./fixtures/eurusd-ecb-reference.json", import.meta.url,
)), "utf8")) as Fixture;
const observations = normalizeFixture(fixture);
const splitIndex = Math.floor(observations.length * 0.7);
const technicalRows = buildTechnicalRows(observations);
const calibrationRows = technicalRows.filter((row) => row.index < splitIndex);
const validationRows = technicalRows.filter((row) => row.index >= splitIndex);

assert(calibrationRows.length >= 600, "Calibration sample is too small after warm-up.");
assert(validationRows.length >= 600, "Validation sample is too small after warm-up.");

const baseCandidate = deriveCalibrationCandidate(calibrationRows);
const rawCalibration = evaluate(calibrationRows, baseCandidate);
const frozenProfile = deriveClassificationBands(baseCandidate, rawCalibration);
const calibration = evaluate(calibrationRows, frozenProfile);
const validation = evaluate(validationRows, frozenProfile);
const validationRepeat = evaluate(validationRows, frozenProfile);
const deterministic = JSON.stringify(validation) === JSON.stringify(validationRepeat);
const subperiods = {
  calibration: contiguousBlocks(calibration.rows, frozenProfile),
  validation: contiguousBlocks(validation.rows, frozenProfile),
};
const drift = bandDrift(calibration, validation);
const gapAudit = publicationGapAudit(observations, calibration.rows, validation.rows);
const regimeShift = structuralRegimeShift(calibrationRows, validationRows);
const acceptance = assessAcceptance(
  frozenProfile, calibration, validation, subperiods, drift, gapAudit, deterministic,
);

console.log(JSON.stringify({
  schemaVersion: "eurusd-calibration-study-v1",
  series: {
    provider: fixture.provider,
    source: fixture.source,
    seriesId: fixture.seriesId,
    unit: fixture.unit,
    quotation: fixture.quotation,
    inverted: fixture.inverted,
    acquisitionTimestampUtc: fixture.acquisitionTimestampUtc,
    firstObservationDate: observations[0]!.date,
    lastObservationDate: observations.at(-1)!.date,
    rawObservationCount: fixture.rawObservationCount,
    explicitMissingValueRows: fixture.missingValueRowCount,
    normalizedObservationCount: observations.length,
    gaps: gapStatistics(observations),
  },
  split: {
    splitIndex,
    calibrationRawCount: splitIndex,
    validationRawCount: observations.length - splitIndex,
    calibrationUsableCount: calibrationRows.length,
    validationUsableCount: validationRows.length,
    calibrationRange: [calibrationRows[0]!.date, calibrationRows.at(-1)!.date],
    validationRange: [validationRows[0]!.date, validationRows.at(-1)!.date],
  },
  technicalWindows: {
    ema: [20, 50, 200], rsi: 14, macd: [12, 26, 9], momentumRoc: 10,
    volatility: 20, annualization: 252, finiteAfterWarmup: true,
  },
  distributions: {
    calibration: distributionReport(calibrationRows),
    validation: distributionReport(validationRows),
  },
  frozenCandidate: { signal: frozenProfile.signal, risk: frozenProfile.risk },
  bands: { calibration: calibration.bands, validation: validation.bands },
  confidence: { calibration: stats(calibration.confidence), validation: stats(validation.confidence) },
  riskComponents: { calibration: calibration.riskComponents, validation: validation.riskComponents },
  signalComponents: { calibration: calibration.signalComponents, validation: validation.signalComponents },
  drift,
  publicationGapAudit: gapAudit,
  structuralRegimeShift: regimeShift,
  subperiods,
  deterministic,
  acceptance,
}, null, 2));

if (!acceptance.accepted) process.exitCode = 1;

function normalizeFixture(input: Fixture) {
  assert(input.schemaVersion === "eurusd-ecb-reference-fixture-v1", "Invalid fixture schema.");
  assert(input.provider === "ECB" && input.source === "European Central Bank", "Invalid fixture source.");
  assert(input.seriesId === SERIES_ID, "Invalid ECB series.");
  assert(input.unit === "USD per EUR" && input.quotation === "EUR 1 = X USD" && !input.inverted,
    "Invalid quotation identity.");
  const acquiredAt = Date.parse(input.acquisitionTimestampUtc);
  assert(Number.isFinite(acquiredAt), "Invalid acquisition timestamp.");
  const byDate = new Map<string, number>();
  for (const [date, value] of input.observations) {
    const timestamp = parseDate(date);
    assert(timestamp <= acquiredAt, `Future observation: ${date}`);
    assert(Number.isFinite(value) && value > 0, `Invalid value: ${date}`);
    const existing = byDate.get(date);
    assert(existing === undefined || existing === value, `Conflicting duplicate: ${date}`);
    byDate.set(date, value);
  }
  const result = [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
  assert(input.normalizedObservationCount === result.length, "Normalized count mismatch.");
  assert(input.rawObservationCount === input.missingValueRowCount + input.observations.length,
    "Raw count mismatch.");
  assert(result[0]?.date === input.firstObservationDate && result.at(-1)?.date === input.lastObservationDate,
    "Observation bounds mismatch.");
  return Object.freeze(result);
}

function buildTechnicalRows(input: readonly { readonly date: string; readonly value: number }[]) {
  const rows: TechnicalRow[] = [];
  for (let index = WARMUP - 1; index < input.length; index += 1) {
    const window = input.slice(Math.max(0, index - eurusdProfile.historyLimit + 1), index + 1);
    const technical = calculateMarketTechnicalIntelligence({
      profile: eurusdProfile,
      closes: window.map((observation) => observation.value),
    });
    for (const [name, value] of Object.entries(technical)) {
      assert(value !== null && Number.isFinite(value), `Non-finite ${name} at ${input[index]!.date}`);
    }
    const previous = input[index - 1]!.value;
    const dailyLogReturn = Math.log(input[index]!.value / previous);
    assert(Number.isFinite(dailyLogReturn), `Non-finite daily return at ${input[index]!.date}`);
    rows.push({ index, date: input[index]!.date, dailyLogReturn, technical: technical as Technical });
  }
  return Object.freeze(rows);
}

function deriveCalibrationCandidate(rows: readonly TechnicalRow[]): MarketAssetProfile {
  const metric = (select: (technical: Technical) => number) => rows.map((row) => select(row.technical));
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
      toleranceRatio: Math.max(0.0001, rounded(quantile(fastRelativeDistance, 0.01), 0.0001)),
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
    weights: { volatility: 0.2, rsi: 0.15, roc: 0.2, macd: 0.15, emaMedium: 0.15, emaSlow: 0.15 },
    volatility: thresholdPair(volatility, 0.7, 0.92, 0.5),
    rsi: {
      stretchedLow: rounded(quantile(rsi, 0.2), 1),
      stretchedHigh: rounded(quantile(rsi, 0.8), 1),
      severity: severity(),
    },
    roc: thresholdPair(roc, 0.7, 0.92, 0.1),
    macd: {
      highThreshold: Math.max(0.0005, rounded(quantile(histogram, 0.85), 0.0005)),
      lowSeverity: 0.2,
      highSeverity: 1,
    },
    emaMedium: thresholdPair(emaMedium, 0.7, 0.92, 0.1),
    emaSlow: thresholdPair(emaSlow, 0.7, 0.92, 0.1),
  };
  return {
    ...eurusdProfile,
    signal: { bullishThreshold: 0.99, bearishThreshold: -0.99, neutralThreshold: 0, calibration: signalCalibration },
    risk: { low: 0.15, moderate: 0.55, high: 0.9, calibration: riskCalibration },
  };
}

function deriveClassificationBands(profile: MarketAssetProfile, calibration: ReturnType<typeof evaluate>): MarketAssetProfile {
  const scores = calibration.rows.map((row) => row.signal.score);
  const positive = scores.filter((value) => value > 0);
  const negative = scores.filter((value) => value < 0).map(Math.abs);
  const magnitude = scores.map(Math.abs);
  const risk = calibration.rows.map((row) => row.risk.score);
  const neutral = Math.max(0.05, rounded(quantile(magnitude, 0.2), 0.05));
  const bullish = Math.max(neutral + 0.05, rounded(quantile(positive, 0.6), 0.05));
  const bearish = -Math.max(neutral + 0.05, rounded(quantile(negative, 0.6), 0.05));
  const moderateStrength = Math.max(neutral + 0.05, rounded(quantile(magnitude, 0.4), 0.05));
  const strongStrength = Math.max(moderateStrength + 0.05, rounded(quantile(magnitude, 0.75), 0.05));
  const low = rounded(quantile(risk, 0.2), 0.05);
  const moderate = Math.max(low + 0.05, rounded(quantile(risk, 0.4), 0.05));
  const high = Math.max(moderate + 0.05, rounded(quantile(risk, 0.8), 0.05));
  return {
    ...profile,
    signal: {
      ...profile.signal,
      bullishThreshold: bullish,
      bearishThreshold: bearish,
      neutralThreshold: neutral,
      calibration: { ...profile.signal.calibration!, strength: {
        moderateThreshold: moderateStrength,
        strongThreshold: strongStrength,
      } },
    },
    risk: { ...profile.risk, low, moderate, high },
  };
}

function evaluate(rows: readonly TechnicalRow[], profile: MarketAssetProfile) {
  const evaluated: EvaluatedRow[] = [];
  for (const row of rows) {
    const risk = calculateMarketRisk({ profile, indicators: row.technical });
    const signal = calculateMarketSignal({ profile, indicators: { ...row.technical, riskScore: risk.score } });
    assert(Number.isFinite(risk.score) && Number.isFinite(signal.score) && Number.isFinite(signal.confidence),
      `Non-finite Engine result at ${row.date}`);
    evaluated.push({ index: row.index, date: row.date, technical: row.technical, risk, signal });
  }
  return {
    rows: Object.freeze(evaluated),
    confidence: evaluated.map((row) => row.signal.confidence),
    bands: {
      signal: shares(evaluated.map((row) => row.signal.direction)),
      strength: shares(evaluated.map((row) => row.signal.strength)),
      risk: shares(evaluated.map((row) => row.risk.level)),
    },
    riskComponents: riskComponentShares(rows, profile),
    signalComponents: signalContributionReport(rows, profile),
  };
}

function distributionReport(rows: readonly TechnicalRow[]) {
  const metric = (select: (row: TechnicalRow) => number) => stats(rows.map(select));
  return {
    level: metric((row) => row.technical.price),
    dailyLogReturn: metric((row) => row.dailyLogReturn),
    signedRoc10: metric((row) => row.technical.roc),
    absoluteRoc10: metric((row) => Math.abs(row.technical.roc)),
    annualizedVolatility20: metric((row) => row.technical.annualizedVolatility),
    rsi14: metric((row) => row.technical.rsi),
    macd: metric((row) => row.technical.macd),
    macdSignal: metric((row) => row.technical.macdSignal),
    macdHistogram: metric((row) => row.technical.macdHistogram),
    ema20: metric((row) => row.technical.emaFast),
    ema50: metric((row) => row.technical.emaMedium),
    ema200: metric((row) => row.technical.emaSlow),
    percentageDistanceEma50: metric((row) => row.technical.priceVsEmaMedium),
    percentageDistanceEma200: metric((row) => row.technical.priceVsEmaSlow),
  };
}

function riskComponentShares(rows: readonly Pick<TechnicalRow, "technical">[], profile: MarketAssetProfile) {
  const c = profile.risk.calibration!;
  return {
    volatility: shares(rows.map((row) => band3(row.technical.annualizedVolatility, c.volatility.moderateThreshold, c.volatility.highThreshold))),
    rsi: shares(rows.map((row) => row.technical.rsi <= profile.technical.rsi.oversold || row.technical.rsi >= profile.technical.rsi.overbought
      ? "high" : row.technical.rsi < c.rsi.stretchedLow || row.technical.rsi > c.rsi.stretchedHigh ? "moderate" : "low")),
    roc: shares(rows.map((row) => band3(Math.abs(row.technical.roc), c.roc.moderateThreshold, c.roc.highThreshold))),
    macd: shares(rows.map((row) => Math.abs(row.technical.macdHistogram) >= c.macd.highThreshold ? "high" : "low")),
    emaMedium: shares(rows.map((row) => band3(Math.abs(row.technical.priceVsEmaMedium), c.emaMedium.moderateThreshold, c.emaMedium.highThreshold))),
    emaSlow: shares(rows.map((row) => band3(Math.abs(row.technical.priceVsEmaSlow), c.emaSlow.moderateThreshold, c.emaSlow.highThreshold))),
  };
}

function signalContributionReport(rows: readonly Pick<TechnicalRow, "technical">[], profile: MarketAssetProfile) {
  const contributions = { ema: [] as number[], rsi: [] as number[], macd: [] as number[], roc: [] as number[] };
  for (const row of rows) {
    const value = signalContributions(row.technical, profile);
    contributions.ema.push(value.ema);
    contributions.rsi.push(value.rsi);
    contributions.macd.push(value.macd);
    contributions.roc.push(value.roc);
  }
  return Object.fromEntries(Object.entries(contributions).map(([name, values]) => [name, {
    distribution: stats(values),
    directionShares: shares(values.map((value) => value > 0 ? "positive" : value < 0 ? "negative" : "neutral")),
  }]));
}

function signalContributions(t: Technical, profile: MarketAssetProfile) {
  const c = profile.signal.calibration!;
  const tolerance = (reference: number) => Math.max(Math.abs(reference) * c.ema.toleranceRatio, c.ema.minimumTolerance);
  const above = (value: number, reference: number) => value > reference + tolerance(reference);
  const below = (value: number, reference: number) => value < reference - tolerance(reference);
  const bull = [above(t.price, t.emaFast), above(t.price, t.emaMedium), above(t.price, t.emaSlow)].filter(Boolean).length;
  const bear = [below(t.price, t.emaFast), below(t.price, t.emaMedium), below(t.price, t.emaSlow)].filter(Boolean).length;
  const fullBull = above(t.price, t.emaFast) && above(t.emaFast, t.emaMedium) && above(t.emaMedium, t.emaSlow);
  const fullBear = below(t.price, t.emaFast) && below(t.emaFast, t.emaMedium) && below(t.emaMedium, t.emaSlow);
  const ema = fullBull ? c.weights.ema : fullBear ? -c.weights.ema : bull === 3 ? c.weights.ema * c.ema.allAveragesMultiplier
    : bear === 3 ? -c.weights.ema * c.ema.allAveragesMultiplier : bull >= 2 ? c.weights.ema * c.ema.moderateBiasMultiplier
    : bear >= 2 ? -c.weights.ema * c.ema.moderateBiasMultiplier : 0;
  const rsi = t.rsi >= profile.technical.rsi.overbought ? c.weights.rsi * c.rsi.extremeMultiplier
    : t.rsi >= profile.technical.rsi.neutralHigh ? c.weights.rsi
    : t.rsi > profile.technical.rsi.neutralLow ? 0
    : t.rsi > profile.technical.rsi.oversold ? -c.weights.rsi
    : -c.weights.rsi * c.rsi.extremeMultiplier;
  const macd = t.macd > c.macd.epsilon && t.macd > t.macdSignal + c.macd.epsilon && t.macdHistogram > c.macd.epsilon
    ? c.weights.macd : t.macd < -c.macd.epsilon && t.macd < t.macdSignal - c.macd.epsilon && t.macdHistogram < -c.macd.epsilon
    ? -c.weights.macd : t.macd > c.macd.epsilon ? c.weights.macd * c.macd.zeroBiasMultiplier
    : t.macd < -c.macd.epsilon ? -c.weights.macd * c.macd.zeroBiasMultiplier : 0;
  const magnitude = Math.abs(t.roc);
  const multiplier = magnitude >= c.roc.strongThreshold ? c.roc.strongMultiplier
    : magnitude > c.roc.directionalThreshold ? c.roc.directionalMultiplier : magnitude > 0 ? c.roc.mildMultiplier : 0;
  const roc = Math.sign(t.roc) * c.weights.roc * multiplier;
  return { ema, rsi, macd, roc };
}

function contiguousBlocks(rows: readonly EvaluatedRow[], profile: MarketAssetProfile) {
  const groups = new Map<string, EvaluatedRow[]>();
  for (const row of rows) {
    const year = Number(row.date.slice(0, 4));
    const start = 1999 + Math.floor((year - 1999) / 3) * 3;
    const label = `${start}-${start + 2}`;
    groups.set(label, [...(groups.get(label) ?? []), row]);
  }
  return Object.fromEntries([...groups].map(([label, values]) => [label, {
    observations: values.length,
    signal: shares(values.map((row) => row.signal.direction)),
    strength: shares(values.map((row) => row.signal.strength)),
    risk: shares(values.map((row) => row.risk.level)),
    technicalBehavior: {
      volatility20: robustnessStats(values.map((row) => row.technical.annualizedVolatility)),
      absoluteRoc10: robustnessStats(values.map((row) => Math.abs(row.technical.roc))),
      absoluteMacdHistogram: robustnessStats(values.map((row) => Math.abs(row.technical.macdHistogram))),
      absoluteEma50Distance: robustnessStats(values.map((row) => Math.abs(row.technical.priceVsEmaMedium))),
      absoluteEma200Distance: robustnessStats(values.map((row) => Math.abs(row.technical.priceVsEmaSlow))),
    },
    riskComponents: riskComponentShares(values, profile),
    signalComponentActivation: signalComponentActivation(values, profile),
  }]));
}

function assessAcceptance(profile: MarketAssetProfile, calibration: ReturnType<typeof evaluate>, validation: ReturnType<typeof evaluate>,
  subperiods: { calibration: ReturnType<typeof contiguousBlocks>; validation: ReturnType<typeof contiguousBlocks> },
  drift: ReturnType<typeof bandDrift>, gapAudit: ReturnType<typeof publicationGapAudit>, deterministic: boolean) {
  const failures: string[] = [];
  const signalWeights = Object.values(profile.signal.calibration!.weights);
  const riskWeights = Object.values(profile.risk.calibration!.weights);
  if ([...signalWeights, ...riskWeights].some((value) => !Number.isFinite(value) || value < 0)) failures.push("invalid weights");
  if (signalWeights.reduce((a, b) => a + b, 0) <= 0 || riskWeights.reduce((a, b) => a + b, 0) <= 0) failures.push("non-positive weight total");
  if (!calibrationInvariants(profile)) failures.push("threshold/severity ordering");
  for (const [group, bands] of Object.entries(drift)) {
    for (const [band, result] of Object.entries(bands)) {
      if (result.calibration > 0.9 && result.validation > 0.9) failures.push(`${group}.${band} dominates both samples`);
      if (result.absoluteDrift > 0.1) failures.push(`${group}.${band} drift=${result.absoluteDrift}`);
    }
  }
  for (const factor of Object.keys(calibration.riskComponents)) {
    const left = calibration.riskComponents[factor as keyof typeof calibration.riskComponents];
    const right = validation.riskComponents[factor as keyof typeof validation.riskComponents];
    for (const band of new Set([...Object.keys(left), ...Object.keys(right)])) {
      if ((left[band] ?? 0) > 0.95 && (right[band] ?? 0) > 0.95) failures.push(`${factor}.${band} stuck in both samples`);
    }
  }
  for (const factor of Object.keys(calibration.signalComponents)) {
    const left = calibration.signalComponents[factor as keyof typeof calibration.signalComponents].directionShares;
    const right = validation.signalComponents[factor as keyof typeof validation.signalComponents].directionShares;
    for (const band of new Set([...Object.keys(left), ...Object.keys(right)])) {
      if ((left[band] ?? 0) > 0.95 && (right[band] ?? 0) > 0.95) failures.push(`${factor}.${band} stuck in both samples`);
    }
  }
  for (const [sample, blocks] of Object.entries(subperiods)) {
    for (const [block, result] of Object.entries(blocks)) {
      if (result.observations < 600) continue;
      if (Object.values(result.signal).some((share) => share > 0.95)) failures.push(`${sample}.${block} Signal degeneracy`);
      if (Object.values(result.risk).some((share) => share > 0.95)) failures.push(`${sample}.${block} Risk degeneracy`);
    }
  }
  if (!gapAudit.noClassificationArtifact) failures.push("ECB publication-gap classification artifact");
  if (!deterministic) failures.push("non-deterministic evaluation");
  return { accepted: failures.length === 0, failures };
}

function bandDrift(calibration: ReturnType<typeof evaluate>, validation: ReturnType<typeof evaluate>) {
  return Object.fromEntries((["signal", "strength", "risk"] as const).map((group) => [group,
    Object.fromEntries([...new Set([
      ...Object.keys(calibration.bands[group]), ...Object.keys(validation.bands[group]),
    ])].sort().map((band) => {
      const left = calibration.bands[group][band] ?? 0;
      const right = validation.bands[group][band] ?? 0;
      return [band, { calibration: left, validation: right, absoluteDrift: rounded(Math.abs(left - right), 0.0001) }];
    })),
  ])) as Readonly<Record<"signal" | "strength" | "risk", Readonly<Record<string, {
    readonly calibration: number; readonly validation: number; readonly absoluteDrift: number;
  }>>>>;
}

function publicationGapAudit(
  input: readonly { readonly date: string }[],
  calibration: readonly EvaluatedRow[],
  validation: readonly EvaluatedRow[],
) {
  const summarize = (rows: readonly EvaluatedRow[], minimumGapDays: number) => {
    const afterGap = rows.filter((row) => row.index > 0 &&
      Math.round((parseDate(input[row.index]!.date) - parseDate(input[row.index - 1]!.date)) / 86_400_000) >= minimumGapDays);
    const finiteOutputs = afterGap.filter((row) => Number.isFinite(row.signal.score) &&
      Number.isFinite(row.signal.confidence) && Number.isFinite(row.risk.score)).length;
    return {
      observations: afterGap.length,
      finiteOutputs,
      signal: shares(afterGap.map((row) => row.signal.direction)),
      risk: shares(afterGap.map((row) => row.risk.level)),
    };
  };
  const calibrationAny = summarize(calibration, 2);
  const validationAny = summarize(validation, 2);
  const calibrationExtended = summarize(calibration, 4);
  const validationExtended = summarize(validation, 4);
  const nonDegenerate = (result: ReturnType<typeof summarize>) => result.observations === 0 ||
    Object.values(result.signal).every((share) => share <= 0.95) && Object.values(result.risk).every((share) => share <= 0.95);
  return {
    definition: "Rows following a real gap in normalized ECB observations; extended gaps are at least four calendar days.",
    calibration: { anyGap: calibrationAny, extendedGap: calibrationExtended },
    validation: { anyGap: validationAny, extendedGap: validationExtended },
    noClassificationArtifact:
      calibrationAny.finiteOutputs === calibrationAny.observations &&
      validationAny.finiteOutputs === validationAny.observations &&
      calibrationExtended.finiteOutputs === calibrationExtended.observations &&
      validationExtended.finiteOutputs === validationExtended.observations &&
      nonDegenerate(calibrationExtended) && nonDegenerate(validationExtended),
  };
}

function structuralRegimeShift(calibration: readonly TechnicalRow[], validation: readonly TechnicalRow[]) {
  const compare = (select: (row: TechnicalRow) => number) => {
    const left = stats(calibration.map(select));
    const right = stats(validation.map(select));
    return {
      calibrationMean: left.mean,
      validationMean: right.mean,
      relativeMeanChange: rounded((right.mean - left.mean) / Math.abs(left.mean), 0.0001),
      calibrationMedian: left.median,
      validationMedian: right.median,
    };
  };
  return {
    annualizedVolatility20: compare((row) => row.technical.annualizedVolatility),
    absoluteRoc10: compare((row) => Math.abs(row.technical.roc)),
    absoluteMacdHistogram: compare((row) => Math.abs(row.technical.macdHistogram)),
    absoluteEma50Distance: compare((row) => Math.abs(row.technical.priceVsEmaMedium)),
    absoluteEma200Distance: compare((row) => Math.abs(row.technical.priceVsEmaSlow)),
    interpretation: "Validation is a structurally lower-volatility/lower-dispersion regime; this documents, but does not waive, failed Risk-band drift gates.",
  };
}

function calibrationInvariants(profile: MarketAssetProfile) {
  const signal = profile.signal.calibration!;
  const risk = profile.risk.calibration!;
  const finiteNonNegative = (values: readonly number[]) => values.every((value) => Number.isFinite(value) && value >= 0);
  const monotonicSeverity = (value: { readonly low: number; readonly moderate: number; readonly high: number }) =>
    finiteNonNegative([value.low, value.moderate, value.high]) && value.low <= value.moderate && value.moderate <= value.high;
  const thresholdPairOrdered = (value: { readonly moderateThreshold: number; readonly highThreshold: number }) =>
    finiteNonNegative([value.moderateThreshold, value.highThreshold]) && value.moderateThreshold < value.highThreshold;
  return profile.signal.neutralThreshold >= 0 &&
    profile.signal.bearishThreshold < -profile.signal.neutralThreshold &&
    profile.signal.bullishThreshold > profile.signal.neutralThreshold &&
    finiteNonNegative([signal.ema.toleranceRatio, signal.ema.minimumTolerance, signal.ema.moderateBiasMultiplier,
      signal.ema.allAveragesMultiplier, signal.rsi.extremeMultiplier, signal.macd.epsilon, signal.macd.zeroBiasMultiplier,
      signal.roc.directionalThreshold, signal.roc.strongThreshold, signal.roc.mildMultiplier,
      signal.roc.directionalMultiplier, signal.roc.strongMultiplier, signal.strength.moderateThreshold,
      signal.strength.strongThreshold, signal.confidence.base, signal.confidence.directional, signal.confidence.riskPenalty]) &&
    signal.ema.moderateBiasMultiplier <= signal.ema.allAveragesMultiplier && signal.ema.allAveragesMultiplier <= 1 &&
    signal.rsi.extremeMultiplier <= 1 && signal.macd.zeroBiasMultiplier <= 1 &&
    signal.roc.directionalThreshold < signal.roc.strongThreshold &&
    signal.roc.mildMultiplier <= signal.roc.directionalMultiplier && signal.roc.directionalMultiplier <= signal.roc.strongMultiplier &&
    signal.strength.moderateThreshold < signal.strength.strongThreshold &&
    0 <= profile.risk.low && profile.risk.low < profile.risk.moderate &&
    profile.risk.moderate < profile.risk.high && profile.risk.high <= 1 &&
    thresholdPairOrdered(risk.volatility) && monotonicSeverity(risk.volatility.severity) &&
    profile.technical.rsi.oversold < risk.rsi.stretchedLow && risk.rsi.stretchedLow < risk.rsi.stretchedHigh &&
    risk.rsi.stretchedHigh < profile.technical.rsi.overbought && monotonicSeverity(risk.rsi.severity) &&
    thresholdPairOrdered(risk.roc) && monotonicSeverity(risk.roc.severity) &&
    finiteNonNegative([risk.macd.highThreshold, risk.macd.lowSeverity, risk.macd.highSeverity]) &&
    risk.macd.lowSeverity <= risk.macd.highSeverity &&
    thresholdPairOrdered(risk.emaMedium) && monotonicSeverity(risk.emaMedium.severity) &&
    thresholdPairOrdered(risk.emaSlow) && monotonicSeverity(risk.emaSlow.severity);
}

function robustnessStats(values: readonly number[]) {
  return {
    finiteCount: values.length,
    mean: rounded(values.reduce((sum, value) => sum + value, 0) / values.length, 0.000001),
    median: rounded(quantile(values, 0.5), 0.000001),
    percentile90: rounded(quantile(values, 0.9), 0.000001),
  };
}

function signalComponentActivation(rows: readonly Pick<TechnicalRow, "technical">[], profile: MarketAssetProfile) {
  const names = ["ema", "rsi", "macd", "roc"] as const;
  const values = rows.map((row) => signalContributions(row.technical, profile));
  return Object.fromEntries(names.map((name) => [name, shares(values.map((value) =>
    value[name] > 0 ? "positive" : value[name] < 0 ? "negative" : "neutral"))]));
}

function stats(values: readonly number[]) {
  assert(values.length > 0 && values.every(Number.isFinite), "Statistics contain non-finite values.");
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.length > 1 ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1) : 0;
  const median = quantile(values, 0.5);
  const mad = quantile(values.map((value) => Math.abs(value - median)), 0.5);
  return {
    finiteCount: values.length,
    mean: rounded(mean, 0.000001),
    standardDeviation: rounded(Math.sqrt(variance), 0.000001),
    median: rounded(median, 0.000001),
    mad: rounded(mad, 0.000001),
    quantiles: Object.fromEntries(QUANTILES.map((q) => [String(q * 100), rounded(quantile(values, q), 0.000001)])),
  };
}

function gapStatistics(input: readonly { readonly date: string }[]) {
  let gapPairs = 0, omittedCalendarDays = 0, omittedWeekdays = 0, largestCalendarGapDays = 0;
  for (let index = 1; index < input.length; index += 1) {
    const previous = parseDate(input[index - 1]!.date);
    const current = parseDate(input[index]!.date);
    const days = Math.round((current - previous) / 86_400_000);
    largestCalendarGapDays = Math.max(largestCalendarGapDays, days);
    if (days <= 1) continue;
    gapPairs += 1;
    omittedCalendarDays += days - 1;
    for (let cursor = previous + 86_400_000; cursor < current; cursor += 86_400_000) {
      const day = new Date(cursor).getUTCDay();
      if (day !== 0 && day !== 6) omittedWeekdays += 1;
    }
  }
  return { gapPairs, omittedCalendarDays, omittedWeekdays, largestCalendarGapDays };
}

function thresholdPair(values: readonly number[], moderateQ: number, highQ: number, step: number) {
  const moderateThreshold = Math.max(step, rounded(quantile(values, moderateQ), step));
  const highThreshold = Math.max(moderateThreshold + step, rounded(quantile(values, highQ), step));
  return { moderateThreshold, highThreshold, severity: severity() };
}
function severity() { return { low: 0.2, moderate: 0.6, high: 1 }; }
function band3(value: number, moderate: number, high: number) { return value >= high ? "high" : value >= moderate ? "moderate" : "low"; }
function shares(values: readonly string[]): Readonly<Record<string, number>> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.freeze(Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => [key, rounded(count / values.length, 0.0001)])));
}
function quantile(values: readonly number[], q: number) {
  assert(values.length > 0, "Cannot calculate an empty quantile.");
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position), upper = Math.ceil(position);
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
}
function rounded(value: number, step: number) { return Number((Math.round(value / step) * step).toFixed(10)); }
function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  assert(match !== null, `Malformed date: ${value}`);
  const timestamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  assert(new Date(timestamp).toISOString().slice(0, 10) === value, `Invalid calendar date: ${value}`);
  return timestamp;
}
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
