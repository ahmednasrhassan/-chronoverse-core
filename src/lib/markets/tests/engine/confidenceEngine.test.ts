import {
  calculateEngineConfidenceV3,
  ENGINE_V3_DATA_CONFIDENCE_POLICY,
  type CalculateEngineConfidenceV3Input,
} from "../../core/confidenceEngine";

const technical = {
  price: 100,
  emaFast: 99,
  emaMedium: 98,
  emaSlow: 97,
  rsi: 55,
  macd: 1,
  macdSignal: 0.8,
  macdHistogram: 0.2,
  momentum: 1,
  roc: 1,
  annualizedVolatility: 20,
  priceVsEmaMedium: 2,
  priceVsEmaSlow: 3,
};

function input(
  overrides: Partial<CalculateEngineConfidenceV3Input> = {},
): CalculateEngineConfidenceV3Input {
  return {
    marketData: {
      availability: "available",
      provider: "ignored-provider",
      status: "realtime",
      interval: "1d",
      freshness: "within-cadence",
      historicalWindow: {
        receivedPoints: 200,
      },
    },
    minimumRequiredHistory: 200,
    technical: {
      availability: "available",
      data: technical,
    },
    signal: signal(1),
    macro: macro(1, 1),
    contradiction: contradiction(0),
    ...overrides,
  };
}

function contradiction(
  score: number,
): CalculateEngineConfidenceV3Input["contradiction"] {
  return {
    availability: "available",
    data: {
      score,
      evidence: [],
      conflicts: [],
      strongestConflict: null,
    },
  };
}

function partialContradiction(
  score: number,
  missing: readonly string[],
): CalculateEngineConfidenceV3Input["contradiction"] {
  return {
    availability: "partial",
    data: {
      score,
      evidence: [],
      conflicts: [],
      strongestConflict: null,
    },
    missing,
  };
}

function signal(
  score: number,
): CalculateEngineConfidenceV3Input["signal"] {
  return {
    availability: "available",
    data: {
      score,
      direction: score > 0 ? "bullish" : score < 0 ? "bearish" : "neutral",
      strength: "strong",
      confidence: 0.01,
      reasons: [],
    },
  };
}

function macro(
  score: number,
  coverage: number,
): Extract<
  CalculateEngineConfidenceV3Input["macro"],
  { readonly applicability: "applicable" }
> {
  return {
    applicability: "applicable",
    section: {
      availability: "available",
      data: {
        direction: score > 0 ? "bullish" : score < 0 ? "bearish" : "neutral",
        score,
        strengthMagnitude: Math.abs(score),
        coverage,
        dataQuality: { availability: "not-computed" },
        drivers: [],
        reasons: [],
      },
    },
  };
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
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

function assertClose(
  actual: number,
  expected: number,
  label: string,
): void {
  if (Math.abs(actual - expected) > Number.EPSILON * 8) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function requirePartial<T>(
  section:
    | { readonly availability: "available"; readonly data: T }
    | { readonly availability: "partial"; readonly data: T; readonly missing: readonly string[] }
    | { readonly availability: "unavailable"; readonly reason?: string },
  label: string,
): Extract<typeof section, { readonly availability: "partial" }> {
  if (section.availability !== "partial") {
    throw new Error(`${label}: expected partial, received ${section.availability}`);
  }

  return section;
}

function requireAvailable<T>(
  section:
    | { readonly availability: "available"; readonly data: T }
    | { readonly availability: "partial"; readonly data: T; readonly missing: readonly string[] }
    | { readonly availability: "unavailable"; readonly reason?: string },
  label: string,
): Extract<typeof section, { readonly availability: "available" }> {
  if (section.availability !== "available") {
    throw new Error(`${label}: expected available, received ${section.availability}`);
  }

  return section;
}

assertEqual(ENGINE_V3_DATA_CONFIDENCE_POLICY.marketData, "required", "market data role");
assertEqual(ENGINE_V3_DATA_CONFIDENCE_POLICY.technical, "required", "technical role");
assertEqual(ENGINE_V3_DATA_CONFIDENCE_POLICY.macro, "conditional", "macro role");
assertEqual(ENGINE_V3_DATA_CONFIDENCE_POLICY.crossAsset, "conditional", "cross-asset role");
assertEqual(ENGINE_V3_DATA_CONFIDENCE_POLICY.positioning, "optional-deferred", "positioning role");

// 1. Full current evidence remains partial while future evidence is deferred.
{
  const result = calculateEngineConfidenceV3(input());
  const data = requirePartial(result.data, "full data");
  const conviction = requirePartial(result.conviction, "full conviction");

  assertEqual(data.data.score, 1, "full data score");
  assertEqual(conviction.data.score, 1, "full conviction score");
  assertIncludes(data.missing, "crossAsset", "full data deferred component");
  assertEqual(data.missing.includes("positioning"), false, "positioning excluded from data missing");
}

// 2. Non-applicable evidence and deferred Positioning do not create a data penalty.
{
  const result = calculateEngineConfidenceV3(input({
    macro: {
      applicability: "not-applicable",
      reason: "Disabled by profile",
    },
    signal: signal(0.8),
    contradiction: {
      availability: "not-applicable",
      reason: "Disabled by profile",
    },
    crossAsset: {
      availability: "not-applicable",
      reason: "No approved relationship",
    },
  }));
  const data = requireAvailable(result.data, "technical-only data");
  const conviction = requirePartial(result.conviction, "technical-only conviction");

  assertEqual(data.data.score, 1, "technical-only data score");
  assertEqual(data.data.components.macro.availability, "not-applicable", "macro applicability");
  assertEqual(data.data.components.crossAsset.availability, "not-applicable", "cross-asset applicability");
  assertEqual(data.data.components.positioning.availability, "not-computed", "positioning remains deferred");
  assertEqual(conviction.data.score, 0.8, "signal-only conviction");
}

// 3. Partial macro coverage limits data confidence and macro influence.
{
  const result = calculateEngineConfidenceV3(input({
    macro: {
      applicability: "applicable",
      section: {
        availability: "partial",
        data: {
          direction: "bearish",
          score: -1,
          strengthMagnitude: 1,
          coverage: 0.5,
          dataQuality: { availability: "not-computed" },
          drivers: [],
          reasons: [],
        },
        missing: ["globalDemand"],
      },
    },
    contradiction: partialContradiction(2 / 3, ["globalDemand"]),
    crossAsset: { availability: "not-applicable" },
  }));
  const data = requirePartial(result.data, "partial macro data");
  const conviction = requirePartial(result.conviction, "partial macro conviction");

  assertEqual(data.data.score, 0.5, "partial macro data score");
  assertIncludes(data.missing, "globalDemand", "partial macro data missing evidence");
  assertEqual(data.missing.includes("positioning"), false, "partial data excludes positioning");
  assertClose(conviction.data.score, 1 / 3, "coverage-scaled conviction");
  assertIncludes(conviction.missing, "globalDemand", "partial macro missing evidence");
}

// 3a. Oil-like partial Macro preserves its exact scalar and real missing evidence.
{
  const result = calculateEngineConfidenceV3(input({
    macro: {
      applicability: "applicable",
      section: {
        availability: "partial",
        data: {
          direction: "bullish",
          score: 0.6,
          strengthMagnitude: 0.6,
          coverage: 0.85,
          dataQuality: { availability: "not-computed" },
          drivers: [],
          reasons: [],
        },
        missing: ["usd"],
      },
    },
    crossAsset: { availability: "not-applicable" },
  }));
  const data = requirePartial(result.data, "oil-like data");

  assertEqual(data.data.score, 0.85, "oil-like data score");
  assertIncludes(data.missing, "usd", "oil-like real missing evidence");
  assertEqual(data.missing.includes("positioning"), false, "oil-like data excludes positioning");
}

// 4. Strong aligned bearish evidence has full conviction.
{
  const result = calculateEngineConfidenceV3(input({
    signal: signal(-1),
    macro: macro(-1, 1),
  }));
  const conviction = requirePartial(result.conviction, "bearish conviction");
  assertEqual(conviction.data.score, 1, "bearish conviction score");
}

// 5. Equal and opposite evidence cancels conviction.
{
  const result = calculateEngineConfidenceV3(input({
    signal: signal(1),
    macro: macro(-1, 1),
    contradiction: contradiction(1),
  }));
  const conviction = requirePartial(result.conviction, "contradictory conviction");
  assertEqual(conviction.data.score, 0, "contradictory conviction score");
}

// 6. A computed neutral signal is valid zero conviction.
{
  const result = calculateEngineConfidenceV3(input({
    signal: signal(0),
    macro: { applicability: "not-applicable" },
    contradiction: { availability: "not-applicable" },
  }));
  const conviction = requirePartial(result.conviction, "neutral conviction");
  assertEqual(conviction.data.score, 0, "neutral conviction score");
}

// 7. Macro cannot replace a missing mandatory signal.
{
  const result = calculateEngineConfidenceV3(input({
    signal: {
      availability: "unavailable",
      reason: "No signal",
    },
  }));
  assertEqual(result.conviction.availability, "unavailable", "missing signal conviction");
}

// 8. Missing market data stays unavailable rather than becoming score zero.
{
  const result = calculateEngineConfidenceV3(input({
    marketData: {
      availability: "unavailable",
      provider: null,
      status: "unavailable",
      interval: "1d",
      freshness: "unavailable",
      reason: "No history",
    },
  }));
  const data = requirePartial(result.data, "missing market data");
  assertEqual(data.data.components.marketData.availability, "unavailable", "market data lifecycle");
}

// 9. Invalid history requirements and point counts are unavailable.
for (const invalidInput of [
  input({ minimumRequiredHistory: 0 }),
  input({
    marketData: {
      availability: "available",
      provider: "ignored-provider",
      status: "realtime",
      interval: "1d",
      freshness: "within-cadence",
      historicalWindow: { receivedPoints: Number.NaN },
    },
  }),
]) {
  const result = calculateEngineConfidenceV3(invalidInput);
  const data = requirePartial(result.data, "invalid history data");
  assertEqual(data.data.components.marketData.availability, "unavailable", "invalid history lifecycle");
}

// 10. Contextual and deferred components have distinct missing-evidence semantics.
{
  const result = calculateEngineConfidenceV3(input());
  const data = requirePartial(result.data, "deferred data");
  const conviction = requirePartial(result.conviction, "deferred conviction");

  assertEqual(data.data.components.crossAsset.availability, "not-computed", "data crossAsset");
  assertEqual(data.data.components.positioning.availability, "not-computed", "data positioning");
  assertEqual(conviction.data.components.crossAsset.availability, "not-computed", "conviction crossAsset");
  assertEqual(conviction.data.components.state.availability, "not-applicable", "conviction state context");
  assertEqual(conviction.data.components.regime.availability, "not-applicable", "conviction regime context");
  assertEqual(conviction.data.components.positioning.availability, "not-computed", "conviction positioning");
  assertEqual(conviction.data.components.scenario.availability, "not-computed", "conviction scenario");
  assertEqual(conviction.data.components.contradiction.availability, "available", "conviction contradiction");
  assertEqual(conviction.missing.includes("state"), false, "state is not missing evidence");
  assertEqual(conviction.missing.includes("regime"), false, "regime is not missing evidence");
  assertEqual(conviction.missing.includes("scenario"), false, "scenario is not missing evidence");
  assertEqual(conviction.missing.includes("positioning"), true, "positioning remains missing evidence");
  assertEqual(conviction.availability, "partial", "positioning keeps conviction partial");
}

function requireConvictionScore(
  value: CalculateEngineConfidenceV3Input,
  label: string,
): number {
  return requirePartial(
    calculateEngineConfidenceV3(value).conviction,
    label,
  ).data.score;
}

// 11. Locked complete-evidence matrix preserves numeric conviction.
for (const testCase of [
  { signalScore: 1, macroScore: 1, coverage: 1, contradictionScore: 0, expected: 1, label: "aligned bullish" },
  { signalScore: -1, macroScore: -1, coverage: 1, contradictionScore: 0, expected: 1, label: "aligned bearish" },
  { signalScore: 1, macroScore: -1, coverage: 1, contradictionScore: 1, expected: 0, label: "opposed bullish" },
  { signalScore: -1, macroScore: 1, coverage: 1, contradictionScore: 1, expected: 0, label: "opposed bearish" },
  { signalScore: 0.8, macroScore: -0.4, coverage: 1, contradictionScore: 0.4, expected: 0.2, label: "bounded opposition" },
  { signalScore: 0.8, macroScore: -0.4, coverage: 0.5, contradictionScore: 4 / 15, expected: 0.4, label: "partial macro bound" },
  { signalScore: 0.2, macroScore: -1, coverage: 0.5, contradictionScore: 4 / 15, expected: 0.2, label: "signal-bound counterexample" },
  { signalScore: 1, macroScore: -0.2, coverage: 0.5, contradictionScore: 2 / 15, expected: 0.6, label: "effective macro bound" },
  { signalScore: 0, macroScore: 1, coverage: 1, contradictionScore: 0, expected: 0.5, label: "neutral signal" },
  { signalScore: 1, macroScore: 0, coverage: 1, contradictionScore: 0, expected: 0.5, label: "neutral macro" },
] as const) {
  assertClose(
    requireConvictionScore(input({
      signal: signal(testCase.signalScore),
      macro: macro(testCase.macroScore, testCase.coverage),
      contradiction: contradiction(testCase.contradictionScore),
    }), testCase.label),
    testCase.expected,
    `${testCase.label} conviction`,
  );
}

// 12. Applicable unavailable macro falls back to signal-only partial conviction.
{
  const result = calculateEngineConfidenceV3(input({
    signal: signal(0.8),
    macro: {
      applicability: "applicable",
      section: { availability: "unavailable", reason: "No macro" },
    },
    contradiction: { availability: "unavailable", reason: "No comparison" },
    crossAsset: { availability: "not-applicable" },
  }));
  const data = requirePartial(result.data, "unavailable macro data");
  const conviction = requirePartial(result.conviction, "unavailable macro");
  assertIncludes(data.missing, "macro", "unavailable macro data missing");
  assertEqual(data.missing.includes("positioning"), false, "unavailable macro excludes positioning");
  assertEqual(conviction.data.score, 0.8, "unavailable macro signal-only score");
  assertEqual(conviction.data.components.contradiction.availability, "unavailable", "unavailable contradiction component");
  assertIncludes(conviction.missing, "macro", "unavailable macro missing");
  assertIncludes(conviction.missing, "contradiction", "unavailable contradiction missing");
}

// 12a. Applicable unavailable Cross-Asset remains a genuine data gap.
{
  const result = calculateEngineConfidenceV3(input({
    crossAsset: { availability: "unavailable", reason: "No reference data" },
  }));
  const data = requirePartial(result.data, "unavailable cross-asset data");

  assertEqual(data.data.score, 1, "unavailable cross-asset numeric omission");
  assertIncludes(data.missing, "crossAsset", "unavailable cross-asset missing");
  assertEqual(data.missing.includes("positioning"), false, "unavailable cross-asset excludes positioning");
}

// 13. Zero macro coverage also falls back without fabricating contradiction zero.
{
  const result = calculateEngineConfidenceV3(input({
    signal: signal(0.8),
    macro: macro(-1, 0),
    contradiction: { availability: "unavailable", reason: "Zero coverage" },
  }));
  const conviction = requirePartial(result.conviction, "zero coverage");
  assertEqual(conviction.data.score, 0.8, "zero coverage signal-only score");
  assertEqual(conviction.data.components.contradiction.availability, "unavailable", "zero coverage contradiction");
}

// 14. Partial usable evidence consumes partial contradiction exactly once.
{
  const partialMacro = macro(-0.4, 0.5);
  if (partialMacro.section.availability !== "available") {
    throw new Error("Macro fixture must be available before partial wrapping.");
  }
  const result = calculateEngineConfidenceV3(input({
    signal: signal(0.8),
    macro: {
      applicability: "applicable",
      section: {
        availability: "partial",
        data: partialMacro.section.data,
        missing: ["macro-driver"],
      },
    },
    contradiction: partialContradiction(4 / 15, ["macro-driver"]),
  }));
  const conviction = requirePartial(result.conviction, "partial canonical contradiction");
  assertClose(conviction.data.score, 0.4, "single contradiction penalty");
  assertEqual(conviction.data.components.contradiction.availability, "partial", "partial contradiction component");
  assertIncludes(conviction.missing, "macro-driver", "partial evidence missing");
}

// 15-18. Usable macro requires usable, finite canonical contradiction evidence.
for (const [canonicalContradiction, label] of [
  [{ availability: "unavailable", reason: "No contradiction" }, "unavailable contradiction"],
  [{ availability: "not-computed" }, "not-computed contradiction"],
  [{ availability: "not-applicable", reason: "Inconsistent lifecycle" }, "not-applicable contradiction"],
  [contradiction(Number.NaN), "non-finite contradiction"],
] satisfies readonly [CalculateEngineConfidenceV3Input["contradiction"], string][]) {
  assertEqual(
    calculateEngineConfidenceV3(input({
      macro: macro(-1, 1),
      contradiction: canonicalContradiction,
    })).conviction.availability,
    "unavailable",
    label,
  );
}

// 19. Non-finite signal remains unavailable.
assertEqual(
  calculateEngineConfidenceV3(input({ signal: signal(Number.NaN) })).conviction.availability,
  "unavailable",
  "invalid signal",
);

// 20. Non-maximum opposition is bullish/bearish symmetric.
assertClose(
  requireConvictionScore(input({
    signal: signal(0.7),
    macro: macro(-0.3, 1),
    contradiction: contradiction(0.3),
  }), "positive symmetry"),
  requireConvictionScore(input({
    signal: signal(-0.7),
    macro: macro(0.3, 1),
    contradiction: contradiction(0.3),
  }), "negative symmetry"),
  "bullish/bearish symmetry",
);

// 21. Macro strength does not alter Data Confidence completeness.
{
  const weak = requirePartial(
    calculateEngineConfidenceV3(input({ macro: macro(0.1, 0.5) })).data,
    "weak macro data confidence",
  );
  const strong = requirePartial(
    calculateEngineConfidenceV3(input({ macro: macro(1, 0.5) })).data,
    "strong macro data confidence",
  );

  assertEqual(weak.data.components.macro.availability, "available", "weak macro component");
  assertEqual(strong.data.components.macro.availability, "available", "strong macro component");
  assertEqual(
    weak.data.components.macro.availability === "available"
      ? weak.data.components.macro.data
      : null,
    0.5,
    "weak macro coverage confidence",
  );
  assertEqual(
    strong.data.components.macro.availability === "available"
      ? strong.data.components.macro.data
      : null,
    0.5,
    "strong macro coverage confidence",
  );
}

console.log("PASS: Engine V3 confidence calculation");
