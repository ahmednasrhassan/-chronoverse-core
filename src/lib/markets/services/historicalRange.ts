export const HISTORICAL_PRODUCT_IDS_V1 = Object.freeze([
  "eurusd",
  "eurjpy",
  "eurgbp",
  "eurchf",
  "estr",
] as const);

export type HistoricalProductIdV1 =
  (typeof HISTORICAL_PRODUCT_IDS_V1)[number];

export const HISTORICAL_RANGES_V1 = Object.freeze([
  "1d",
  "5d",
  "1mo",
  "3mo",
  "6mo",
  "1y",
  "2y",
  "5y",
  "max",
] as const);

export type HistoricalRangeV1 = (typeof HISTORICAL_RANGES_V1)[number];

export type HistoricalRangeSupportV1 =
  | "supported"
  | "conditional"
  | "unsupported";

export interface HistoricalRangeRequestV1 {
  readonly range: HistoricalRangeV1;
  readonly from: number;
  readonly to: number;
}

export interface HistoricalRangePointV1 {
  readonly timestamp: number;
}

export interface HistoricalRangeProjectionV1<
  TPoint extends HistoricalRangePointV1,
> {
  readonly requested: HistoricalRangeRequestV1;
  readonly points: readonly TPoint[];
  /**
   * Complete means the canonical source begins at or before requested.from.
   * The difference between observedTo and requested.to is not treated as a
   * gap because the anchor may be a weekend or official non-publication date.
   * Internal publication calendars are not inferred and points are never
   * synthesized.
   */
  readonly completeness: "complete" | "partial";
}

const FIXED_RANGE_SECONDS_V1 = Object.freeze({
  "1d": 86_400,
  "5d": 5 * 86_400,
  "1mo": 30 * 86_400,
  "3mo": 90 * 86_400,
  "6mo": 180 * 86_400,
  "1y": 365 * 86_400,
  "2y": 730 * 86_400,
  "5y": 1_825 * 86_400,
} as const satisfies Record<Exclude<HistoricalRangeV1, "max">, number>);

const FX_RANGE_SUPPORT_V1 = Object.freeze({
  "1d": "unsupported",
  "5d": "conditional",
  "1mo": "supported",
  "3mo": "supported",
  "6mo": "supported",
  "1y": "supported",
  "2y": "supported",
  "5y": "unsupported",
  max: "unsupported",
} as const satisfies Record<HistoricalRangeV1, HistoricalRangeSupportV1>);

const ESTR_RANGE_SUPPORT_V1 = Object.freeze({
  "1d": "unsupported",
  "5d": "conditional",
  "1mo": "supported",
  "3mo": "supported",
  "6mo": "supported",
  "1y": "supported",
  "2y": "supported",
  "5y": "supported",
  max: "supported",
} as const satisfies Record<HistoricalRangeV1, HistoricalRangeSupportV1>);

export function isHistoricalProductIdV1(
  value: unknown,
): value is HistoricalProductIdV1 {
  return HISTORICAL_PRODUCT_IDS_V1.includes(value as HistoricalProductIdV1);
}

export function isHistoricalRangeV1(value: unknown): value is HistoricalRangeV1 {
  return HISTORICAL_RANGES_V1.includes(value as HistoricalRangeV1);
}

export function getHistoricalRangeSupportV1(
  productId: HistoricalProductIdV1,
  range: HistoricalRangeV1,
): HistoricalRangeSupportV1 {
  return productId === "estr"
    ? ESTR_RANGE_SUPPORT_V1[range]
    : FX_RANGE_SUPPORT_V1[range];
}

export function resolveHistoricalRangeRequestV1(
  range: HistoricalRangeV1,
  to: number,
  availableFrom = 0,
): HistoricalRangeRequestV1 {
  requireFiniteTimestamp(to, "request anchor");
  requireFiniteTimestamp(availableFrom, "available-history boundary");

  return Object.freeze({
    range,
    from: range === "max"
      ? availableFrom
      : to - FIXED_RANGE_SECONDS_V1[range],
    to,
  });
}

/** Selects only observations inside the exact requested calendar window. */
export function projectHistoricalRangeV1<
  TPoint extends HistoricalRangePointV1,
>(
  range: HistoricalRangeV1,
  to: number,
  orderedSourcePoints: readonly TPoint[],
): HistoricalRangeProjectionV1<TPoint> {
  const sourceStart = orderedSourcePoints.at(0)?.timestamp;
  const availableFrom = range === "max" && sourceStart !== undefined && sourceStart <= to
    ? sourceStart
    : 0;
  const requested = resolveHistoricalRangeRequestV1(range, to, availableFrom);
  const points = orderedSourcePoints.filter((point) =>
    point.timestamp >= requested.from && point.timestamp <= requested.to
  );

  return Object.freeze({
    requested,
    points: Object.freeze(points),
    completeness: sourceStart !== undefined && sourceStart <= requested.from
      ? "complete"
      : "partial",
  });
}

function requireFiniteTimestamp(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`Historical ${label} must be finite.`);
  }
}
