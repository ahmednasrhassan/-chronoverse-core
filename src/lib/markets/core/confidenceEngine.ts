import type {
  EngineConfidenceInputV3,
  EngineConfidenceV3,
  EngineContradictionSectionV3,
  EngineCrossAssetSectionV3,
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
import {
  calculatePrimaryEvidenceAlgebraV3,
  ENGINE_V3_EVIDENCE_POLICY,
} from "../engine/evidenceAlgebra";

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
  readonly contradiction: EngineContradictionSectionV3;
  readonly crossAsset?: EngineCrossAssetSectionV3;
}

type ResolvedComponent = {
  readonly component: EngineConfidenceInputV3;
  readonly score: number | null;
  readonly missing: readonly string[];
};

type ResolvedContradiction = ResolvedComponent & {
  readonly score: number | null;
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
  const crossAsset = resolveCrossAsset(input.crossAsset);

  const dataScores = [
    marketData.score,
    technical.score,
    macroData.score,
    crossAsset.data.score,
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
            crossAsset: crossAsset.data.component,
            positioning: NOT_COMPUTED,
          },
        },
        missing: unique([
          ...marketData.missing,
          ...technical.missing,
          ...macroData.missing,
          ...crossAsset.data.missing,
          "positioning",
        ]),
      };

  const signal = resolveSignal(input.signal);
  const macroConviction = resolveMacroConviction(input.macro);
  const contradiction = resolveContradiction(
    input.contradiction,
  );

  if (signal.score === null || signal.signedScore === null) {
    return {
      data,
      conviction: {
        availability: "unavailable",
        reason: "A valid signal score is required for market conviction.",
      },
    };
  }

  const convictionComponents = {
    signal: signal.component,
    macro: macroConviction.component,
    state: {
      availability: "unavailable" as const,
      reason: "State confidence is derived and not independent conviction evidence.",
    },
    regime: {
      availability: "unavailable" as const,
      reason: "Current regime confidence is derived and not an independent measure.",
    },
    crossAsset: crossAsset.conviction.component,
    positioning: NOT_COMPUTED,
    scenario: NOT_COMPUTED,
    contradiction: contradiction.component,
  };
  const deferredMissing = [
    "state",
    "regime",
    ...crossAsset.conviction.missing,
    "positioning",
    "scenario",
  ];

  if (input.macro.applicability === "not-applicable") {
    const convictionScore = resolveConvictionScore(
      Math.abs(signal.signedScore),
      contradiction,
      isUsableCrossAsset(input.crossAsset),
    );

    if (convictionScore === null) {
      return unavailableConviction(data);
    }

    return {
      data,
      conviction: {
        availability: "partial",
        data: {
          score: convictionScore,
          components: convictionComponents,
        },
        missing: unique([
          ...signal.missing,
          ...contradiction.missing,
          ...deferredMissing,
        ]),
      },
    };
  }

  if (
    macroConviction.signedScore === null ||
    macroConviction.coverage === null ||
    macroConviction.coverage === 0
  ) {
    const convictionScore = resolveConvictionScore(
      Math.abs(signal.signedScore),
      contradiction,
      isUsableCrossAsset(input.crossAsset),
    );

    if (convictionScore === null) {
      return unavailableConviction(data);
    }

    return {
      data,
      conviction: {
        availability: "partial",
        data: {
          score: convictionScore,
          components: convictionComponents,
        },
        missing: unique([
          ...signal.missing,
          ...macroConviction.missing,
          ...(macroConviction.coverage === 0 ? ["macro"] : []),
          ...contradiction.missing,
          ...deferredMissing,
        ]),
      },
    };
  }

  if (contradiction.score === null) {
    return {
      data,
      conviction: {
        availability: "unavailable",
        reason: "Usable canonical contradiction evidence is required for market conviction.",
      },
    };
  }

  const primary = calculatePrimaryEvidenceAlgebraV3([
    {
      id: "signal",
      evidenceRole: ENGINE_V3_EVIDENCE_POLICY.signal.evidenceRole,
      score: signal.signedScore,
      architecturePrior: ENGINE_V3_EVIDENCE_POLICY.signal.architecturePrior,
      coverage: 1,
    },
    {
      id: "macro",
      evidenceRole: ENGINE_V3_EVIDENCE_POLICY.macro.evidenceRole,
      score: macroConviction.signedScore,
      architecturePrior: ENGINE_V3_EVIDENCE_POLICY.macro.architecturePrior,
      coverage: macroConviction.coverage,
    },
  ]);
  const rawEvidenceStrength = primary.rawEvidenceStrength;
  const convictionScore = clamp01(
    rawEvidenceStrength - contradiction.score,
  );

  return {
    data,
    conviction: {
      availability: "partial",
      data: {
        score: convictionScore,
        components: convictionComponents,
      },
      missing: unique([
        ...signal.missing,
        ...macroConviction.missing,
        ...contradiction.missing,
        ...deferredMissing,
      ]),
    },
  };
}

function resolveCrossAsset(
  section: EngineCrossAssetSectionV3 | undefined,
): {
  readonly data: ResolvedComponent;
  readonly conviction: ResolvedComponent;
} {
  if (section === undefined || section.availability === "not-computed") {
    const resolved = {
      component: NOT_COMPUTED,
      score: null,
      missing: ["crossAsset"],
    };

    return { data: resolved, conviction: resolved };
  }

  if (section.availability === "not-applicable") {
    const resolved = {
      component: {
        availability: "not-applicable" as const,
        reason: section.reason,
      },
      score: null,
      missing: [],
    };

    return { data: resolved, conviction: resolved };
  }

  if (section.availability === "unavailable") {
    const resolved = unavailable(
      "crossAsset",
      section.reason ?? "Cross-Asset evidence is unavailable.",
    );

    return { data: resolved, conviction: resolved };
  }

  const { score, coverage } = section.data;

  if (
    !isFiniteNumber(score) ||
    score < -1 ||
    score > 1 ||
    !isFiniteNumber(coverage) ||
    coverage <= 0 ||
    coverage > 1 ||
    (section.availability === "available" && coverage !== 1) ||
    (section.availability === "partial" && coverage >= 1)
  ) {
    const resolved = unavailable(
      "crossAsset",
      "Valid normalized Cross-Asset score and coverage are required.",
    );

    return { data: resolved, conviction: resolved };
  }

  const capacity = coverage * Math.abs(score);

  if (section.availability === "partial") {
    return {
      data: {
        component: {
          availability: "partial",
          data: coverage,
          missing: section.missing,
        },
        score: coverage,
        missing: section.missing,
      },
      conviction: {
        component: {
          availability: "partial",
          data: capacity,
          missing: section.missing,
        },
        score: capacity,
        missing: section.missing,
      },
    };
  }

  return {
    data: available(coverage),
    conviction: available(capacity),
  };
}

function resolveConvictionScore(
  rawEvidenceStrength: number,
  contradiction: ResolvedContradiction,
  crossAssetWasSupplied: boolean,
): number | null {
  if (!crossAssetWasSupplied) {
    return rawEvidenceStrength;
  }

  return contradiction.score === null
    ? null
    : clamp01(rawEvidenceStrength - contradiction.score);
}

function isUsableCrossAsset(
  section: EngineCrossAssetSectionV3 | undefined,
): boolean {
  return section?.availability === "available" || section?.availability === "partial";
}

function unavailableConviction(
  data: EngineConfidenceV3["data"],
): EngineConfidenceV3 {
  return {
    data,
    conviction: {
      availability: "unavailable",
      reason: "Usable canonical contradiction evidence is required for market conviction.",
    },
  };
}

function resolveContradiction(
  contradiction: EngineContradictionSectionV3,
): ResolvedContradiction {
  if (contradiction.availability === "not-computed") {
    return {
      component: NOT_COMPUTED,
      score: null,
      missing: ["contradiction"],
    };
  }

  if (contradiction.availability === "not-applicable") {
    return {
      component: {
        availability: "not-applicable",
        reason: contradiction.reason,
      },
      score: null,
      missing: [],
    };
  }

  if (contradiction.availability === "unavailable") {
    return unavailableContradiction(
      contradiction.reason ?? "Contradiction evidence is unavailable.",
    );
  }

  if (!isFiniteNumber(contradiction.data.score)) {
    return unavailableContradiction(
      "A finite contradiction score is required for market conviction.",
    );
  }

  const score = clamp01(contradiction.data.score);

  if (contradiction.availability === "partial") {
    return {
      component: {
        availability: "partial",
        data: score,
        missing: contradiction.missing,
      },
      score,
      missing: contradiction.missing,
    };
  }

  return {
    component: {
      availability: "available",
      data: score,
    },
    score,
    missing: [],
  };
}

function unavailableContradiction(
  reason: string,
): ResolvedContradiction {
  return {
    component: {
      availability: "unavailable",
      reason,
    },
    score: null,
    missing: ["contradiction"],
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
