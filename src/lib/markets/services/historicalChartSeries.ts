import "server-only";

import {
  CANONICAL_OBSERVATION_SERIES_SCHEMA_VERSION_V1,
  type CanonicalObservationSeriesV1,
  type CanonicalObservationValueV1,
} from "./canonicalObservationSeries";
import {
  getCanonicalEcbEstrSeriesV1,
} from "../providers/ecb/estrSeriesCache";
import {
  ECB_ESTR_SERIES_ID_V1,
} from "../providers/ecb/estrContract";
import {
  ECB_FX_REFERENCE_PRODUCTS_V1,
  selectEcbFxReferenceSeriesV1,
  type EcbFxReferenceSeriesBundleV1,
} from "../providers/ecb/fxReferenceSeries";
import {
  getCanonicalEcbFxReferenceSeriesBundleV1,
} from "../providers/ecb/fxReferenceSeriesCache";
import {
  getHistoricalRangeSupportV1,
  isHistoricalProductIdV1,
  isHistoricalRangeV1,
  projectHistoricalRangeV1,
  resolveHistoricalRangeRequestV1,
  type HistoricalProductIdV1,
  type HistoricalRangeRequestV1,
  type HistoricalRangeV1,
} from "./historicalRange";

export const HISTORICAL_CHART_SERIES_VERSION_V1 =
  "historical-chart-series-v1" as const;

export interface HistoricalPointV1 {
  /** Unix timestamp in seconds. */
  readonly timestamp: number;
  readonly value: number;
}

export interface HistoricalRangeResolutionV1 {
  readonly interval: "1d";
  readonly observedFrom: number;
  readonly observedTo: number;
  readonly completeness: "complete" | "partial";
}

export interface HistoricalProvenanceV1 {
  readonly provider: string;
  readonly sourceLabel: string;
  readonly sourceSeriesId: string;
  readonly sourceRole: "primary";
  readonly status: "end_of_day" | "stale";
  readonly fetchedAt: number;
  /** Latest included reference-date timestamp; not a publication timestamp. */
  readonly sourceTimestamp: number;
  readonly freshness: "not-assessed" | "stale";
  readonly normalization: "canonical-observation-series-v1";
}

export type HistoricalChartUnavailableReasonV1 =
  | "range-unsupported"
  | "source-unavailable"
  | "invalid-series"
  | "insufficient-observations";

export type HistoricalChartSeriesV1 =
  | {
      readonly version: typeof HISTORICAL_CHART_SERIES_VERSION_V1;
      readonly availability: "available";
      readonly productId: HistoricalProductIdV1;
      readonly valueKind: "fx-reference-rate" | "interest-rate-percent";
      readonly unit: string;
      readonly requested: HistoricalRangeRequestV1;
      readonly resolved: HistoricalRangeResolutionV1;
      readonly points: readonly HistoricalPointV1[];
      readonly provenance: HistoricalProvenanceV1;
    }
  | {
      readonly version: typeof HISTORICAL_CHART_SERIES_VERSION_V1;
      readonly availability: "unavailable";
      readonly productId: HistoricalProductIdV1;
      readonly requested: HistoricalRangeRequestV1;
      readonly reason: HistoricalChartUnavailableReasonV1;
      readonly lastKnownProvenance?: HistoricalProvenanceV1;
    };

export interface HistoricalChartSeriesOptionsV1 {
  /** Optional reference-date timestamp used to align history with Deep output. */
  readonly sourceTimestamp?: number;
}

export interface HistoricalChartSeriesDependenciesV1 {
  readonly loadFxBundle?: () => Promise<EcbFxReferenceSeriesBundleV1>;
  readonly loadEstrSeries?: () => Promise<CanonicalObservationSeriesV1>;
  /** Unix seconds used only when no canonical source timestamp is available. */
  readonly now?: () => number;
}

interface ValidatedHistoricalSourceV1 {
  readonly points: readonly HistoricalPointV1[];
  readonly metadata: CanonicalObservationSeriesV1["metadata"];
}

/**
 * Reads one existing canonical ECB source owner and applies an uncached,
 * identity-free range projection. No fallback provider is permitted.
 */
export async function getHistoricalChartSeriesV1(
  productCandidate: HistoricalProductIdV1,
  rangeCandidate: HistoricalRangeV1,
  options: HistoricalChartSeriesOptionsV1 = {},
  dependencies: HistoricalChartSeriesDependenciesV1 = {},
): Promise<HistoricalChartSeriesV1> {
  if (!isHistoricalProductIdV1(productCandidate)) {
    throw new TypeError("Historical product ID is invalid.");
  }

  if (!isHistoricalRangeV1(rangeCandidate)) {
    throw new TypeError("Historical range is invalid.");
  }

  const productId = productCandidate;
  const range = rangeCandidate;
  const requestedWithoutSource = () => resolveHistoricalRangeRequestV1(
    range,
    resolveFallbackAnchor(options.sourceTimestamp, dependencies.now),
  );

  if (getHistoricalRangeSupportV1(productId, range) === "unsupported") {
    return unavailableResult(productId, requestedWithoutSource(), "range-unsupported");
  }

  const loaded = await loadCanonicalSourceV1(productId, dependencies);

  if (loaded.kind === "unavailable") {
    return unavailableResult(productId, requestedWithoutSource(), "source-unavailable");
  }

  let source: ValidatedHistoricalSourceV1;

  try {
    source = validateCanonicalSourceV1(productId, loaded.series);
  } catch {
    return unavailableResult(productId, requestedWithoutSource(), "invalid-series");
  }

  const anchor = options.sourceTimestamp ?? source.metadata.sourceTimestamp;

  if (anchor === undefined || !Number.isFinite(anchor)) {
    return unavailableResult(productId, requestedWithoutSource(), "invalid-series");
  }

  const projection = projectHistoricalRangeV1(range, anchor, source.points);

  if (projection.points.length < 2) {
    return unavailableResult(
      productId,
      projection.requested,
      "insufficient-observations",
    );
  }

  const observedFrom = projection.points[0]!.timestamp;
  const observedTo = projection.points.at(-1)!.timestamp;
  const provenance = createProvenanceV1(source.metadata, observedTo);

  return Object.freeze({
    version: HISTORICAL_CHART_SERIES_VERSION_V1,
    availability: "available",
    productId,
    valueKind: productId === "estr"
      ? "interest-rate-percent"
      : "fx-reference-rate",
    unit: source.metadata.unit,
    requested: projection.requested,
    resolved: Object.freeze({
      interval: "1d",
      observedFrom,
      observedTo,
      completeness: projection.completeness,
    }),
    points: projection.points,
    provenance,
  });
}

async function loadCanonicalSourceV1(
  productId: HistoricalProductIdV1,
  dependencies: HistoricalChartSeriesDependenciesV1,
): Promise<
  | { readonly kind: "available"; readonly series: CanonicalObservationSeriesV1 }
  | { readonly kind: "unavailable" }
> {
  if (productId === "estr") {
    try {
      return {
        kind: "available",
        series: await (dependencies.loadEstrSeries ?? getCanonicalEcbEstrSeriesV1)(),
      };
    } catch {
      return { kind: "unavailable" };
    }
  }

  let bundle: EcbFxReferenceSeriesBundleV1;

  try {
    bundle = await (
      dependencies.loadFxBundle ?? getCanonicalEcbFxReferenceSeriesBundleV1
    )();
  } catch {
    return { kind: "unavailable" };
  }

  try {
    return {
      kind: "available",
      series: selectEcbFxReferenceSeriesV1(bundle, productId),
    };
  } catch {
    return {
      kind: "available",
      series: bundle[productId] as CanonicalObservationSeriesV1,
    };
  }
}

function validateCanonicalSourceV1(
  productId: HistoricalProductIdV1,
  series: CanonicalObservationSeriesV1,
): ValidatedHistoricalSourceV1 {
  if (
    typeof series !== "object" ||
    series === null ||
    series.schemaVersion !== CANONICAL_OBSERVATION_SERIES_SCHEMA_VERSION_V1 ||
    !Array.isArray(series.observations)
  ) {
    throw new TypeError("Canonical historical series shape is invalid.");
  }

  const expected = expectedSourceIdentityV1(productId);
  const metadata = series.metadata;

  if (
    typeof metadata !== "object" ||
    metadata === null ||
    metadata.provider !== "ecb" ||
    metadata.source !== "European Central Bank" ||
    metadata.seriesId !== expected.seriesId ||
    metadata.requestedProductId !== productId ||
    metadata.canonicalProductId !== productId ||
    metadata.interval !== "1d" ||
    metadata.unit !== expected.unit ||
    metadata.seriesKind !== "reference-rate" ||
    (metadata.status !== "end_of_day" && metadata.status !== "stale") ||
    !Number.isFinite(metadata.fetchedAt) ||
    !Number.isFinite(metadata.sourceTimestamp)
  ) {
    throw new TypeError("Canonical historical series identity is invalid.");
  }

  const points = normalizeHistoricalPointsV1(productId, series.observations);
  const latest = points.at(-1)?.timestamp;

  if (latest === undefined || latest !== metadata.sourceTimestamp) {
    throw new TypeError("Canonical historical source timestamp is inconsistent.");
  }

  return Object.freeze({ points, metadata });
}

function normalizeHistoricalPointsV1(
  productId: HistoricalProductIdV1,
  observations: readonly CanonicalObservationValueV1[],
): readonly HistoricalPointV1[] {
  const ordered = observations.map((observation) => {
    if (
      typeof observation !== "object" ||
      observation === null ||
      !Number.isFinite(observation.timestamp) ||
      !Number.isFinite(observation.value) ||
      (productId !== "estr" && observation.value <= 0)
    ) {
      throw new TypeError("Canonical historical observation is invalid.");
    }

    return Object.freeze({
      timestamp: observation.timestamp,
      value: observation.value,
    });
  }).sort((left, right) => left.timestamp - right.timestamp);
  const points: HistoricalPointV1[] = [];

  for (const point of ordered) {
    const previous = points.at(-1);

    if (previous?.timestamp === point.timestamp) {
      if (previous.value !== point.value) {
        throw new TypeError("Canonical history has conflicting duplicate evidence.");
      }

      continue;
    }

    points.push(point);
  }

  return Object.freeze(points);
}

function expectedSourceIdentityV1(productId: HistoricalProductIdV1): {
  readonly seriesId: string;
  readonly unit: string;
} {
  if (productId === "estr") {
    return {
      seriesId: ECB_ESTR_SERIES_ID_V1,
      unit: "percent",
    };
  }

  const product = ECB_FX_REFERENCE_PRODUCTS_V1[productId];

  return {
    seriesId: product.seriesId,
    unit: product.unit,
  };
}

function createProvenanceV1(
  metadata: CanonicalObservationSeriesV1["metadata"],
  sourceTimestamp: number,
): HistoricalProvenanceV1 {
  const status = metadata.status as "end_of_day" | "stale";

  return Object.freeze({
    provider: metadata.provider,
    sourceLabel: metadata.source,
    sourceSeriesId: metadata.seriesId,
    sourceRole: "primary",
    status,
    fetchedAt: metadata.fetchedAt,
    sourceTimestamp,
    freshness: status === "stale" ? "stale" : "not-assessed",
    normalization: CANONICAL_OBSERVATION_SERIES_SCHEMA_VERSION_V1,
  });
}

function unavailableResult(
  productId: HistoricalProductIdV1,
  requested: HistoricalRangeRequestV1,
  reason: HistoricalChartUnavailableReasonV1,
): HistoricalChartSeriesV1 {
  return Object.freeze({
    version: HISTORICAL_CHART_SERIES_VERSION_V1,
    availability: "unavailable",
    productId,
    requested,
    reason,
  });
}

function resolveFallbackAnchor(
  sourceTimestamp: number | undefined,
  now: (() => number) | undefined,
): number {
  const anchor = sourceTimestamp ?? (now ?? (() => Math.floor(Date.now() / 1000)))();

  if (!Number.isFinite(anchor)) {
    throw new TypeError("Historical source timestamp anchor must be finite.");
  }

  return anchor;
}
