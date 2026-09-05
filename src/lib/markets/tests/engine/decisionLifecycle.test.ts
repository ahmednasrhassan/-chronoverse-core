import {
  calculateDecisionLifecycleV3,
} from "../../core/decisionLifecycle";
import type {
  EngineDecisionLifecycleV3,
  EngineDecisionLifecycleSectionV3,
  EngineDecisionSectionV3,
  EngineDecisionStanceV3,
  EngineDecisionTransitionV3,
} from "../../engine/contracts";

type ComparedLifecycleData = Extract<
  EngineDecisionLifecycleV3,
  { readonly comparison: "compared" }
>;

type UsableComparedLifecycle =
  | {
      readonly availability: "available";
      readonly data: ComparedLifecycleData;
    }
  | {
      readonly availability: "partial";
      readonly data: ComparedLifecycleData;
      readonly missing: readonly string[];
    };

function decision(
  score: number,
  stance: EngineDecisionStanceV3,
  missing?: readonly string[],
): EngineDecisionSectionV3 {
  const data = {
    score,
    stance,
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

function compare(
  previousDecision: EngineDecisionSectionV3 | null,
  currentDecision: EngineDecisionSectionV3,
): EngineDecisionLifecycleSectionV3 {
  return calculateDecisionLifecycleV3({
    currentDecision,
    previousDecision,
  });
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

function assertDeepEqual(
  actual: unknown,
  expected: unknown,
  label: string,
): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);

  if (actualJson !== expectedJson) {
    throw new Error(
      `${label}: expected ${expectedJson}, received ${actualJson}`,
    );
  }
}

function requireCompared(
  result: EngineDecisionLifecycleSectionV3,
  label: string,
): UsableComparedLifecycle {
  if (
    result.availability !== "available" &&
    result.availability !== "partial"
  ) {
    throw new Error(
      `${label}: expected usable lifecycle, received ${result.availability}`,
    );
  }

  if (result.data.comparison !== "compared") {
    throw new Error(`${label}: expected compared lifecycle.`);
  }

  return result.availability === "partial"
    ? {
        availability: "partial",
        data: result.data,
        missing: result.missing,
      }
    : {
        availability: "available",
        data: result.data,
      };
}

function requireInitialized(
  result: EngineDecisionLifecycleSectionV3,
  label: string,
) {
  if (
    result.availability !== "available" &&
    result.availability !== "partial"
  ) {
    throw new Error(
      `${label}: expected usable lifecycle, received ${result.availability}`,
    );
  }

  if (result.data.comparison !== "initialized") {
    throw new Error(`${label}: expected initialized lifecycle.`);
  }

  return result;
}

function assertCompared(
  previousScore: number,
  previousStance: EngineDecisionStanceV3,
  currentScore: number,
  currentStance: EngineDecisionStanceV3,
  transition: EngineDecisionTransitionV3,
  convictionChange: "increased" | "decreased" | "unchanged",
  label: string,
) {
  const result = requireCompared(
    compare(
      decision(previousScore, previousStance),
      decision(currentScore, currentStance),
    ),
    label,
  );

  assertDeepEqual(result.data.transition, transition, `${label} transition`);
  assertEqual(
    result.data.decisionScoreDelta,
    currentScore - previousScore,
    `${label} signed delta`,
  );
  assertEqual(
    result.data.convictionDelta,
    Math.abs(currentScore) - Math.abs(previousScore),
    `${label} conviction delta`,
  );
  assertEqual(
    result.data.convictionChange,
    convictionChange,
    `${label} conviction change`,
  );

  return result;
}

// 1-3. Maintained bullish stance reports exact magnitude movement.
assertCompared(
  0.2,
  "bullish",
  0.8,
  "bullish",
  { kind: "maintained", stance: "bullish" },
  "increased",
  "bullish increased",
);
assertCompared(
  0.8,
  "bullish",
  0.2,
  "bullish",
  { kind: "maintained", stance: "bullish" },
  "decreased",
  "bullish decreased",
);
assertCompared(
  0.8,
  "bullish",
  0.8,
  "bullish",
  { kind: "maintained", stance: "bullish" },
  "unchanged",
  "bullish unchanged",
);

// 4-5. Maintained bearish stance uses absolute magnitude for conviction.
assertCompared(
  -0.2,
  "bearish",
  -0.8,
  "bearish",
  { kind: "maintained", stance: "bearish" },
  "increased",
  "bearish increased",
);
assertCompared(
  -0.8,
  "bearish",
  -0.2,
  "bearish",
  { kind: "maintained", stance: "bearish" },
  "decreased",
  "bearish decreased",
);

// 6-7. Direct directional changes are structural reversals.
const bullishToBearish = assertCompared(
  0.8,
  "bullish",
  -0.2,
  "bearish",
  { kind: "reversed", from: "bullish", to: "bearish" },
  "decreased",
  "bullish to bearish",
);
const bearishToBullish = assertCompared(
  -0.8,
  "bearish",
  0.2,
  "bullish",
  { kind: "reversed", from: "bearish", to: "bullish" },
  "decreased",
  "bearish to bullish",
);

// 8-9. Directional stance becoming neutral is neutralization.
assertCompared(
  0.4,
  "bullish",
  0,
  "neutral",
  { kind: "neutralized", from: "bullish" },
  "decreased",
  "bullish neutralized",
);
assertCompared(
  -0.4,
  "bearish",
  0,
  "neutral",
  { kind: "neutralized", from: "bearish" },
  "decreased",
  "bearish neutralized",
);

// 10-11. Directional stance emerging from neutral is emergence.
assertCompared(
  0,
  "neutral",
  0.4,
  "bullish",
  { kind: "emerged", to: "bullish" },
  "increased",
  "bullish emerged",
);
assertCompared(
  0,
  "neutral",
  -0.4,
  "bearish",
  { kind: "emerged", to: "bearish" },
  "increased",
  "bearish emerged",
);

// 12. Neutral remains maintained with no numeric change.
assertCompared(
  0,
  "neutral",
  0,
  "neutral",
  { kind: "maintained", stance: "neutral" },
  "unchanged",
  "neutral maintained",
);

// 13. First available Decision initializes without comparison fields.
{
  const current = decision(0.6, "bullish");
  const result = requireInitialized(compare(null, current), "available initialization");

  assertEqual(result.availability, "available", "available initialization lifecycle");
  assertEqual(
    result.data.current,
    current.availability === "available" ? current.data : null,
    "initialized canonical current",
  );
  assertEqual("transition" in result.data, false, "initialized transition absence");
  assertEqual("decisionScoreDelta" in result.data, false, "initialized score delta absence");
  assertEqual("convictionDelta" in result.data, false, "initialized conviction delta absence");
}

// 14. First partial Decision initializes as partial and preserves missing data.
{
  const result = requireInitialized(
    compare(null, decision(0.6, "bullish", ["macro"])),
    "partial initialization",
  );

  if (result.availability !== "partial") {
    throw new Error("Partial initialization must remain partial.");
  }

  assertEqual(result.missing.join(","), "macro", "initialization missing");
}

// 15-18. Unusable current or previous Decision prevents comparison.
for (const [previousDecision, currentDecision, label] of [
  [{ availability: "unavailable", reason: "No previous" }, decision(0.5, "bullish"), "previous unavailable"],
  [{ availability: "not-computed" }, decision(0.5, "bullish"), "previous not-computed"],
  [decision(0.5, "bullish"), { availability: "unavailable", reason: "No current" }, "current unavailable"],
  [decision(0.5, "bullish"), { availability: "not-computed" }, "current not-computed"],
] satisfies readonly [EngineDecisionSectionV3, EngineDecisionSectionV3, string][]) {
  assertEqual(
    compare(previousDecision, currentDecision).availability,
    "unavailable",
    label,
  );
}

// 19-21. Partial comparisons merge previous then current missing identifiers.
{
  const currentPartial = requireCompared(
    compare(
      decision(0.2, "bullish"),
      decision(0.4, "bullish", ["current-a"]),
    ),
    "current partial",
  );
  const previousPartial = requireCompared(
    compare(
      decision(0.2, "bullish", ["previous-a"]),
      decision(0.4, "bullish"),
    ),
    "previous partial",
  );
  const bothPartial = requireCompared(
    compare(
      decision(0.2, "bullish", ["previous-a", "shared"]),
      decision(0.4, "bullish", ["shared", "current-b"]),
    ),
    "both partial",
  );

  assertEqual(currentPartial.availability, "partial", "current partial lifecycle");
  assertEqual(previousPartial.availability, "partial", "previous partial lifecycle");
  assertEqual(bothPartial.availability, "partial", "both partial lifecycle");

  if (
    currentPartial.availability !== "partial" ||
    previousPartial.availability !== "partial" ||
    bothPartial.availability !== "partial"
  ) {
    throw new Error("Partial comparison fixtures must remain partial.");
  }

  assertEqual(currentPartial.missing.join(","), "current-a", "current missing");
  assertEqual(previousPartial.missing.join(","), "previous-a", "previous missing");
  assertEqual(
    bothPartial.missing.join(","),
    "previous-a,shared,current-b",
    "merged missing order",
  );
}

// 22-23. Reversal deltas use exact signed and absolute arithmetic.
assertEqual(
  bullishToBearish.data.decisionScoreDelta,
  -0.2 - 0.8,
  "reversal signed delta",
);
assertEqual(
  bullishToBearish.data.convictionDelta,
  Math.abs(-0.2) - Math.abs(0.8),
  "reversal conviction delta",
);

// 24-27. Non-finite and out-of-range scores are unavailable.
for (const invalidScore of [
  1.01,
  -1.01,
  Number.NaN,
  Number.POSITIVE_INFINITY,
]) {
  assertEqual(
    compare(
      decision(0.2, "bullish"),
      decision(invalidScore, "bullish"),
    ).availability,
    "unavailable",
    `invalid score ${String(invalidScore)}`,
  );
}

// 28-31. Stance must match the exact score sign.
for (const [score, stance, label] of [
  [0.2, "bearish", "positive bearish"],
  [-0.2, "bullish", "negative bullish"],
  [0, "bullish", "zero directional"],
  [0.2, "neutral", "nonzero neutral"],
] satisfies readonly [number, EngineDecisionStanceV3, string][]) {
  assertEqual(
    compare(
      decision(0.1, "bullish"),
      decision(score, stance),
    ).availability,
    "unavailable",
    label,
  );
}

// 32. Sign-inverted reversal fixtures are symmetric.
assertEqual(
  bullishToBearish.data.decisionScoreDelta,
  -bearishToBullish.data.decisionScoreDelta,
  "reversal signed symmetry",
);
assertEqual(
  bullishToBearish.data.convictionDelta,
  bearishToBullish.data.convictionDelta,
  "reversal conviction symmetry",
);

// 33. No magnitude threshold suppresses a tiny structural reversal.
assertCompared(
  0.000001,
  "bullish",
  -0.000001,
  "bearish",
  { kind: "reversed", from: "bullish", to: "bearish" },
  "unchanged",
  "tiny reversal",
);

console.log("PASS: Engine V3 Decision Lifecycle calculation");
