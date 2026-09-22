import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

import { LAUNCH_MARKETS_V1 } from "../../../config/institutionalNavigation";
import {
  selectVipMarketV1,
  VIP_MARKET_IDS_V1,
} from "../../../lib/markets/projections/vipMarketSelection";
import type {
  FiveProductVipDeepProjectionMapV1,
} from "../../../lib/markets/services/canonicalProductResults";
import VipOverviewSurface from "../VipOverviewSurface";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

function source(relativePath: string): string {
  return readFileSync(`${repositoryRoot}${relativePath}`, "utf8");
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function count(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

function verifySelectionContract(): void {
  assertEqual(
    JSON.stringify(VIP_MARKET_IDS_V1),
    JSON.stringify(["eurusd", "eurjpy", "eurgbp", "eurchf", "estr"]),
    "VIP uses exactly the five launch markets",
  );
  assertEqual(
    JSON.stringify(LAUNCH_MARKETS_V1.map(({ productId }) => productId)),
    JSON.stringify(VIP_MARKET_IDS_V1),
    "rendered selector and selection whitelist share the same five markets",
  );
  assertEqual(
    JSON.stringify(LAUNCH_MARKETS_V1.map(({ label }) => label)),
    JSON.stringify(["EUR/USD", "EUR/JPY", "EUR/GBP", "EUR/CHF", "€STR"]),
    "rendered selector uses the exact five public labels",
  );
  assertEqual(
    LAUNCH_MARKETS_V1.every(({ roomDescription }) =>
      roomDescription.length > 0
    ),
    true,
    "every launch product has canonical Market Room description metadata",
  );

  for (const market of VIP_MARKET_IDS_V1) {
    assertEqual(selectVipMarketV1(market), market, `${market} is selectable`);
  }

  for (const candidate of [
    undefined,
    "",
    "gold",
    "bitcoin",
    "sp500",
    "nasdaq100",
    "oil",
    "dxy",
    "vix",
    "EURJPY",
    " eurjpy",
    "eurjpy ",
    ["eurjpy"],
    [],
    ["eurjpy", "eurusd"],
  ] as const) {
    assertEqual(selectVipMarketV1(candidate), "eurusd", "invalid selection falls back");
  }
}

function verifyProtectedPageComposition(): void {
  const page = source("src/app/(vip)/vip/page.tsx");
  const guard = page.indexOf(
    "await enforceVipPageAccessV1(requireVipV1, redirect)",
  );
  const deepLoad = page.indexOf(
    "await getFiveProductVipDeepProjectionMapV1()",
  );

  assertEqual(guard >= 0, true, "VIP Overview has the existing leaf-page guard");
  assertEqual(deepLoad > guard, true, "VIP authorization precedes canonical Deep load");
  assertEqual(count(page, "getFiveProductVipDeepProjectionMapV1()"), 1,
    "VIP Overview performs one five-market Deep assembly");
  assertEqual(page.includes("getFiveProductFreeLiteProjection"), false,
    "VIP Overview does not use Free Lite projection data");
  assertEqual(page.includes("searchParams: Promise"), true,
    "VIP Overview follows the current async searchParams contract");
}

function verifySharedCanonicalOwnership(): void {
  const service = source("src/lib/markets/services/canonicalProductResults.ts");
  const functionStart = service.indexOf(
    "export async function getFiveProductVipDeepProjectionMapV1",
  );
  const functionEnd = service.indexOf(
    "async function getCanonicalProjectionInputV1",
    functionStart,
  );
  const assembly = service.slice(functionStart, functionEnd);

  assertEqual(functionStart >= 0, true, "five-market Deep map exists");
  assertEqual(count(assembly, "getCachedCanonicalFxResultBundleV1()"), 1,
    "Deep map reads the atomic FX canonical owner once");
  assertEqual(count(assembly, "getCanonicalEstrResultV1()"), 1,
    "Deep map reads the €STR canonical owner once");
  assertEqual(count(assembly, "projectFiveProductVipDeepV1"), 5,
    "Deep map projects exactly five canonical products");
  assertEqual(assembly.includes("unstable_cache"), false,
    "Deep assembly creates no separate VIP cache");
  assertEqual(assembly.includes("getFiveProductFreeLite"), false,
    "Deep assembly does not project Free Lite data");
}

function verifyVipProductSurface(): void {
  const component = source("src/components/vip/VipOverviewSurface.tsx");
  const lower = component.toLowerCase();

  for (const forbidden of [
    "fetch(",
    "setinterval",
    "settimeout",
    "useeffect",
    '"use client"',
    "<canvas",
    "sparkline",
    "historicalseries",
    "echarts",
    ".candles",
    "providers/",
    "no-store",
  ]) {
    assertEqual(lower.includes(forbidden), false,
      `VIP Overview excludes ${forbidden}`);
  }

  for (const forbidden of [
    "latest research",
    "sanity",
    "newsletter",
    "gumroad",
    "affiliate",
    "sponsor",
    "upgrade to vip",
    "see vip difference",
    "checkout",
    "access-code",
    "access code",
    "lemon-70",
  ]) {
    assertEqual(lower.includes(forbidden), false,
      `authorized VIP product excludes ${forbidden}`);
  }

  assertEqual(component.includes("projection.provenance.freshness"), true,
    "freshness comes from the Deep projection");
  assertEqual(component.includes('href="/disclaimer"'), true,
    "VIP terminal links to the canonical disclaimer");
}

function verifyMarketRoomDirectory(): void {
  const page = source("src/app/(vip)/vip/markets/page.tsx");
  const lower = page.toLowerCase();

  assertEqual(
    page.includes("await enforceVipPageAccessV1(requireVipV1, redirect)"),
    true,
    "Market Room directory preserves the VIP leaf-page guard",
  );
  assertEqual(page.includes("LAUNCH_MARKETS_V1.map"), true,
    "Market Room directory renders the canonical five-product list");
  assertEqual(page.includes("/vip/markets/${market.productId}"), true,
    "Market Room directory links every canonical product to its room");
  assertEqual(page.includes("prefetch={false}"), true,
    "protected directory navigation disables route prefetch reads");

  for (const forbidden of [
    "getfiveproduct",
    "fetch(",
    "online",
    "operational",
    "private preview",
    "infrastructure ready",
    "this workspace will host",
  ]) {
    assertEqual(lower.includes(forbidden), false,
      `Market Room directory excludes ${forbidden}`);
  }
}

function verifyRenderedDecisionTerminal(): void {
  const projections = projectionMap();

  for (const selectedMarket of VIP_MARKET_IDS_V1) {
    const html = renderToStaticMarkup(VipOverviewSurface({
      projections,
      selectedMarket,
    }));
    const selectorLinks = html.match(/href="\/vip(?:\?market=[^"]+)?"/g) ?? [];
    const currentLinks = html.match(/aria-current="page"/g) ?? [];

    assertEqual(selectorLinks.length, 5,
      `${selectedMarket} render has exactly five selector links`);
    assertEqual(currentLinks.length, 1,
      `${selectedMarket} render has exactly one current selection`);
    assertEqual(html.includes(displayName(selectedMarket)), true,
      `${selectedMarket} render identifies the selected market`);
    assertEqual(
      html.includes(`href="/vip/markets/${selectedMarket}"`),
      true,
      `${selectedMarket} render links to its dedicated Market Room`,
    );
    assertEqual(
      html.includes(`Open ${displayName(selectedMarket)} Market Room`),
      true,
      `${selectedMarket} render labels its selected-room action`,
    );
    assertEqual(html.includes('href="/vip/markets"'), true,
      `${selectedMarket} render links to the five-room directory`);
  }

  const fxHtml = renderToStaticMarkup(VipOverviewSurface({
    projections,
    selectedMarket: "eurusd",
  }));
  assertEqual(fxHtml.includes('href="/vip"'), true,
    "EUR/USD keeps the canonical Overview selection route");
  assertEqual(fxHtml.includes('href="/vip?market=eurusd"'), false,
    "EUR/USD does not invent a query-string Overview route");
  assertEqual(fxHtml.includes('href="/vip/markets/eurusd"'), true,
    "EUR/USD dedicated room remains distinct from its Overview route");
  assertEqual(fxHtml.includes("1.08420"), true,
    "FX selected value is rendered from the Deep projection");
  assertEqual(fxHtml.includes("What matters now?"), true,
    "FX decision rail promotes actionable interpretation");
  assertEqual(fxHtml.includes("What changed?"), false,
    "not-computed FX lifecycle receives no premium decision row");
  assertEqual(fxHtml.includes("Scenario architecture"), true,
    "available FX scenario receives a dedicated analytical layer");
  assertEqual(fxHtml.includes("Base / Current configuration"), true,
    "FX scenario identifies the current base configuration");
  assertEqual(fxHtml.includes("Bullish case"), true,
    "FX scenario preserves its supplied bullish conditional case");
  assertEqual(fxHtml.includes("Bearish case"), true,
    "FX scenario preserves its supplied bearish conditional case");
  assertEqual(fxHtml.includes("Target /"), false,
    "scenario direction is not presented as a price target");
  assertEqual(fxHtml.includes('role="meter"'), true,
    "current analytical geometry exposes accessible meters");
  assertEqual(fxHtml.includes('aria-valuenow="0.72"'), true,
    "FX signal confidence drives rendered geometry");
  assertEqual(fxHtml.includes('aria-valuenow="0.31"'), true,
    "FX risk remains distinct in rendered geometry");
  assertEqual(/\b(?:live|real-time)\b/i.test(fxHtml), false,
    "rendered terminal makes no live or real-time claim");

  const unavailableScenarioHtml = renderToStaticMarkup(VipOverviewSurface({
    projections: projectionMap(false),
    selectedMarket: "eurusd",
  }));
  assertEqual(unavailableScenarioHtml.includes("Scenario architecture"), false,
    "not-computed FX scenario receives no empty analytical layer");

  const rateHtml = renderToStaticMarkup(VipOverviewSurface({
    projections,
    selectedMarket: "estr",
  }));
  assertEqual(rateHtml.includes('href="/vip/markets/estr"'), true,
    "€STR selected action routes to the dedicated rate room");
  for (const required of [
    "€STR",
    "Rising rate",
    "Middle",
    "Calm",
    "+1.25 bp",
    "Evidence coverage",
    "normalized",
  ]) {
    assertEqual(rateHtml.includes(required), true,
      `€STR render includes ${required}`);
  }
  for (const forbidden of [
    "Bullish",
    "Bearish",
    "Scenario architecture",
    "thesis",
    "recommendation",
  ]) {
    assertEqual(rateHtml.toLowerCase().includes(forbidden.toLowerCase()), false,
      `€STR render excludes ${forbidden}`);
  }
  for (const forbidden of [
    "Gold",
    "Bitcoin",
    "S&amp;P 500",
    "Nasdaq",
    "Oil",
    "DXY",
    "VIX",
  ]) {
    assertEqual(`${fxHtml}${rateHtml}`.includes(forbidden), false,
      `rendered five-market product excludes ${forbidden}`);
  }
  assertEqual(rateHtml.includes('aria-valuemin="-1"'), true,
    "€STR direction uses a signed normalized axis");
  assertEqual(rateHtml.includes('aria-valuenow="0.4"'), true,
    "€STR signal score drives rendered geometry");
}

function verifyUnavailableRendering(): void {
  const projections = projectionMap();
  const reason = "Verified canonical result is temporarily unavailable.";
  const unavailable = {
    ...projections,
    eurusd: {
      version: "market-product-projection-v1",
      tier: "vip-deep",
      availability: "unavailable",
      productId: "eurusd",
      displayName: "EUR/USD",
      productKind: "fx",
      reason,
      missing: ["canonical"],
    },
  } as unknown as FiveProductVipDeepProjectionMapV1;
  const html = renderToStaticMarkup(VipOverviewSurface({
    projections: unavailable,
    selectedMarket: "eurusd",
  }));

  assertEqual(html.includes(reason), true,
    "unavailable selected market preserves the canonical reason");
  assertEqual(html.includes("No analytical values have been inferred"), true,
    "unavailable selected market explicitly rejects substitution");
  assertEqual(html.includes("Calibrated readout"), false,
    "unavailable selected market fabricates no geometry");
  assertEqual(html.includes("Scenario architecture"), false,
    "unavailable selected market fabricates no scenario");
  assertEqual((html.match(/href="\/vip(?:\?market=[^"]+)?"/g) ?? []).length, 5,
    "selector remains usable when the selected result is unavailable");
  assertEqual(html.includes('href="/disclaimer"'), true,
    "disclaimer remains available when market data is unavailable");
  assertEqual(html.includes('href="/vip/markets/eurusd"'), true,
    "selected-room action remains available when Deep is unavailable");
  assertEqual(html.includes("Open EUR/USD Market Room"), true,
    "unavailable state preserves the selected-room action label");
}

function verifyApprovedChrome(): void {
  const layout = source("src/app/(vip)/vip/layout.tsx");

  assertEqual(layout.includes("<Header />"), true,
    "VIP reuses the approved global Header");
  assertEqual(layout.includes("<Footer />"), true,
    "VIP reuses the approved global Footer");
}

function main(): void {
  verifySelectionContract();
  verifyProtectedPageComposition();
  verifySharedCanonicalOwnership();
  verifyVipProductSurface();
  verifyMarketRoomDirectory();
  verifyRenderedDecisionTerminal();
  verifyUnavailableRendering();
  verifyApprovedChrome();

  console.log("PASS: C3 VIP Overview contract and delivery composition");
}

main();

function projectionMap(
  includeFxScenario = true,
): FiveProductVipDeepProjectionMapV1 {
  const fx = (productId: "eurusd" | "eurjpy" | "eurgbp" | "eurchf") => ({
    version: "market-product-projection-v1",
    tier: "vip-deep",
    availability: "available",
    productId,
    displayName: displayName(productId),
    productKind: "fx",
    currentValue: {
      kind: "fx-reference-rate",
      value: productId === "eurjpy" ? 162.4 : 1.0842,
      unit: "reference-rate",
    },
    referenceDate: "2026-09-11",
    fetchedAt: 1_789_000_000,
    sourceTimestamp: 1_789_000_000,
    interval: "1d",
    status: "end_of_day",
    provenance: provenance(productId),
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
      risk: { score: 0.31, level: "moderate", reasons: [] },
      calibration: {
        genericComputable: true,
        productionCalibrated: true,
        missingExplicitCalibration: [],
      },
      engine: {
        version: "3",
        evaluatedAt: "2026-09-11T12:00:00.000Z",
        macro: { availability: "not-applicable" },
        regime: { availability: "unavailable" },
        crossAsset: { availability: "not-applicable" },
        positioning: { availability: "not-computed" },
        scenario: includeFxScenario
          ? scenarioFixture()
          : { availability: "not-computed" },
        invalidation: includeFxScenario
          ? invalidationFixture()
          : { availability: "not-computed" },
        contradiction: {
          availability: "available",
          data: { score: 0.14, evidence: [], conflicts: [], strongestConflict: null },
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
            restraintReasons: [
              { code: "RISK_MODERATE", source: "risk" },
            ],
            supportingReasons: [],
            opposingReasons: [],
          },
        },
      },
    },
  });

  const estr = {
    version: "market-product-projection-v1",
    tier: "vip-deep",
    availability: "available",
    productId: "estr",
    displayName: "€STR",
    productKind: "rate",
    currentValue: { kind: "rate-percent", value: 2.125, unit: "percent" },
    referenceDate: "2026-09-11",
    fetchedAt: 1_789_000_000,
    sourceTimestamp: 1_789_000_000,
    interval: "1d",
    status: "end_of_day",
    provenance: provenance("estr"),
    details: {
      kind: "rate",
      currentRatePercent: 2.125,
      direction: "rising-rate",
      signalStrength: "directional",
      riskLevel: "low",
      levelRegime: "middle",
      volatilityRegime: "calm",
      rateFeatures: {
        currentRate: 2.125,
        dailyChangeBp: 1.25,
        momentum: [{ horizonObservations: 10, momentumBp: 3.5 }],
        ema: [],
        rsi: 54,
        macd: { valueBp: 0.2, signalBp: 0.1, histogramBp: 0.1 },
        dailyBpVolatility: 0.85,
      },
      signal: {
        score: 0.4,
        direction: "rising-rate",
        strength: "directional",
        coverage: 1,
        components: {
          ema: 0.3,
          rsi14: 0.1,
          macdHistogramBp: 0.2,
          momentum10Bp: 0.4,
        },
      },
      risk: {
        score: 0.2,
        level: "low",
        coverage: 1,
        components: {
          dailyBpVolatility: 0.2,
          rsiStretch: 0.1,
          momentum10Bp: 0.2,
          macdHistogramBp: 0.1,
          ema50DistanceBp: 0.2,
          ema200DistanceBp: 0.2,
        },
      },
      marketState: {
        currentRatePercent: 2.125,
        direction: "rising-rate",
        signalStrength: "directional",
        signalScore: 0.4,
        riskLevel: "low",
        riskScore: 0.2,
        levelRegime: "middle",
        volatilityRegime: "calm",
      },
      engineEvidence: {},
    },
  };

  return {
    eurusd: fx("eurusd"),
    eurjpy: fx("eurjpy"),
    eurgbp: fx("eurgbp"),
    eurchf: fx("eurchf"),
    estr,
  } as unknown as FiveProductVipDeepProjectionMapV1;
}

function scenarioFixture() {
  const signalReference = {
    kind: "channel",
    channel: "signal",
    role: "primary",
  };
  const scenarioCase = (
    id: "base" | "bullish" | "bearish",
    targetStance: "bullish" | "bearish",
    relationToDecision: "current" | "aligned" | "counterfactual",
  ) => ({
    id,
    targetStance,
    relationToDecision,
    supportingEvidence: [{ reference: signalReference, relation: "supports" }],
    opposingEvidence: [],
    neutralEvidence: [],
    notApplicableEvidence: [],
    unknownEvidence: [],
    dominantSupportingDrivers: [signalReference],
    strengtheningConditions: [{
      code: "TARGET_DIRECTION_SUPPORTED",
      reference: signalReference,
      expectedRelation: "supports",
      status: targetStance === "bullish" ? "met" : "unmet",
    }],
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
      assessmentFailsWhen: [{
        code: "SUPPORTING_EVIDENCE_BECOMES_UNAVAILABLE",
        effect: "assessment-unavailable",
        predicate: {
          kind: "evidence-availability-equal",
          reference: { kind: "channel", channel: "signal", role: "primary" },
          availability: "unavailable",
        },
      }],
      currentFragilities: [],
    },
  };
}

function provenance(productId: string) {
  return {
    provider: "ecb",
    source: "European Central Bank",
    seriesId: `fixture-${productId}`,
    canonicalProductId: productId,
    interval: "1d",
    status: "end_of_day",
    unit: productId === "estr" ? "percent" : "reference-rate",
    seriesKind: "reference-rate",
    referenceDate: "2026-09-11",
    fetchedAt: 1_789_000_000,
    sourceTimestamp: 1_789_000_000,
    freshness: "not-assessed",
  };
}

function displayName(productId: string): string {
  return ({
    eurusd: "EUR/USD",
    eurjpy: "EUR/JPY",
    eurgbp: "EUR/GBP",
    eurchf: "EUR/CHF",
    estr: "€STR",
  } as Record<string, string>)[productId]!;
}
