import type { MarketAssetId } from "../core/assets";
import type { EngineCrossAssetSectionV3 } from "./contracts";
import type { CanonicalMarketEvaluationV1 } from "./marketEvaluationCoordinator";

/** Returns the exact precomputed section; it performs no calculation or fetching. */
export function getPrecomputedCrossAssetForTargetV1(
  evaluation: CanonicalMarketEvaluationV1,
  targetAssetId: MarketAssetId,
): EngineCrossAssetSectionV3 {
  if (!evaluation.requestedTargetAssetIds.includes(targetAssetId)) {
    throw new TypeError("Cross-Asset handoff target was not requested by this evaluation.");
  }

  const matches = evaluation.crossAssetSections.sections.filter(
    (section) => section.targetAssetId === targetAssetId,
  );

  if (matches.length !== 1) {
    throw new TypeError("Cross-Asset handoff target is inconsistent in this evaluation.");
  }

  return matches[0]!.crossAsset;
}
