import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

import VipFxMarketRoom from "../VipFxMarketRoom";
import {
  deriveFxHistoricalRangeViewV1,
} from "../VipFxHistoricalPanel";
import type { HistoricalChartSeriesV1 } from
  "../../../../lib/markets/services/historicalChartSeries";
import type { VipFxMarketRoomV1 } from
  "../../../../lib/markets/services/vipMarketRoomDelivery";

const DAY = 86_400;
const ANCHOR = 2_000_000_000;

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function availableHistory(
  range: "2y" | "5d",
  completeness: "complete" | "partial" = "complete",
): HistoricalChartSeriesV1 {
  const start = range === "2y" ? ANCHOR - 730 * DAY : ANCHOR - 5 * DAY;
  const points = range === "2y"
    ? [
      { timestamp: start, value: 1.02 },
      { timestamp: ANCHOR - 365 * DAY, value: 1.06 },
      { timestamp: ANCHOR - 30 * DAY, value: 1.08 },
      { timestamp: ANCHOR - 4 * DAY, value: 1.081 },
      { timestamp: ANCHOR - 2 * DAY, value: 1.083 },
      { timestamp: ANCHOR, value: 1.0842 },
    ]
    : [
      { timestamp: ANCHOR - 4 * DAY, value: 1.081 },
      { timestamp: ANCHOR - 2 * DAY, value: 1.083 },
      { timestamp: ANCHOR, value: 1.0842 },
    ];

  return {
    version: "historical-chart-series-v1",
    availability: "available",
    productId: "eurusd",
    valueKind: "fx-reference-rate",
    unit: "USD per EUR",
    requested: { range, from: start, to: ANCHOR },
    resolved: {
      interval: "1d",
      observedFrom: points[0]!.timestamp,
      observedTo: points.at(-1)!.timestamp,
      completeness,
    },
    points,
    provenance: {
      provider: "ecb",
      sourceLabel: "European Central Bank",
      sourceSeriesId: "EXR.D.USD.EUR.SP00.A",
      sourceRole: "primary",
      status: "end_of_day",
      fetchedAt: ANCHOR,
      sourceTimestamp: points.at(-1)!.timestamp,
      freshness: "not-assessed",
      normalization: "canonical-observation-series-v1",
    },
  };
}

function roomFixture(options: {
  readonly deep?: "available" | "unavailable" | "failed";
  readonly history?: "available" | "unavailable" | "partial" | "failed";
  readonly fiveDay?: "available" | "insufficient" | "failed";
} = {}): VipFxMarketRoomV1 {
  const deepState = options.deep ?? "available";
  const historyState = options.history ?? "available";
  const fiveDayState = options.fiveDay ?? "available";

  return {
    productId: "eurusd",
    deep: deepState === "failed"
      ? null
      : deepState === "unavailable"
        ? {
          version: "market-product-projection-v1",
          tier: "vip-deep",
          availability: "unavailable",
          productId: "eurusd",
          displayName: "EUR/USD",
          productKind: "fx",
          reason: "Canonical Deep projection is temporarily unavailable.",
        }
        : availableDeepFixture(),
    history: {
      twoYear: historyState === "failed"
        ? null
        : historyState === "unavailable"
          ? unavailableHistory("2y", "source-unavailable")
          : availableHistory("2y", historyState === "partial" ? "partial" : "complete"),
      fiveDay: fiveDayState === "failed"
        ? null
        : fiveDayState === "insufficient"
          ? unavailableHistory("5d", "insufficient-observations")
          : availableHistory("5d"),
    },
  } as VipFxMarketRoomV1;
}

function availableDeepFixture(): NonNullable<VipFxMarketRoomV1["deep"]> {
  return {
    version: "market-product-projection-v1",
    tier: "vip-deep",
    availability: "available",
    productId: "eurusd",
    displayName: "EUR/USD",
    productKind: "fx",
    currentValue: {
      kind: "fx-reference-rate",
      value: 1.0842,
      unit: "USD per EUR",
    },
    referenceDate: new Date(ANCHOR * 1_000).toISOString().slice(0, 10),
    fetchedAt: ANCHOR,
    sourceTimestamp: ANCHOR,
    interval: "1d",
    status: "end_of_day",
    provenance: {
      provider: "ecb",
      source: "European Central Bank",
      seriesId: "EXR.D.USD.EUR.SP00.A",
      canonicalProductId: "eurusd",
      interval: "1d",
      status: "end_of_day",
      unit: "USD per EUR",
      seriesKind: "reference-rate",
      referenceDate: new Date(ANCHOR * 1_000).toISOString().slice(0, 10),
      fetchedAt: ANCHOR,
      sourceTimestamp: ANCHOR,
      freshness: "not-assessed",
    },
    details: {
      kind: "fx",
      direction: "bullish",
      signalStrength: "moderate",
      marketState: "caution",
      riskLevel: "moderate",
      annualizedVolatility: 0.11,
      confidence: 0.64,
      technical: {
        price: 1.0842,
        emaFast: 1.08,
        emaMedium: 1.07,
        emaSlow: 1.06,
        rsi: 57.2,
        macd: 0.02,
        macdSignal: 0.01,
        macdHistogram: 0.01,
        momentum: 0.0123,
        roc: 0.01,
        annualizedVolatility: 0.11,
        priceVsEmaMedium: 0.01,
        priceVsEmaSlow: 0.02,
      },
      signal: {
        score: 0.48,
        direction: "bullish",
        strength: "moderate",
        confidence: 0.72,
        reasons: ["Reference rate remains above the medium trend measure."],
      },
      risk: {
        score: 0.31,
        level: "moderate",
        reasons: ["Volatility remains bounded."],
      },
      calibration: {
        genericComputable: true,
        productionCalibrated: true,
        missingExplicitCalibration: [],
      },
      engine: {
        version: "3",
        evaluatedAt: "2033-05-18T03:33:20.000Z",
        macro: { availability: "not-applicable" },
        regime: { availability: "unavailable" },
        crossAsset: { availability: "not-applicable" },
        positioning: { availability: "not-computed" },
        scenario: scenarioFixture(),
        invalidation: invalidationFixture(),
        contradiction: {
          availability: "available",
          data: {
            score: 0.14,
            evidence: [],
            conflicts: [],
            strongestConflict: null,
          },
        },
        confidence: {
          availability: "available",
          data: {
            conviction: { availability: "available", data: { score: 0.58 } },
            data: { availability: "partial", data: { score: 0.82 } },
          },
        },
        decision: {
          availability: "available",
          data: { score: 0.48, stance: "bullish" },
        },
        decisionLifecycle: { availability: "not-computed" },
        recommendation: {
          availability: "available",
          data: {
            posture: "selective",
            stance: "bullish",
            strength: { band: "moderate" },
            restraintReasons: [],
            supportingReasons: [],
            opposingReasons: [],
          },
        },
      },
    },
  } as unknown as NonNullable<VipFxMarketRoomV1["deep"]>;
}

function scenarioFixture() {
  const condition = {
    code: "TARGET_DIRECTION_SUPPORTED",
    reference: { kind: "channel", channel: "signal", role: "primary" },
    expectedRelation: "supports",
    status: "met",
  };
  const scenarioCase = (
    id: "base" | "bullish" | "bearish",
    targetStance: "bullish" | "bearish",
    relationToDecision: "current" | "aligned" | "counterfactual",
  ) => ({
    id,
    targetStance,
    relationToDecision,
    supportingEvidence: [],
    opposingEvidence: [],
    neutralEvidence: [],
    notApplicableEvidence: [],
    unknownEvidence: [],
    dominantSupportingDrivers: [],
    strengtheningConditions: [condition],
    weakeningConditions: [],
  });

  return {
    availability: "available",
    data: {
      semantic: "conditional-evidence-configurations-v1",
      base: scenarioCase("base", "bullish", "current"),
      bullish: scenarioCase("bullish", "bullish", "aligned"),
      bearish: scenarioCase("bearish", "bearish", "counterfactual"),
    },
  };
}

function invalidationFixture() {
  return {
    availability: "available",
    data: {
      semantic: "decision-anchored-transition-predicates-v1",
      thesis: { stance: "bullish", source: "decision" },
      invalidatesWhen: [{
        code: "DECISION_STANCE_NO_LONGER_MATCHES_THESIS",
        effect: "invalidates",
        predicate: { kind: "decision-stance-not-equal", stance: "bullish" },
      }],
      weakensWhen: [{
        code: "RISK_LEVEL_HIGH",
        effect: "weakens",
        predicate: { kind: "risk-level-equal", level: "high" },
      }],
      assessmentFailsWhen: [],
      currentFragilities: [],
    },
  };
}

function unavailableHistory(
  range: "2y" | "5d",
  reason: "source-unavailable" | "insufficient-observations",
): HistoricalChartSeriesV1 {
  return {
    version: "historical-chart-series-v1",
    availability: "unavailable",
    productId: "eurusd",
    requested: {
      range,
      from: ANCHOR - (range === "2y" ? 730 : 5) * DAY,
      to: ANCHOR,
    },
    reason,
  };
}

function verifyRoomRendering(): void {
  const html = renderToStaticMarkup(VipFxMarketRoom({ room: roomFixture() }));

  for (const required of [
    "EUR/USD",
    "1.08420",
    "ECB daily reference rate",
    "Official daily observations only",
    "Executive readout",
    "Selective posture",
    "Technical evidence",
    "RSI",
    "Scenario architecture",
    "Base / Current configuration",
    "Bullish case",
    "Bearish case",
    "What changes the thesis",
    "European Central Bank",
    "EXR.D.USD.EUR.SP00.A",
    "Not assessed",
    "Reference dates aligned",
  ]) {
    assertEqual(html.includes(required), true, `room renders ${required}`);
  }
  assertEqual((html.match(/href="\/vip\/markets\/eur(?:usd|jpy|gbp|chf)"/g) ?? []).length, 4,
    "room selector links exactly four FX rooms");
  assertEqual(html.includes("€STR"), false, "FX room contains no rate room");
  assertEqual(html.includes("price target"), false, "room invents no price target");
  assertEqual(html.includes('role="img"'), true, "chart has a meaningful text alternative");
  assertEqual(html.includes("ECB daily reference-rate line chart"), true,
    "chart text alternative describes reference-rate semantics");
}

function verifyRangeSemantics(): void {
  const availableHtml = renderToStaticMarkup(
    VipFxMarketRoom({ room: roomFixture() }),
  );
  assertEqual(buttonOpening(availableHtml, "1D").includes("disabled=\"\""), true,
    "1D is semantically disabled");
  assertEqual(buttonOpening(availableHtml, "5D").includes("disabled=\"\""), false,
    "5D is enabled only when its C4-B result is available");
  assertEqual(buttonOpening(availableHtml, "1M").includes("disabled=\"\""), false,
    "1M is enabled");
  assertEqual(buttonOpening(availableHtml, "2Y").includes("disabled=\"\""), false,
    "2Y is enabled");
  assertEqual(buttonOpening(availableHtml, "5Y").includes("disabled=\"\""), true,
    "5Y is semantically disabled");
  assertEqual(buttonOpening(availableHtml, "MAX").includes("disabled=\"\""), true,
    "MAX is semantically disabled");

  const insufficientHtml = renderToStaticMarkup(
    VipFxMarketRoom({ room: roomFixture({ fiveDay: "insufficient" }) }),
  );
  assertEqual(buttonOpening(insufficientHtml, "5D").includes("disabled=\"\""), true,
    "insufficient 5D result disables the control");
  assertEqual(insufficientHtml.includes("Fewer than two official observations"), true,
    "existing insufficient-observations state is visible");

  const base = availableHistory("2y");
  const fiveDay = availableHistory("5d");
  const oneMonth = deriveFxHistoricalRangeViewV1(
    "eurusd",
    "1mo",
    base,
    fiveDay,
  );
  assertEqual(oneMonth?.requested.range, "1mo", "1M remains an exact 1M request");
  const unsupported = deriveFxHistoricalRangeViewV1(
    "eurusd",
    "1d",
    base,
    fiveDay,
  );
  assertEqual(unsupported?.availability, "unavailable", "1D remains unavailable");
  assertEqual(unsupported?.requested.range, "1d", "1D is never mapped to 5D");
  const fiveYear = deriveFxHistoricalRangeViewV1(
    "eurusd",
    "5y",
    base,
    fiveDay,
  );
  assertEqual(fiveYear?.requested.range, "5y", "5Y is never mapped to 2Y");
  const maximum = deriveFxHistoricalRangeViewV1(
    "eurusd",
    "max",
    base,
    fiveDay,
  );
  assertEqual(maximum?.requested.range, "max", "MAX is never mapped to 2Y");
}

function verifyDegradedRendering(): void {
  const historyOnly = renderToStaticMarkup(
    VipFxMarketRoom({ room: roomFixture({ deep: "failed" }) }),
  );
  assertEqual(historyOnly.includes("ECB daily reference rate"), true,
    "real history renders when Deep fails");
  assertEqual(historyOnly.includes("Deep intelligence unavailable"), true,
    "Deep failure is explicit beside available history");
  assertEqual(historyOnly.includes("1.08420"), false,
    "chart endpoint is not promoted as current value");

  const deepOnly = renderToStaticMarkup(
    VipFxMarketRoom({
      room: roomFixture({ history: "failed", fiveDay: "failed" }),
    }),
  );
  assertEqual(deepOnly.includes("1.08420"), true,
    "Deep current value renders when history fails");
  assertEqual(deepOnly.includes("Historical series unavailable"), true,
    "history failure is explicit beside available Deep");

  const neither = renderToStaticMarkup(
    VipFxMarketRoom({
      room: roomFixture({
        deep: "failed",
        history: "failed",
        fiveDay: "failed",
      }),
    }),
  );
  assertEqual(neither.includes("Historical series unavailable"), true,
    "neither-available state preserves history failure");
  assertEqual(neither.includes("Deep intelligence unavailable"), true,
    "neither-available state preserves Deep failure");

  const partial = deriveFxHistoricalRangeViewV1(
    "eurusd",
    "2y",
    availableHistory("2y", "partial"),
    availableHistory("5d"),
  );
  assertEqual(
    partial?.availability === "available"
      ? partial.resolved.completeness
      : null,
    "partial",
    "partial historical completeness survives the local range boundary",
  );
}

function verifyArchitectureBoundary(): void {
  const repositoryRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
  const files = [
    "src/app/(vip)/vip/markets/[market]/page.tsx",
    "src/components/vip/market-room/VipFxMarketRoom.tsx",
    "src/components/vip/market-room/VipFxHistoricalPanel.tsx",
    "src/components/vip/market-room/HistoricalReferenceLineChart.tsx",
    "src/components/vip/market-room/HistoricalRangeSelector.tsx",
    "src/lib/markets/services/vipMarketRoomDelivery.ts",
  ];
  const sources = files.map((file) =>
    readFileSync(`${repositoryRoot}${file}`, "utf8")
  );
  const combined = sources.join("\n").toLowerCase();
  const chart = sources[3]!;
  const delivery = sources[5]!;

  assertEqual(chart.includes("EChartsEngine"), true,
    "thin line chart uses the existing ECharts engine");
  assertEqual(chart.includes("point.timestamp * 1_000"), true,
    "chart consumes canonical timestamps");
  assertEqual(chart.includes("point.value"), true,
    "chart consumes canonical values");
  assertEqual(delivery.includes('loadHistorical(productId, "2y", options)'), true,
    "room requests selected-market two-year C4-B envelope");
  assertEqual(delivery.includes('loadHistorical(productId, "5d", options)'), true,
    "room requests exact conditional C4-B 5D state");

  for (const forbidden of [
    "historicalmarketdata",
    "/api/market-data",
    "yahoo",
    "marketstack",
    "setinterval(",
    "fetch(",
    "candlestick",
    "unstable_cache",
  ]) {
    assertEqual(combined.includes(forbidden), false, `C4-C excludes ${forbidden}`);
  }

  const deepTypes = readFileSync(
    `${repositoryRoot}src/lib/markets/projections/types.ts`,
    "utf8",
  );
  assertEqual(deepTypes.includes("HistoricalChartSeriesV1"), false,
    "historical sibling is not embedded into Deep");
}

function buttonOpening(html: string, label: string): string {
  const match = html.match(new RegExp(`<button[^>]*>${label}</button>`));

  if (match === null) {
    throw new Error(`${label} range button was not rendered.`);
  }

  return match[0];
}

function main(): void {
  verifyRoomRendering();
  verifyRangeSemantics();
  verifyDegradedRendering();
  verifyArchitectureBoundary();

  console.log("PASS: C4-C VIP FX Market Room UI");
}

main();
