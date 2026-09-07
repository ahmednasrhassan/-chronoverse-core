import {
  integrateCanonicalDecisionLifecycleV3,
} from "../../engine/decisionLifecycleRuntime";
import {
  coordinateCanonicalMarketEvaluationV1,
} from "../../engine/marketEvaluationCoordinator";
import {
  calculateMinimumTechnicalObservationCountV1,
  prepareAssetEvaluationV1,
} from "../../engine/preparedAssetEvaluation";
import {
  enrichEngineRegimeV1,
} from "../../engine/regimeEnrichment";
import {
  advanceCanonicalDecisionSnapshot,
} from "../../persistence/decisionSnapshotRedis";
import {
  getGoldMacroSnapshot,
  type GoldMacroSnapshot,
} from "./macro";
import {
  calculateGoldMacroScore,
} from "./macroScore";
import {
  goldProfile,
} from "./profile";
import {
  evaluatePreparedGoldV1,
  mapGoldCompatibilityV1,
  type GoldCompatibilityResultV1,
} from "./productionCutover";
import {
  appendGoldRegimeSnapshot,
  getLatestGoldRegimeSnapshot,
} from "./regimeHistory";
import {
  calculateGoldRegimeMemory,
  createGoldRegimeSnapshot,
} from "./regimeMemory";
import {
  createFredProvider,
} from "../../providers/fred/register";

const GOLD_HISTORY_RANGE = "5y";
const GOLD_HISTORY_UNAVAILABLE_MESSAGE =
  "[Chronoverse Gold] No live gold price history available.";

export interface GoldProductionRuntimeDependenciesV1 {
  readonly coordinateMarketEvaluation?:
    typeof coordinateCanonicalMarketEvaluationV1;
  readonly loadMacroSnapshot?: () => Promise<GoldMacroSnapshot>;
  readonly calculateMacro?: typeof calculateGoldMacroScore;
  readonly evaluatePrepared?: typeof evaluatePreparedGoldV1;
  readonly readLatestRegime?: typeof getLatestGoldRegimeSnapshot;
  readonly appendRegime?: typeof appendGoldRegimeSnapshot;
  readonly integrateDecisionLifecycle?:
    typeof integrateCanonicalDecisionLifecycleV3;
  readonly advanceDecisionSnapshot?:
    typeof advanceCanonicalDecisionSnapshot;
  readonly mapCompatibility?: typeof mapGoldCompatibilityV1;
}

/**
 * Fresh Gold production computation owned by the route's existing final cache.
 * Provider access and persistence occur only when this function is executed.
 */
export async function getCanonicalLiveGoldIntelligence(
  dependencies: GoldProductionRuntimeDependenciesV1 = {},
): Promise<GoldCompatibilityResultV1> {
  const coordinateMarketEvaluation =
    dependencies.coordinateMarketEvaluation ??
    coordinateCanonicalMarketEvaluationV1;
  const minimumRequiredHistory =
    calculateMinimumTechnicalObservationCountV1(goldProfile);
  const evaluation = await coordinateMarketEvaluation({
    targetAssetIds: ["gold"],
    interval: goldProfile.defaultInterval,
    history: {
      kind: "required-observations",
      requiredObservationCount: minimumRequiredHistory,
      range: GOLD_HISTORY_RANGE,
    },
  });

  assertCanonicalGoldHistoryReady(evaluation);

  const loadMacroSnapshot =
    dependencies.loadMacroSnapshot ?? loadProductionGoldMacroSnapshot;
  const calculateMacro =
    dependencies.calculateMacro ?? calculateGoldMacroScore;
  const macro = calculateMacro(await loadMacroSnapshot());
  const evaluatePrepared =
    dependencies.evaluatePrepared ?? evaluatePreparedGoldV1;
  const runtime = evaluatePrepared(evaluation, macro);

  if (runtime.availability !== "available") {
    throw new Error("[Chronoverse Gold] Intelligence runtime is unavailable.");
  }

  const currentRegime = createGoldRegimeSnapshot(
    {
      state: runtime.intelligence.state,
      confidence: runtime.intelligence.confidence,
      signal: runtime.intelligence.signal,
      macro,
      risk: runtime.intelligence.risk,
    },
    runtime.engineResult.evaluatedAt,
  );
  const regimeEnrichment = await enrichEngineRegimeV1({
    engineResult: runtime.engineResult,
    current: currentRegime,
    calculateMemory: calculateGoldRegimeMemory,
    readLatest:
      dependencies.readLatestRegime ?? getLatestGoldRegimeSnapshot,
    append:
      dependencies.appendRegime ?? appendGoldRegimeSnapshot,
  });
  const integrateDecisionLifecycle =
    dependencies.integrateDecisionLifecycle ??
    integrateCanonicalDecisionLifecycleV3;
  const decisionIntegration = await integrateDecisionLifecycle({
    assetId: regimeEnrichment.engineResult.asset,
    computedAt: regimeEnrichment.engineResult.evaluatedAt,
    currentDecision: regimeEnrichment.engineResult.decision,
    advanceSnapshot:
      dependencies.advanceDecisionSnapshot ??
      advanceCanonicalDecisionSnapshot,
  });
  const engineResult = {
    ...regimeEnrichment.engineResult,
    ...decisionIntegration,
  };
  const mapCompatibility =
    dependencies.mapCompatibility ?? mapGoldCompatibilityV1;

  return mapCompatibility({
    intelligence: runtime.intelligence,
    engineResult,
    macro,
    regimeMemory: regimeEnrichment.regimeMemory,
  });
}

async function loadProductionGoldMacroSnapshot():
  Promise<GoldMacroSnapshot> {
  return getGoldMacroSnapshot(createFredProvider());
}

function assertCanonicalGoldHistoryReady(
  evaluation: Awaited<
    ReturnType<typeof coordinateCanonicalMarketEvaluationV1>
  >,
): void {
  const prepared = prepareAssetEvaluationV1(evaluation, "gold", {
    applicability: "applicable",
    section: {
      availability: "unavailable",
      reason: "Gold Macro has not been acquired.",
    },
  });

  if (prepared.availability === "unavailable") {
    throw new Error(GOLD_HISTORY_UNAVAILABLE_MESSAGE);
  }
}
