import {
  assetRegistry,
  type MarketAssetId,
} from "../core/assets";
import { marketAssetProfiles } from "../core/assetProfiles";
import type {
  AssetClass,
  CandleInterval,
  MarketDataStatus,
} from "../core/types";
import { activeCrossAssetRelationshipsV1 } from "../engine/crossAssetRelationships";
import {
  getHistoricalMarketData,
  type HistoricalMarketResult,
} from "./historicalMarketData";

export const CANONICAL_MARKET_SNAPSHOT_SCHEMA_VERSION_V1 =
  "canonical-market-snapshot-v1" as const;

export const CANONICAL_MARKET_ASSET_IDS = Object.freeze(
  Object.keys(assetRegistry) as MarketAssetId[],
);

export interface CanonicalMarketObservationV1 {
  /** Unix timestamp in seconds. */
  readonly timestamp: number;
  readonly close: number;
}

export type CanonicalMarketSnapshotHistoryV1 =
  | {
      readonly kind: "range";
      readonly range: string;
      readonly minimumObservationCount?: number;
    }
  | {
      readonly kind: "required-observations";
      readonly requiredObservationCount: number;
      /** Uses the existing historical service's `max` range when omitted. */
      readonly range?: string;
    };

export interface CanonicalMarketSnapshotRequestV1 {
  readonly assetIds: readonly MarketAssetId[];
  readonly interval: CandleInterval;
  readonly history: CanonicalMarketSnapshotHistoryV1;
}

export interface NormalizedCanonicalMarketSnapshotRequestV1 {
  readonly assetIds: readonly MarketAssetId[];
  readonly interval: CandleInterval;
  readonly range: string;
  readonly minimumObservationCount: number;
}

export interface CanonicalMarketSnapshotProvenanceV1 {
  readonly source: HistoricalMarketResult["source"];
  readonly provider: string | null;
  readonly requestedSymbol: string;
  readonly interval: CandleInterval;
  readonly fetchedAt?: number;
  readonly sourceTimestamp?: number;
}

export interface CanonicalMarketSnapshotAssetV1 {
  readonly assetId: MarketAssetId;
  readonly symbol: string;
  readonly assetClass: AssetClass;
  readonly interval: CandleInterval;
  readonly observations: readonly CanonicalMarketObservationV1[];
  readonly observationCount: number;
  readonly earliestTimestamp?: number;
  readonly latestTimestamp?: number;
  readonly provenance?: CanonicalMarketSnapshotProvenanceV1;
  readonly availability: "available" | "unavailable";
  readonly status: MarketDataStatus;
  readonly reason?: string;
}

export interface CanonicalMarketSnapshotV1 {
  readonly schemaVersion: typeof CANONICAL_MARKET_SNAPSHOT_SCHEMA_VERSION_V1;
  readonly computedAt: string;
  readonly requestedAssetIds: readonly MarketAssetId[];
  readonly assets: readonly CanonicalMarketSnapshotAssetV1[];
  readonly availability: "available" | "partial" | "unavailable";
  readonly reason?: string;
}

export type CanonicalHistoricalMarketDataLoaderV1 = (
  symbol: string,
  range: string,
  interval: CandleInterval,
  assetClass: AssetClass,
) => Promise<HistoricalMarketResult>;

export interface CanonicalMarketSnapshotDependenciesV1 {
  readonly loadHistoricalMarketData?: CanonicalHistoricalMarketDataLoaderV1;
  readonly now?: () => Date;
}

/**
 * Validates, de-duplicates, and places asset IDs in registry-defined canonical order.
 */
export function normalizeCanonicalMarketSnapshotRequestV1(
  request: CanonicalMarketSnapshotRequestV1,
): NormalizedCanonicalMarketSnapshotRequestV1 {
  const assetIds = normalizeAssetIds(request.assetIds);
  const range = request.history.range?.trim() ?? "max";
  const minimumObservationCount = request.history.kind === "required-observations"
    ? request.history.requiredObservationCount
    : request.history.minimumObservationCount ?? 1;

  if (!isCandleInterval(request.interval)) {
    throw new TypeError("Canonical market snapshot interval is invalid.");
  }

  if (range.length === 0) {
    throw new TypeError("Canonical market snapshot range is invalid.");
  }

  if (!Number.isInteger(minimumObservationCount) || minimumObservationCount <= 0) {
    throw new TypeError("Canonical market snapshot history requirement is invalid.");
  }

  return Object.freeze({
    assetIds,
    interval: request.interval,
    range,
    minimumObservationCount,
  });
}

/**
 * Pure close-series normalization. Gaps are retained; no values are synthesized.
 */
export function normalizeCanonicalMarketObservationsV1(
  observations: readonly CanonicalMarketObservationV1[],
): readonly CanonicalMarketObservationV1[] {
  const ordered = observations.map((observation) => {
    if (
      !Number.isFinite(observation.timestamp) ||
      !Number.isFinite(observation.close) ||
      observation.close <= 0
    ) {
      throw new TypeError("Canonical market observation is invalid.");
    }

    return Object.freeze({
      timestamp: observation.timestamp,
      close: observation.close,
    });
  }).sort((left, right) => left.timestamp - right.timestamp);
  const normalized: CanonicalMarketObservationV1[] = [];

  for (const observation of ordered) {
    const previous = normalized.at(-1);

    if (previous?.timestamp === observation.timestamp) {
      if (previous.close !== observation.close) {
        throw new TypeError(
          "Canonical market observations contain conflicting duplicate timestamps.",
        );
      }

      continue;
    }

    normalized.push(observation);
  }

  return Object.freeze(normalized);
}

/**
 * Resolves target assets plus reference assets for active approved relationships only.
 */
export function planCanonicalMarketSnapshotDependenciesV1(
  targetAssetIds: readonly MarketAssetId[],
): readonly MarketAssetId[] {
  const targets = normalizeAssetIds(targetAssetIds);
  const dependencies = new Set<MarketAssetId>(targets);
  const targetSet = new Set(targets);

  for (const relationship of activeCrossAssetRelationshipsV1) {
    if (targetSet.has(relationship.targetAssetId)) {
      dependencies.add(relationship.referenceAssetId);
    }
  }

  return Object.freeze(
    CANONICAL_MARKET_ASSET_IDS.filter((assetId) => dependencies.has(assetId)),
  );
}

/**
 * Creates a normalized point-in-time view without activating any analytics consumer.
 * The default loader reuses the historical service's existing 15-minute shared cache.
 */
export async function createCanonicalMarketSnapshotV1(
  request: CanonicalMarketSnapshotRequestV1,
  dependencies: CanonicalMarketSnapshotDependenciesV1 = {},
): Promise<CanonicalMarketSnapshotV1> {
  const normalizedRequest = normalizeCanonicalMarketSnapshotRequestV1(request);
  const computedAt = (dependencies.now ?? (() => new Date()))().toISOString();

  if (normalizedRequest.assetIds.length === 0) {
    return Object.freeze({
      schemaVersion: CANONICAL_MARKET_SNAPSHOT_SCHEMA_VERSION_V1,
      computedAt,
      requestedAssetIds: normalizedRequest.assetIds,
      assets: Object.freeze([]),
      availability: "unavailable",
      reason: "No canonical market assets were requested.",
    });
  }

  const loader = dependencies.loadHistoricalMarketData ?? defaultHistoricalLoader;
  const assets = await Promise.all(
    normalizedRequest.assetIds.map((assetId) => loadAsset(assetId, normalizedRequest, loader)),
  );
  const availableCount = assets.filter(
    (asset) => asset.availability === "available",
  ).length;

  return Object.freeze({
    schemaVersion: CANONICAL_MARKET_SNAPSHOT_SCHEMA_VERSION_V1,
    computedAt,
    requestedAssetIds: normalizedRequest.assetIds,
    assets: Object.freeze(assets),
    availability: availableCount === assets.length
      ? "available"
      : availableCount === 0
        ? "unavailable"
        : "partial",
  });
}

async function loadAsset(
  assetId: MarketAssetId,
  request: NormalizedCanonicalMarketSnapshotRequestV1,
  loader: CanonicalHistoricalMarketDataLoaderV1,
): Promise<CanonicalMarketSnapshotAssetV1> {
  const profile = marketAssetProfiles[assetId];
  const common = {
    assetId,
    symbol: profile.symbol,
    assetClass: profile.assetClass,
    interval: request.interval,
  } as const;

  let result: HistoricalMarketResult;

  try {
    result = await loader(
      profile.symbol,
      request.range,
      request.interval,
      profile.assetClass,
    );
  } catch {
    return unavailableAsset(common, "Historical market data request failed.");
  }

  const provenance = freezeProvenance(result, profile.symbol, request.interval);

  if (result.status === "unavailable") {
    return unavailableAsset(
      common,
      "Historical market data is unavailable.",
      provenance,
    );
  }

  let observations: readonly CanonicalMarketObservationV1[];

  try {
    observations = normalizeCanonicalMarketObservationsV1(
      result.candles.map((candle) => ({ timestamp: candle.time, close: candle.close })),
    );
  } catch {
    return unavailableAsset(
      common,
      "Historical market data contains invalid or conflicting observations.",
      provenance,
      result.status,
    );
  }

  if (observations.length < request.minimumObservationCount) {
    return Object.freeze({
      ...common,
      observations,
      observationCount: observations.length,
      ...observationBounds(observations),
      provenance,
      availability: "unavailable",
      status: result.status,
      reason: `At least ${request.minimumObservationCount} observations are required.`,
    });
  }

  return Object.freeze({
    ...common,
    observations,
    observationCount: observations.length,
    ...observationBounds(observations),
    provenance,
    availability: "available",
    status: result.status,
  });
}

function defaultHistoricalLoader(
  symbol: string,
  range: string,
  interval: CandleInterval,
  assetClass: AssetClass,
): Promise<HistoricalMarketResult> {
  return getHistoricalMarketData(symbol, range, interval, {
    assetClass,
    cacheMode: "shared",
  });
}

function unavailableAsset(
  common: Pick<CanonicalMarketSnapshotAssetV1, "assetId" | "symbol" | "assetClass" | "interval">,
  reason: string,
  provenance?: CanonicalMarketSnapshotProvenanceV1,
  status: MarketDataStatus = "unavailable",
): CanonicalMarketSnapshotAssetV1 {
  return Object.freeze({
    ...common,
    observations: Object.freeze([]),
    observationCount: 0,
    ...(provenance === undefined ? {} : { provenance }),
    availability: "unavailable",
    status,
    reason,
  });
}

function freezeProvenance(
  result: HistoricalMarketResult,
  requestedSymbol: string,
  interval: CandleInterval,
): CanonicalMarketSnapshotProvenanceV1 {
  return Object.freeze({
    source: result.source,
    provider: result.provider,
    requestedSymbol,
    interval,
    ...(result.provenance?.fetchedAt === undefined
      ? {}
      : { fetchedAt: result.provenance.fetchedAt }),
    ...(result.provenance?.sourceTimestamp === undefined
      ? {}
      : { sourceTimestamp: result.provenance.sourceTimestamp }),
  });
}

function observationBounds(
  observations: readonly CanonicalMarketObservationV1[],
): Pick<CanonicalMarketSnapshotAssetV1, "earliestTimestamp" | "latestTimestamp"> {
  const earliestTimestamp = observations.at(0)?.timestamp;
  const latestTimestamp = observations.at(-1)?.timestamp;

  return earliestTimestamp === undefined || latestTimestamp === undefined
    ? {}
    : { earliestTimestamp, latestTimestamp };
}

function normalizeAssetIds(assetIds: readonly MarketAssetId[]): readonly MarketAssetId[] {
  const requested = new Set<MarketAssetId>();

  for (const assetId of assetIds) {
    if (!isMarketAssetId(assetId)) {
      throw new TypeError("Canonical market snapshot contains an invalid asset ID.");
    }

    requested.add(assetId);
  }

  return Object.freeze(
    CANONICAL_MARKET_ASSET_IDS.filter((assetId) => requested.has(assetId)),
  );
}

function isMarketAssetId(value: unknown): value is MarketAssetId {
  return typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(assetRegistry, value);
}

function isCandleInterval(value: unknown): value is CandleInterval {
  return ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1wk", "1mo"].includes(
    value as CandleInterval,
  );
}
