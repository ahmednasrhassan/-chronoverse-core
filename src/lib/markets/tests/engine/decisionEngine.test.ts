import {
  calculateEngineDecisionV3,
  type CalculateEngineDecisionV3Input,
  type EngineDecisionMacroInputV3,
} from "../../core/decisionEngine";
import type {
  EngineConfidenceSectionV3,
  EngineConfidenceV3,
  EngineDecisionSectionV3,
  EngineMacroV3,
} from "../../engine/contracts";

const AVAILABLE_NUMBER = {
  availability: "available",
  data: 1,
} as const;

function signal(
  score: number,
  missing?: readonly string[],
): CalculateEngineDecisionV3Input["signal"] {
  const data = {
    score,
    direction:
      score > 0
        ? "bullish" as const
        : score < 0
          ? "bearish" as const
          : "neutral" as const,
    strength: "strong" as const,
    confidence: 0.01,
    reasons: [],
  };

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

function macro(
  score: number,
  coverage: number,
  missing?: readonly string[],
): EngineDecisionMacroInputV3 {
  const data = {
    direction:
      score > 0
        ? "bullish" as const
        : score < 0
          ? "bearish" as const
          : "neutral" as const,
    score,
    confidence: 0.01,
    coverage,
    drivers: [],
    reasons: [],
  };

  return {
    applicability: "applicable",
    section: missing === undefined
      ? {
          availability: "available",
          data,
        }
      : {
          availability: "partial",
          data,
          missing,
        },
  };
}

function unavailableMacro(): EngineDecisionMacroInputV3 {
  return {
    applicability: "applicable",
    section: {
      availability: "unavailable",
      reason: "No macro evidence",
    },
  };
}

type ConfidenceOptions = {
  readonly convictionMissing?: readonly string[];
  readonly dataAvailability?: "available" | "partial" | "unavailable";
  readonly dataScore?: number;
  readonly dataMissing?: readonly string[];
};

function confidence(
  convictionScore: number,
  options: ConfidenceOptions = {},
): EngineConfidenceSectionV3 {
  const dataSnapshot = {
    score: options.dataScore ?? 1,
    components: {
      marketData: AVAILABLE_NUMBER,
      technical: AVAILABLE_NUMBER,
      macro: AVAILABLE_NUMBER,
      crossAsset: AVAILABLE_NUMBER,
      positioning: AVAILABLE_NUMBER,
    },
  };
  const data: EngineConfidenceV3["data"] =
    options.dataAvailability === "unavailable"
      ? {
          availability: "unavailable",
          reason: "No data confidence",
        }
      : options.dataAvailability === "partial"
        ? {
            availability: "partial",
            data: dataSnapshot,
            missing: options.dataMissing ?? ["marketData"],
          }
        : {
            availability: "available",
            data: dataSnapshot,
          };
  const convictionSnapshot = {
    score: convictionScore,
    components: {
      signal: AVAILABLE_NUMBER,
      macro: AVAILABLE_NUMBER,
      state: AVAILABLE_NUMBER,
      regime: AVAILABLE_NUMBER,
      crossAsset: AVAILABLE_NUMBER,
      positioning: AVAILABLE_NUMBER,
      scenario: AVAILABLE_NUMBER,
      contradiction: AVAILABLE_NUMBER,
    },
  };
  const conviction: EngineConfidenceV3["conviction"] =
    options.convictionMissing === undefined
      ? {
          availability: "available",
          data: convictionSnapshot,
        }
      : {
          availability: "partial",
          data: convictionSnapshot,
          missing: options.convictionMissing,
        };

  return {
    availability: "available",
    data: {
      data,
      conviction,
    },
  };
}

function unavailableConviction(): EngineConfidenceSectionV3 {
  return {
    availability: "available",
    data: {
      data: {
        availability: "available",
        data: {
          score: 1,
          components: {
            marketData: AVAILABLE_NUMBER,
            technical: AVAILABLE_NUMBER,
            macro: AVAILABLE_NUMBER,
            crossAsset: AVAILABLE_NUMBER,
            positioning: AVAILABLE_NUMBER,
          },
        },
      },
      conviction: {
        availability: "unavailable",
        reason: "No conviction",
      },
    },
  };
}

function input(
  overrides: Partial<CalculateEngineDecisionV3Input> = {},
): CalculateEngineDecisionV3Input {
  return {
    signal: signal(1),
    macro: macro(1, 1),
    confidence: confidence(1),
    ...overrides,
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

function assertIncludes(
  values: readonly string[],
  expected: string,
  label: string,
): void {
  if (!values.includes(expected)) {
    throw new Error(`${label}: expected ${expected}`);
  }
}

function requireDecision(
  result: EngineDecisionSectionV3,
  label: string,
) {
  if (
    result.availability !== "available" &&
    result.availability !== "partial"
  ) {
    throw new Error(
      `${label}: expected usable Decision, received ${result.availability}`,
    );
  }

  return result;
}

function assertDecision(
  value: CalculateEngineDecisionV3Input,
  availability: "available" | "partial",
  stance: "bullish" | "bearish" | "neutral",
  score: number,
  convictionScore: number,
  label: string,
): EngineDecisionSectionV3 {
  const result = requireDecision(
    calculateEngineDecisionV3(value),
    label,
  );

  assertEqual(result.availability, availability, `${label} lifecycle`);
  assertEqual(result.data.stance, stance, `${label} stance`);
  assertEqual(result.data.score, score, `${label} score`);
  assertEqual(
    Math.abs(result.data.score),
    convictionScore,
    `${label} magnitude invariant`,
  );
  assertEqual(result.data.score > 0, stance === "bullish", `${label} bullish invariant`);
  assertEqual(result.data.score < 0, stance === "bearish", `${label} bearish invariant`);
  assertEqual(result.data.score === 0, stance === "neutral", `${label} neutral invariant`);

  return result;
}

// 1-2. Strong aligned evidence produces symmetric signed Decisions.
assertDecision(input(), "available", "bullish", 1, 1, "strong bullish");
assertDecision(input({
  signal: signal(-1),
  macro: macro(-1, 1),
}), "available", "bearish", -1, 1, "strong bearish");

// 3. Exact cancellation is valid neutral evidence.
assertDecision(input({
  macro: macro(-1, 1),
  confidence: confidence(0),
}), "available", "neutral", 0, 0, "exact cancellation");

// 4-5. Weak non-zero conviction remains directional.
assertDecision(input({
  signal: signal(0.1),
  macro: { applicability: "not-applicable" },
  confidence: confidence(0.01),
}), "available", "bullish", 0.01, 0.01, "weak bullish");
assertDecision(input({
  signal: signal(-0.1),
  macro: { applicability: "not-applicable" },
  confidence: confidence(0.01),
}), "available", "bearish", -0.01, 0.01, "weak bearish");

// 6-7. Effective macro evidence may reverse the signal direction.
assertDecision(input({
  signal: signal(0.2),
  macro: macro(-1, 0.5),
  confidence: confidence(0.2),
}), "available", "bearish", -0.2, 0.2, "macro bearish reversal");
assertDecision(input({
  signal: signal(-0.2),
  macro: macro(1, 0.5),
  confidence: confidence(0.2),
}), "available", "bullish", 0.2, 0.2, "macro bullish reversal");

// 8. Not-applicable macro is excluded without a missing penalty.
{
  const result = assertDecision(input({
    signal: signal(0.6),
    macro: {
      applicability: "not-applicable",
      reason: "Disabled by profile",
    },
    confidence: confidence(0.6),
  }), "available", "bullish", 0.6, 0.6, "macro not-applicable");

  if (result.availability === "partial") {
    assertEqual(result.missing.includes("macro"), false, "not-applicable macro missing");
  }
}

// 9-10. Unusable applicable macro falls back to signal and marks partial.
for (const [macroInput, label] of [
  [unavailableMacro(), "macro unavailable"],
  [macro(-1, 0), "zero macro coverage"],
] satisfies readonly [EngineDecisionMacroInputV3, string][]) {
  const result = assertDecision(input({
    signal: signal(0.7),
    macro: macroInput,
    confidence: confidence(0.7),
  }), "partial", "bullish", 0.7, 0.7, label);

  if (result.availability !== "partial") {
    throw new Error(`${label}: expected partial`);
  }

  assertIncludes(result.missing, "macro", `${label} missing`);
}

// 11. Partial usable macro uses weighted balance and deduplicates missing data.
{
  const result = assertDecision(input({
    signal: signal(0.8),
    macro: macro(-0.4, 0.5, ["macro-driver", "shared"]),
    confidence: confidence(0.4, {
      convictionMissing: ["shared"],
    }),
  }), "partial", "bullish", 0.4, 0.4, "partial usable macro");

  if (result.availability !== "partial") {
    throw new Error("Partial macro Decision must remain partial.");
  }

  assertEqual(
    result.missing.join(","),
    "shared,macro-driver",
    "partial macro missing order",
  );
}

// 12. Partial Data Confidence affects lifecycle, not magnitude.
{
  const result = assertDecision(input({
    confidence: confidence(0.8, {
      dataAvailability: "partial",
      dataScore: 0.2,
      dataMissing: ["marketData"],
    }),
  }), "partial", "bullish", 0.8, 0.8, "partial data confidence");

  if (result.availability !== "partial") {
    throw new Error("Partial Data Confidence must produce partial Decision.");
  }

  assertIncludes(result.missing, "marketData", "partial data missing");
}

// 13. Unavailable inner Data Confidence permits usable partial Decision.
{
  const result = assertDecision(input({
    confidence: confidence(0.8, {
      dataAvailability: "unavailable",
    }),
  }), "partial", "bullish", 0.8, 0.8, "unavailable inner data confidence");

  if (result.availability !== "partial") {
    throw new Error("Unavailable inner Data Confidence must be partial.");
  }

  assertIncludes(result.missing, "dataConfidence", "unavailable data missing");
}

// 14-15. Missing outer confidence or conviction makes Decision unavailable.
for (const [canonicalConfidence, label] of [
  [{ availability: "unavailable", reason: "No confidence" }, "outer confidence unavailable"],
  [unavailableConviction(), "conviction unavailable"],
] satisfies readonly [EngineConfidenceSectionV3, string][]) {
  assertEqual(
    calculateEngineDecisionV3(input({ confidence: canonicalConfidence })).availability,
    "unavailable",
    label,
  );
}

// 16. Invalid canonical conviction is rejected rather than clamped.
for (const score of [Number.NaN, Number.POSITIVE_INFINITY, -0.1, 1.1]) {
  assertEqual(
    calculateEngineDecisionV3(input({ confidence: confidence(score) })).availability,
    "unavailable",
    `invalid conviction ${String(score)}`,
  );
}

// 17. Invalid signal is unavailable.
assertEqual(
  calculateEngineDecisionV3(input({ signal: signal(Number.NaN) })).availability,
  "unavailable",
  "invalid signal",
);

// 18. Invalid macro falls back to a partial signal-only Decision.
assertDecision(input({
  signal: signal(0.6),
  macro: macro(Number.NaN, 1),
  confidence: confidence(0.6),
}), "partial", "bullish", 0.6, 0.6, "invalid macro");

// 19. Positive conviction with exactly zero balance is inconsistent.
assertEqual(
  calculateEngineDecisionV3(input({
    macro: macro(-1, 1),
    confidence: confidence(0.1),
  })).availability,
  "unavailable",
  "positive conviction with zero balance",
);

// 20-21. Neutral signal is valid and usable macro can own direction.
assertDecision(input({
  signal: signal(0),
  macro: { applicability: "not-applicable" },
  confidence: confidence(0),
}), "available", "neutral", 0, 0, "neutral signal only");
assertDecision(input({
  signal: signal(0),
  macro: macro(1, 1),
  confidence: confidence(0.5),
}), "available", "bullish", 0.5, 0.5, "neutral signal directional macro");

// 22. Bullish/bearish symmetry preserves magnitude and reverses sign.
{
  const bullish = requireDecision(calculateEngineDecisionV3(input({
    signal: signal(0.7),
    macro: macro(-0.3, 1),
    confidence: confidence(0.2),
  })), "bullish symmetry");
  const bearish = requireDecision(calculateEngineDecisionV3(input({
    signal: signal(-0.7),
    macro: macro(0.3, 1),
    confidence: confidence(0.2),
  })), "bearish symmetry");

  assertEqual(bullish.data.score, -bearish.data.score, "signed symmetry");
}

// 23-24. Data Confidence score never changes canonical Decision magnitude.
{
  const lowData = requireDecision(calculateEngineDecisionV3(input({
    confidence: confidence(0.75, { dataScore: 0.1 }),
  })), "low Data Confidence score");
  const highData = requireDecision(calculateEngineDecisionV3(input({
    confidence: confidence(0.75, { dataScore: 0.9 }),
  })), "high Data Confidence score");

  assertEqual(lowData.data.score, 0.75, "low Data Confidence magnitude");
  assertEqual(highData.data.score, 0.75, "high Data Confidence magnitude");
}

console.log("PASS: Engine V3 Decision calculation");
