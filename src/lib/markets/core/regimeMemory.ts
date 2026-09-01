export type MarketRegimeSignalDirection =
  | "bullish"
  | "neutral"
  | "bearish";

export type MarketRegimeMacroBias =
  | "bullish"
  | "neutral"
  | "bearish";

export type MarketRegimeTransition =
  | "new"
  | "unchanged"
  | "improving"
  | "deteriorating"
  | "mixed";

export type MarketRegimeMomentumChange =
  | "strengthening"
  | "weakening"
  | "stable";

export type MarketRegimeMacroChange =
  | "improving"
  | "deteriorating"
  | "stable"
  | "unavailable";

export type MarketRegimeRiskChange =
  | "improving"
  | "deteriorating"
  | "stable";

export type MarketRegimeStateRanker<
  TState extends string,
> = (
  state: TState,
) => number;

export type MarketRegimeSnapshot<
  TState extends string = string,
  TRiskLevel extends string = string,
> = {
  timestamp: string;

  state: TState;

  confidence: number;

  signalDirection:
    MarketRegimeSignalDirection;

  signalConfidence: number;

  macroBias:
    MarketRegimeMacroBias | null;

  macroConfidence:
    number | null;

  riskLevel:
    TRiskLevel;

  riskScore: number;
};

export type MarketRegimeMemoryResult<
  TState extends string = string,
  TRiskLevel extends string = string,
> = {
  current:
    MarketRegimeSnapshot<
      TState,
      TRiskLevel
    >;

  previous:
    | MarketRegimeSnapshot<
        TState,
        TRiskLevel
      >
    | null;

  transition: {
    changed: boolean;

    from:
      | TState
      | null;

    to: TState;

    direction:
      MarketRegimeTransition;
  };

  conviction: {
    current: number;

    previous:
      | number
      | null;

    change:
      | number
      | null;

    direction:
      | "rising"
      | "falling"
      | "stable";
  };

  technical: {
    current:
      MarketRegimeSignalDirection;

    previous:
      | MarketRegimeSignalDirection
      | null;

    confidence: number;

    previousConfidence:
      | number
      | null;

    change:
      MarketRegimeMomentumChange;
  };

  macro: {
    current:
      | MarketRegimeMacroBias
      | null;

    previous:
      | MarketRegimeMacroBias
      | null;

    confidence:
      | number
      | null;

    previousConfidence:
      | number
      | null;

    change:
      MarketRegimeMacroChange;
  };

  risk: {
    currentLevel:
      TRiskLevel;

    previousLevel:
      | TRiskLevel
      | null;

    currentScore: number;

    previousScore:
      | number
      | null;

    change:
      MarketRegimeRiskChange;
  };
};

export type CreateMarketRegimeSnapshotInput<
  TState extends string,
  TRiskLevel extends string,
> = {
  state: TState;

  confidence: number;

  signalDirection:
    MarketRegimeSignalDirection;

  signalConfidence: number;

  macroBias?:
    | MarketRegimeMacroBias
    | null;

  macroConfidence?:
    | number
    | null;

  riskLevel:
    TRiskLevel;

  riskScore: number;

  timestamp?: string;
};

/**
 * Chronoverse Capital
 * Universal Regime Memory
 *
 * Normalized intelligence snapshot
 * ->
 * Previous snapshot
 * ->
 * State transition
 * ->
 * Conviction change
 * ->
 * Technical change
 * ->
 * Macro change
 * ->
 * Risk change
 *
 * Pure analytical layer.
 *
 * No provider dependency.
 * No database dependency.
 * No Redis dependency.
 * No UI dependency.
 */
export function createMarketRegimeSnapshot<
  TState extends string,
  TRiskLevel extends string,
>(
  input:
    CreateMarketRegimeSnapshotInput<
      TState,
      TRiskLevel
    >,
): MarketRegimeSnapshot<
  TState,
  TRiskLevel
> {
  return {
    timestamp:
      input.timestamp ??
      new Date().toISOString(),

    state:
      input.state,

    confidence:
      input.confidence,

    signalDirection:
      input.signalDirection,

    signalConfidence:
      input.signalConfidence,

    macroBias:
      input.macroBias ??
      null,

    macroConfidence:
      input.macroConfidence ??
      null,

    riskLevel:
      input.riskLevel,

    riskScore:
      input.riskScore,
  };
}

export function calculateMarketRegimeMemory<
  TState extends string,
  TRiskLevel extends string,
>(
  current:
    MarketRegimeSnapshot<
      TState,
      TRiskLevel
    >,

  previous:
    | MarketRegimeSnapshot<
        TState,
        TRiskLevel
      >
    | null,

  stateRank:
    MarketRegimeStateRanker<TState>,
): MarketRegimeMemoryResult<
  TState,
  TRiskLevel
> {
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
        stateRank,
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

function calculateTransition<
  TState extends string,
  TRiskLevel extends string,
>(
  current:
    MarketRegimeSnapshot<
      TState,
      TRiskLevel
    >,

  previous:
    MarketRegimeSnapshot<
      TState,
      TRiskLevel
    >,

  stateRank:
    MarketRegimeStateRanker<TState>,
): MarketRegimeMemoryResult<
  TState,
  TRiskLevel
>["transition"] {
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
    stateRank(
      current.state,
    );

  const previousRank =
    stateRank(
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

function calculateTechnicalChange<
  TState extends string,
  TRiskLevel extends string,
>(
  current:
    MarketRegimeSnapshot<
      TState,
      TRiskLevel
    >,

  previous:
    MarketRegimeSnapshot<
      TState,
      TRiskLevel
    >,
): MarketRegimeMomentumChange {
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

function calculateMacroChange<
  TState extends string,
  TRiskLevel extends string,
>(
  current:
    MarketRegimeSnapshot<
      TState,
      TRiskLevel
    >,

  previous:
    MarketRegimeSnapshot<
      TState,
      TRiskLevel
    >,
): MarketRegimeMacroChange {
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

  if (
    current.macroBias ===
    "bullish"
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
    current.macroBias ===
    "bearish"
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
): MarketRegimeRiskChange {
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

function directionRank(
  direction:
    MarketRegimeSignalDirection,
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
    MarketRegimeMacroBias,
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