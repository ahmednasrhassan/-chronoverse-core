import type {
  EngineConfidenceInputV3,
  EngineConfidenceV3,
  EngineDataSection,
  EngineMacroV3,
  EngineMarketDataV3,
} from "../engine/contracts";
import type {
  MarketTechnicalSnapshot,
} from "./intelligenceEngine";
import type {
  MarketSignalResult,
} from "./signalEngine";

export type EngineConfidenceMacroInputV3<
  TMacroDetails = never,
> =
  | {
      readonly applicability: "not-applicable";
      readonly reason?: string;
    }
  | {
      readonly applicability: "applicable";
      readonly section: EngineMacroV3<TMacroDetails>;
    };

export interface CalculateEngineConfidenceV3Input<
  TMacroDetails = never,
> {
  readonly marketData: EngineMarketDataV3;
  readonly minimumRequiredHistory: number;
  readonly technical: EngineDataSection<MarketTechnicalSnapshot>;
  readonly signal: EngineDataSection<MarketSignalResult>;
  readonly macro: EngineConfidenceMacroInputV3<TMacroDetails>;
}

type ResolvedComponent = {
  readonly component: EngineConfidenceInputV3;
  readonly score: number | null;
  readonly missing: readonly string[];
};

const NOT_COMPUTED = {
  availability: "not-computed",
} as const;

export function calculateEngineConfidenceV3<
  TMacroDetails = never,
>(
  input: CalculateEngineConfidenceV3Input<TMacroDetails>,
): EngineConfidenceV3 {
  const marketData = resolveMarketData(
    input.marketData,
    input.minimumRequiredHistory,
  );
  const technical = resolveTechnical(input.technical);
  const macroData = resolveMacroData(input.macro);

  const dataScores = [
    marketData.score,
    technical.score,
    macroData.score,
  ].filter(isFiniteNumber);

  const data = dataScores.length === 0
    ? {
        availability: "unavailable" as const,
        reason: "No usable data-confidence evidence is available.",
      }
    : {
        availability: "partial" as const,
        data: {
          score: clamp01(Math.min(...dataScores)),
          components: {
            marketData: marketData.component,
            technical: technical.component,
            macro: macroData.component,
            crossAsset: NOT_COMPUTED,
            positioning: NOT_COMPUTED,
          },
        },
        missing: unique([
          ...marketData.missing,
          ...technical.missing,
          ...macroData.missing,
          "crossAsset",
          "positioning",
        ]),
      };

  const signal = resolveSignal(input.signal);
  const macroConviction = resolveMacroConviction(input.macro);

  if (signal.score === null || signal.signedScore === null) {
    return {
      data,
      conviction: {
        availability: "unavailable",
        reason: "A valid signal score is required for market conviction.",
      },
    };
  }

  const convictionScore =
    macroConviction.signedScore === null ||
    macroConviction.coverage === null ||
    macroConviction.coverage === 0
      ? Math.abs(signal.signedScore)
      : clamp01(
          Math.abs(
            (
              signal.signedScore +
              macroConviction.coverage * macroConviction.signedScore
            ) /
              (1 + macroConviction.coverage),
          ),
        );

  return {
    data,
    conviction: {
      availability: "partial",
      data: {
        score: convictionScore,
        components: {
          signal: signal.component,
          macro: macroConviction.component,
          state: {
            availability: "unavailable",
            reason: "State confidence is derived and not independent conviction evidence.",
          },
          regime: {
            availability: "unavailable",
            reason: "Current regime confidence is derived and not an independent measure.",
          },
          crossAsset: NOT_COMPUTED,
          positioning: NOT_COMPUTED,
          scenario: NOT_COMPUTED,
          contradiction: NOT_COMPUTED,
        },
      },
      missing: unique([
        ...signal.missing,
        ...macroConviction.missing,
        "state",
        "regime",
        "crossAsset",
        "positioning",
        "scenario",
        "contradiction",
      ]),
    },
  };
}

function resolveMarketData(
  marketData: EngineMarketDataV3,
  minimumRequiredHistory: number,
): ResolvedComponent {
  if (marketData.availability === "unavailable") {
    return unavailable(
      "marketData",
      marketData.reason ?? "Market data is unavailable.",
    );
  }

  const receivedPoints = marketData.historicalWindow?.receivedPoints;

  if (
    !isFiniteNumber(minimumRequiredHistory) ||
    minimumRequiredHistory <= 0 ||
    !isFiniteNumber(receivedPoints) ||
    receivedPoints < 0
  ) {
    return unavailable(
      "marketData",
      "Valid historical point counts are required for market-data confidence.",
    );
  }

  const score = clamp01(receivedPoints / minimumRequiredHistory);

  if (marketData.availability === "partial") {
    return {
      component: {
        availability: "partial",
        data: score,
        missing: ["marketData"],
      },
      score,
      missing: ["marketData"],
    };
  }

  return available(score);
}

function resolveTechnical(
  technical: EngineDataSection<MarketTechnicalSnapshot>,
): ResolvedComponent {
  if (technical.availability === "unavailable") {
    return unavailable(
      "technical",
      technical.reason ?? "Technical evidence is unavailable.",
    );
  }

  if (technical.availability === "partial") {
    return {
      component: {
        availability: "partial",
        data: 1,
        missing: technical.missing,
      },
      score: 1,
      missing: technical.missing,
    };
  }

  return available(1);
}

function resolveMacroData<TMacroDetails>(
  macro: EngineConfidenceMacroInputV3<TMacroDetails>,
): ResolvedComponent {
  if (macro.applicability === "not-applicable") {
    return {
      component: {
        availability: "not-applicable",
        reason: macro.reason,
      },
      score: null,
      missing: [],
    };
  }

  const { section } = macro;

  if (section.availability === "unavailable") {
    return unavailable(
      "macro",
      section.reason ?? "Macro evidence is unavailable.",
    );
  }

  const coverage = section.data.coverage;

  if (!isFiniteNumber(coverage)) {
    return unavailable(
      "macro",
      "A valid macro coverage value is required for data confidence.",
    );
  }

  const score = clamp01(coverage);

  if (section.availability === "partial") {
    return {
      component: {
        availability: "partial",
        data: score,
        missing: section.missing,
      },
      score,
      missing: section.missing,
    };
  }

  return available(score);
}

function resolveSignal(
  signal: EngineDataSection<MarketSignalResult>,
): ResolvedComponent & { readonly signedScore: number | null } {
  if (signal.availability === "unavailable") {
    return {
      ...unavailable(
        "signal",
        signal.reason ?? "Signal evidence is unavailable.",
      ),
      signedScore: null,
    };
  }

  if (!isFiniteNumber(signal.data.score)) {
    return {
      ...unavailable(
        "signal",
        "A valid signal score is required for market conviction.",
      ),
      signedScore: null,
    };
  }

  const signedScore = clampSigned(signal.data.score);
  const score = Math.abs(signedScore);

  if (signal.availability === "partial") {
    return {
      component: {
        availability: "partial",
        data: score,
        missing: signal.missing,
      },
      score,
      signedScore,
      missing: signal.missing,
    };
  }

  return {
    ...available(score),
    signedScore,
  };
}

function resolveMacroConviction<TMacroDetails>(
  macro: EngineConfidenceMacroInputV3<TMacroDetails>,
): ResolvedComponent & {
  readonly signedScore: number | null;
  readonly coverage: number | null;
} {
  if (macro.applicability === "not-applicable") {
    return {
      component: {
        availability: "not-applicable",
        reason: macro.reason,
      },
      score: null,
      signedScore: null,
      coverage: null,
      missing: [],
    };
  }

  const { section } = macro;

  if (section.availability === "unavailable") {
    return {
      ...unavailable(
        "macro",
        section.reason ?? "Macro evidence is unavailable.",
      ),
      signedScore: null,
      coverage: null,
    };
  }

  if (
    !isFiniteNumber(section.data.score) ||
    !isFiniteNumber(section.data.coverage)
  ) {
    return {
      ...unavailable(
        "macro",
        "Valid macro score and coverage values are required for market conviction.",
      ),
      signedScore: null,
      coverage: null,
    };
  }

  const signedScore = clampSigned(section.data.score);
  const coverage = clamp01(section.data.coverage);
  const score = Math.abs(signedScore);

  if (section.availability === "partial") {
    return {
      component: {
        availability: "partial",
        data: score,
        missing: section.missing,
      },
      score,
      signedScore,
      coverage,
      missing: section.missing,
    };
  }

  return {
    ...available(score),
    signedScore,
    coverage,
  };
}

function available(score: number): ResolvedComponent {
  return {
    component: {
      availability: "available",
      data: score,
    },
    score,
    missing: [],
  };
}

function unavailable(
  missing: string,
  reason: string,
): ResolvedComponent {
  return {
    component: {
      availability: "unavailable",
      reason,
    },
    score: null,
    missing: [missing],
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clampSigned(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
