import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  ECB_FX_REFERENCE_DATA_URL_V1,
  EcbClientV1,
} from "../../providers/ecb/client";
import {
  ECB_FX_REFERENCE_PRODUCTS_V1,
  loadEcbFxReferenceSeriesBundleV1,
  selectEcbFxReferenceSeriesV1,
} from "../../providers/ecb/fxReferenceSeries";
import type {
  EcbFxReferenceDataResultV1,
  EcbFxReferenceRawObservationV1,
} from "../../providers/ecb/types";

const productIds = ["eurusd", "eurjpy", "eurgbp", "eurchf"] as const;
const expectedMappings = {
  eurusd: ["D.USD.EUR.SP00.A", "EXR.D.USD.EUR.SP00.A", "USD", "EUR 1 = X USD", "USD per EUR"],
  eurjpy: ["D.JPY.EUR.SP00.A", "EXR.D.JPY.EUR.SP00.A", "JPY", "EUR 1 = X JPY", "JPY per EUR"],
  eurgbp: ["D.GBP.EUR.SP00.A", "EXR.D.GBP.EUR.SP00.A", "GBP", "EUR 1 = X GBP", "GBP per EUR"],
  eurchf: ["D.CHF.EUR.SP00.A", "EXR.D.CHF.EUR.SP00.A", "CHF", "EUR 1 = X CHF", "CHF per EUR"],
} as const;

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, label: string): void {
  assertEqual(JSON.stringify(actual), JSON.stringify(expected), label);
}

async function assertRejects(operation: () => Promise<unknown>, label: string): Promise<void> {
  let rejected = false;

  try {
    await operation();
  } catch {
    rejected = true;
  }

  assertEqual(rejected, true, label);
}

function rawResult(
  observations: readonly EcbFxReferenceRawObservationV1[],
): EcbFxReferenceDataResultV1 {
  return Object.freeze({
    provider: "ecb",
    requestedSeriesIds: Object.freeze(productIds.map(
      (productId) => ECB_FX_REFERENCE_PRODUCTS_V1[productId].seriesId,
    )),
    observations: Object.freeze(observations),
  });
}

function rawObservations(): readonly EcbFxReferenceRawObservationV1[] {
  const values = { eurusd: "1.1652", eurjpy: "178.59", eurgbp: "0.85898", eurchf: "0.9321" };

  return Object.freeze(productIds.flatMap((productId, index) => {
    const seriesId = ECB_FX_REFERENCE_PRODUCTS_V1[productId].seriesId;
    const latest = Object.freeze({ seriesId, period: "2026-09-09", value: values[productId] });

    return [
      latest,
      Object.freeze({ seriesId, period: "2026-09-08", value: String(Number(values[productId]) - index * 0.01) }),
      latest,
      Object.freeze({ seriesId, period: "2026-09-07", value: "" }),
    ];
  }));
}

async function main(): Promise<void> {
  for (const productId of productIds) {
    const product = ECB_FX_REFERENCE_PRODUCTS_V1[productId];
    assertDeepEqual(
      [product.ecbSeriesKey, product.seriesId, product.quoteCurrency, product.quotation, product.unit],
      expectedMappings[productId],
      `${productId} exact mapping`,
    );
    assertEqual(product.canonicalProductId, productId, `${productId} canonical identity`);
    assertEqual(product.inverted, false, `${productId} quotation is not inverted`);
  }

  let loadCount = 0;
  const now = () => new Date("2026-09-10T12:34:56.000Z");
  const dependencies = {
    loadData: async () => {
      loadCount += 1;
      return rawResult(rawObservations());
    },
    now,
  };
  const bundle = await loadEcbFxReferenceSeriesBundleV1(dependencies);
  const repeat = await loadEcbFxReferenceSeriesBundleV1({
    loadData: async () => rawResult(rawObservations()),
    now,
  });

  assertEqual(loadCount, 1, "one acquisition supplies all four products");
  assertDeepEqual(repeat, bundle, "controlled input normalization is deterministic");

  for (const productId of productIds) {
    const product = ECB_FX_REFERENCE_PRODUCTS_V1[productId];
    const series = selectEcbFxReferenceSeriesV1(bundle, productId);
    assertEqual(series.observations.length, 2, `${productId} blank omitted and duplicate deduped`);
    assertEqual(series.observations[0]!.timestamp < series.observations[1]!.timestamp, true,
      `${productId} dates sorted ascending`);
    assertEqual(series.observations.every((item) => Number.isFinite(item.value) && item.value > 0), true,
      `${productId} observations positive and finite`);
    assertEqual(series.metadata.provider, "ecb", `${productId} provider`);
    assertEqual(series.metadata.source, "European Central Bank", `${productId} source`);
    assertEqual(series.metadata.originalPublisher, "European Central Bank",
      `${productId} original publisher`);
    assertEqual(series.metadata.substitution?.status, "none",
      `${productId} has no fallback source`);
    assertEqual(series.metadata.seriesId, product.seriesId, `${productId} series ID`);
    assertEqual(series.metadata.requestedProductId, productId, `${productId} requested product`);
    assertEqual(series.metadata.canonicalProductId, productId, `${productId} canonical product`);
    assertEqual(series.metadata.interval, "1d", `${productId} interval`);
    assertEqual(series.metadata.status, "end_of_day", `${productId} status`);
    assertEqual(series.metadata.seriesKind, "reference-rate", `${productId} series kind`);
    assertEqual(series.metadata.unit, product.unit, `${productId} unit`);
    assertEqual(series.metadata.fetchedAt, Date.parse("2026-09-10T12:34:56.000Z") / 1000,
      `${productId} fetchedAt`);
    assertEqual(series.metadata.sourceTimestamp, Date.parse("2026-09-09T00:00:00.000Z") / 1000,
      `${productId} latest real sourceTimestamp`);
    assertEqual(series.metadata.observationTimestamp, series.metadata.sourceTimestamp,
      `${productId} observation is reference time`);
    assertEqual("releaseTimestamp" in series.metadata, false,
      `${productId} release time is not fabricated`);
    for (const field of ["open", "high", "low", "close", "volume"] as const) {
      assertEqual(field in series.observations[0]!, false, `${productId} no synthesized ${field}`);
    }
  }

  assertEqual(selectEcbFxReferenceSeriesV1(bundle, "eurjpy").metadata.seriesId,
    "EXR.D.JPY.EUR.SP00.A", "product getter returns only requested series");

  const usd = ECB_FX_REFERENCE_PRODUCTS_V1.eurusd.seriesId;
  await assertRejects(() => loadEcbFxReferenceSeriesBundleV1({
    loadData: async () => rawResult([
      ...rawObservations(),
      { seriesId: usd, period: "2026-09-09", value: "1.2" },
    ]),
  }), "conflicting duplicate rejected");
  await assertRejects(() => loadEcbFxReferenceSeriesBundleV1({
    loadData: async () => rawResult([
      ...rawObservations(),
      { seriesId: usd, period: "2026-02-30", value: "1.2" },
    ]),
  }), "malformed date rejected");
  await assertRejects(() => loadEcbFxReferenceSeriesBundleV1({
    loadData: async () => rawResult([
      ...rawObservations(),
      { seriesId: usd, period: "2026-09-10", value: "not-a-number" },
    ]),
  }), "malformed numeric value rejected");
  await assertRejects(() => loadEcbFxReferenceSeriesBundleV1({
    loadData: async () => rawResult(rawObservations().filter(
      (item) => item.seriesId !== ECB_FX_REFERENCE_PRODUCTS_V1.eurchf.seriesId,
    )),
  }), "one missing pair rejects the atomic shared bundle");

  let fetchCount = 0;
  const csv = [
    "KEY,TIME_PERIOD,OBS_VALUE",
    ...rawObservations().map((item) => `${item.seriesId},${item.period},${item.value}`),
  ].join("\n");
  const client = new EcbClientV1({
    fetchImpl: async (input, init) => {
      fetchCount += 1;
      assertEqual(String(input), ECB_FX_REFERENCE_DATA_URL_V1, "official multi-series URL");
      assertEqual(new Headers(init?.headers).get("accept"), "text/csv", "explicit CSV negotiation");
      return new Response(csv, { status: 200, headers: { "content-type": "text/csv" } });
    },
  });
  const clientResult = await client.getFxReferenceRates(
    productIds.map((productId) => ECB_FX_REFERENCE_PRODUCTS_V1[productId].seriesId),
  );
  assertEqual(fetchCount, 1, "one upstream request per shared refresh");
  assertEqual(clientResult.observations.length, rawObservations().length, "CSV rows parsed exactly");

  let failureFetchCount = 0;
  const failingClient = new EcbClientV1({
    fetchImpl: async () => {
      failureFetchCount += 1;
      return new Response("unavailable", { status: 503, headers: { "content-type": "text/plain" } });
    },
  });
  await assertRejects(() => failingClient.getFxReferenceRates(
    productIds.map((productId) => ECB_FX_REFERENCE_PRODUCTS_V1[productId].seriesId),
  ), "ECB failure rejects without fallback");
  assertEqual(failureFetchCount, 1, "failure performs no fallback request");

  const providerDirectory = fileURLToPath(new URL("../../providers/ecb/", import.meta.url));
  const cacheSource = readFileSync(`${providerDirectory}fxReferenceSeriesCache.ts`, "utf8");
  const providerSource = ["client.ts", "fxReferenceSeries.ts", "fxReferenceSeriesCache.ts"]
    .map((file) => readFileSync(`${providerDirectory}${file}`, "utf8"))
    .join("\n");
  assertEqual(cacheSource.match(/= unstable_cache\(/g)?.length, 1,
    "exactly one shared cache entry");
  assertEqual(cacheSource.includes("24 * 60 * 60"), true, "daily shared cache cadence");
  assertEqual(providerSource.toLowerCase().includes("yahoo"), false, "no Yahoo fallback");

  console.log("PASS: Shared ECB FX Reference Backbone V1");
}

void main();
