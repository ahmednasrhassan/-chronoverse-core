import {
  integrateCanonicalDecisionLifecycleV3,
  type AdvanceCanonicalDecisionSnapshot,
} from "../../engine/decisionLifecycleRuntime";
import {
  buildCanonicalDecisionSnapshot,
  type AdvanceDecisionSnapshotResult,
  type CanonicalDecisionSnapshot,
} from "../../engine/decisionPersistence";
import type {
  EngineDecisionLifecycleSectionV3,
  EngineDecisionSectionV3,
  EngineDecisionStanceV3,
} from "../../engine/contracts";

const PREVIOUS_TIME = "2026-01-01T00:00:00.000Z";
const CURRENT_TIME = "2026-01-02T00:00:00.000Z";

function decision(
  score: number,
  stance: EngineDecisionStanceV3,
  missing?: readonly string[],
): EngineDecisionSectionV3 {
  return missing === undefined
    ? { availability: "available", data: { score, stance } }
    : { availability: "partial", data: { score, stance }, missing };
}

function snapshot(
  currentDecision: EngineDecisionSectionV3,
  computedAt = PREVIOUS_TIME,
): CanonicalDecisionSnapshot {
  return buildCanonicalDecisionSnapshot({
    assetId: "gold",
    computedAt,
    decision: currentDecision,
  });
}

async function integrate(
  currentDecision: EngineDecisionSectionV3,
  result: AdvanceDecisionSnapshotResult | Error,
) {
  let persistenceCalls = 0;
  let providerCalls = 0;
  const advanceSnapshot: AdvanceCanonicalDecisionSnapshot = async () => {
    persistenceCalls += 1;
    if (result instanceof Error) {
      throw result;
    }
    return result;
  };

  const integration = await integrateCanonicalDecisionLifecycleV3({
    assetId: "gold",
    computedAt: CURRENT_TIME,
    currentDecision,
    advanceSnapshot,
  });

  return {
    integration,
    persistenceCalls,
    providerCalls,
  };
}

function compared(
  lifecycle: EngineDecisionLifecycleSectionV3,
  label: string,
) {
  if (
    (lifecycle.availability !== "available" &&
      lifecycle.availability !== "partial") ||
    lifecycle.data.comparison !== "compared"
  ) {
    throw new Error(`${label}: expected compared lifecycle.`);
  }
  return lifecycle.data;
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function assertClose(actual: number, expected: number, label: string): void {
  if (Math.abs(actual - expected) > Number.EPSILON) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

async function assertTransition(
  previousDecision: EngineDecisionSectionV3,
  currentDecision: EngineDecisionSectionV3,
  expectedKind: string,
  label: string,
) {
  const result = await integrate(currentDecision, {
    status: "advanced",
    previous: snapshot(previousDecision),
  });
  const lifecycle = compared(result.integration.decisionLifecycle, label);

  assertEqual(lifecycle.transition.kind, expectedKind, `${label} transition`);
  assertEqual(result.persistenceCalls, 1, `${label} persistence calls`);
  assertEqual(result.providerCalls, 0, `${label} provider calls`);
  return lifecycle;
}

async function main(): Promise<void> {
  const bullish = decision(0.6, "bullish");
  const initialized = await integrate(bullish, {
    status: "initialized",
    previous: null,
  });

  if (
    (initialized.integration.decisionLifecycle.availability !== "available" &&
      initialized.integration.decisionLifecycle.availability !== "partial") ||
    initialized.integration.decisionLifecycle.data.comparison !== "initialized"
  ) {
    throw new Error("First Decision must initialize lifecycle.");
  }

  assertEqual(initialized.persistenceCalls, 1, "initialization persistence calls");
  assertEqual(
    "decisionScoreDelta" in initialized.integration.decisionLifecycle.data,
    false,
    "initialization has no fake score delta",
  );
  assertEqual(
    "convictionDelta" in initialized.integration.decisionLifecycle.data,
    false,
    "initialization has no fake conviction delta",
  );

  await assertTransition(
    decision(0.4, "bullish"),
    decision(0.7, "bullish"),
    "maintained",
    "bullish maintained",
  );
  await assertTransition(
    decision(0.4, "bullish"),
    decision(0, "neutral"),
    "neutralized",
    "bullish neutralized",
  );
  const reversed = await assertTransition(
    decision(0.8, "bullish"),
    decision(-0.2, "bearish"),
    "reversed",
    "bullish reversed",
  );
  await assertTransition(
    decision(0, "neutral"),
    decision(0.3, "bullish"),
    "emerged",
    "bullish emerged",
  );
  assertEqual(reversed.decisionScoreDelta, -1, "reversal signed delta");
  assertClose(reversed.convictionDelta, -0.6, "reversal conviction delta");

  const unchanged = await integrate(bullish, {
    status: "unchanged",
    previous: snapshot(bullish),
  });
  const unchangedLifecycle = compared(
    unchanged.integration.decisionLifecycle,
    "unchanged",
  );
  assertEqual(unchangedLifecycle.transition.kind, "maintained", "unchanged transition");
  assertEqual(unchangedLifecycle.decisionScoreDelta, 0, "unchanged score delta");

  for (const unusable of [
    { availability: "unavailable", reason: "No Decision" },
    { availability: "not-computed" },
  ] satisfies readonly EngineDecisionSectionV3[]) {
    const result = await integrate(unusable, new Error("must not execute"));
    assertEqual(result.persistenceCalls, 0, `${unusable.availability} persistence calls`);
    assertEqual(result.integration.decisionLifecycle.availability, "unavailable", `${unusable.availability} lifecycle`);
  }

  const failure = await integrate(bullish, new Error("Redis unavailable"));
  assertEqual(failure.integration.decision, bullish, "failure preserves current Decision");
  assertEqual(failure.integration.decisionLifecycle.availability, "unavailable", "failure lifecycle");

  const stale = await integrate(bullish, {
    status: "stale",
    previous: snapshot(decision(-0.5, "bearish"), CURRENT_TIME),
  });
  assertEqual(stale.integration.decisionLifecycle.availability, "unavailable", "stale lifecycle");

  const partial = decision(0.5, "bullish", [" technical ", "macro", "macro"]);
  const partialResult = await integrate(partial, {
    status: "initialized",
    previous: null,
  });
  assertEqual(partialResult.integration.decision, partial, "partial current preserved");
  assertEqual(partialResult.integration.decisionLifecycle.availability, "partial", "partial lifecycle");

  console.log("PASS: Engine V3 Decision Lifecycle runtime boundary");
}

void main();
