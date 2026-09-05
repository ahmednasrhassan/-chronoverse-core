import type {
  EngineConfidenceSectionV3,
  EngineDataSection,
  EngineDecisionSectionV3,
  EngineMacroV3,
} from "../engine/contracts";
import type {
  MarketSignalResult,
} from "./signalEngine";

export type EngineDecisionMacroInputV3<
  TDetails = never,
> =
  | {
      readonly applicability: "not-applicable";
      readonly reason?: string;
    }
  | {
      readonly applicability: "applicable";
      readonly section: EngineMacroV3<TDetails>;
    };

export interface CalculateEngineDecisionV3Input<
  TDetails = never,
> {
  readonly signal: EngineDataSection<MarketSignalResult>;
  readonly macro: EngineDecisionMacroInputV3<TDetails>;
  readonly confidence: EngineConfidenceSectionV3;
}

export function calculateEngineDecisionV3<
  TDetails = never,
>(
  input: CalculateEngineDecisionV3Input<TDetails>,
): EngineDecisionSectionV3 {
  if (input.confidence.availability !== "available") {
    return {
      availability: "unavailable",
      reason:
        input.confidence.availability === "unavailable"
          ? input.confidence.reason ?? "Canonical confidence is unavailable."
          : "Canonical confidence has not been computed.",
    };
  }

  const confidence = input.confidence.data;
  const conviction = confidence.conviction;

  if (conviction.availability === "unavailable") {
    return {
      availability: "unavailable",
      reason: conviction.reason ?? "Canonical Market Conviction is unavailable.",
    };
  }

  const convictionScore = conviction.data.score;

  if (
    !isFiniteNumber(convictionScore) ||
    convictionScore < 0 ||
    convictionScore > 1
  ) {
    return {
      availability: "unavailable",
      reason: "Canonical Market Conviction must be finite and normalized to 0..1.",
    };
  }

  if (input.signal.availability === "unavailable") {
    return {
      availability: "unavailable",
      reason: input.signal.reason ?? "Signal evidence is unavailable.",
    };
  }

  if (!isFiniteNumber(input.signal.data.score)) {
    return {
      availability: "unavailable",
      reason: "A finite signal score is required for Decision.",
    };
  }

  const signalScore = clampSigned(input.signal.data.score);
  let signedBalance = signalScore;
  let isPartial =
    input.signal.availability === "partial" ||
    conviction.availability === "partial";
  const missing = [
    ...(input.signal.availability === "partial"
      ? input.signal.missing
      : []),
    ...(conviction.availability === "partial"
      ? conviction.missing
      : []),
  ];

  if (confidence.data.availability === "partial") {
    isPartial = true;
    missing.push(...confidence.data.missing);
  } else if (confidence.data.availability === "unavailable") {
    isPartial = true;
    missing.push("dataConfidence");
  }

  if (input.macro.applicability === "applicable") {
    const macro = input.macro.section;

    if (macro.availability === "unavailable") {
      isPartial = true;
      missing.push("macro");
    } else if (
      !isFiniteNumber(macro.data.score) ||
      !isFiniteNumber(macro.data.coverage) ||
      macro.data.coverage <= 0
    ) {
      isPartial = true;
      missing.push("macro");
    } else {
      const macroScore = clampSigned(macro.data.score);
      const macroCoverage = clamp01(macro.data.coverage);

      signedBalance =
        signalScore + macroCoverage * macroScore;

      if (macro.availability === "partial") {
        isPartial = true;
        missing.push(...macro.missing);
      }
    }
  }

  const decision = convictionScore === 0
    ? {
        score: 0,
        stance: "neutral" as const,
      }
    : signedBalance > 0
      ? {
          score: convictionScore,
          stance: "bullish" as const,
        }
      : signedBalance < 0
        ? {
            score: -convictionScore,
            stance: "bearish" as const,
          }
        : null;

  if (decision === null) {
    return {
      availability: "unavailable",
      reason: "Positive Market Conviction is inconsistent with zero signed directional balance.",
    };
  }

  return isPartial
    ? {
        availability: "partial",
        data: decision,
        missing: unique(missing),
      }
    : {
        availability: "available",
        data: decision,
      };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clampSigned(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
