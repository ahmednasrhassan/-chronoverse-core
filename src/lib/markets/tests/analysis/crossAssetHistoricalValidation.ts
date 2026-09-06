import {
  calculateCrossAssetReferenceMoveV1,
  CROSS_ASSET_MINIMUM_CLOSES_V1,
} from "../../engine/crossAssetFeatures";

export interface DatedClose {
  readonly date: string;
  readonly close: number;
}

interface NumericSummary {
  readonly count: number;
  readonly mean: number | null;
  readonly median: number | null;
}

interface DirectionalSummary {
  readonly eligibleCount: number;
  readonly agreementCount: number;
  readonly agreementRate: number | null;
  readonly zeroReferenceCount: number;
  readonly zeroTargetCount: number;
}

interface ConditionalBinSummary extends NumericSummary {
  readonly meanSignAlignedReturn: number | null;
  readonly medianSignAlignedReturn: number | null;
}

interface ForwardPoint {
  readonly date: string;
  readonly referenceMoveScore: number;
  readonly targetForwardReturn: number;
}

export interface CrossAssetHistoricalValidationResult {
  readonly targetName: string;
  readonly referenceName: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly overlappingObservationCount: number;
  readonly validationSampleSize: number;
  readonly contemporaneous20: {
    readonly sampleSize: number;
    readonly pearsonCorrelation: number | null;
    readonly spearmanCorrelation: number | null;
  };
  readonly forward: Readonly<Record<5 | 20, {
    readonly sampleSize: number;
    readonly directional: DirectionalSummary;
    readonly scoreReturnPearson: number | null;
    readonly scoreReturnSpearman: number | null;
    readonly bins: {
      readonly positive: ConditionalBinSummary;
      readonly negative: ConditionalBinSummary;
      readonly neutral: ConditionalBinSummary;
    };
    readonly strongSignal: ConditionalBinSummary & DirectionalSummary;
    readonly rolling252: {
      readonly windowCount: number;
      readonly correlation: RangeSummary;
      readonly directionalAgreement: RangeSummary;
    };
  }>>;
  readonly periodStability: readonly {
    readonly period: string;
    readonly sampleSize: number;
    readonly agreement5: number | null;
    readonly agreement20: number | null;
    readonly contemporaneousCorrelation20: number | null;
  }[];
  readonly extremeDivergences20: readonly {
    readonly date: string;
    readonly referenceMoveScore: number;
    readonly targetForwardReturn: number;
  }[];
}

interface RangeSummary {
  readonly minimum: number | null;
  readonly median: number | null;
  readonly maximum: number | null;
}

export function alignDatedCloses(
  target: readonly DatedClose[],
  reference: readonly DatedClose[],
): { readonly target: readonly DatedClose[]; readonly reference: readonly DatedClose[] } {
  const targetByDate = validatedDateMap(target);
  const referenceByDate = validatedDateMap(reference);
  const dates = [...targetByDate.keys()]
    .filter((date) => referenceByDate.has(date))
    .sort(compareText);

  return {
    target: dates.map((date) => ({ date, close: targetByDate.get(date)! })),
    reference: dates.map((date) => ({ date, close: referenceByDate.get(date)! })),
  };
}

export function analyzeCrossAssetRelationship(
  targetName: string,
  referenceName: string,
  targetInput: readonly DatedClose[],
  referenceInput: readonly DatedClose[],
): CrossAssetHistoricalValidationResult {
  const aligned = alignDatedCloses(targetInput, referenceInput);

  if (aligned.target.length < CROSS_ASSET_MINIMUM_CLOSES_V1 + 20) {
    throw new Error(`${targetName} <- ${referenceName}: insufficient aligned history.`);
  }

  const targetCloses = aligned.target.map((observation) => observation.close);
  const referenceCloses = aligned.reference.map((observation) => observation.close);
  const contemporaneous = Array.from(
    { length: aligned.target.length - 20 },
    (_, offset) => {
      const index = offset + 20;
      return {
        date: aligned.target[index]!.date,
        target: Math.log(targetCloses[index]! / targetCloses[index - 20]!),
        reference: Math.log(referenceCloses[index]! / referenceCloses[index - 20]!),
      };
    },
  );
  const forward5 = buildForwardPoints(aligned.target, aligned.reference, 5);
  const forward20 = buildForwardPoints(aligned.target, aligned.reference, 20);
  const periods = [...new Set(forward20.map((point) => point.date.slice(0, 4)))];

  return {
    targetName,
    referenceName,
    startDate: aligned.target[0]!.date,
    endDate: aligned.target.at(-1)!.date,
    overlappingObservationCount: aligned.target.length,
    validationSampleSize: forward20.length,
    contemporaneous20: {
      sampleSize: contemporaneous.length,
      pearsonCorrelation: correlation(
        contemporaneous.map((point) => point.target),
        contemporaneous.map((point) => point.reference),
      ),
      spearmanCorrelation: spearman(
        contemporaneous.map((point) => point.target),
        contemporaneous.map((point) => point.reference),
      ),
    },
    forward: {
      5: summarizeForward(forward5),
      20: summarizeForward(forward20),
    },
    periodStability: periods.map((period) => {
      const points5 = forward5.filter((point) => point.date.startsWith(period));
      const points20 = forward20.filter((point) => point.date.startsWith(period));
      const periodContemporaneous = contemporaneous.filter((point) => point.date.startsWith(period));

      return {
        period,
        sampleSize: points20.length,
        agreement5: directional(points5).agreementRate,
        agreement20: directional(points20).agreementRate,
        contemporaneousCorrelation20: correlation(
          periodContemporaneous.map((point) => point.target),
          periodContemporaneous.map((point) => point.reference),
        ),
      };
    }),
    extremeDivergences20: forward20
      .filter((point) =>
        Math.abs(point.referenceMoveScore) >= 0.5 &&
        Math.sign(point.referenceMoveScore) !== Math.sign(point.targetForwardReturn) &&
        point.targetForwardReturn !== 0
      )
      .sort((left, right) =>
        Math.abs(right.targetForwardReturn) - Math.abs(left.targetForwardReturn) ||
        compareText(left.date, right.date)
      )
      .slice(0, 5),
  };
}

function buildForwardPoints(
  target: readonly DatedClose[],
  reference: readonly DatedClose[],
  forwardHorizon: 5 | 20,
): readonly ForwardPoint[] {
  const points: ForwardPoint[] = [];

  for (
    let index = CROSS_ASSET_MINIMUM_CLOSES_V1 - 1;
    index + forwardHorizon < target.length;
    index += 1
  ) {
    const referenceWindow = reference.slice(
      index - CROSS_ASSET_MINIMUM_CLOSES_V1 + 1,
      index + 1,
    );
    const move = calculateCrossAssetReferenceMoveV1({
      observations: referenceWindow.map((observation) => ({ close: observation.close })),
    });

    if (move.availability !== "available") {
      throw new Error(`Unexpected unusable reference window ending ${reference[index]!.date}.`);
    }

    points.push({
      date: target[index]!.date,
      referenceMoveScore: move.referenceMoveScore,
      targetForwardReturn: Math.log(
        target[index + forwardHorizon]!.close / target[index]!.close,
      ),
    });
  }

  return points;
}

function summarizeForward(points: readonly ForwardPoint[]) {
  const score = points.map((point) => point.referenceMoveScore);
  const response = points.map((point) => point.targetForwardReturn);
  const strong = points.filter((point) => Math.abs(point.referenceMoveScore) >= 0.5);

  return {
    sampleSize: points.length,
    directional: directional(points),
    scoreReturnPearson: correlation(score, response),
    scoreReturnSpearman: spearman(score, response),
    bins: {
      positive: conditional(points.filter((point) => point.referenceMoveScore > 0.25)),
      negative: conditional(points.filter((point) => point.referenceMoveScore < -0.25)),
      neutral: conditional(points.filter((point) => Math.abs(point.referenceMoveScore) <= 0.25)),
    },
    strongSignal: {
      ...conditional(strong),
      ...directional(strong),
    },
    rolling252: rollingSummary(points, 252),
  };
}

function conditional(points: readonly ForwardPoint[]): ConditionalBinSummary {
  const returns = points.map((point) => point.targetForwardReturn);
  const alignedReturns = points.map(
    (point) => Math.sign(point.referenceMoveScore) * point.targetForwardReturn,
  );

  return {
    ...numericSummary(returns),
    meanSignAlignedReturn: mean(alignedReturns),
    medianSignAlignedReturn: median(alignedReturns),
  };
}

function directional(points: readonly ForwardPoint[]): DirectionalSummary {
  const zeroReferenceCount = points.filter((point) => point.referenceMoveScore === 0).length;
  const zeroTargetCount = points.filter((point) => point.targetForwardReturn === 0).length;
  const eligible = points.filter((point) =>
    point.referenceMoveScore !== 0 && point.targetForwardReturn !== 0
  );
  const agreementCount = eligible.filter((point) =>
    Math.sign(point.referenceMoveScore) === Math.sign(point.targetForwardReturn)
  ).length;

  return {
    eligibleCount: eligible.length,
    agreementCount,
    agreementRate: eligible.length === 0 ? null : agreementCount / eligible.length,
    zeroReferenceCount,
    zeroTargetCount,
  };
}

function rollingSummary(points: readonly ForwardPoint[], window: number) {
  const correlations: number[] = [];
  const agreements: number[] = [];

  for (let end = window; end <= points.length; end += 1) {
    const slice = points.slice(end - window, end);
    const coefficient = correlation(
      slice.map((point) => point.referenceMoveScore),
      slice.map((point) => point.targetForwardReturn),
    );
    const agreement = directional(slice).agreementRate;

    if (coefficient !== null) correlations.push(coefficient);
    if (agreement !== null) agreements.push(agreement);
  }

  return {
    windowCount: Math.max(0, points.length - window + 1),
    correlation: rangeSummary(correlations),
    directionalAgreement: rangeSummary(agreements),
  };
}

function validatedDateMap(values: readonly DatedClose[]): Map<string, number> {
  const result = new Map<string, number>();

  for (const value of values) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value.date) ||
      !Number.isFinite(value.close) ||
      value.close <= 0 ||
      result.has(value.date)
    ) {
      throw new Error("Dated closes must have unique ISO dates and positive finite prices.");
    }
    result.set(value.date, value.close);
  }

  return result;
}

function correlation(left: readonly number[], right: readonly number[]): number | null {
  if (left.length !== right.length || left.length < 2) return null;
  const leftMean = mean(left)!;
  const rightMean = mean(right)!;
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index]! - leftMean;
    const rightDelta = right[index]! - rightMean;
    covariance += leftDelta * rightDelta;
    leftVariance += leftDelta ** 2;
    rightVariance += rightDelta ** 2;
  }

  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator === 0 || !Number.isFinite(denominator)
    ? null
    : covariance / denominator;
}

function spearman(left: readonly number[], right: readonly number[]): number | null {
  return correlation(ranks(left), ranks(right));
}

function ranks(values: readonly number[]): readonly number[] {
  const sorted = values
    .map((value, index) => ({ value, index }))
    .sort((left, right) => left.value - right.value || left.index - right.index);
  const output = new Array<number>(values.length);

  for (let start = 0; start < sorted.length;) {
    let end = start + 1;
    while (end < sorted.length && sorted[end]!.value === sorted[start]!.value) end += 1;
    const averageRank = (start + end - 1) / 2 + 1;
    for (let index = start; index < end; index += 1) output[sorted[index]!.index] = averageRank;
    start = end;
  }

  return output;
}

function numericSummary(values: readonly number[]): NumericSummary {
  return { count: values.length, mean: mean(values), median: median(values) };
}

function mean(values: readonly number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function rangeSummary(values: readonly number[]): RangeSummary {
  if (values.length === 0) return { minimum: null, median: null, maximum: null };
  return {
    minimum: Math.min(...values),
    median: median(values),
    maximum: Math.max(...values),
  };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
