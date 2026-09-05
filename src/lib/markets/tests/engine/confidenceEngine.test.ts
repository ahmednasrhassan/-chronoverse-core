import {
  calculateEngineConfidenceV3,
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
    ...overrides,
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
        confidence: 0.01,
        coverage,
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

// 1. Full current evidence remains partial while future evidence is deferred.
{
  const result = calculateEngineConfidenceV3(input());
  const data = requirePartial(result.data, "full data");
  const conviction = requirePartial(result.conviction, "full conviction");

  assertEqual(data.data.score, 1, "full data score");
  assertEqual(conviction.data.score, 1, "full conviction score");
  assertIncludes(data.missing, "crossAsset", "full data deferred component");
}

// 2. Intentionally disabled macro is excluded without a data penalty.
{
  const result = calculateEngineConfidenceV3(input({
    macro: {
      applicability: "not-applicable",
      reason: "Disabled by profile",
    },
    signal: signal(0.8),
  }));
  const data = requirePartial(result.data, "technical-only data");
  const conviction = requirePartial(result.conviction, "technical-only conviction");

  assertEqual(data.data.score, 1, "technical-only data score");
  assertEqual(data.data.components.macro.availability, "not-applicable", "macro applicability");
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
          confidence: 0.01,
          coverage: 0.5,
          drivers: [],
          reasons: [],
        },
        missing: ["globalDemand"],
      },
    },
  }));
  const data = requirePartial(result.data, "partial macro data");
  const conviction = requirePartial(result.conviction, "partial macro conviction");

  assertEqual(data.data.score, 0.5, "partial macro data score");
  assertEqual(conviction.data.score, 1 / 3, "coverage-scaled conviction");
  assertIncludes(conviction.missing, "globalDemand", "partial macro missing evidence");
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
  }));
  const conviction = requirePartial(result.conviction, "contradictory conviction");
  assertEqual(conviction.data.score, 0, "contradictory conviction score");
}

// 6. A computed neutral signal is valid zero conviction.
{
  const result = calculateEngineConfidenceV3(input({
    signal: signal(0),
    macro: { applicability: "not-applicable" },
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
      historicalWindow: { receivedPoints: Number.NaN },
    },
  }),
]) {
  const result = calculateEngineConfidenceV3(invalidInput);
  const data = requirePartial(result.data, "invalid history data");
  assertEqual(data.data.components.marketData.availability, "unavailable", "invalid history lifecycle");
}

// 10. Every future component remains explicitly not computed.
{
  const result = calculateEngineConfidenceV3(input());
  const data = requirePartial(result.data, "deferred data");
  const conviction = requirePartial(result.conviction, "deferred conviction");

  assertEqual(data.data.components.crossAsset.availability, "not-computed", "data crossAsset");
  assertEqual(data.data.components.positioning.availability, "not-computed", "data positioning");
  assertEqual(conviction.data.components.crossAsset.availability, "not-computed", "conviction crossAsset");
  assertEqual(conviction.data.components.positioning.availability, "not-computed", "conviction positioning");
  assertEqual(conviction.data.components.scenario.availability, "not-computed", "conviction scenario");
  assertEqual(conviction.data.components.contradiction.availability, "not-computed", "conviction contradiction");
}

console.log("PASS: Engine V3 confidence calculation");
