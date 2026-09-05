import type {
  EngineContradictionConflictV3,
  EngineContradictionSectionV3,
  EngineDataSection,
  EngineMacroV3,
} from "../engine/contracts";
import type {
  MarketSignalResult,
} from "./signalEngine";

export type EngineContradictionMacroInputV3<
  TMacroDetails = unknown,
> =
  | {
      readonly applicability: "not-applicable";
      readonly reason?: string;
    }
  | {
      readonly applicability: "applicable";
      readonly section: EngineMacroV3<TMacroDetails>;
    };

export interface CalculateEngineContradictionV3Input<
  TMacroDetails = unknown,
> {
  readonly signal: EngineDataSection<MarketSignalResult>;

  readonly macro:
    EngineContradictionMacroInputV3<TMacroDetails>;
}

export function calculateEngineContradictionV3<
  TMacroDetails = unknown,
>(
  input: CalculateEngineContradictionV3Input<TMacroDetails>,
): EngineContradictionSectionV3 {
  if (input.macro.applicability === "not-applicable") {
    return {
      availability: "not-applicable",
      reason: input.macro.reason,
    };
  }

  const signal = input.signal;
  const macro = input.macro.section;

  if (signal.availability === "unavailable") {
    return {
      availability: "unavailable",
      reason: signal.reason ?? "Signal evidence is unavailable.",
    };
  }

  if (macro.availability === "unavailable") {
    return {
      availability: "unavailable",
      reason: macro.reason ?? "Macro evidence is unavailable.",
    };
  }

  if (!isFiniteNumber(signal.data.score)) {
    return {
      availability: "unavailable",
      reason: "A finite signal score is required for contradiction.",
    };
  }

  if (!isFiniteNumber(macro.data.score)) {
    return {
      availability: "unavailable",
      reason: "A finite macro score is required for contradiction.",
    };
  }

  if (!isFiniteNumber(macro.data.coverage)) {
    return {
      availability: "unavailable",
      reason: "Finite positive macro coverage is required for contradiction.",
    };
  }

  const signalScore = clampSigned(signal.data.score);
  const macroScore = clampSigned(macro.data.score);
  const macroCoverage = clamp01(macro.data.coverage);

  if (macroCoverage <= 0) {
    return {
      availability: "unavailable",
      reason: "Positive macro coverage is required for contradiction.",
    };
  }

  const signalMagnitude = Math.abs(signalScore);
  const effectiveMacroMagnitude =
    macroCoverage * Math.abs(macroScore);
  const opposingOverlap = hasOppositeNonZeroSigns(
    signalScore,
    macroScore,
  )
    ? Math.min(signalMagnitude, effectiveMacroMagnitude)
    : 0;
  const aggregateContradiction = clamp01(
    (2 * opposingOverlap) / (1 + macroCoverage),
  );

  const conflict: EngineContradictionConflictV3 | null =
    opposingOverlap > 0
      ? {
          sources: ["signal", "macro"],
          score: opposingOverlap,
        }
      : null;

  const data = {
    score: aggregateContradiction,
    evidence: [
      {
        source: "signal" as const,
        signedScore: signalScore,
      },
      {
        source: "macro" as const,
        signedScore: macroScore,
        coverage: macroCoverage,
      },
    ],
    conflicts: conflict === null ? [] : [conflict],
    strongestConflict: conflict,
  };

  const missing = unique([
    ...(signal.availability === "partial" ? signal.missing : []),
    ...(macro.availability === "partial" ? macro.missing : []),
  ]);

  return signal.availability === "partial" ||
    macro.availability === "partial"
    ? {
        availability: "partial",
        data,
        missing,
      }
    : {
        availability: "available",
        data,
      };
}

function hasOppositeNonZeroSigns(
  left: number,
  right: number,
): boolean {
  return (
    (left > 0 && right < 0) ||
    (left < 0 && right > 0)
  );
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
