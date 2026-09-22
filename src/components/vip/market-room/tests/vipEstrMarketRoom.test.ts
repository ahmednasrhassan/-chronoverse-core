import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

import type { HistoricalChartSeriesV1 } from
  "../../../../lib/markets/services/historicalChartSeries";
import type { VipEstrMarketRoomV1 } from
  "../../../../lib/markets/services/vipMarketRoomDelivery";
import {
  deriveEstrHistoricalRangeViewV1,
} from "../VipEstrHistoricalPanel";
import VipEstrMarketRoom, {
  formatBasisPointsV1,
} from "../VipEstrMarketRoom";

const DAY = 86_400;
const ANCHOR = 2_000_000_000;
const SERIES_ID = "EST.B.EU000A2X2A25.WT";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function availableHistory(
  range: "max" | "5d",
): HistoricalChartSeriesV1 {
  const inception = ANCHOR - 2_000 * DAY;
  const points = range === "max"
    ? [
      { timestamp: inception, value: -0.7 },
      { timestamp: ANCHOR - 300 * DAY, value: -0.35 },
      { timestamp: ANCHOR - 30 * DAY, value: 0 },
      { timestamp: ANCHOR - 4 * DAY, value: -0.45 },
      { timestamp: ANCHOR - 2 * DAY, value: -0.4975 },
      { timestamp: ANCHOR, value: -0.5 },
    ]
    : [
      { timestamp: ANCHOR - 4 * DAY, value: -0.45 },
      { timestamp: ANCHOR - 2 * DAY, value: -0.4975 },
      { timestamp: ANCHOR, value: -0.5 },
    ];

  return {
    version: "historical-chart-series-v1",
    availability: "available",
    productId: "estr",
    valueKind: "interest-rate-percent",
    unit: "percent",
    requested: {
      range,
      from: range === "max" ? inception : ANCHOR - 5 * DAY,
      to: ANCHOR,
    },
    resolved: {
      interval: "1d",
      observedFrom: points[0]!.timestamp,
      observedTo: points.at(-1)!.timestamp,
      completeness: "complete",
    },
    points,
    provenance: {
      provider: "ecb",
      sourceLabel: "European Central Bank",
      sourceSeriesId: SERIES_ID,
      sourceRole: "primary",
      status: "end_of_day",
      fetchedAt: ANCHOR,
      sourceTimestamp: ANCHOR,
      freshness: "not-assessed",
      normalization: "canonical-observation-series-v1",
    },
  };
}

function unavailableHistory(
  range: "max" | "5d",
  reason: "source-unavailable" | "insufficient-observations",
): HistoricalChartSeriesV1 {
  return {
    version: "historical-chart-series-v1",
    availability: "unavailable",
    productId: "estr",
    requested: {
      range,
      from: range === "max" ? 0 : ANCHOR - 5 * DAY,
      to: ANCHOR,
    },
    reason,
  };
}

function availableDeep() {
  return {
    version: "market-product-projection-v1",
    tier: "vip-deep",
    availability: "available",
    productId: "estr",
    displayName: "€STR",
    productKind: "rate",
    currentValue: {
      kind: "rate-percent",
      value: -0.5,
      unit: "percent",
    },
    referenceDate: new Date(ANCHOR * 1_000).toISOString().slice(0, 10),
    fetchedAt: ANCHOR,
    sourceTimestamp: ANCHOR,
    interval: "1d",
    status: "end_of_day",
    provenance: {
      provider: "ecb",
      source: "European Central Bank",
      seriesId: SERIES_ID,
      canonicalProductId: "estr",
      interval: "1d",
      status: "end_of_day",
      unit: "percent",
      seriesKind: "reference-rate",
      referenceDate: new Date(ANCHOR * 1_000).toISOString().slice(0, 10),
      fetchedAt: ANCHOR,
      sourceTimestamp: ANCHOR,
      freshness: "not-assessed",
    },
    details: {
      kind: "rate",
      currentRatePercent: -0.5,
      direction: "falling-rate",
      signalStrength: "directional",
      riskLevel: "moderate",
      levelRegime: "low",
      volatilityRegime: "elevated",
      rateFeatures: {
        currentRate: -0.5,
        dailyChangeBp: -0.25,
        momentum: [
          { horizonObservations: 10, momentumBp: -5.5 },
        ],
        ema: [
          { period: 50, emaRate: -0.47, emaDistanceBp: -3 },
        ],
        rsi: 42.3,
        macd: {
          macdBp: -0.3,
          signalBp: -0.1,
          histogramBp: -0.2,
        },
        dailyBpVolatility: 0.75,
      },
      signal: {
        score: -0.42,
        direction: "falling-rate",
        strength: "directional",
        coverage: 1,
        components: {
          ema: -0.4,
          rsi14: -0.2,
          macdHistogramBp: -0.3,
          momentum10Bp: -0.6,
        },
      },
      risk: {
        score: 0.31,
        level: "moderate",
        coverage: 1,
        components: {
          dailyBpVolatility: 0.35,
          rsiStretch: 0.2,
          momentum10Bp: 0.4,
          macdHistogramBp: 0.2,
          ema50DistanceBp: 0.3,
          ema200DistanceBp: 0.45,
        },
      },
      marketState: {
        currentRatePercent: -0.5,
        direction: "falling-rate",
        signalStrength: "directional",
        signalScore: -0.42,
        riskLevel: "moderate",
        riskScore: 0.31,
        levelRegime: "low",
        volatilityRegime: "elevated",
      },
      engineEvidence: {},
    },
  } as unknown as NonNullable<VipEstrMarketRoomV1["deep"]>;
}

function roomFixture(options: {
  readonly deep?: "available" | "unavailable" | "failed";
  readonly history?: "available" | "unavailable" | "failed";
  readonly fiveDay?: "available" | "insufficient" | "failed";
} = {}): VipEstrMarketRoomV1 {
  const deepState = options.deep ?? "available";
  const historyState = options.history ?? "available";
  const fiveDayState = options.fiveDay ?? "available";

  return {
    productId: "estr",
    deep: deepState === "failed"
      ? null
      : deepState === "unavailable"
        ? {
          version: "market-product-projection-v1",
          tier: "vip-deep",
          availability: "unavailable",
          productId: "estr",
          displayName: "€STR",
          productKind: "rate",
          reason: "Canonical €STR Deep projection is temporarily unavailable.",
        }
        : availableDeep(),
    history: {
      maximum: historyState === "failed"
        ? null
        : historyState === "unavailable"
          ? unavailableHistory("max", "source-unavailable")
          : availableHistory("max"),
      fiveDay: fiveDayState === "failed"
        ? null
        : fiveDayState === "insufficient"
          ? unavailableHistory("5d", "insufficient-observations")
          : availableHistory("5d"),
    },
  };
}

function verifyRateRoomRendering(): void {
  const html = renderToStaticMarkup(
    VipEstrMarketRoom({ room: roomFixture() }),
  );

  for (const required of [
    "€STR Market Room",
    "-0.500%",
    "€STR official rate history",
    "Negative, zero, and positive rates remain unaltered",
    "Executive rate readout",
    "Falling rate",
    "Low",
    "Elevated",
    "Directional",
    "Signal evidence coverage",
    "Risk evidence coverage",
    "Latest daily change",
    "-0.25 bp",
    "10-observation momentum",
    "-5.50 bp",
    "Daily volatility",
    "0.75 bp",
    "European Central Bank",
    SERIES_ID,
    "Not assessed",
    "Reference dates aligned",
  ]) {
    assertEqual(html.includes(required), true, `rate room renders ${required}`);
  }

  for (const forbidden of [
    "bullish",
    "bearish",
    "bull case",
    "bear case",
    "FX pair",
    "candlestick",
    "OHLC",
    "rate target",
    "forecast path",
  ]) {
    assertEqual(html.toLowerCase().includes(forbidden.toLowerCase()), false,
      `rate room excludes ${forbidden}`);
  }

  assertEqual((html.match(/href="\/vip\/markets\/(?:eurusd|eurjpy|eurgbp|eurchf|estr)"/g) ?? []).length,
    5, "rate room selector contains exactly five products");
  assertEqual(html.includes('aria-current="page"'), true,
    "€STR is the selected room");
  assertEqual((html.match(/aria-current="page"/g) ?? []).length, 1,
    "rate room selector exposes exactly one current room");
  assertEqual(html.includes('role="img"'), true,
    "chart has a meaningful text alternative");
  assertEqual(html.includes("€STR ECB daily reference-rate line chart"), true,
    "chart alternative describes the official rate");
}

function verifyRangeSemantics(): void {
  const html = renderToStaticMarkup(
    VipEstrMarketRoom({ room: roomFixture() }),
  );
  assertEqual(buttonOpening(html, "1D").includes('disabled=""'), true,
    "1D is semantically disabled");

  for (const enabled of ["5D", "1M", "3M", "6M", "1Y", "2Y", "5Y", "MAX"]) {
    assertEqual(buttonOpening(html, enabled).includes('disabled=""'), false,
      `${enabled} is enabled`);
  }

  const insufficient = renderToStaticMarkup(
    VipEstrMarketRoom({ room: roomFixture({ fiveDay: "insufficient" }) }),
  );
  assertEqual(buttonOpening(insufficient, "5D").includes('disabled=""'), true,
    "insufficient 5D is disabled");

  const maximum = availableHistory("max");
  const fiveDay = availableHistory("5d");
  const maxView = deriveEstrHistoricalRangeViewV1("max", maximum, fiveDay);
  assertEqual(maxView?.requested.range, "max", "MAX remains exact");
  assertEqual(
    maxView?.availability === "available"
      ? maxView.resolved.observedFrom
      : null,
    maximum.availability === "available"
      ? maximum.resolved.observedFrom
      : null,
    "MAX begins at official series inception",
  );
  const oneDay = deriveEstrHistoricalRangeViewV1("1d", maximum, fiveDay);
  assertEqual(oneDay?.availability, "unavailable", "1D stays unavailable");
  assertEqual(oneDay?.requested.range, "1d", "1D is not substituted");
  const fiveYear = deriveEstrHistoricalRangeViewV1("5y", maximum, fiveDay);
  assertEqual(fiveYear?.requested.range, "5y", "5Y remains exact");
}

function verifyNegativeRatesAndBasisPoints(): void {
  const projected = deriveEstrHistoricalRangeViewV1(
    "1y",
    availableHistory("max"),
    availableHistory("5d"),
  );
  assertEqual(projected?.availability, "available",
    "negative rate range remains available");
  assertEqual(
    projected?.availability === "available"
      ? projected.points.some(({ value }) => value < 0)
      : false,
    true,
    "negative historical values are preserved",
  );
  assertEqual(formatBasisPointsV1(5), "+5.00 bp",
    "five basis points remain five bp");
  assertEqual(formatBasisPointsV1(-0.25), "-0.25 bp",
    "negative raw basis points retain sign and unit");
  assertEqual(formatBasisPointsV1(0, false), "0.000 bp",
    "zero basis points remain valid");
}

function verifyDegradedRendering(): void {
  const historyOnly = renderToStaticMarkup(
    VipEstrMarketRoom({ room: roomFixture({ deep: "failed" }) }),
  );
  assertEqual(historyOnly.includes("€STR official rate history"), true,
    "history remains when Deep fails");
  assertEqual(historyOnly.includes("Rate intelligence unavailable"), true,
    "Deep failure is explicit");
  assertEqual(historyOnly.includes("-0.500%"), false,
    "historical endpoint is not promoted as current rate");

  const deepOnly = renderToStaticMarkup(
    VipEstrMarketRoom({
      room: roomFixture({ history: "failed", fiveDay: "failed" }),
    }),
  );
  assertEqual(deepOnly.includes("-0.500%"), true,
    "current canonical rate remains when history fails");
  assertEqual(deepOnly.includes("Historical series unavailable"), true,
    "history failure is explicit");

  const neither = renderToStaticMarkup(
    VipEstrMarketRoom({
      room: roomFixture({
        deep: "failed",
        history: "failed",
        fiveDay: "failed",
      }),
    }),
  );
  assertEqual(neither.includes("Historical series unavailable"), true,
    "neither state preserves history failure");
  assertEqual(neither.includes("Rate intelligence unavailable"), true,
    "neither state preserves analytical failure");
}

function verifyArchitectureBoundaries(): void {
  const repositoryRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
  const files = [
    "src/components/vip/market-room/VipEstrMarketRoom.tsx",
    "src/components/vip/market-room/VipEstrHistoricalPanel.tsx",
    "src/components/vip/market-room/HistoricalReferenceLineChart.tsx",
    "src/components/vip/market-room/HistoricalRangeSelector.tsx",
    "src/lib/markets/services/vipMarketRoomDelivery.ts",
    "src/components/vip/market-room/VipMarketRoomNavigation.tsx",
  ];
  const sources = files.map((file) =>
    readFileSync(`${repositoryRoot}${file}`, "utf8")
  );
  const rateSources = sources.slice(0, 2).join("\n").toLowerCase();
  const combined = sources.join("\n").toLowerCase();
  const chart = sources[2]!;

  for (const forbidden of [
    "bullish",
    "bearish",
    "scenario",
    "recommendation",
  ]) {
    assertEqual(rateSources.includes(forbidden), false,
      `rate components exclude ${forbidden}`);
  }

  for (const forbidden of [
    "historicalmarketdata",
    "/api/market-data",
    "yahoo",
    "marketstack",
    "setinterval(",
    "fetch(",
    "candlestick",
    "unstable_cache",
    "observationmetadata",
  ]) {
    assertEqual(combined.includes(forbidden), false,
      `C4-D excludes ${forbidden}`);
  }

  assertEqual(chart.includes('valueKind === "interest-rate-percent"'), true,
    "shared chart applies percent formatting");
  assertEqual(chart.includes("scale: true"), true,
    "shared chart keeps a data-driven axis for negative rates");
  assertEqual(chart.includes("min: 0"), false,
    "shared chart does not clamp negative values");

  const index = readFileSync(
    `${repositoryRoot}src/app/(vip)/vip/markets/page.tsx`,
    "utf8",
  );
  assertEqual(index.includes('href={`/vip/markets/${market.productId}`}'), true,
    "VIP index links every canonical product room");
  assertEqual(index.includes("LAUNCH_MARKETS_V1.map"), true,
    "VIP index renders the canonical product directory");
  assertEqual(index.includes("Open {market.label} Market Room"), true,
    "VIP index labels each room with its canonical product name");
  assertEqual(index.includes("prefetch={false}"), true,
    "VIP index avoids background protected-route reads");

  const lowerIndex = index.toLowerCase();
  for (const forbidden of [
    "getfiveproduct",
    "fetch(",
    "online",
    "operational",
    "private preview",
    "infrastructure ready",
    "this workspace will host",
  ]) {
    assertEqual(lowerIndex.includes(forbidden), false,
      `VIP index excludes ${forbidden}`);
  }
}

function buttonOpening(html: string, label: string): string {
  const match = html.match(new RegExp(`<button[^>]*>${label}</button>`));

  if (match === null) {
    throw new Error(`${label} range button was not rendered.`);
  }

  return match[0];
}

function main(): void {
  verifyRateRoomRendering();
  verifyRangeSemantics();
  verifyNegativeRatesAndBasisPoints();
  verifyDegradedRendering();
  verifyArchitectureBoundaries();

  console.log("PASS: C4-D VIP €STR Market Room UI");
}

main();
