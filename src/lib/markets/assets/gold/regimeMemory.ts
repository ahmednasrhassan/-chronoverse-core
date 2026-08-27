import type {
  GoldIntelligenceResult,
  GoldIntelligenceState,
} from "./intelligence";

export type GoldRegimeSnapshot = {
  timestamp: string;

  state: GoldIntelligenceState;

  confidence: number;

  signalDirection:
    GoldIntelligenceResult["signal"]["direction"];

  signalConfidence: number;

  macroBias:
    | "bullish"
    | "bearish"
    | "neutral"
    | null;

  macroConfidence: number | null;

  riskLevel:
    GoldIntelligenceResult["risk"]["level"];

  riskScore: number;
};

export type GoldRegimeTransition =
  | "new"
  | "unchanged"
  | "improving"
  | "deteriorating"
  | "mixed";

export type GoldMomentumChange =
  | "strengthening"
  | "weakening"
  | "stable";

export type GoldMacroChange =
  | "improving"
  | "deteriorating"
  | "stable"
  | "unavailable";

export type GoldRegimeMemoryResult = {
  current: GoldRegimeSnapshot;

  previous: GoldRegimeSnapshot | null;

  transition: {
    changed: boolean;

    from:
      | GoldIntelligenceState
      | null;

    to: GoldIntelligenceState;

    direction: GoldRegimeTransition;
  };

  conviction: {
    current: number;

    previous: number | null;

    change: number | null;

    direction:
      | "rising"
      | "falling"
      | "stable";
  };

  technical: {
    current:
      GoldIntelligenceResult["signal"]["direction"];

    previous:
      | GoldIntelligenceResult["signal"]["direction"]
      | null;

    confidence: number;

    previousConfidence: number | null;

    change: GoldMomentumChange;
  };

  macro: {
    current:
      | "bullish"
      | "bearish"
      | "neutral"
      | null;

    previous:
      | "bullish"
      | "bearish"
      | "neutral"
      | null;

    confidence: number | null;

    previousConfidence: number | null;

    change: GoldMacroChange;
  };

  risk: {
    currentLevel:
      GoldIntelligenceResult["risk"]["level"];

    previousLevel:
      | GoldIntelligenceResult["risk"]["level"]
      | null;

    currentScore: number;

    previousScore: number | null;

    change:
      | "improving"
      | "deteriorating"
      | "stable";
  };
};

/**
 * Chronoverse Capital
 * Gold Regime Memory
 *
 * Intelligence Snapshot
 *        ↓
 * Previous Snapshot
 *        ↓
 * Transition Detection
 *        ↓
 * Conviction Change
 *        ↓
 * Technical Change
 *        ↓
 * Macro Change
 *        ↓
 * Risk Change
 *
 * Pure analytical layer.
 *
 * No provider dependency.
 * No database dependency.
 * No UI dependency.
 */
export function createGoldRegimeSnapshot(
  intelligence: GoldIntelligenceResult,
  timestamp = new Date().toISOString(),
): GoldRegimeSnapshot {
  return {
    timestamp,

    state:
      intelligence.state,

    confidence:
      intelligence.confidence,

    signalDirection:
      intelligence.signal.direction,

    signalConfidence:
      intelligence.signal.confidence,

    macroBias:
      intelligence.macro?.bias ??
      null,

    macroConfidence:
      intelligence.macro?.confidence ??
      null,

    riskLevel:
      intelligence.risk.level,

    riskScore:
      intelligence.risk.score,
  };
}

export function calculateGoldRegimeMemory(
  current: GoldRegimeSnapshot,
  previous:
    | GoldRegimeSnapshot
    | null,
): GoldRegimeMemoryResult {
  if (previous === null) {
    return {
      current,

      previous: null,

      transition: {
        changed: false,
        from: null,
        to: current.state,
        direction: "new",
      },

      conviction: {
        current:
          toPercentage(
            current.confidence,
          ),

        previous: null,

        change: null,

        direction: "stable",
      },

      technical: {
        current:
          current.signalDirection,

        previous: null,

        confidence:
          toPercentage(
            current.signalConfidence,
          ),

        previousConfidence:
          null,

        change: "stable",
      },

      macro: {
        current:
          current.macroBias,

        previous: null,

        confidence:
          current.macroConfidence ===
          null
            ? null
            : toPercentage(
                current.macroConfidence,
              ),

        previousConfidence:
          null,

        change:
          current.macroBias === null
            ? "unavailable"
            : "stable",
      },

      risk: {
        currentLevel:
          current.riskLevel,

        previousLevel: null,

        currentScore:
          current.riskScore,

        previousScore: null,

        change: "stable",
      },
    };
  }

  const convictionChange =
    current.confidence -
    previous.confidence;

  return {
    current,

    previous,

    transition:
      calculateTransition(
        current,
        previous,
      ),

    conviction: {
      current:
        toPercentage(
          current.confidence,
        ),

      previous:
        toPercentage(
          previous.confidence,
        ),

      change:
        roundPercentageDifference(
          convictionChange,
        ),

      direction:
        resolveNumericDirection(
          convictionChange,
          0.01,
        ),
    },

    technical: {
      current:
        current.signalDirection,

      previous:
        previous.signalDirection,

      confidence:
        toPercentage(
          current.signalConfidence,
        ),

      previousConfidence:
        toPercentage(
          previous.signalConfidence,
        ),

      change:
        calculateTechnicalChange(
          current,
          previous,
        ),
    },

    macro: {
      current:
        current.macroBias,

      previous:
        previous.macroBias,

      confidence:
        current.macroConfidence ===
        null
          ? null
          : toPercentage(
              current.macroConfidence,
            ),

      previousConfidence:
        previous.macroConfidence ===
        null
          ? null
          : toPercentage(
              previous.macroConfidence,
            ),

      change:
        calculateMacroChange(
          current,
          previous,
        ),
    },

    risk: {
      currentLevel:
        current.riskLevel,

      previousLevel:
        previous.riskLevel,

      currentScore:
        current.riskScore,

      previousScore:
        previous.riskScore,

      change:
        calculateRiskChange(
          current.riskScore,
          previous.riskScore,
        ),
    },
  };
}

function calculateTransition(
  current: GoldRegimeSnapshot,
  previous: GoldRegimeSnapshot,
): GoldRegimeMemoryResult["transition"] {
  if (
    current.state ===
    previous.state
  ) {
    return {
      changed: false,
      from:
        previous.state,
      to:
        current.state,
      direction:
        "unchanged",
    };
  }

  const currentRank =
    regimeRank(
      current.state,
    );

  const previousRank =
    regimeRank(
      previous.state,
    );

  if (
    currentRank >
    previousRank
  ) {
    return {
      changed: true,
      from:
        previous.state,
      to:
        current.state,
      direction:
        "improving",
    };
  }

  if (
    currentRank <
    previousRank
  ) {
    return {
      changed: true,
      from:
        previous.state,
      to:
        current.state,
      direction:
        "deteriorating",
    };
  }

  return {
    changed: true,
    from:
      previous.state,
    to:
      current.state,
    direction:
      "mixed",
  };
}

function calculateTechnicalChange(
  current: GoldRegimeSnapshot,
  previous: GoldRegimeSnapshot,
): GoldMomentumChange {
  const currentDirection =
    directionRank(
      current.signalDirection,
    );

  const previousDirection =
    directionRank(
      previous.signalDirection,
    );

  if (
    currentDirection >
    previousDirection
  ) {
    return "strengthening";
  }

  if (
    currentDirection <
    previousDirection
  ) {
    return "weakening";
  }

  const difference =
    current.signalConfidence -
    previous.signalConfidence;

  if (difference >= 0.03) {
    return "strengthening";
  }

  if (difference <= -0.03) {
    return "weakening";
  }

  return "stable";
}

function calculateMacroChange(
  current: GoldRegimeSnapshot,
  previous: GoldRegimeSnapshot,
): GoldMacroChange {
  if (
    current.macroBias === null
  ) {
    return "unavailable";
  }

  if (
    previous.macroBias === null
  ) {
    return "stable";
  }

  const currentRank =
    macroRank(
      current.macroBias,
    );

  const previousRank =
    macroRank(
      previous.macroBias,
    );

  if (
    currentRank >
    previousRank
  ) {
    return "improving";
  }

  if (
    currentRank <
    previousRank
  ) {
    return "deteriorating";
  }

  if (
    current.macroConfidence ===
      null ||
    previous.macroConfidence ===
      null
  ) {
    return "stable";
  }

  const confidenceChange =
    current.macroConfidence -
    previous.macroConfidence;

  /*
   * Confidence only matters when
   * directional bias remains unchanged.
   */
  if (
    current.macroBias === "bullish"
  ) {
    if (
      confidenceChange >=
      0.03
    ) {
      return "improving";
    }

    if (
      confidenceChange <=
      -0.03
    ) {
      return "deteriorating";
    }
  }

  if (
    current.macroBias === "bearish"
  ) {
    if (
      confidenceChange >=
      0.03
    ) {
      return "deteriorating";
    }

    if (
      confidenceChange <=
      -0.03
    ) {
      return "improving";
    }
  }

  return "stable";
}

function calculateRiskChange(
  currentScore: number,
  previousScore: number,
):
  | "improving"
  | "deteriorating"
  | "stable" {
  const difference =
    currentScore -
    previousScore;

  if (difference >= 0.03) {
    return "deteriorating";
  }

  if (difference <= -0.03) {
    return "improving";
  }

  return "stable";
}

function regimeRank(
  state: GoldIntelligenceState,
): number {
  if (
    state === "opportunity"
  ) {
    return 2;
  }

  if (
    state === "caution"
  ) {
    return 1;
  }

  return 0;
}

function directionRank(
  direction:
    GoldIntelligenceResult["signal"]["direction"],
): number {
  if (
    direction === "bullish"
  ) {
    return 2;
  }

  if (
    direction === "neutral"
  ) {
    return 1;
  }

  return 0;
}

function macroRank(
  bias:
    | "bullish"
    | "bearish"
    | "neutral",
): number {
  if (
    bias === "bullish"
  ) {
    return 2;
  }

  if (
    bias === "neutral"
  ) {
    return 1;
  }

  return 0;
}

function resolveNumericDirection(
  difference: number,
  tolerance: number,
):
  | "rising"
  | "falling"
  | "stable" {
  if (
    difference >
    tolerance
  ) {
    return "rising";
  }

  if (
    difference <
    -tolerance
  ) {
    return "falling";
  }

  return "stable";
}

function toPercentage(
  value: number,
): number {
  return Math.round(
    value * 100,
  );
}

function roundPercentageDifference(
  difference: number,
): number {
  return Number(
    (
      difference *
      100
    ).toFixed(1),
  );
}