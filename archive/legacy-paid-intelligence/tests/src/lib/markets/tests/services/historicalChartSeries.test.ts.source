import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  CANONICAL_OBSERVATION_SERIES_SCHEMA_VERSION_V1,
  type CanonicalObservationSeriesMetadataV1,
  type CanonicalObservationSeriesV1,
  type CanonicalObservationValueV1,
} from "../../services/canonicalObservationSeries";
import {
  getHistoricalChartSeriesV1,
  type HistoricalChartSeriesDependenciesV1,
  type HistoricalChartSeriesV1,
} from "../../services/historicalChartSeries";
import {
  ECB_FX_REFERENCE_PRODUCT_IDS_V1,
  ECB_FX_REFERENCE_PRODUCTS_V1,
  type EcbFxReferenceSeriesBundleV1,
} from "../../providers/ecb/fxReferenceSeries";
import {
  HISTORICAL_PRODUCT_IDS_V1,
  HISTORICAL_RANGES_V1,
  getHistoricalRangeSupportV1,
  type HistoricalProductIdV1,
  type HistoricalRangeSupportV1,
  type HistoricalRangeV1,
} from "../../services/historicalRange";

const DAY = 86_400;
const ANCHOR = 2_000_000_000;
const FETCHED_AT = 1_999_999_000;

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, label: string): void {
  assertEqual(JSON.stringify(actual), JSON.stringify(expected), label);
}

async function assertRejects(run: () => Promise<unknown>, label: string): Promise<void> {
  let rejected = false;

  try {
    await run();
  } catch {
    rejected = true;
  }

  assertEqual(rejected, true, label);
}

function requireAvailable(
  result: HistoricalChartSeriesV1,
  label: string,
): Extract<HistoricalChartSeriesV1, { readonly availability: "available" }> {
  assertEqual(result.availability, "available", label);

  if (result.availability !== "available") {
    throw new Error(`${label}: ${result.reason}`);
  }

  return result;
}

function requireUnavailable(
  result: HistoricalChartSeriesV1,
  reason: Extract<
    HistoricalChartSeriesV1,
    { readonly availability: "unavailable" }
  >["reason"],
  label: string,
): Extract<HistoricalChartSeriesV1, { readonly availability: "unavailable" }> {
  assertEqual(result.availability, "unavailable", label);

  if (result.availability !== "unavailable") {
    throw new Error(`${label}: unexpectedly available`);
  }

  assertEqual(result.reason, reason, `${label} reason`);
  return result;
}

function sourceIdentity(productId: HistoricalProductIdV1): {
  readonly seriesId: string;
  readonly unit: string;
} {
  if (productId === "estr") {
    return {
      seriesId: "EST.B.EU000A2X2A25.WT",
      unit: "percent",
    };
  }

  const product = ECB_FX_REFERENCE_PRODUCTS_V1[productId];
  return { seriesId: product.seriesId, unit: product.unit };
}

function canonicalSeries(
  productId: HistoricalProductIdV1,
  observations: readonly CanonicalObservationValueV1[],
  metadataOverrides: Partial<CanonicalObservationSeriesMetadataV1> = {},
): CanonicalObservationSeriesV1 {
  const identity = sourceIdentity(productId);
  const finiteTimestamps = observations
    .map((observation) => observation.timestamp)
    .filter(Number.isFinite);
  const sourceTimestamp = finiteTimestamps.length === 0
    ? ANCHOR
    : Math.max(...finiteTimestamps);

  return {
    schemaVersion: CANONICAL_OBSERVATION_SERIES_SCHEMA_VERSION_V1,
    observations,
    metadata: {
      provider: "ecb",
      source: "European Central Bank",
      seriesId: identity.seriesId,
      requestedProductId: productId,
      canonicalProductId: productId,
      interval: "1d",
      fetchedAt: FETCHED_AT,
      sourceTimestamp,
      status: "end_of_day",
      unit: identity.unit,
      seriesKind: "reference-rate",
      ...metadataOverrides,
    },
  };
}

function longHistory(
  productId: HistoricalProductIdV1,
): CanonicalObservationSeriesV1 {
  const startDays = productId === "estr" ? 2_000 : 800;

  return canonicalSeries(productId, [
    { timestamp: ANCHOR - startDays * DAY, value: productId === "estr" ? -0.5 : 1 },
    { timestamp: ANCHOR - 730 * DAY, value: productId === "estr" ? -0.2 : 1.1 },
    { timestamp: ANCHOR - 365 * DAY, value: productId === "estr" ? 0.1 : 1.2 },
    { timestamp: ANCHOR - 30 * DAY, value: productId === "estr" ? 1.9 : 1.3 },
    { timestamp: ANCHOR - 5 * DAY, value: productId === "estr" ? 2 : 1.4 },
    { timestamp: ANCHOR - 2 * DAY, value: productId === "estr" ? 2.1 : 1.5 },
    { timestamp: ANCHOR, value: productId === "estr" ? 2.2 : 1.6 },
  ]);
}

function fxBundle(
  replacementProduct: Exclude<HistoricalProductIdV1, "estr"> = "eurusd",
  replacementSeries: CanonicalObservationSeriesV1 = longHistory("eurusd"),
): EcbFxReferenceSeriesBundleV1 {
  const entries = ECB_FX_REFERENCE_PRODUCT_IDS_V1.map((productId) => [
    productId,
    productId === replacementProduct ? replacementSeries : longHistory(productId),
  ] as const);

  return Object.freeze(Object.fromEntries(entries)) as EcbFxReferenceSeriesBundleV1;
}

function dependenciesFor(
  productId: HistoricalProductIdV1,
  series: CanonicalObservationSeriesV1,
  counters?: { fx: number; estr: number },
): HistoricalChartSeriesDependenciesV1 {
  const counts = counters ?? { fx: 0, estr: 0 };

  return {
    loadFxBundle: async () => {
      counts.fx += 1;
      return fxBundle(
        productId === "estr" ? "eurusd" : productId,
        productId === "estr" ? longHistory("eurusd") : series,
      );
    },
    loadEstrSeries: async () => {
      counts.estr += 1;
      return series;
    },
    now: () => ANCHOR,
  };
}

async function request(
  productId: HistoricalProductIdV1,
  range: HistoricalRangeV1,
  series = longHistory(productId),
  sourceTimestamp = ANCHOR,
): Promise<HistoricalChartSeriesV1> {
  return getHistoricalChartSeriesV1(
    productId,
    range,
    { sourceTimestamp },
    dependenciesFor(productId, series),
  );
}

function verifyProductAndRangePolicy(): void {
  assertDeepEqual(
    HISTORICAL_PRODUCT_IDS_V1,
    ["eurusd", "eurjpy", "eurgbp", "eurchf", "estr"],
    "exact historical product IDs",
  );
  assertDeepEqual(
    HISTORICAL_RANGES_V1,
    ["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "max"],
    "exact historical ranges",
  );

  const fxPolicy: Record<HistoricalRangeV1, HistoricalRangeSupportV1> = {
    "1d": "unsupported",
    "5d": "conditional",
    "1mo": "supported",
    "3mo": "supported",
    "6mo": "supported",
    "1y": "supported",
    "2y": "supported",
    "5y": "unsupported",
    max: "unsupported",
  };
  const estrPolicy: Record<HistoricalRangeV1, HistoricalRangeSupportV1> = {
    "1d": "unsupported",
    "5d": "conditional",
    "1mo": "supported",
    "3mo": "supported",
    "6mo": "supported",
    "1y": "supported",
    "2y": "supported",
    "5y": "supported",
    max: "supported",
  };

  for (const range of HISTORICAL_RANGES_V1) {
    for (const productId of ["eurusd", "eurjpy", "eurgbp", "eurchf"] as const) {
      assertEqual(
        getHistoricalRangeSupportV1(productId, range),
        fxPolicy[range],
        `${productId} ${range} range policy`,
      );
    }

    assertEqual(
      getHistoricalRangeSupportV1("estr", range),
      estrPolicy[range],
      `estr ${range} range policy`,
    );
  }
}

async function verifySupportedAndUnsupportedResults(): Promise<void> {
  for (const range of ["1d", "5y", "max"] as const) {
    const result = await request("eurusd", range);
    requireUnavailable(result, "range-unsupported", `FX ${range}`);
    assertEqual(result.requested.to, ANCHOR, `FX ${range} explicit requested to`);
  }

  for (const range of ["5d", "1mo", "3mo", "6mo", "1y", "2y"] as const) {
    requireAvailable(await request("eurusd", range), `FX ${range}`);
  }

  requireUnavailable(await request("estr", "1d"), "range-unsupported", "estr 1d");

  for (const range of ["5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "max"] as const) {
    requireAvailable(await request("estr", range), `estr ${range}`);
  }
}

async function verifyPointValidation(): Promise<void> {
  const sorted = requireAvailable(await request("eurusd", "5d", canonicalSeries("eurusd", [
    { timestamp: ANCHOR, value: 1.3 },
    { timestamp: ANCHOR - 4 * DAY, value: 1.1 },
    { timestamp: ANCHOR - 4 * DAY, value: 1.1 },
  ])), "sorted/deduplicated FX");
  assertDeepEqual(
    sorted.points,
    [
      { timestamp: ANCHOR - 4 * DAY, value: 1.1 },
      { timestamp: ANCHOR, value: 1.3 },
    ],
    "strict chronological ordering and identical duplicate collapse",
  );

  requireUnavailable(await request("eurusd", "5d", canonicalSeries("eurusd", [
    { timestamp: ANCHOR - DAY, value: 1.1 },
    { timestamp: ANCHOR - DAY, value: 1.2 },
    { timestamp: ANCHOR, value: 1.3 },
  ])), "invalid-series", "conflicting duplicate");

  requireUnavailable(await request("eurusd", "5d", canonicalSeries("eurusd", [
    { timestamp: ANCHOR - DAY, value: Number.NaN },
    { timestamp: ANCHOR, value: 1.3 },
  ])), "invalid-series", "non-finite value");

  requireUnavailable(await request("eurusd", "5d", canonicalSeries("eurusd", [
    { timestamp: Number.POSITIVE_INFINITY, value: 1.2 },
    { timestamp: ANCHOR, value: 1.3 },
  ], { sourceTimestamp: ANCHOR })), "invalid-series", "non-finite timestamp");

  for (const value of [0, -1]) {
    requireUnavailable(await request("eurusd", "5d", canonicalSeries("eurusd", [
      { timestamp: ANCHOR - DAY, value },
      { timestamp: ANCHOR, value: 1.3 },
    ])), "invalid-series", `non-positive FX ${value}`);
  }

  const negativeEstr = requireAvailable(await request("estr", "5d", canonicalSeries("estr", [
    { timestamp: ANCHOR - 4 * DAY, value: -0.55 },
    { timestamp: ANCHOR, value: -0.5 },
  ])), "negative estr");
  assertEqual(negativeEstr.points[0]!.value, -0.55, "negative estr preserved");
  assertEqual(negativeEstr.valueKind, "interest-rate-percent", "estr value kind");
}

async function verifyCountsAndRangeResolution(): Promise<void> {
  const insufficient = canonicalSeries("eurusd", [
    { timestamp: ANCHOR - 20 * DAY, value: 1.1 },
    { timestamp: ANCHOR - DAY, value: 1.2 },
  ]);
  requireUnavailable(
    await request("eurusd", "5d", insufficient),
    "insufficient-observations",
    "one observation in conditional window",
  );

  const twoPoints = requireAvailable(await request("eurusd", "5d", canonicalSeries("eurusd", [
    { timestamp: ANCHOR - 4 * DAY, value: 1.1 },
    { timestamp: ANCHOR, value: 1.2 },
  ])), "two observations may render");
  assertEqual(twoPoints.points.length, 2, "two observation result length");

  const complete = requireAvailable(await request("eurusd", "1mo", canonicalSeries("eurusd", [
    { timestamp: ANCHOR - 40 * DAY, value: 1 },
    { timestamp: ANCHOR - 20 * DAY, value: 1.1 },
    { timestamp: ANCHOR - 10 * DAY, value: 1.2 },
    { timestamp: ANCHOR, value: 1.3 },
  ])), "complete range");
  assertEqual(complete.requested.from, ANCHOR - 30 * DAY, "explicit requested from");
  assertEqual(complete.requested.to, ANCHOR, "explicit requested to");
  assertEqual(complete.resolved.observedFrom, ANCHOR - 20 * DAY, "observed from");
  assertEqual(complete.resolved.observedTo, ANCHOR, "observed to");
  assertEqual(complete.resolved.completeness, "complete", "source covers start boundary");

  const partial = requireAvailable(await request("eurusd", "1mo", canonicalSeries("eurusd", [
    { timestamp: ANCHOR - 20 * DAY, value: 1.1 },
    { timestamp: ANCHOR - 10 * DAY, value: 1.2 },
    { timestamp: ANCHOR, value: 1.3 },
  ])), "partial range");
  assertEqual(partial.resolved.completeness, "partial", "source starts after request boundary");

  const sparse = requireAvailable(await request("eurusd", "5d", canonicalSeries("eurusd", [
    { timestamp: ANCHOR - 4 * DAY, value: 1.1 },
    { timestamp: ANCHOR, value: 1.2 },
  ])), "sparse official dates");
  assertEqual(sparse.points.length, 2, "weekend or holiday points are not fabricated");
}

async function verifyAnchoringAndProvenance(): Promise<void> {
  const source = canonicalSeries("eurusd", [
    { timestamp: ANCHOR - 4 * DAY, value: 1.1 },
    { timestamp: ANCHOR - 2 * DAY, value: 1.2 },
    { timestamp: ANCHOR + DAY, value: 1.3 },
  ]);
  const anchored = requireAvailable(await request("eurusd", "5d", source), "anchored FX");

  assertEqual(anchored.requested.to, ANCHOR, "requested to uses sourceTimestamp anchor");
  assertEqual(anchored.points.length, 2, "post-anchor observation excluded");
  assertEqual(anchored.resolved.observedTo, ANCHOR - 2 * DAY, "endpoint is not fabricated");
  assertEqual(
    anchored.provenance.sourceTimestamp,
    ANCHOR - 2 * DAY,
    "provenance uses latest included reference date",
  );
  assertDeepEqual(anchored.provenance, {
    provider: "ecb",
    sourceLabel: "European Central Bank",
    sourceSeriesId: "EXR.D.USD.EUR.SP00.A",
    sourceRole: "primary",
    status: "end_of_day",
    fetchedAt: FETCHED_AT,
    sourceTimestamp: ANCHOR - 2 * DAY,
    freshness: "not-assessed",
    normalization: "canonical-observation-series-v1",
  }, "exact ECB provenance");

  const maxEstr = requireAvailable(await request("estr", "max"), "estr max");
  assertEqual(
    maxEstr.requested.from,
    maxEstr.points[0]!.timestamp,
    "estr max begins at official available history",
  );
}

async function verifyFailureAndInputSemantics(): Promise<void> {
  const sourceFailure = await getHistoricalChartSeriesV1(
    "eurusd",
    "1mo",
    { sourceTimestamp: ANCHOR },
    { loadFxBundle: async () => { throw new Error("offline"); } },
  );
  requireUnavailable(sourceFailure, "source-unavailable", "source failure");

  const invalidIdentity = canonicalSeries("eurusd", [
    { timestamp: ANCHOR - DAY, value: 1.1 },
    { timestamp: ANCHOR, value: 1.2 },
  ], { provider: "not-ecb" });
  requireUnavailable(
    await request("eurusd", "5d", invalidIdentity),
    "invalid-series",
    "invalid source identity",
  );

  await assertRejects(
    () => getHistoricalChartSeriesV1("gold" as HistoricalProductIdV1, "1mo"),
    "sixth product rejected",
  );
  await assertRejects(
    () => getHistoricalChartSeriesV1("eurusd", "10y" as HistoricalRangeV1),
    "unknown range rejected",
  );
}

async function verifySourceOwnershipAndOutputBoundary(): Promise<void> {
  const counters = { fx: 0, estr: 0 };

  for (const productId of ECB_FX_REFERENCE_PRODUCT_IDS_V1) {
    const result = await getHistoricalChartSeriesV1(
      productId,
      "1mo",
      { sourceTimestamp: ANCHOR },
      dependenciesFor(productId, longHistory(productId), counters),
    );
    const available = requireAvailable(result, `${productId} shared FX source`);
    assertEqual(
      available.provenance.sourceSeriesId,
      sourceIdentity(productId).seriesId,
      `${productId} exact source series ID`,
    );
    assertEqual(available.unit, sourceIdentity(productId).unit, `${productId} exact unit`);
  }

  assertEqual(counters.fx, 4, "each request reads the injected shared FX bundle once");
  assertEqual(counters.estr, 0, "FX never reads estr source");

  const estrResult = requireAvailable(await getHistoricalChartSeriesV1(
    "estr",
    "1mo",
    { sourceTimestamp: ANCHOR },
    dependenciesFor("estr", longHistory("estr"), counters),
  ), "estr canonical source");
  assertEqual(counters.estr, 1, "estr reads its canonical source once");
  assertEqual(counters.fx, 4, "estr never reads FX source");
  assertEqual(estrResult.provenance.sourceSeriesId, "EST.B.EU000A2X2A25.WT",
    "estr exact headline series ID");
  assertEqual(estrResult.unit, "percent", "estr exact unit");

  const unsupportedCounts = { fx: 0, estr: 0 };
  requireUnavailable(await getHistoricalChartSeriesV1(
    "eurusd",
    "1d",
    { sourceTimestamp: ANCHOR },
    dependenciesFor("eurusd", longHistory("eurusd"), unsupportedCounts),
  ), "range-unsupported", "unsupported range avoids source read");
  assertEqual(unsupportedCounts.fx, 0, "unsupported FX range owns no source read");

  const defaultAnchorSource = canonicalSeries("eurusd", [
    { timestamp: ANCHOR - DAY, value: 1.1 },
    { timestamp: ANCHOR + DAY, value: 1.2 },
  ]);
  const defaultAnchored = requireAvailable(await getHistoricalChartSeriesV1(
    "eurusd",
    "5d",
    {},
    dependenciesFor("eurusd", defaultAnchorSource),
  ), "canonical default anchor");
  assertEqual(defaultAnchored.requested.to, ANCHOR + DAY,
    "canonical sourceTimestamp is the default request anchor");

  const output = JSON.stringify(estrResult).toLowerCase();

  for (const forbidden of [
    '"open":',
    '"high":',
    '"low":',
    '"close":',
    '"volume":',
    "publicationtype",
    "calculationmethod",
    "observationmetadata",
  ]) {
    assertEqual(output.includes(forbidden), false, `output excludes ${forbidden}`);
  }

  const repositoryRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
  const serviceSource = readFileSync(
    `${repositoryRoot}src/lib/markets/services/historicalChartSeries.ts`,
    "utf8",
  ).toLowerCase();
  const rangeSource = readFileSync(
    `${repositoryRoot}src/lib/markets/services/historicalRange.ts`,
    "utf8",
  ).toLowerCase();

  assertEqual(serviceSource.includes('import "server-only"'), true,
    "historical source service is server-only");
  assertEqual(serviceSource.includes("fxreferenceseriescache"), true,
    "service reuses the shared FX source owner");
  assertEqual(serviceSource.includes("estrseriescache"), true,
    "service reuses the shared estr source owner");

  for (const forbidden of [
    "historicalmarketdata",
    "yahoo",
    "marketstack",
    "unstable_cache",
  ]) {
    assertEqual(serviceSource.includes(forbidden), false,
      `service excludes ${forbidden}`);
    assertEqual(rangeSource.includes(forbidden), false,
      `range projector excludes ${forbidden}`);
  }
}

async function main(): Promise<void> {
  verifyProductAndRangePolicy();
  await verifySupportedAndUnsupportedResults();
  await verifyPointValidation();
  await verifyCountsAndRangeResolution();
  await verifyAnchoringAndProvenance();
  await verifyFailureAndInputSemantics();
  await verifySourceOwnershipAndOutputBoundary();

  console.log("PASS: Canonical Historical Chart Series V1");
}

void main();
