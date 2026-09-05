import type {
  EngineContradictionSectionV3,
  EngineMacroV3,
} from "../../engine/contracts";
import {
  calculateEngineContradictionV3,
  type CalculateEngineContradictionV3Input,
} from "../../core/contradictionEngine";
import type {
  MarketSignalResult,
} from "../../core/signalEngine";

function signal(
  score: number,
): CalculateEngineContradictionV3Input["signal"] {
  const data: MarketSignalResult = {
    score,
    direction:
      score > 0
        ? "bullish"
        : score < 0
          ? "bearish"
          : "neutral",
    strength: "strong",
    confidence: 0.01,
    reasons: [],
  };

  return {
    availability: "available",
    data,
  };
}

function macro(
  score: number,
  coverage: number,
): EngineMacroV3 {
  return {
    availability: "available",
    data: {
      direction:
        score > 0
          ? "bullish"
          : score < 0
            ? "bearish"
            : "neutral",
      score,
      confidence: 0.01,
      coverage,
      drivers: [],
      reasons: [],
    },
  };
}

function calculate(
  signalScore: number,
  macroScore: number,
  coverage = 1,
): EngineContradictionSectionV3 {
  return calculateEngineContradictionV3({
    signal: signal(signalScore),
    macro: {
      applicability: "applicable",
      section: macro(macroScore, coverage),
    },
  });
}

function requireAvailable(
  section: EngineContradictionSectionV3,
  label: string,
) {
  if (section.availability !== "available") {
    throw new Error(
      `${label}: expected available, received ${section.availability}`,
    );
  }

  return section.data;
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

function assertScore(
  signalScore: number,
  macroScore: number,
  coverage: number,
  expected: number,
  label: string,
): void {
  const data = requireAvailable(
    calculate(signalScore, macroScore, coverage),
    label,
  );

  assertEqual(data.score, expected, `${label} score`);
}

function assertContradiction(
  signalScore: number,
  macroScore: number,
  coverage: number,
  expectedAggregate: number,
  expectedConflict: number,
  label: string,
): void {
  const data = requireAvailable(
    calculate(signalScore, macroScore, coverage),
    label,
  );

  assertEqual(data.score, expectedAggregate, `${label} aggregate`);
  assertEqual(data.conflicts.length, 1, `${label} conflicts`);
  assertEqual(
    data.conflicts[0]?.score,
    expectedConflict,
    `${label} conflict score`,
  );
  assertEqual(
    data.strongestConflict?.score,
    expectedConflict,
    `${label} strongest conflict`,
  );
}

// 1-2. Aligned evidence has no contradiction or zero-valued conflicts.
for (const [signalScore, macroScore, label] of [
  [1, 1, "aligned bullish"],
  [-1, -1, "aligned bearish"],
] as const) {
  const data = requireAvailable(
    calculate(signalScore, macroScore),
    label,
  );

  assertEqual(data.score, 0, `${label} score`);
  assertEqual(data.conflicts.length, 0, `${label} conflicts`);
  assertEqual(data.strongestConflict, null, `${label} strongest conflict`);
}

// 3-4. Maximum opposing evidence is symmetric.
for (const [signalScore, macroScore, label] of [
  [1, -1, "bullish versus bearish"],
  [-1, 1, "bearish versus bullish"],
] as const) {
  const data = requireAvailable(
    calculate(signalScore, macroScore),
    label,
  );

  assertEqual(data.score, 1, `${label} score`);
  assertEqual(data.conflicts.length, 1, `${label} conflicts`);
  assertEqual(data.conflicts[0]?.sources[0], "signal", `${label} first source`);
  assertEqual(data.conflicts[0]?.sources[1], "macro", `${label} second source`);
  assertEqual(data.strongestConflict?.score, 1, `${label} strongest conflict`);
}

// 5-8. Effective macro magnitude bounds raw overlap before normalization.
assertContradiction(0.8, -0.4, 1, 0.4, 0.4, "bounded conflict");
assertContradiction(
  0.8,
  -0.4,
  0.5,
  4 / 15,
  0.2,
  "coverage-adjusted macro bound",
);
assertContradiction(
  0.2,
  -1,
  0.5,
  4 / 15,
  0.2,
  "signal-bound counterexample",
);
assertContradiction(
  1,
  -0.2,
  0.5,
  2 / 15,
  0.1,
  "effective macro bound",
);

// 9-10. Neutral usable evidence produces a valid zero score.
assertScore(0, -1, 1, 0, "neutral signal");
assertScore(1, 0, 1, 0, "neutral macro");

// 9. Intentionally disabled macro is not applicable and preserves reason.
{
  const result = calculateEngineContradictionV3({
    signal: signal(1),
    macro: {
      applicability: "not-applicable",
      reason: "Disabled by profile",
    },
  });

  assertEqual(result.availability, "not-applicable", "not-applicable lifecycle");
  assertEqual(
    result.availability === "not-applicable" ? result.reason : undefined,
    "Disabled by profile",
    "not-applicable reason",
  );
}

// 10. Unavailable macro cannot produce a comparison.
{
  const result = calculateEngineContradictionV3({
    signal: signal(1),
    macro: {
      applicability: "applicable",
      section: {
        availability: "unavailable",
        reason: "No macro",
      },
    },
  });

  assertEqual(result.availability, "unavailable", "unavailable macro");
}

// 11. Unavailable signal cannot produce a comparison.
{
  const result = calculateEngineContradictionV3({
    signal: {
      availability: "unavailable",
      reason: "No signal",
    },
    macro: {
      applicability: "applicable",
      section: macro(-1, 1),
    },
  });

  assertEqual(result.availability, "unavailable", "unavailable signal");
}

// 12. Zero macro coverage is unavailable rather than contradiction zero.
assertEqual(calculate(1, -1, 0).availability, "unavailable", "zero coverage");

// 13-15. Non-finite evidence is unavailable.
assertEqual(calculate(Number.NaN, -1).availability, "unavailable", "NaN signal");
assertEqual(calculate(1, Number.POSITIVE_INFINITY).availability, "unavailable", "infinite macro");
assertEqual(calculate(1, -1, Number.NaN).availability, "unavailable", "NaN coverage");
assertEqual(calculate(1, -1, Number.POSITIVE_INFINITY).availability, "unavailable", "infinite coverage");

// 16-17. Finite evidence and coverage are clamped to contract ranges.
{
  const data = requireAvailable(calculate(2, -4, 3), "clamped evidence");

  assertEqual(data.score, 1, "clamped contradiction score");
  assertEqual(data.evidence[0]?.signedScore, 1, "clamped signal");
  assertEqual(data.evidence[1]?.signedScore, -1, "clamped macro");
  assertEqual(data.evidence[1]?.coverage, 1, "clamped coverage");
}

// 18. Partial sources calculate and merge missing identifiers deterministically.
{
  const partialSignal = signal(0.8);
  const partialMacro = macro(-0.4, 0.5);

  if (
    partialSignal.availability !== "available" ||
    partialMacro.availability !== "available"
  ) {
    throw new Error("Test fixtures must be available before partial wrapping.");
  }

  const result = calculateEngineContradictionV3({
    signal: {
      availability: "partial",
      data: partialSignal.data,
      missing: ["technical-a", "shared"],
    },
    macro: {
      applicability: "applicable",
      section: {
        availability: "partial",
        data: partialMacro.data,
        missing: ["shared", "macro-b"],
      },
    },
  });

  if (result.availability !== "partial") {
    throw new Error(`partial lifecycle: received ${result.availability}`);
  }

  assertEqual(result.data.score, 4 / 15, "partial aggregate score");
  assertEqual(result.data.conflicts[0]?.score, 0.2, "partial conflict score");
  assertEqual(
    result.missing.join(","),
    "technical-a,shared,macro-b",
    "partial missing order",
  );
}

// 19. Non-maximum bullish/bearish opposition is symmetric.
assertEqual(
  requireAvailable(calculate(0.7, -0.3), "positive symmetry").score,
  requireAvailable(calculate(-0.7, 0.3), "negative symmetry").score,
  "bullish/bearish symmetry",
);

// 20. Neutral evidence never emits a zero-valued conflict object.
for (const result of [calculate(0, -1), calculate(1, 0)]) {
  const data = requireAvailable(result, "neutral conflict record");
  assertEqual(data.conflicts.length, 0, "neutral conflict count");
  assertEqual(data.strongestConflict, null, "neutral strongest conflict");
}

console.log("PASS: Engine V3 contradiction calculation");
