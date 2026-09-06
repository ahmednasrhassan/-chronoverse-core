export type EvidenceRole =
  | "primary"
  | "corroborative"
  | "contextual";

/** Versioned semantic ownership policy. It contains no fitted coefficients. */
export const ENGINE_V3_EVIDENCE_POLICY = {
  signal: {
    evidenceRole: "primary",
    mandatory: true,
    architecturePrior: 1,
  },
  macro: {
    evidenceRole: "primary",
    mandatory: false,
    architecturePrior: 1,
  },
  crossAsset: {
    evidenceRole: "corroborative",
    mandatory: false,
  },
  technical: {
    evidenceRole: "contextual",
    evidenceVote: false,
    owner: "signal",
  },
  state: {
    evidenceRole: "contextual",
    evidenceVote: false,
    derived: true,
  },
  regime: {
    evidenceRole: "contextual",
    evidenceVote: false,
    derived: true,
  },
} as const;

export interface PrimaryEvidenceChannelV3 {
  readonly id: string;
  readonly evidenceRole: "primary";
  readonly score: number;
  readonly architecturePrior: number;
  readonly coverage: number;
}

export interface PrimaryEvidenceAlgebraV3 {
  readonly totalActivation: number;
  readonly positiveMass: number;
  readonly negativeMass: number;
  readonly rawEvidenceStrength: number;
  readonly primaryContradiction: number;
  readonly primarySignedBalance: number;
  readonly primaryConviction: number;
}

/** Pure primary-channel algebra. Inputs are usable, normalized evidence only. */
export function calculatePrimaryEvidenceAlgebraV3(
  channels: readonly PrimaryEvidenceChannelV3[],
): PrimaryEvidenceAlgebraV3 {
  const normalized = channels
    .map((channel) => ({ ...channel, id: channel.id.trim() }))
    .sort((left, right) => compareText(left.id, right.id));

  if (
    normalized.length === 0 ||
    normalized.some((channel) =>
      channel.id.length === 0 ||
      channel.evidenceRole !== "primary" ||
      !isNormalizedSigned(channel.score) ||
      !Number.isFinite(channel.architecturePrior) ||
      channel.architecturePrior <= 0 ||
      !isNormalizedCoverage(channel.coverage) ||
      channel.coverage <= 0
    ) ||
    normalized.some((channel, index) => channel.id === normalized[index - 1]?.id)
  ) {
    throw new TypeError("Primary evidence configuration is invalid.");
  }

  let totalActivation = 0;
  let positiveMass = 0;
  let negativeMass = 0;

  for (const channel of normalized) {
    const activation = channel.architecturePrior * channel.coverage;

    if (!Number.isFinite(activation) || activation <= 0) {
      throw new TypeError("Primary evidence activation is invalid.");
    }

    totalActivation += activation;
    positiveMass += activation * Math.max(channel.score, 0);
    negativeMass += activation * Math.max(-channel.score, 0);
  }

  if (!Number.isFinite(totalActivation) || totalActivation <= 0) {
    throw new TypeError("Primary evidence activation is invalid.");
  }

  const rawEvidenceStrength =
    (positiveMass + negativeMass) / totalActivation;
  const primaryContradiction =
    (2 * Math.min(positiveMass, negativeMass)) / totalActivation;
  const primarySignedBalance =
    (positiveMass - negativeMass) / totalActivation;
  const primaryConviction =
    rawEvidenceStrength - primaryContradiction;

  return {
    totalActivation,
    positiveMass,
    negativeMass,
    rawEvidenceStrength,
    primaryContradiction,
    primarySignedBalance,
    primaryConviction,
  };
}

export interface CalculateCorroborativeEvidenceV1Input {
  readonly primarySignedBalance: number;
  readonly primaryConviction: number;
  readonly corroborativeScore: number;
  readonly corroborativeCoverage: number;
}

export interface CorroborativeEvidenceV1 {
  readonly evidenceRole: "corroborative";
  readonly corroborativeCapacity: number;
  /** Diagnostic only; this value never increases conviction. */
  readonly confirmationStrength: number;
  readonly corroborativeContradiction: number;
  readonly finalConviction: number;
  readonly decisionScore: number;
  readonly decisionDirection: "bullish" | "bearish" | "neutral";
}

/** Pure V1 operator for exactly one aggregated corroborative channel. */
export function calculateCorroborativeEvidenceV1(
  input: CalculateCorroborativeEvidenceV1Input,
): CorroborativeEvidenceV1 {
  if (
    !isNormalizedSigned(input.primarySignedBalance) ||
    !isNormalizedMagnitude(input.primaryConviction) ||
    !isNormalizedSigned(input.corroborativeScore) ||
    !isNormalizedCoverage(input.corroborativeCoverage) ||
    !approximatelyEqual(
      Math.abs(input.primarySignedBalance),
      input.primaryConviction,
    )
  ) {
    throw new TypeError("Corroborative evidence input is invalid.");
  }

  const corroborativeCapacity =
    input.corroborativeCoverage * Math.abs(input.corroborativeScore);
  const primarySign = Math.sign(input.primarySignedBalance);
  const corroborativeSign = Math.sign(input.corroborativeScore);
  const hasDirection = primarySign !== 0 && corroborativeSign !== 0;
  const agrees = hasDirection && primarySign === corroborativeSign;
  const opposes = hasDirection && primarySign === -corroborativeSign;
  const confirmationStrength = agrees
    ? Math.min(input.primaryConviction, corroborativeCapacity)
    : 0;
  const corroborativeContradiction = opposes
    ? Math.min(input.primaryConviction, corroborativeCapacity)
    : 0;
  const finalConviction =
    input.primaryConviction - corroborativeContradiction;
  const decisionDirection = finalConviction === 0 || primarySign === 0
    ? "neutral"
    : primarySign > 0
      ? "bullish"
      : "bearish";

  return {
    evidenceRole: "corroborative",
    corroborativeCapacity,
    confirmationStrength,
    corroborativeContradiction,
    finalConviction,
    decisionScore:
      decisionDirection === "bullish"
        ? finalConviction
        : decisionDirection === "bearish"
          ? -finalConviction
          : 0,
    decisionDirection,
  };
}

export type CorroborativeEvidenceSectionInputV1 =
  | {
      readonly availability: "available";
      readonly score: number;
      readonly coverage: number;
    }
  | {
      readonly availability: "partial";
      readonly score: number;
      readonly coverage: number;
      readonly missing: readonly string[];
    }
  | { readonly availability: "not-applicable"; readonly reason?: string }
  | { readonly availability: "unavailable"; readonly reason?: string }
  | { readonly availability: "not-computed" };

export interface RoleAwareEvidenceDiagnosticsV1 extends PrimaryEvidenceAlgebraV3 {
  readonly corroborative:
    | CorroborativeEvidenceV1
    | Extract<
        CorroborativeEvidenceSectionInputV1,
        { readonly availability: "not-applicable" | "unavailable" | "not-computed" }
      >;
  readonly totalContradiction: number;
  readonly finalConviction: number;
  readonly decisionScore: number;
  readonly decisionDirection: "bullish" | "bearish" | "neutral";
}

export type RoleAwareEvidenceResultV1 =
  | {
      readonly availability: "available";
      readonly data: RoleAwareEvidenceDiagnosticsV1;
    }
  | {
      readonly availability: "partial";
      readonly data: RoleAwareEvidenceDiagnosticsV1;
      readonly missing: readonly string[];
    }
  | { readonly availability: "unavailable"; readonly reason: string };

export interface CalculateRoleAwareEvidenceV1Input {
  readonly mandatorySignalAnchorAvailable: boolean;
  readonly primary: PrimaryEvidenceAlgebraV3 | null;
  readonly corroborative: CorroborativeEvidenceSectionInputV1;
}

/** Lifecycle-aware foundation. It is not wired into EngineRuntimeV3. */
export function calculateRoleAwareEvidenceV1(
  input: CalculateRoleAwareEvidenceV1Input,
): RoleAwareEvidenceResultV1 {
  if (!input.mandatorySignalAnchorAvailable || input.primary === null) {
    return {
      availability: "unavailable",
      reason: "A usable mandatory Signal anchor is required.",
    };
  }

  const section = input.corroborative;

  if (section.availability === "available" || section.availability === "partial") {
    const corroborative = calculateCorroborativeEvidenceV1({
      primarySignedBalance: input.primary.primarySignedBalance,
      primaryConviction: input.primary.primaryConviction,
      corroborativeScore: section.score,
      corroborativeCoverage: section.coverage,
    });
    const data = combine(input.primary, corroborative);

    return section.availability === "partial"
      ? {
          availability: "partial",
          data,
          missing: normalizeMissing(section.missing),
        }
      : { availability: "available", data };
  }

  const data = combineWithoutOperation(input.primary, section);

  if (section.availability === "not-applicable") {
    return { availability: "available", data };
  }

  return {
    availability: "partial",
    data,
    missing: ["crossAsset"],
  };
}

function combine(
  primary: PrimaryEvidenceAlgebraV3,
  corroborative: CorroborativeEvidenceV1,
): RoleAwareEvidenceDiagnosticsV1 {
  const totalContradiction =
    primary.primaryContradiction + corroborative.corroborativeContradiction;
  const finalConviction =
    primary.rawEvidenceStrength - totalContradiction;
  const decisionDirection = finalConviction === 0
    ? "neutral"
    : primary.primarySignedBalance > 0
      ? "bullish"
      : "bearish";

  return {
    ...primary,
    corroborative,
    totalContradiction,
    finalConviction,
    decisionScore:
      decisionDirection === "bullish"
        ? finalConviction
        : decisionDirection === "bearish"
          ? -finalConviction
          : 0,
    decisionDirection,
  };
}

function combineWithoutOperation(
  primary: PrimaryEvidenceAlgebraV3,
  corroborative: Extract<
    CorroborativeEvidenceSectionInputV1,
    { readonly availability: "not-applicable" | "unavailable" | "not-computed" }
  >,
): RoleAwareEvidenceDiagnosticsV1 {
  const decisionDirection = primary.primaryConviction === 0
    ? "neutral"
    : primary.primarySignedBalance > 0
      ? "bullish"
      : "bearish";

  return {
    ...primary,
    corroborative,
    totalContradiction: primary.primaryContradiction,
    finalConviction: primary.primaryConviction,
    decisionScore:
      decisionDirection === "bullish"
        ? primary.primaryConviction
        : decisionDirection === "bearish"
          ? -primary.primaryConviction
          : 0,
    decisionDirection,
  };
}

function normalizeMissing(missing: readonly string[]): readonly string[] {
  return [...new Set(missing.map((id) => id.trim()).filter(Boolean))].sort(compareText);
}

function isNormalizedSigned(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -1 && value <= 1;
}

function isNormalizedMagnitude(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isNormalizedCoverage(value: unknown): value is number {
  return isNormalizedMagnitude(value);
}

function approximatelyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= Number.EPSILON * 16;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
