import type { MarketAssetId } from "../../core/assets";
import { marketAssetProfiles } from "../../core/assetProfiles";
import type { EngineCrossAssetSectionV3 } from "../../engine/contracts";
import {
  CANONICAL_MARKET_EVALUATION_SCHEMA_VERSION_V1,
  coordinateCanonicalMarketEvaluationV1,
  getPrecomputedCrossAssetForTargetV1,
  resolveCanonicalMarketEvaluationHistoryPolicyV1,
  type CanonicalMarketEvaluationV1,
} from "../../engine/marketEvaluationCoordinator";
import {
  calculateCanonicalCrossAssetSectionsV1,
  type CanonicalCrossAssetSectionsV1,
} from "../../engine/crossAssetOrchestrator";
import {
  CANONICAL_MARKET_SNAPSHOT_SCHEMA_VERSION_V1,
  type CanonicalMarketSnapshotAssetV1,
  type CanonicalMarketSnapshotRequestV1,
  type CanonicalMarketSnapshotV1,
} from "../../services/canonicalMarketSnapshot";

const computedAt = "2026-09-06T12:00:00.000Z";

function availableAsset(assetId: MarketAssetId): CanonicalMarketSnapshotAssetV1 {
  const profile = marketAssetProfiles[assetId];
  const observations = Object.freeze(
    Array.from({ length: 61 }, (_, index) => Object.freeze({
      timestamp: 1_700_000_000 + index * 86_400,
      close: 100 * Math.exp(index * 0.003 + (index % 3 - 1) * 0.002),
    })),
  );

  return Object.freeze({
    assetId,
    symbol: profile.symbol,
    assetClass: profile.assetClass,
    interval: "1d",
    observations,
    observationCount: observations.length,
    earliestTimestamp: observations.at(0)?.timestamp,
    latestTimestamp: observations.at(-1)?.timestamp,
    availability: "available",
    status: "end_of_day",
  });
}

function unavailableAsset(assetId: MarketAssetId): CanonicalMarketSnapshotAssetV1 {
  const profile = marketAssetProfiles[assetId];

  return Object.freeze({
    assetId,
    symbol: profile.symbol,
    assetClass: profile.assetClass,
    interval: "1d",
    observations: Object.freeze([]),
    observationCount: 0,
    availability: "unavailable",
    status: "unavailable",
    reason: "Historical market data is unavailable.",
  });
}

function snapshotFor(
  assetIds: readonly MarketAssetId[],
  unavailableIds: readonly MarketAssetId[] = [],
): CanonicalMarketSnapshotV1 {
  const unavailable = new Set(unavailableIds);
  const assets = Object.freeze(
    assetIds.map((assetId) => unavailable.has(assetId)
      ? unavailableAsset(assetId)
      : availableAsset(assetId)),
  );
  const availableCount = assets.filter((asset) => asset.availability === "available").length;

  return Object.freeze({
    schemaVersion: CANONICAL_MARKET_SNAPSHOT_SCHEMA_VERSION_V1,
    computedAt,
    requestedAssetIds: Object.freeze([...assetIds]),
    assets,
    availability: availableCount === assets.length
      ? "available"
      : availableCount === 0
        ? "unavailable"
        : "partial",
  });
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertAssets(
  actual: readonly MarketAssetId[],
  expected: string,
  label: string,
): void {
  assertEqual(actual.join(","), expected, label);
}

async function assertRejects(
  run: () => Promise<unknown>,
  expectedMessage: string,
  label: string,
): Promise<void> {
  let error: unknown;

  try {
    await run();
  } catch (caught) {
    error = caught;
  }

  assertEqual(error instanceof Error, true, `${label} throws Error`);
  assertEqual((error as Error).message, expectedMessage, `${label} message`);
}

function section(
  batch: CanonicalCrossAssetSectionsV1,
  targetAssetId: MarketAssetId,
): EngineCrossAssetSectionV3 {
  const match = batch.sections.find((candidate) => candidate.targetAssetId === targetAssetId);

  if (match === undefined) {
    throw new Error(`Missing Cross-Asset section for ${targetAssetId}.`);
  }

  return match.crossAsset;
}

async function evaluateWithMockSnapshot(
  targetAssetIds: readonly MarketAssetId[],
  unavailableIds: readonly MarketAssetId[] = [],
): Promise<{
  readonly evaluation: CanonicalMarketEvaluationV1;
  readonly requests: readonly CanonicalMarketSnapshotRequestV1[];
}> {
  const requests: CanonicalMarketSnapshotRequestV1[] = [];
  const evaluation = await coordinateCanonicalMarketEvaluationV1(
    {
      targetAssetIds,
      interval: "1d",
      history: { kind: "required-observations", requiredObservationCount: 61 },
    },
    {
      createSnapshot: async (request) => {
        requests.push(request);
        return snapshotFor(request.assetIds, unavailableIds);
      },
    },
  );

  return { evaluation, requests };
}

async function run(): Promise<void> {
  const input = Object.freeze({
    targetAssetIds: Object.freeze(["ethereum", "silver", "ethereum"] as const),
    interval: "1d" as const,
    history: Object.freeze({
      kind: "required-observations" as const,
      requiredObservationCount: 61,
    }),
  });
  const beforeInput = JSON.stringify(input);
  let snapshotCalls = 0;
  let orchestrationCalls = 0;
  let referenceFeatureCalls = 0;
  let capturedRequest: CanonicalMarketSnapshotRequestV1 | undefined;
  let capturedSnapshot: CanonicalMarketSnapshotV1 | undefined;
  const suppliedSnapshot = snapshotFor(["gold", "bitcoin", "silver", "ethereum"]);
  const evaluation = await coordinateCanonicalMarketEvaluationV1(input, {
    createSnapshot: async (request) => {
      snapshotCalls += 1;
      capturedRequest = request;
      return suppliedSnapshot;
    },
    calculateCrossAssetSections: (orchestrationInput) => {
      orchestrationCalls += 1;
      if (orchestrationInput.availability !== "not-computed") {
        capturedSnapshot = orchestrationInput.snapshot;
      }

      return calculateCanonicalCrossAssetSectionsV1(orchestrationInput, {
        calculateReferenceMove: (featureInput) => {
          referenceFeatureCalls += 1;
          const latestTimestamp = featureInput.observations.at(-1)?.timestamp;

          return {
            availability: "available",
            referenceMoveScore: 0.25,
            ...(latestTimestamp === undefined
              ? {}
              : {
                  latestTimestamp,
                  observedAt: new Date(latestTimestamp * 1_000).toISOString(),
                }),
          };
        },
      });
    },
  });

  assertEqual(snapshotCalls, 1, "one canonical snapshot call");
  assertEqual(orchestrationCalls, 1, "one Cross-Asset orchestration call");
  assertEqual(referenceFeatureCalls, 2, "one feature calculation per active reference");
  assertAssets(capturedRequest!.assetIds, "gold,bitcoin,silver,ethereum", "snapshot dependencies");
  assertEqual(capturedRequest!.history.kind, "range", "normalized snapshot history kind");
  if (capturedRequest!.history.kind !== "range") {
    throw new Error("Expected normalized range history.");
  }
  assertEqual(capturedRequest!.history.range, "max", "required-count default range");
  assertEqual(capturedRequest!.history.minimumObservationCount, 61, "caller history count retained");
  assertAssets(evaluation.requestedTargetAssetIds, "silver,ethereum", "canonical target ordering");
  assertAssets(
    evaluation.requiredObservationAssetIds,
    "gold,bitcoin,silver,ethereum",
    "evaluation dependency ordering",
  );
  assertEqual(evaluation.schemaVersion, CANONICAL_MARKET_EVALUATION_SCHEMA_VERSION_V1, "schema");
  assertEqual(evaluation.computedAt, computedAt, "snapshot computation time reused");
  assertEqual(evaluation.snapshot, suppliedSnapshot, "snapshot reference preserved");
  assertEqual(capturedSnapshot, suppliedSnapshot, "same snapshot supplied to orchestration");
  assertEqual(Object.isFrozen(evaluation), true, "evaluation is frozen");
  assertEqual(JSON.stringify(input), beforeInput, "input remains unchanged");

  for (const targetAssetId of evaluation.requestedTargetAssetIds) {
    const orchestrated = section(evaluation.crossAssetSections, targetAssetId);
    assertEqual(
      getPrecomputedCrossAssetForTargetV1(evaluation, targetAssetId),
      orchestrated,
      `${targetAssetId} exact handoff reference`,
    );
  }

  await assertRejects(
    async () => getPrecomputedCrossAssetForTargetV1(evaluation, "gold"),
    "Cross-Asset handoff target was not requested by this evaluation.",
    "mismatched handoff",
  );

  const expectedDependencies = [
    [["silver"], "gold,silver"],
    [["ethereum"], "bitcoin,ethereum"],
    [["ethereum", "silver", "ethereum"], "gold,bitcoin,silver,ethereum"],
    [["gold"], "gold"],
    [["oil"], "oil"],
  ] as const;

  for (const [targets, expected] of expectedDependencies) {
    const result = await evaluateWithMockSnapshot(targets);
    assertEqual(result.requests.length, 1, `${targets.join("+")} snapshot call count`);
    assertAssets(result.requests[0]!.assetIds, expected, `${targets.join("+")} dependencies`);
  }

  let rejectedLoaderCalls = 0;
  const rejectingDependencies = {
    createSnapshot: async () => {
      rejectedLoaderCalls += 1;
      return snapshotFor(["gold"]);
    },
  };
  await assertRejects(
    () => coordinateCanonicalMarketEvaluationV1({
      targetAssetIds: [],
      interval: "1d",
      history: { kind: "range", range: "1y" },
    }, rejectingDependencies),
    "Canonical market evaluation requires at least one target asset.",
    "empty target request",
  );
  await assertRejects(
    () => coordinateCanonicalMarketEvaluationV1({
      targetAssetIds: ["invalid" as MarketAssetId],
      interval: "1d",
      history: { kind: "range", range: "1y" },
    }, rejectingDependencies),
    "Canonical market snapshot contains an invalid asset ID.",
    "invalid target request",
  );
  assertEqual(rejectedLoaderCalls, 0, "invalid requests do not load snapshots");

  const firstPermutation = await evaluateWithMockSnapshot(["ethereum", "silver"]);
  const secondPermutation = await evaluateWithMockSnapshot(["silver", "ethereum"]);
  assertEqual(
    JSON.stringify(firstPermutation.evaluation),
    JSON.stringify(secondPermutation.evaluation),
    "target permutation invariance",
  );

  const partial = await evaluateWithMockSnapshot(["silver", "ethereum"], ["gold"]);
  assertEqual(partial.evaluation.availability, "partial", "partial snapshot preserved");
  assertEqual(section(partial.evaluation.crossAssetSections, "silver").availability, "unavailable", "isolated Silver failure");
  assertEqual(section(partial.evaluation.crossAssetSections, "ethereum").availability, "available", "Ethereum survives Silver failure");

  const total = await evaluateWithMockSnapshot(
    ["silver", "ethereum"],
    ["gold", "bitcoin", "silver", "ethereum"],
  );
  assertEqual(total.evaluation.availability, "unavailable", "total snapshot failure preserved");
  assertEqual(section(total.evaluation.crossAssetSections, "silver").availability, "unavailable", "Silver total failure");
  assertEqual(section(total.evaluation.crossAssetSections, "ethereum").availability, "unavailable", "Ethereum total failure");

  const gold = await evaluateWithMockSnapshot(["gold"]);
  assertEqual(
    getPrecomputedCrossAssetForTargetV1(gold.evaluation, "gold").availability,
    "not-applicable",
    "non-modeled target handoff",
  );

  const available = section(evaluation.crossAssetSections, "silver");
  if (available.availability !== "available") {
    throw new Error("Expected usable Silver fixture.");
  }
  const lifecycleStates: readonly EngineCrossAssetSectionV3[] = [
    available,
    Object.freeze({ availability: "partial", data: available.data, missing: Object.freeze(["future-edge"]) }),
    Object.freeze({ availability: "unavailable", reason: "Unavailable fixture." }),
    Object.freeze({ availability: "not-applicable", reason: "Not applicable fixture." }),
    Object.freeze({ availability: "not-computed" }),
  ];

  for (const crossAsset of lifecycleStates) {
    const silverTargetIds: readonly MarketAssetId[] = Object.freeze(["silver"]);
    const lifecycleEvaluation: CanonicalMarketEvaluationV1 = Object.freeze({
      ...evaluation,
      requestedTargetAssetIds: silverTargetIds,
      crossAssetSections: Object.freeze({
        targetAssetIds: silverTargetIds,
        sections: Object.freeze([Object.freeze({ targetAssetId: "silver", crossAsset })]),
      }),
    });
    assertEqual(
      getPrecomputedCrossAssetForTargetV1(lifecycleEvaluation, "silver"),
      crossAsset,
      `${crossAsset.availability} lifecycle handoff`,
    );
  }

  const silverPolicy = resolveCanonicalMarketEvaluationHistoryPolicyV1(["silver"]);
  assertEqual(silverPolicy.targetTechnicalMinimumObservationCount, 200, "technical EMA requirement");
  assertEqual(silverPolicy.crossAssetReferenceMinimumObservationCount, 61, "H20/L60 requirement");
  assertEqual(silverPolicy.sharedMinimumObservationCount, 200, "shared history requirement");
  assertEqual(silverPolicy.targetProfileHistoryLimit, 600, "profile history limit");
  assertEqual(silverPolicy.recommendedObservationCount, 600, "recommended history count");
  assertEqual(Object.isFrozen(silverPolicy), true, "history policy is frozen");
  const goldPolicy = resolveCanonicalMarketEvaluationHistoryPolicyV1(["gold"]);
  assertEqual(goldPolicy.crossAssetReferenceMinimumObservationCount, null, "no universal 61 requirement");
  assertEqual(goldPolicy.sharedMinimumObservationCount, 200, "Gold technical requirement");

  await assertRejects(
    () => coordinateCanonicalMarketEvaluationV1(
      {
        targetAssetIds: ["silver"],
        interval: "1d",
        history: { kind: "range", range: "1y" },
      },
      {
        createSnapshot: async () => {
          throw new Error("provider secret must not escape");
        },
      },
    ),
    "Canonical market evaluation coordination failed.",
    "snapshot failure sanitization",
  );

  console.log("PASS: Canonical Market Evaluation Coordinator V1");
}

void run();
