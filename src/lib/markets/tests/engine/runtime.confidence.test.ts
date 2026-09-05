import type {
  EngineMacroV3,
} from "../../engine/contracts";
import {
  runEngineRuntimeV3,
} from "../../engine/runtime";
import type {
  MarketRiskResult,
} from "../../core/riskEngine";
import type {
  MarketSignalResult,
} from "../../core/signalEngine";

const technical = {
  price: 100,
  emaFast: 99,
  emaMedium: 98,
  emaSlow: 97,
  rsi: 55,
  macd: 1,
  macdSignal: 0.8,
  macdHistogram: 0.2,
  momentum: 1,
  roc: 1,
  annualizedVolatility: 20,
  priceVsEmaMedium: 2,
  priceVsEmaSlow: 3,
};

const signal: MarketSignalResult = {
  score: 1,
  direction: "bullish",
  strength: "strong",
  confidence: 0.2,
  reasons: ["Test signal"],
};

const risk = {
  score: 0.9,
  level: "high",
  reasons: ["Test risk"],
} satisfies MarketRiskResult;

const intelligence = {
  technical,
  signal,
  risk,
  state: "opportunity",
  confidence: 0.3,
} as const;

const snapshot = {
  timestamp: "2026-01-01T00:00:00.000Z",
  state: "opportunity",
  confidence: 0.3,
  signalDirection: "bullish",
  signalConfidence: 0.2,
  macroBias: "bullish",
  macroConfidence: 0.4,
  riskLevel: "high",
  riskScore: 0.9,
} as const;

const regimeMemory = {
  current: snapshot,
  previous: null,
  transition: {
    changed: false,
    from: null,
    to: "opportunity",
    direction: "new",
  },
  conviction: {
    current: 30,
    previous: null,
    change: null,
    direction: "stable",
  },
  technical: {
    current: "bullish",
    previous: null,
    confidence: 20,
    previousConfidence: null,
    change: "stable",
  },
  macro: {
    current: "bullish",
    previous: null,
    confidence: 40,
    previousConfidence: null,
    change: "stable",
  },
  risk: {
    currentLevel: "high",
    previousLevel: null,
    currentScore: 0.9,
    previousScore: null,
    change: "stable",
  },
} as const;

function normalizedMacro(
  score: number,
  coverage: number,
  missing?: readonly string[],
): EngineMacroV3 {
  const data = {
    direction: "bullish",
    score,
    confidence: 0.1,
    coverage,
    drivers: [],
    reasons: ["Test macro"],
  } as const;

  return missing === undefined
    ? {
        availability: "available",
        data,
      }
    : {
        availability: "partial",
        data,
        missing,
      };
}

type RunOptions = {
  readonly macroApplicability:
    | "applicable"
    | "not-applicable";
  readonly receivedPoints?: number;
  readonly signalScore?: number;
  readonly macroScore?: number;
  readonly macroCoverage?: number;
  readonly macroMissing?: readonly string[];
  readonly throwFromIntelligence?: boolean;
};

async function runCase(options: RunOptions) {
  let intelligenceCalls = 0;
  let buildMacroCalls = 0;
  let getSnapshotCalls = 0;
  let regimeCalls = 0;
  let persistenceCalls = 0;
  const caseSignal: MarketSignalResult = {
    ...signal,
    score: options.signalScore ?? signal.score,
  };
  const caseIntelligence = {
    ...intelligence,
    signal: caseSignal,
  };
  const caseMacro = normalizedMacro(
    options.macroScore ?? 0.5,
    options.macroCoverage ?? 1,
    options.macroMissing,
  );

  const runtime = await runEngineRuntimeV3({
    asset: "gold",
    symbol: "TEST",
    historyLimit: 600,
    minimumRequiredHistory: 1,
    macroApplicability: options.macroApplicability,
    insufficientHistoryMessage:
      (received, minimum) =>
        `Received ${received}; required ${minimum}.`,
    marketData: {
      provider: "in-memory",
      status: "realtime",
      window: {
        receivedPoints: options.receivedPoints ?? 1,
      },
      candles: [
        {
          time: 1,
          close: 100,
        },
      ],
    },
    macroInput: null,
    calculateIntelligence: () => {
      intelligenceCalls += 1;

      if (options.throwFromIntelligence) {
        throw new Error("Expected callback failure");
      }

      return caseIntelligence;
    },
    buildMacro: () => {
      buildMacroCalls += 1;
      return caseMacro;
    },
    createRegimeSnapshot: () => snapshot,
    calculateRegimeMemory: () => {
      regimeCalls += 1;
      return regimeMemory;
    },
    getLatestRegimeSnapshot: async () => {
      getSnapshotCalls += 1;
      return null;
    },
    appendRegimeSnapshot: async (
      current,
      previous,
    ) => {
      persistenceCalls += 1;
      assertEqual(current, snapshot, "persisted current snapshot");
      assertEqual(previous, null, "persisted previous snapshot");
    },
  });

  return {
    runtime,
    intelligenceCalls,
    buildMacroCalls,
    getSnapshotCalls,
    regimeCalls,
    persistenceCalls,
    signal: caseSignal,
  };
}

function assertEqual<T>(
  actual: T,
  expected: T,
  label: string,
): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function assertClose(
  actual: number,
  expected: number,
  label: string,
): void {
  if (Math.abs(actual - expected) > Number.EPSILON * 8) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function requireAvailableConfidence(
  result: Awaited<ReturnType<typeof runCase>>["runtime"],
) {
  const confidence = result.engineResult.confidence;

  if (confidence.availability !== "available") {
    throw new Error(
      `confidence: expected available, received ${confidence.availability}`,
    );
  }

  return confidence.data;
}

function requireAvailableContradiction(
  result: Awaited<ReturnType<typeof runCase>>["runtime"],
) {
  const contradiction = result.engineResult.contradiction;

  if (contradiction.availability !== "available") {
    throw new Error(
      `contradiction: expected available, received ${contradiction.availability}`,
    );
  }

  return contradiction.data;
}

function requireUsableDecision(
  result: Awaited<ReturnType<typeof runCase>>["runtime"],
) {
  const decision = result.engineResult.decision;

  if (
    decision.availability !== "available" &&
    decision.availability !== "partial"
  ) {
    throw new Error(
      `decision: expected usable, received ${decision.availability}`,
    );
  }

  return decision;
}

function assertDecisionMatchesConviction(
  result: Awaited<ReturnType<typeof runCase>>["runtime"],
  label: string,
): void {
  const confidence = requireAvailableConfidence(result);
  const decision = requireUsableDecision(result);

  if (
    confidence.conviction.availability !== "available" &&
    confidence.conviction.availability !== "partial"
  ) {
    throw new Error(`${label}: canonical conviction is unavailable.`);
  }

  assertClose(
    Math.abs(decision.data.score),
    confidence.conviction.data.score,
    `${label} Decision magnitude`,
  );
}

async function main(): Promise<void> {
  const applicable = await runCase({
    macroApplicability: "applicable",
  });
  const applicableConfidence =
    requireAvailableConfidence(applicable.runtime);
  const alignedContradiction =
    requireAvailableContradiction(applicable.runtime);

  assertEqual(applicable.intelligenceCalls, 1, "intelligence calls");
  assertEqual(applicable.buildMacroCalls, 1, "buildMacro calls");
  assertEqual(applicable.getSnapshotCalls, 1, "snapshot reads");
  assertEqual(applicable.regimeCalls, 1, "regime calculations");
  assertEqual(applicable.persistenceCalls, 1, "persistence calls");
  assertEqual(applicableConfidence.data.availability, "partial", "data lifecycle");
  assertEqual(applicableConfidence.conviction.availability, "partial", "conviction lifecycle");

  if (applicableConfidence.conviction.availability !== "partial") {
    throw new Error("Applicable conviction data is unavailable.");
  }

  assertEqual(
    applicableConfidence.conviction.data.components.macro.availability,
    "available",
    "applicable macro lifecycle",
  );
  assertEqual(
    applicableConfidence.conviction.data.score,
    0.75,
    "applicable macro conviction",
  );
  const applicableDecision = requireUsableDecision(applicable.runtime);

  assertEqual(applicableDecision.availability, "partial", "applicable Decision lifecycle");
  assertEqual(applicableDecision.data.stance, "bullish", "applicable Decision stance");
  assertEqual(applicableDecision.data.score, 0.75, "applicable Decision score");
  assertDecisionMatchesConviction(applicable.runtime, "applicable");
  assertEqual(
    applicable.runtime.engineResult.recommendation.availability,
    "not-computed",
    "recommendation lifecycle",
  );
  assertEqual(alignedContradiction.score, 0, "aligned contradiction score");
  assertEqual(alignedContradiction.conflicts.length, 0, "aligned conflicts");
  assertEqual(
    alignedContradiction.strongestConflict,
    null,
    "aligned strongest conflict",
  );
  assertEqual(
    applicableConfidence.conviction.data.components.contradiction.availability,
    "available",
    "confidence contradiction lifecycle",
  );
  assertEqual(
    applicableConfidence.conviction.data.components.contradiction.availability === "available"
      ? applicableConfidence.conviction.data.components.contradiction.data
      : null,
    alignedContradiction.score,
    "confidence canonical contradiction score",
  );
  const technicalSection =
    applicable.runtime.engineResult.technical;

  if (technicalSection.availability !== "available") {
    throw new Error("Technical output is unavailable.");
  }

  assertEqual(
    technicalSection.data,
    technical,
    "technical output",
  );
  assertEqual(
    applicable.runtime.engineResult.signal,
    applicable.signal,
    "signal output",
  );
  assertEqual(applicable.runtime.engineResult.risk, risk, "risk output");
  assertEqual(applicable.runtime.engineResult.state.state, "opportunity", "state output");
  assertEqual(applicable.runtime.engineResult.state.confidence, 0.3, "state confidence");

  if (applicable.runtime.engineResult.regime.availability !== "available") {
    throw new Error("Regime output is unavailable.");
  }

  assertEqual(
    applicable.runtime.engineResult.regime.memory,
    regimeMemory,
    "regime output",
  );

  const bearish = await runCase({
    macroApplicability: "applicable",
    signalScore: -1,
    macroScore: -1,
  });
  const bearishDecision = requireUsableDecision(bearish.runtime);

  assertEqual(bearishDecision.data.stance, "bearish", "bearish Decision stance");
  assertEqual(bearishDecision.data.score, -1, "bearish Decision score");
  assertDecisionMatchesConviction(bearish.runtime, "bearish");

  const notApplicable = await runCase({
    macroApplicability: "not-applicable",
  });
  const notApplicableConfidence =
    requireAvailableConfidence(notApplicable.runtime);

  if (notApplicableConfidence.data.availability !== "partial") {
    throw new Error("Not-applicable data confidence is unavailable.");
  }

  if (notApplicableConfidence.conviction.availability !== "partial") {
    throw new Error("Not-applicable conviction is unavailable.");
  }

  assertEqual(
    notApplicableConfidence.data.data.components.macro.availability,
    "not-applicable",
    "data macro applicability",
  );
  assertEqual(
    notApplicableConfidence.conviction.data.components.macro.availability,
    "not-applicable",
    "conviction macro applicability",
  );
  assertEqual(
    notApplicableConfidence.conviction.data.score,
    1,
    "signal-only conviction",
  );
  assertEqual(
    notApplicable.runtime.engineResult.contradiction.availability,
    "not-applicable",
    "contradiction macro applicability",
  );
  assertEqual(
    notApplicableConfidence.conviction.data.components.contradiction.availability,
    "not-applicable",
    "confidence contradiction applicability",
  );
  const notApplicableDecision = requireUsableDecision(notApplicable.runtime);

  assertEqual(notApplicableDecision.data.stance, "bullish", "not-applicable Decision stance");
  assertEqual(notApplicableDecision.data.score, 1, "not-applicable Decision score");
  assertDecisionMatchesConviction(notApplicable.runtime, "not-applicable");

  const opposing = await runCase({
    macroApplicability: "applicable",
    macroScore: -1,
  });
  const opposingContradiction =
    requireAvailableContradiction(opposing.runtime);

  assertEqual(opposingContradiction.score, 1, "opposing contradiction score");
  assertEqual(opposingContradiction.conflicts.length, 1, "opposing conflicts");
  const opposingConfidence = requireAvailableConfidence(opposing.runtime);

  if (opposingConfidence.conviction.availability !== "partial") {
    throw new Error("Opposing conviction is unavailable.");
  }

  assertEqual(opposingConfidence.conviction.data.score, 0, "opposing conviction");
  assertEqual(
    opposingConfidence.conviction.data.components.contradiction.availability === "available"
      ? opposingConfidence.conviction.data.components.contradiction.data
      : null,
    opposingContradiction.score,
    "opposing canonical contradiction consumption",
  );
  const opposingDecision = requireUsableDecision(opposing.runtime);

  assertEqual(opposingDecision.data.stance, "neutral", "canceled Decision stance");
  assertEqual(opposingDecision.data.score, 0, "canceled Decision score");
  assertDecisionMatchesConviction(opposing.runtime, "canceled");

  const partialCoverage = await runCase({
    macroApplicability: "applicable",
    signalScore: 0.8,
    macroScore: -0.4,
    macroCoverage: 0.5,
  });
  const partialCoverageContradiction =
    requireAvailableContradiction(partialCoverage.runtime);
  const partialCoverageConfidence =
    requireAvailableConfidence(partialCoverage.runtime);

  if (partialCoverageConfidence.conviction.availability !== "partial") {
    throw new Error("Partial-coverage conviction is unavailable.");
  }

  assertClose(
    partialCoverageContradiction.score,
    4 / 15,
    "partial-coverage contradiction",
  );
  assertClose(
    partialCoverageConfidence.conviction.data.score,
    0.4,
    "partial-coverage conviction",
  );
  assertEqual(
    partialCoverageConfidence.conviction.data.components.contradiction.availability === "available"
      ? partialCoverageConfidence.conviction.data.components.contradiction.data
      : null,
    partialCoverageContradiction.score,
    "partial-coverage canonical contradiction consumption",
  );
  const partialCoverageDecision = requireUsableDecision(partialCoverage.runtime);

  assertEqual(partialCoverageDecision.data.stance, "bullish", "partial-coverage Decision stance");
  assertClose(partialCoverageDecision.data.score, 0.4, "partial-coverage Decision score");
  assertDecisionMatchesConviction(partialCoverage.runtime, "partial-coverage");

  const macroDominant = await runCase({
    macroApplicability: "applicable",
    signalScore: 0.2,
    macroScore: -1,
    macroCoverage: 0.5,
  });
  const macroDominantContradiction =
    requireAvailableContradiction(macroDominant.runtime);
  const macroDominantConfidence =
    requireAvailableConfidence(macroDominant.runtime);
  const macroDominantDecision =
    requireUsableDecision(macroDominant.runtime);

  if (macroDominantConfidence.conviction.availability !== "partial") {
    throw new Error("Macro-dominant conviction is unavailable.");
  }

  assertClose(macroDominantContradiction.score, 4 / 15, "macro-dominant contradiction");
  assertClose(macroDominantConfidence.conviction.data.score, 0.2, "macro-dominant conviction");
  assertEqual(macroDominantDecision.data.stance, "bearish", "macro-dominant Decision stance");
  assertClose(macroDominantDecision.data.score, -0.2, "macro-dominant Decision score");
  assertDecisionMatchesConviction(macroDominant.runtime, "macro-dominant");

  const partialMacro = await runCase({
    macroApplicability: "applicable",
    macroScore: -1,
    macroMissing: ["macro-driver"],
  });
  const partialContradiction =
    partialMacro.runtime.engineResult.contradiction;

  if (partialContradiction.availability !== "partial") {
    throw new Error(
      `partial contradiction: received ${partialContradiction.availability}`,
    );
  }

  assertEqual(partialContradiction.data.score, 1, "partial contradiction score");
  assertEqual(
    partialContradiction.missing.join(","),
    "macro-driver",
    "partial contradiction missing",
  );
  assertEqual(
    partialMacro.runtime.engineResult.decision.availability,
    "partial",
    "partial evidence Decision lifecycle",
  );

  const zeroCoverage = await runCase({
    macroApplicability: "applicable",
    macroScore: -1,
    macroCoverage: 0,
  });

  assertEqual(
    zeroCoverage.runtime.engineResult.contradiction.availability,
    "unavailable",
    "zero-coverage contradiction",
  );
  const zeroCoverageConfidence =
    requireAvailableConfidence(zeroCoverage.runtime);

  if (zeroCoverageConfidence.conviction.availability !== "partial") {
    throw new Error("Zero-coverage conviction is unavailable.");
  }

  assertEqual(
    zeroCoverageConfidence.conviction.data.score,
    1,
    "zero-coverage signal-only conviction",
  );
  assertEqual(
    zeroCoverageConfidence.conviction.data.components.contradiction.availability,
    "unavailable",
    "zero-coverage confidence contradiction",
  );
  const zeroCoverageDecision = requireUsableDecision(zeroCoverage.runtime);

  assertEqual(zeroCoverageDecision.availability, "partial", "zero-coverage Decision lifecycle");
  assertEqual(zeroCoverageDecision.data.stance, "bullish", "zero-coverage Decision stance");
  assertEqual(zeroCoverageDecision.data.score, 1, "zero-coverage Decision score");
  assertDecisionMatchesConviction(zeroCoverage.runtime, "zero-coverage");

  const invalidHistory = await runCase({
    macroApplicability: "applicable",
    receivedPoints: Number.NaN,
  });
  const invalidHistoryConfidence =
    requireAvailableConfidence(invalidHistory.runtime);

  if (invalidHistoryConfidence.data.availability !== "partial") {
    throw new Error("Invalid-history data confidence is unavailable.");
  }

  assertEqual(
    invalidHistoryConfidence.data.data.components.marketData.availability,
    "unavailable",
    "invalid history lifecycle",
  );

  let callbackError: unknown = null;

  try {
    await runCase({
      macroApplicability: "applicable",
      throwFromIntelligence: true,
    });
  } catch (error) {
    callbackError = error;
  }

  assertEqual(
    callbackError instanceof Error
      ? callbackError.message
      : null,
    "Expected callback failure",
    "callback error propagation",
  );

  console.log("PASS: Engine V3 runtime confidence integration");
}

void main();
