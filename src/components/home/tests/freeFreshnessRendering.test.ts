import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import FreeMarketSurface from "../FreeMarketSurface";
import type { FxFreeLiteProjectionV1, MarketProjectionProvenanceV1 } from "../../../lib/markets/projections/types";
import type { FiveProductFreeLiteProjectionMapV1 } from "../../../lib/markets/services/canonicalProductResults";

function projection(freshness: MarketProjectionProvenanceV1["freshness"]): FxFreeLiteProjectionV1 {
  return {
    version: "market-product-projection-v1", tier: "free-lite", availability: "available",
    productId: "eurusd", displayName: "EUR/USD", productKind: "fx",
    currentValue: { kind: "fx-reference-rate", value: 1.12, unit: "USD per EUR" },
    referenceDate: "2026-10-02", fetchedAt: 1790938800, sourceTimestamp: 1790938800,
    interval: "1d", status: "end_of_day",
    provenance: {
      version: "canonical-observation-provenance-v1", provider: "ecb", source: "European Central Bank",
      originalPublisher: "European Central Bank", substitution: { status: "none" }, seriesId: "eurusd",
      canonicalProductId: "eurusd", interval: "1d", status: "end_of_day", unit: "USD per EUR",
      seriesKind: "reference-rate", referenceDate: "2026-10-02", fetchedAt: 1790938800,
      observationTimestamp: 1790938800, sourceTimestamp: 1790938800, releaseTimestamp: null,
      freshness, freshnessAssessedAt: freshness === "unknown" ? null : "2026-10-04T12:00:00Z",
    },
    details: { kind: "fx", direction: "neutral", signalStrength: "weak", marketState: "caution", riskLevel: "low", annualizedVolatility: null },
  };
}

const render = (eurusd: FiveProductFreeLiteProjectionMapV1["eurusd"]) => renderToStaticMarkup(createElement(FreeMarketSurface, {
  projections: { eurusd, eurjpy: null, eurgbp: null, eurchf: null, estr: null },
}));
for (const [state, label] of [
  ["within-cadence", "Within Cadence"], ["stale", "Stale"], ["unknown", "Unknown"],
  ["unavailable", "Unavailable"], ["not-assessed", "Not Assessed"],
] as const) {
  const html = render(projection(state));
  assert.match(html, new RegExp(`Freshness</dt><dd[^>]*>${label}</dd>`));
  assert.doesNotMatch(html, /real-time|live price|engineEvidence|ecbPolicyEvent|invalidationState/);
}
for (const unavailable of [null, {
  version: "market-product-projection-v1", tier: "free-lite", availability: "unavailable",
  productId: "eurusd", displayName: "EUR/USD", productKind: "fx", reason: "source-unavailable",
}] as const) {
  const html = render(unavailable);
  assert.match(html, /EUR\/USD projection unavailable/);
  assert.doesNotMatch(html, /Freshness<\/dt>/);
}
console.log("PASS: Free freshness renders provenance states and unavailable semantics");
