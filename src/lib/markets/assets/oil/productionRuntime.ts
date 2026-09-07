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
  calculateOilMacro,
} from "./macro";
import {
  getOilMacroInput,
} from "./macroData";
import {
  oilProfile,
} from "./profile";
import {
  evaluatePreparedOilV1,
  mapOilCompatibilityV1,
  type OilCompatibilityResultV1,
} from "./productionCutover";
import {
  appendOilRegimeSnapshot,
  getLatestOilRegimeSnapshot,
} from "./regimeHistory";
import {
  calculateOilRegimeMemory,
  createOilRegimeSnapshot,
} from "./regimeMemory";

const OIL_HISTORY_RANGE = "5y";

export interface OilProductionRuntimeDependenciesV1 {
  readonly coordinateMarketEvaluation?:
    typeof coordinateCanonicalMarketEvaluationV1;
  readonly loadMacroInput?: typeof getOilMacroInput;
  readonly calculateMacro?: typeof calculateOilMacro;
  readonly evaluatePrepared?: typeof evaluatePreparedOilV1;
  readonly readLatestRegime?: typeof getLatestOilRegimeSnapshot;
  readonly appendRegime?: typeof appendOilRegimeSnapshot;
  readonly integrateDecisionLifecycle?:
    typeof integrateCanonicalDecisionLifecycleV3;
  readonly advanceDecisionSnapshot?:
    typeof advanceCanonicalDecisionSnapshot;
  readonly mapCompatibility?: typeof mapOilCompatibilityV1;
}

/**
 * Fresh Oil production computation owned by the route's existing final cache.
 * Provider access and persistence occur only when this function is executed.
 */
export async function getCanonicalLiveOilIntelligence(
  dependencies: OilProductionRuntimeDependenciesV1 = {},
): Promise<OilCompatibilityResultV1> {
  const coordinateMarketEvaluation =
    dependencies.coordinateMarketEvaluation ??
    coordinateCanonicalMarketEvaluationV1;
  const minimumRequiredHistory =
    calculateMinimumTechnicalObservationCountV1(oilProfile);
  const evaluation = await coordinateMarketEvaluation({
    targetAssetIds: ["oil"],
    interval: oilProfile.defaultInterval,
    history: {
      kind: "required-observations",
      requiredObservationCount: minimumRequiredHistory,
      range: OIL_HISTORY_RANGE,
    },
  });

  assertCanonicalOilHistoryReady(evaluation);

  const loadMacroInput = dependencies.loadMacroInput ?? getOilMacroInput;
  const calculateMacro = dependencies.calculateMacro ?? calculateOilMacro;
  const macro = calculateMacro(await loadMacroInput());
  const evaluatePrepared = dependencies.evaluatePrepared ?? evaluatePreparedOilV1;
  const runtime = evaluatePrepared(evaluation, macro);

  if (runtime.availability !== "available") {
    throw new Error(
      `[Chronoverse Oil] Generic Runtime is unavailable: ${runtime.reason}`,
    );
  }

  const currentRegime = createOilRegimeSnapshot(
    {
      ...runtime.intelligence,
      macro,
    },
    runtime.engineResult.evaluatedAt,
  );
  const regimeEnrichment = await enrichEngineRegimeV1({
    engineResult: runtime.engineResult,
    current: currentRegime,
    calculateMemory: calculateOilRegimeMemory,
    readLatest:
      dependencies.readLatestRegime ?? getLatestOilRegimeSnapshot,
    append:
      dependencies.appendRegime ?? appendOilRegimeSnapshot,
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
    dependencies.mapCompatibility ?? mapOilCompatibilityV1;

  return mapCompatibility({
    intelligence: runtime.intelligence,
    engineResult,
    macro,
    regimeMemory: regimeEnrichment.regimeMemory,
  });
}

function assertCanonicalOilHistoryReady(
  evaluation: Awaited<
    ReturnType<typeof coordinateCanonicalMarketEvaluationV1>
  >,
): void {
  const prepared = prepareAssetEvaluationV1(evaluation, "oil", {
    applicability: "applicable",
    section: {
      availability: "unavailable",
      reason: "Oil Macro has not been acquired.",
    },
  });

  if (prepared.availability === "unavailable") {
    throw new Error(
      `[Chronoverse Oil] Canonical target history is unavailable: ${prepared.reason}`,
    );
  }
}
