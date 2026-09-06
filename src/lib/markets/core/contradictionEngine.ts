import type {
  EngineContradictionConflictV3,
  EngineContradictionEvidenceV3,
  EngineContradictionSectionV3,
  EngineCrossAssetSectionV3,
  EngineDataSection,
  EngineMacroV3,
} from "../engine/contracts";
import type {
  MarketSignalResult,
} from "./signalEngine";
import {
  calculatePrimaryEvidenceAlgebraV3,
  calculateRoleAwareEvidenceV1,
  ENGINE_V3_EVIDENCE_POLICY,
  type CorroborativeEvidenceSectionInputV1,
  type PrimaryEvidenceChannelV3,
} from "../engine/evidenceAlgebra";

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

  readonly crossAsset?: EngineCrossAssetSectionV3;
}

export function calculateEngineContradictionV3<
  TMacroDetails = unknown,
>(
  input: CalculateEngineContradictionV3Input<TMacroDetails>,
): EngineContradictionSectionV3 {
  if (
    input.crossAsset?.availability === "available" ||
    input.crossAsset?.availability === "partial"
  ) {
    return calculateCrossAssetAwareContradiction(input, input.crossAsset);
  }

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
  const primary = calculatePrimaryEvidenceAlgebraV3([
    {
      id: "signal",
      evidenceRole: ENGINE_V3_EVIDENCE_POLICY.signal.evidenceRole,
      score: signalScore,
      architecturePrior: ENGINE_V3_EVIDENCE_POLICY.signal.architecturePrior,
      coverage: 1,
    },
    {
      id: "macro",
      evidenceRole: ENGINE_V3_EVIDENCE_POLICY.macro.evidenceRole,
      score: macroScore,
      architecturePrior: ENGINE_V3_EVIDENCE_POLICY.macro.architecturePrior,
      coverage: macroCoverage,
    },
  ]);
  const aggregateContradiction = primary.primaryContradiction;

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

function calculateCrossAssetAwareContradiction<TMacroDetails>(
  input: CalculateEngineContradictionV3Input<TMacroDetails>,
  crossAsset: Extract<
    EngineCrossAssetSectionV3,
    { readonly availability: "available" | "partial" }
  >,
): EngineContradictionSectionV3 {
  const signal = input.signal;

  if (signal.availability === "unavailable" || !isFiniteNumber(signal.data.score)) {
    return {
      availability: "unavailable",
      reason: signal.availability === "unavailable"
        ? signal.reason ?? "Signal evidence is unavailable."
        : "A finite signal score is required for contradiction.",
    };
  }

  const signalScore = clampSigned(signal.data.score);
  const primaryChannels: PrimaryEvidenceChannelV3[] = [{
    id: "signal",
    evidenceRole: ENGINE_V3_EVIDENCE_POLICY.signal.evidenceRole,
    score: signalScore,
    architecturePrior: ENGINE_V3_EVIDENCE_POLICY.signal.architecturePrior,
    coverage: 1,
  }];
  const evidence: EngineContradictionEvidenceV3[] = [{
    source: "signal" as const,
    signedScore: signalScore,
  }];
  const missing = [
    ...(signal.availability === "partial" ? signal.missing : []),
  ];
  let primaryConflict: EngineContradictionConflictV3 | null = null;

  if (input.macro.applicability === "applicable") {
    const macro = input.macro.section;

    if (
      macro.availability === "unavailable" ||
      !isFiniteNumber(macro.data.score) ||
      !isFiniteNumber(macro.data.coverage) ||
      macro.data.coverage <= 0
    ) {
      missing.push(
        ...(macro.availability === "partial" ? macro.missing : []),
        "macro",
      );
    } else {
      const macroScore = clampSigned(macro.data.score);
      const macroCoverage = clamp01(macro.data.coverage);
      const opposingOverlap = hasOppositeNonZeroSigns(signalScore, macroScore)
        ? Math.min(Math.abs(signalScore), macroCoverage * Math.abs(macroScore))
        : 0;

      primaryChannels.push({
        id: "macro",
        evidenceRole: ENGINE_V3_EVIDENCE_POLICY.macro.evidenceRole,
        score: macroScore,
        architecturePrior: ENGINE_V3_EVIDENCE_POLICY.macro.architecturePrior,
        coverage: macroCoverage,
      });
      evidence.push({
        source: "macro" as const,
        signedScore: macroScore,
        coverage: macroCoverage,
      });
      primaryConflict = opposingOverlap > 0
        ? { sources: ["signal", "macro"], score: opposingOverlap }
        : null;

      if (macro.availability === "partial") {
        missing.push(...macro.missing);
      }
    }
  }

  const primary = calculatePrimaryEvidenceAlgebraV3(primaryChannels);
  const corroborative = resolveCorroborativeInput(crossAsset);
  const roleAware = calculateRoleAwareEvidenceV1({
    mandatorySignalAnchorAvailable: true,
    primary,
    corroborative: corroborative.input,
  });

  if (roleAware.availability === "unavailable") {
    return { availability: "unavailable", reason: roleAware.reason };
  }

  missing.push(...corroborative.missing);

  if (corroborative.input.availability === "available" ||
    corroborative.input.availability === "partial") {
    evidence.push({
      source: "crossAsset" as const,
      signedScore: corroborative.input.score,
      coverage: corroborative.input.coverage,
    });
  }

  const usableCorroborative = roleAware.data.corroborative;
  const diagnostics = "confirmationStrength" in usableCorroborative
    ? {
        corroborativeConfirmation: usableCorroborative.confirmationStrength,
        corroborativeContradiction:
          usableCorroborative.corroborativeContradiction,
      }
    : {};
  const data = {
    score: roleAware.data.totalContradiction,
    primaryContradiction: primary.primaryContradiction,
    ...diagnostics,
    evidence,
    conflicts: primaryConflict === null ? [] : [primaryConflict],
    strongestConflict: primaryConflict,
  };
  const normalizedMissing = unique(missing);

  return normalizedMissing.length > 0
    ? { availability: "partial", data, missing: normalizedMissing }
    : { availability: "available", data };
}

function resolveCorroborativeInput(
  section: Extract<
    EngineCrossAssetSectionV3,
    { readonly availability: "available" | "partial" }
  >,
): {
  readonly input: CorroborativeEvidenceSectionInputV1;
  readonly missing: readonly string[];
} {
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
    return {
      input: { availability: "unavailable" },
      missing: ["crossAsset"],
    };
  }

  return section.availability === "partial"
    ? {
        input: {
          availability: "partial",
          score,
          coverage,
          missing: section.missing,
        },
        missing: section.missing,
      }
    : {
        input: { availability: "available", score, coverage },
        missing: [],
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
