import type {
  EngineDecisionLifecycleSectionV3,
  EngineDecisionSectionV3,
  EngineDecisionStanceV3,
  EngineDecisionTransitionV3,
  EngineDecisionV3,
} from "../engine/contracts";

export interface CalculateDecisionLifecycleV3Input {
  readonly currentDecision: EngineDecisionSectionV3;
  readonly previousDecision: EngineDecisionSectionV3 | null;
}

type ResolvedDecision =
  | {
      readonly usable: true;
      readonly data: EngineDecisionV3;
      readonly partial: boolean;
      readonly missing: readonly string[];
    }
  | {
      readonly usable: false;
      readonly reason: string;
    };

export function calculateDecisionLifecycleV3(
  input: CalculateDecisionLifecycleV3Input,
): EngineDecisionLifecycleSectionV3 {
  const current = resolveDecision(
    input.currentDecision,
    "Current",
  );

  if (!current.usable) {
    return {
      availability: "unavailable",
      reason: current.reason,
    };
  }

  if (input.previousDecision === null) {
    const data = {
      comparison: "initialized" as const,
      current: current.data,
    };

    return current.partial
      ? {
          availability: "partial",
          data,
          missing: unique(current.missing),
        }
      : {
          availability: "available",
          data,
        };
  }

  const previous = resolveDecision(
    input.previousDecision,
    "Previous",
  );

  if (!previous.usable) {
    return {
      availability: "unavailable",
      reason: previous.reason,
    };
  }

  const decisionScoreDelta =
    current.data.score - previous.data.score;
  const convictionDelta =
    Math.abs(current.data.score) -
    Math.abs(previous.data.score);
  const data = {
    comparison: "compared" as const,
    previous: previous.data,
    current: current.data,
    transition: resolveTransition(
      previous.data.stance,
      current.data.stance,
    ),
    decisionScoreDelta,
    convictionDelta,
    convictionChange:
      convictionDelta > 0
        ? "increased" as const
        : convictionDelta < 0
          ? "decreased" as const
          : "unchanged" as const,
  };

  return previous.partial || current.partial
    ? {
        availability: "partial",
        data,
        missing: unique([
          ...previous.missing,
          ...current.missing,
        ]),
      }
    : {
        availability: "available",
        data,
      };
}

function resolveDecision(
  section: EngineDecisionSectionV3,
  label: "Current" | "Previous",
): ResolvedDecision {
  if (section.availability === "not-computed") {
    return {
      usable: false,
      reason: `${label} Decision has not been computed.`,
    };
  }

  if (section.availability === "unavailable") {
    return {
      usable: false,
      reason: section.reason ?? `${label} Decision is unavailable.`,
    };
  }

  const { score, stance } = section.data;

  if (!Number.isFinite(score) || score < -1 || score > 1) {
    return {
      usable: false,
      reason: `${label} Decision score must be finite and normalized to -1..1.`,
    };
  }

  if (
    (score > 0 && stance !== "bullish") ||
    (score < 0 && stance !== "bearish") ||
    (score === 0 && stance !== "neutral")
  ) {
    return {
      usable: false,
      reason: `${label} Decision stance must match its score sign.`,
    };
  }

  return {
    usable: true,
    data: section.data,
    partial: section.availability === "partial",
    missing:
      section.availability === "partial"
        ? section.missing
        : [],
  };
}

function resolveTransition(
  previous: EngineDecisionStanceV3,
  current: EngineDecisionStanceV3,
): EngineDecisionTransitionV3 {
  if (previous === current) {
    return {
      kind: "maintained",
      stance: current,
    };
  }

  if (current === "neutral") {
    return {
      kind: "neutralized",
      from:
        previous === "bullish"
          ? "bullish"
          : "bearish",
    };
  }

  if (previous === "neutral") {
    return {
      kind: "emerged",
      to: current,
    };
  }

  return previous === "bullish"
    ? {
        kind: "reversed",
        from: "bullish",
        to: "bearish",
      }
    : {
        kind: "reversed",
        from: "bearish",
        to: "bullish",
      };
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
