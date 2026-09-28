import assert from "node:assert/strict";

import {
  EUROSTAT_STATISTICS_API_DATA_BASE_URL_V1,
  EurostatClientV1,
} from "../../providers/eurostat/client";
import {
  EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1,
  loadEurostatEuroAreaMacroSeriesV1,
  type EurostatEuroAreaMacroFamilyV1,
} from "../../providers/eurostat/macroSeries";
import { CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1 } from
  "../../services/canonicalObservationSeries";

const UPDATED = "2026-09-27T11:00:00+0200";
const FETCHED_AT = 1_790_500_000;

interface MutableDataset {
  version: unknown;
  class: unknown;
  source: unknown;
  updated?: unknown;
  id: string[];
  size: number[];
  dimension: Record<string, { category: { index: unknown } }>;
  value: unknown;
  status?: unknown;
}

interface FixtureOptions {
  readonly dimensionOrder?: readonly string[];
  readonly times?: readonly string[];
  readonly value?: unknown;
  readonly status?: unknown;
  readonly updated?: string;
}

function fixture(
  family: EurostatEuroAreaMacroFamilyV1,
  options: FixtureOptions = {},
): MutableDataset {
  const spec = EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1[family];
  const times = options.times ?? (spec.frequency === "monthly"
    ? ["2026-01", "2026-02", "2026-03"]
    : ["2026-Q1", "2026-Q2"]);
  const id = [...(options.dimensionOrder ?? spec.dimensionIds)];
  const dimension = Object.fromEntries(id.map((dimensionId) => [
    dimensionId,
    {
      category: {
        index: dimensionId === "time"
          ? Object.fromEntries(times.map((period, index) => [period, index]))
          : { [spec.selectors[dimensionId]!]: 0 },
      },
    },
  ]));
  const payload: MutableDataset = {
    version: "2.0",
    class: "dataset",
    source: "ESTAT",
    updated: options.updated ?? UPDATED,
    id,
    size: id.map((dimensionId) =>
      dimensionId === "time" ? times.length : 1
    ),
    dimension,
    value: options.value ?? times.map((_, index) => index + 1),
  };
  if (options.status !== undefined) payload.status = options.status;
  return payload;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function load(
  family: EurostatEuroAreaMacroFamilyV1,
  payload: unknown,
  fetchedAt = FETCHED_AT,
) {
  const spec = EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1[family];
  let calls = 0;
  const series = await loadEurostatEuroAreaMacroSeriesV1(family, {
    fetchedAt,
    loadDataset: async (sourceUrl) => {
      calls += 1;
      assert.equal(sourceUrl, spec.sourceUrl);
      return Object.freeze({ sourceUrl, payload });
    },
  });
  assert.equal(calls, 1, `${family} performs one source load`);
  return series;
}

async function rejects(
  operation: () => Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  await assert.rejects(operation, pattern);
}

async function main(): Promise<void> {
  const hicpSpec = EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1.hicp;
  const gdpSpec = EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1.gdp;

  assert.equal(hicpSpec.datasetCode, "prc_hicp_minr");
  assert.deepEqual(hicpSpec.selectors, {
    freq: "M",
    unit: "RCH_A",
    coicop18: "TOTAL",
    geo: "EA",
  });
  assert.notEqual(hicpSpec.selectors.coicop18, "CP00");
  assert.deepEqual(hicpSpec.dimensionIds, [
    "freq",
    "unit",
    "coicop18",
    "geo",
    "time",
  ]);
  assert.equal(hicpSpec.frequency, "monthly");
  assert.equal(
    hicpSpec.canonicalSeriesId,
    "euro-area-hicp-all-items-annual-rate",
  );
  assert.equal(
    hicpSpec.sourceSeriesId,
    "prc_hicp_minr|freq=M|unit=RCH_A|coicop18=TOTAL|geo=EA",
  );
  assert.equal(hicpSpec.unit, "RCH_A");
  assert.equal(
    hicpSpec.sourceUrl,
    `${EUROSTAT_STATISTICS_API_DATA_BASE_URL_V1}/prc_hicp_minr` +
      "?lang=EN&freq=M&unit=RCH_A&coicop18=TOTAL&geo=EA",
  );
  assert.equal("coicop" in hicpSpec.selectors, false);
  assert.equal(hicpSpec.sourceUrl.includes("coicop="), false);
  assert.equal(hicpSpec.sourceUrl.includes("coicop18=CP00"), false);

  assert.equal(gdpSpec.datasetCode, "namq_10_gdp");
  assert.deepEqual(gdpSpec.selectors, {
    freq: "Q",
    unit: "CLV_PCH_PRE",
    s_adj: "SCA",
    na_item: "B1GQ",
    geo: "EA",
  });
  assert.equal(gdpSpec.frequency, "quarterly");
  assert.equal(gdpSpec.canonicalSeriesId, "euro-area-real-gdp-qoq-sca");
  assert.equal(
    gdpSpec.sourceSeriesId,
    "namq_10_gdp|freq=Q|unit=CLV_PCH_PRE|s_adj=SCA|na_item=B1GQ|geo=EA",
  );
  assert.equal(
    gdpSpec.sourceUrl,
    `${EUROSTAT_STATISTICS_API_DATA_BASE_URL_V1}/namq_10_gdp` +
      "?lang=EN&freq=Q&unit=CLV_PCH_PRE&s_adj=SCA&na_item=B1GQ&geo=EA",
  );
  assert.equal(gdpSpec.unit, "CLV_PCH_PRE");

  assert.equal(
    "unemployment" in EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1,
    false,
  );

  for (const spec of Object.values(
    EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1,
  )) {
    assert.equal(spec.selectors.geo, "EA");
    assert.equal(spec.sourceUrl.includes("geo=EA"), true);
    assert.equal(spec.sourceUrl.includes("EA21"), false);
    assert.equal(spec.sourceUrl.includes("sinceTimePeriod"), false);
    assert.equal(spec.sourceUrl.includes("startPeriod"), false);
    assert.equal(Object.isFrozen(spec), true);
    assert.equal(Object.isFrozen(spec.selectors), true);
    assert.equal(Object.isFrozen(spec.dimensionIds), true);
  }
  assert.equal(Object.isFrozen(EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1), true);

  const hicp = await load("hicp", fixture("hicp", {
    value: [2.4, null, 0],
    status: ["p b", ":", ""],
  }));
  assert.deepEqual(hicp.observations, [
    { referencePeriod: "2026-01", value: 2.4, officialStatus: "p b" },
    { referencePeriod: "2026-03", value: 0 },
  ]);
  assert.equal(hicp.metadata.provider, "eurostat");
  assert.equal(hicp.metadata.source, "Eurostat Statistics API");
  assert.equal(hicp.metadata.originalPublisher, "Eurostat");
  assert.deepEqual(hicp.metadata.substitution, { status: "none" });
  assert.equal(hicp.metadata.canonicalSeriesId, hicpSpec.canonicalSeriesId);
  assert.equal(hicp.metadata.sourceSeriesId, hicpSpec.sourceSeriesId);
  assert.equal(hicp.metadata.sourceUrl, hicpSpec.sourceUrl);
  assert.equal(hicp.metadata.sourceVersionId,
    `eurostat:prc_hicp_minr:${UPDATED}`);
  assert.equal(hicp.metadata.sourceVersionId.includes(String(FETCHED_AT)), false);
  assert.equal(hicp.metadata.fetchedAt, FETCHED_AT);
  assert.equal(hicp.metadata.frequency, "monthly");
  assert.equal(hicp.metadata.unit, "RCH_A");
  assert.equal(hicp.metadata.provenanceVersion,
    CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1);
  assert.equal("releaseTimestamp" in hicp.metadata, false);
  assert.equal(Object.isFrozen(hicp), true);
  assert.equal(Object.isFrozen(hicp.observations), true);
  assert.equal(Object.isFrozen(hicp.metadata), true);
  assert.equal(Object.isFrozen(hicp.observations[0]), true);

  const gdpDimensionOrder = [
    "time",
    "geo",
    "na_item",
    "freq",
    "s_adj",
    "unit",
  ];
  const gdp = await load("gdp", fixture("gdp", {
    dimensionOrder: gdpDimensionOrder,
    value: { "0": -0.3, "1": 0.2 },
    status: { "0": "p" },
  }));
  assert.deepEqual(gdp.observations, [
    { referencePeriod: "2026-Q1", value: -0.3, officialStatus: "p" },
    { referencePeriod: "2026-Q2", value: 0.2 },
  ]);
  assert.equal(gdp.metadata.canonicalSeriesId, gdpSpec.canonicalSeriesId);
  assert.equal(gdp.metadata.sourceSeriesId, gdpSpec.sourceSeriesId);
  assert.equal(gdp.metadata.frequency, "quarterly");
  assert.equal(gdp.metadata.unit, "CLV_PCH_PRE");

  let unsupportedUnemploymentLoads = 0;
  await rejects(
    () => loadEurostatEuroAreaMacroSeriesV1(
      "unemployment" as unknown as EurostatEuroAreaMacroFamilyV1,
      {
        fetchedAt: FETCHED_AT,
        loadDataset: async (sourceUrl) => {
          unsupportedUnemploymentLoads += 1;
          return { sourceUrl, payload: {} };
        },
      },
    ),
    /macro family is invalid/,
  );
  assert.equal(unsupportedUnemploymentLoads, 0);

  await rejects(
    () => loadEurostatEuroAreaMacroSeriesV1("hicp", {
      fetchedAt: -1,
      loadDataset: async () => {
        throw new Error("must not load");
      },
    }),
    /fetchedAt is invalid/,
  );
  await rejects(
    () => loadEurostatEuroAreaMacroSeriesV1("hicp", {
      fetchedAt: 1.5,
      loadDataset: async () => {
        throw new Error("must not load");
      },
    }),
    /fetchedAt is invalid/,
  );
  await rejects(
    () => loadEurostatEuroAreaMacroSeriesV1("hicp", {
      fetchedAt: FETCHED_AT,
      loadDataset: async () => ({
        sourceUrl: gdpSpec.sourceUrl,
        payload: fixture("hicp"),
      }),
    }),
    /source URL identity is invalid/,
  );

  const malformedNumber = fixture("hicp");
  malformedNumber.value = [1, "2", 3];
  await rejects(() => load("hicp", malformedNumber), /value is invalid/);

  const wrongVersion = fixture("hicp");
  wrongVersion.version = "1.0";
  await rejects(() => load("hicp", wrongVersion), /version is invalid/);

  const wrongClass = fixture("hicp");
  wrongClass.class = "series";
  await rejects(() => load("hicp", wrongClass), /class is invalid/);

  const wrongSource = fixture("hicp");
  wrongSource.source = "Other";
  await rejects(() => load("hicp", wrongSource), /source is invalid/);

  for (const updated of [
    undefined,
    "",
    "not-a-timestamp",
    "2026-09-27",
  ] as const) {
    const malformedUpdated = fixture("hicp");
    if (updated === undefined) delete malformedUpdated.updated;
    else malformedUpdated.updated = updated;
    await rejects(
      () => load("hicp", malformedUpdated),
      /updated timestamp is invalid/,
    );
  }

  const missingDimension = fixture("hicp");
  const missingIndex = missingDimension.id.indexOf("coicop18");
  missingDimension.id.splice(missingIndex, 1);
  missingDimension.size.splice(missingIndex, 1);
  delete missingDimension.dimension.coicop18;
  await rejects(
    () => load("hicp", missingDimension),
    /dimension set is invalid/,
  );

  const oldCoicopDimension = fixture("hicp");
  const coicop18Index = oldCoicopDimension.id.indexOf("coicop18");
  oldCoicopDimension.id[coicop18Index] = "coicop";
  oldCoicopDimension.dimension.coicop =
    oldCoicopDimension.dimension.coicop18!;
  delete oldCoicopDimension.dimension.coicop18;
  await rejects(
    () => load("hicp", oldCoicopDimension),
    /dimension set is invalid/,
  );

  const unexpectedDimension = fixture("hicp");
  unexpectedDimension.id.push("unexpected");
  unexpectedDimension.size.push(1);
  unexpectedDimension.dimension.unexpected = {
    category: { index: { X: 0 } },
  };
  await rejects(
    () => load("hicp", unexpectedDimension),
    /dimension set is invalid/,
  );

  const unexpectedDimensionEntry = fixture("hicp");
  unexpectedDimensionEntry.dimension.unexpected = {
    category: { index: { X: 0 } },
  };
  await rejects(
    () => load("hicp", unexpectedDimensionEntry),
    /dimension entries are invalid/,
  );

  const wrongFixedCategory = fixture("gdp");
  wrongFixedCategory.dimension.s_adj!.category.index = { NSA: 0 };
  await rejects(
    () => load("gdp", wrongFixedCategory),
    /s_adj category is invalid/,
  );

  const obsoleteHicpCategory = fixture("hicp");
  obsoleteHicpCategory.dimension.coicop18!.category.index = { CP00: 0 };
  await rejects(
    () => load("hicp", obsoleteHicpCategory),
    /coicop18 category is invalid/,
  );

  const multipleFixedCategories = fixture("gdp");
  const adjustmentIndex = multipleFixedCategories.id.indexOf("s_adj");
  multipleFixedCategories.size[adjustmentIndex] = 2;
  multipleFixedCategories.dimension.s_adj!.category.index = { SCA: 0, NSA: 1 };
  await rejects(
    () => load("gdp", multipleFixedCategories),
    /s_adj dimension must contain one category/,
  );

  const duplicateDimensionId = fixture("hicp");
  duplicateDimensionId.id[1] = duplicateDimensionId.id[0]!;
  await rejects(
    () => load("hicp", duplicateDimensionId),
    /dimension IDs are invalid/,
  );

  const emptyDimensionId = fixture("hicp");
  emptyDimensionId.id[1] = "";
  await rejects(
    () => load("hicp", emptyDimensionId),
    /dimension IDs are invalid/,
  );

  const mismatchedShape = fixture("hicp");
  mismatchedShape.size.pop();
  await rejects(
    () => load("hicp", mismatchedShape),
    /dimension shape is invalid/,
  );

  const zeroDimensionSize = fixture("hicp");
  zeroDimensionSize.size[0] = 0;
  await rejects(
    () => load("hicp", zeroDimensionSize),
    /dimension sizes are invalid/,
  );

  const duplicateTime = fixture("hicp");
  duplicateTime.dimension.time!.category.index = [
    "2026-01",
    "2026-01",
    "2026-03",
  ];
  await rejects(
    () => load("hicp", duplicateTime),
    /time category index is invalid/,
  );

  const invalidTime = fixture("gdp");
  invalidTime.dimension.time!.category.index = {
    "2026-Q1": 0,
    "2026-Q5": 1,
  };
  await rejects(
    () => load("gdp", invalidTime),
    /time categories are invalid/,
  );

  const duplicateTimePosition = fixture("hicp");
  duplicateTimePosition.dimension.time!.category.index = {
    "2026-01": 0,
    "2026-02": 0,
    "2026-03": 2,
  };
  await rejects(
    () => load("hicp", duplicateTimePosition),
    /time category index is invalid/,
  );

  const wrongDenseValueShape = fixture("hicp");
  wrongDenseValueShape.value = [1, 2];
  await rejects(
    () => load("hicp", wrongDenseValueShape),
    /value shape is invalid/,
  );

  const impossibleSparseValueIndex = fixture("hicp");
  impossibleSparseValueIndex.value = { "3": 1 };
  await rejects(
    () => load("hicp", impossibleSparseValueIndex),
    /value index is invalid/,
  );

  const malformedSparseValueIndex = fixture("hicp");
  malformedSparseValueIndex.value = { "01": 1 };
  await rejects(
    () => load("hicp", malformedSparseValueIndex),
    /value index is invalid/,
  );

  const wrongDenseStatusShape = fixture("hicp");
  wrongDenseStatusShape.status = ["p"];
  await rejects(
    () => load("hicp", wrongDenseStatusShape),
    /status shape is invalid/,
  );

  const impossibleSparseStatusIndex = fixture("hicp");
  impossibleSparseStatusIndex.status = { "99": "p" };
  await rejects(
    () => load("hicp", impossibleSparseStatusIndex),
    /status index is invalid/,
  );

  const malformedStatus = fixture("hicp");
  malformedStatus.status = ["p", 1, null];
  await rejects(
    () => load("hicp", malformedStatus),
    /status is invalid/,
  );

  const statusWithoutValue = fixture("hicp");
  statusWithoutValue.value = { "0": 1, "2": 3 };
  statusWithoutValue.status = { "1": "p" };
  await rejects(
    () => load("hicp", statusWithoutValue),
    /status has no value/,
  );

  const contradictoryUnavailableStatus = fixture("hicp");
  contradictoryUnavailableStatus.value = [1, 2, 3];
  contradictoryUnavailableStatus.status = [null, ":", null];
  await rejects(
    () => load("hicp", contradictoryUnavailableStatus),
    /contradicts unavailable status/,
  );

  const malformedCategoryIndex = fixture("hicp");
  malformedCategoryIndex.dimension.time!.category.index = {
    "2026-01": 0,
    "2026-02": 1,
    "2026-03": 3,
  };
  await rejects(
    () => load("hicp", malformedCategoryIndex),
    /time category index is invalid/,
  );

  const nonObjectPayloads: unknown[] = [null, [], "dataset"];
  for (const payload of nonObjectPayloads) {
    await rejects(
      () => load("hicp", payload),
      /dataset must be an object/,
    );
  }

  const noDimensionObject = fixture("hicp") as unknown as (
    Omit<MutableDataset, "dimension"> & { dimension: unknown }
  );
  noDimensionObject.dimension = null;
  await rejects(
    () => load("hicp", noDimensionObject),
    /dimension object is invalid/,
  );

  const officialUrl = hicpSpec.sourceUrl;
  const clientPayload = fixture("hicp");
  let clientCalls = 0;
  const client = new EurostatClientV1({
    fetchImpl: async (input, init) => {
      clientCalls += 1;
      assert.equal(String(input), officialUrl);
      assert.equal(init?.method, "GET");
      assert.equal(new Headers(init?.headers).get("accept"), "application/json");
      assert.equal(init?.redirect, "error");
      assert.equal(init?.signal instanceof AbortSignal, true);
      return new Response(JSON.stringify(clientPayload), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    },
  });
  const clientResult = await client.getDataset(officialUrl);
  assert.equal(clientCalls, 1);
  assert.equal(clientResult.sourceUrl, officialUrl);
  assert.deepEqual(clientResult.payload, clientPayload);
  assert.equal(Object.isFrozen(clientResult), true);

  let failedHttpCalls = 0;
  const failedHttpClient = new EurostatClientV1({
    fetchImpl: async () => {
      failedHttpCalls += 1;
      return new Response("unavailable", {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    },
  });
  await rejects(
    () => failedHttpClient.getDataset(officialUrl),
    /HTTP 503/,
  );
  assert.equal(failedHttpCalls, 1, "Eurostat client has no retry loop");

  const wrongContentTypeClient = new EurostatClientV1({
    fetchImpl: async () => new Response("{}", {
      status: 200,
      headers: { "content-type": "text/html" },
    }),
  });
  await rejects(
    () => wrongContentTypeClient.getDataset(officialUrl),
    /content type is invalid/,
  );

  const invalidJsonClient = new EurostatClientV1({
    fetchImpl: async () => new Response("{", {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  });
  await rejects(
    () => invalidJsonClient.getDataset(officialUrl),
    /Response JSON is invalid/,
  );

  assert.throws(
    () => new EurostatClientV1({ timeoutMs: 0 }),
    /positive integer/,
  );
  assert.throws(
    () => new EurostatClientV1({ timeoutMs: 1.5 }),
    /positive integer/,
  );
  await rejects(
    () => client.getDataset("https://example.test/data/not-eurostat"),
    /source URL is invalid/,
  );

  let browserGuardFetches = 0;
  const browserGuardClient = new EurostatClientV1({
    fetchImpl: async () => {
      browserGuardFetches += 1;
      return new Response("{}");
    },
  });
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {},
  });
  try {
    await rejects(
      () => browserGuardClient.getDataset(officialUrl),
      /server-only/,
    );
  } finally {
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      Object.defineProperty(globalThis, "window", originalWindow);
    }
  }
  assert.equal(browserGuardFetches, 0);

  const copiedFixture = fixture("hicp");
  const copiedBefore = clone(copiedFixture);
  await load("hicp", copiedFixture);
  assert.deepEqual(copiedFixture, copiedBefore, "provider input is not mutated");

  console.log("PASS: Eurostat Euro-area Macro Series V1");
}

void main();
