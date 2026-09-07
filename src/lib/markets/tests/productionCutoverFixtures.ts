import { marketAssetProfiles } from "../core/assetProfiles";
import type { MarketAssetId } from "../core/assets";
import type { CanonicalMarketEvaluationV1 } from
  "../engine/marketEvaluationCoordinator";
import type { CanonicalMarketObservationV1 } from
  "../services/canonicalMarketSnapshot";

export const CUTOVER_COMPUTED_AT = "2026-09-07T12:00:00.000Z";

export function cutoverHistory(
  count: number,
  base: number,
): readonly CanonicalMarketObservationV1[] {
  return Object.freeze(
    Array.from({ length: count }, (_, index) =>
      Object.freeze({
        timestamp: 1_650_000_000 + index * 86_400,
        close: base + index * 0.2 + Math.sin(index / 11) * 0.1,
      }),
    ),
  );
}

export function cutoverEvaluation(
  assetId: "gold" | "oil",
  observations: readonly CanonicalMarketObservationV1[],
): CanonicalMarketEvaluationV1 {
  const profile = marketAssetProfiles[assetId];
  const asset = Object.freeze({
    assetId,
    symbol: profile.symbol,
    assetClass: profile.assetClass,
    interval: profile.defaultInterval,
    observations,
    observationCount: observations.length,
    ...(observations.at(0) === undefined
      ? {}
      : { earliestTimestamp: observations.at(0)!.timestamp }),
    ...(observations.at(-1) === undefined
      ? {}
      : { latestTimestamp: observations.at(-1)!.timestamp }),
    provenance: Object.freeze({
      source: "chronoverse" as const,
      provider: `offline-${assetId}-cutover-fixture`,
      requestedSymbol: profile.symbol,
      interval: profile.defaultInterval,
      fetchedAt: 1_780_000_000,
    }),
    availability: "available" as const,
    status: "end_of_day" as const,
  });

  return Object.freeze({
    schemaVersion: "canonical-market-evaluation-v1",
    availability: "available",
    computedAt: CUTOVER_COMPUTED_AT,
    requestedTargetAssetIds: Object.freeze([assetId]) as readonly MarketAssetId[],
    requiredObservationAssetIds: Object.freeze([assetId]) as readonly MarketAssetId[],
    historyPolicy: Object.freeze({
      targetTechnicalMinimumObservationCount: 200,
      crossAssetReferenceMinimumObservationCount: null,
      sharedMinimumObservationCount: 200,
      targetProfileHistoryLimit: profile.historyLimit,
      recommendedObservationCount: profile.historyLimit,
    }),
    snapshot: Object.freeze({
      schemaVersion: "canonical-market-snapshot-v1",
      computedAt: CUTOVER_COMPUTED_AT,
      requestedAssetIds: Object.freeze([assetId]) as readonly MarketAssetId[],
      assets: Object.freeze([asset]),
      availability: "available",
    }),
    crossAssetSections: Object.freeze({
      targetAssetIds: Object.freeze([assetId]) as readonly MarketAssetId[],
      sections: Object.freeze([
        Object.freeze({
          targetAssetId: assetId,
          crossAsset: Object.freeze({
            availability: "not-applicable" as const,
            reason: `No approved canonical Cross-Asset relationship is configured for ${assetId}.`,
          }),
        }),
      ]),
    }),
  });
}

export function assertDeep(
  actual: unknown,
  expected: unknown,
  label: string,
): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);

  if (actualJson !== expectedJson) {
    throw new Error(`${label}\nexpected ${expectedJson}\nreceived ${actualJson}`);
  }
}

export function assertEqual<T>(
  actual: T,
  expected: T,
  label: string,
): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}
