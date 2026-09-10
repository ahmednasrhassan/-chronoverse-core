import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { EcbClientV1 } from "../../providers/ecb/client";
import {
  ECB_ESTR_BOOTSTRAP_DATA_URL_V1,
  ECB_ESTR_CALCULATION_METHOD_SERIES_ID_V1,
  ECB_ESTR_FULL_CSV_HEADERS_V1,
  ECB_ESTR_PRODUCTION_DATA_URL_V1,
  ECB_ESTR_PUBLICATION_TYPE_SERIES_ID_V1,
  ECB_ESTR_SERIES_ID_V1,
} from "../../providers/ecb/estrContract";
import { parseEcbEstrCsvV1 } from "../../providers/ecb/estrCsv";
import {
  mergeEcbEstrOverlapV1,
  normalizeEcbEstrSeriesV1,
} from "../../providers/ecb/estrSeries";
import {
  ECB_ESTR_CACHE_SECONDS_V1,
} from "../../providers/ecb/estrSeriesCache";
import type { EcbEstrSeriesV1 } from "../../providers/ecb/estrTypes";

type CsvOverrides = Partial<Record<
  typeof ECB_ESTR_FULL_CSV_HEADERS_V1[number],
  string
>>;

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, label: string): void {
  assertEqual(JSON.stringify(actual), JSON.stringify(expected), label);
}

function assertThrows(operation: () => unknown, label: string): void {
  let threw = false;

  try {
    operation();
  } catch {
    threw = true;
  }

  assertEqual(threw, true, label);
}

async function assertRejects(
  operation: () => Promise<unknown>,
  label: string,
): Promise<void> {
  let rejected = false;

  try {
    await operation();
  } catch {
    rejected = true;
  }

  assertEqual(rejected, true, label);
}

function row(dataType: "WT" | "RP" | "CM", overrides: CsvOverrides = {}): string {
  const defaults: CsvOverrides = {
    KEY: {
      WT: ECB_ESTR_SERIES_ID_V1,
      RP: ECB_ESTR_PUBLICATION_TYPE_SERIES_ID_V1,
      CM: ECB_ESTR_CALCULATION_METHOD_SERIES_ID_V1,
    }[dataType],
    FREQ: "B",
    BENCHMARK_ITEM: "EU000A2X2A25",
    DATA_TYPE_EST: dataType,
    TIME_PERIOD: "2026-09-09",
    OBS_VALUE: dataType === "WT" ? "2.189" : "0",
    OBS_STATUS: "A",
    CONF_STATUS: "F",
    TIME_FORMAT: "P1D",
    DECIMALS: dataType === "WT" ? "3" : "0",
    TIME_PER_COLLECT: dataType === "WT" ? "A" : "V",
    UNIT_MEASURE: dataType === "WT" ? "PC" : "_Z",
    UNIT_MULT: "0",
  };
  const values = { ...defaults, ...overrides };

  return ECB_ESTR_FULL_CSV_HEADERS_V1.map((header) =>
    escapeCsv(values[header] ?? "")).join(",");
}

function escapeCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll("\"", "\"\"")}"` : value;
}

function csv(
  rows: readonly string[],
  headers: readonly string[] = ECB_ESTR_FULL_CSV_HEADERS_V1,
): string {
  return [headers.join(","), ...rows].join("\n");
}

function triplet(
  period: string,
  value: string,
  publication = "0",
  calculation = "0",
): readonly string[] {
  return [
    row("WT", { TIME_PERIOD: period, OBS_VALUE: value }),
    row("RP", { TIME_PERIOD: period, OBS_VALUE: publication }),
    row("CM", { TIME_PERIOD: period, OBS_VALUE: calculation }),
  ];
}

function normalize(rows: readonly string[], fetchedAt = "2026-09-10T12:34:56Z") {
  return normalizeEcbEstrSeriesV1({
    provider: "ecb",
    observations: parseEcbEstrCsvV1(csv(rows)),
  }, () => new Date(fetchedAt));
}

function valueOn(series: EcbEstrSeriesV1, period: string): number | undefined {
  const timestamp = Date.parse(`${period}T00:00:00.000Z`) / 1000;
  return series.canonicalSeries.observations.find(
    (observation) => observation.timestamp === timestamp,
  )?.value;
}

async function main(): Promise<void> {
  const domainRows = [
    ...triplet("2026-09-07", "-0.125"),
    ...triplet("2026-09-08", "0"),
    ...triplet("2026-09-09", "2.189", "1", "1"),
  ];
  const normalized = normalize(domainRows);
  const canonical = normalized.canonicalSeries;

  assertDeepEqual(canonical.observations.map((item) => item.value),
    [-0.125, 0, 2.189], "negative, zero, and positive WT accepted");
  assertEqual(canonical.metadata.provider, "ecb", "canonical provider");
  assertEqual(canonical.metadata.source, "European Central Bank", "canonical source");
  assertEqual(canonical.metadata.seriesId, ECB_ESTR_SERIES_ID_V1, "canonical series ID");
  assertEqual(canonical.metadata.requestedProductId, "estr", "requested product");
  assertEqual(canonical.metadata.canonicalProductId, "estr", "canonical product");
  assertEqual(canonical.metadata.interval, "1d", "canonical interval");
  assertEqual(canonical.metadata.status, "end_of_day", "canonical status");
  assertEqual(canonical.metadata.unit, "percent", "canonical unit");
  assertEqual(canonical.metadata.seriesKind, "reference-rate", "canonical series kind");
  assertEqual(canonical.metadata.fetchedAt, Date.parse("2026-09-10T12:34:56Z") / 1000,
    "successful fetch time retained");
  assertEqual(canonical.metadata.sourceTimestamp,
    Date.parse("2026-09-09T00:00:00.000Z") / 1000,
    "source timestamp is latest UTC-midnight reference date");
  assertEqual("publicationTimestamp" in canonical.metadata, false,
    "no publication timestamp fabricated");

  assertDeepEqual(normalized.observationMetadata.map((item) => [
    item.referenceDate,
    item.observationStatus,
    item.publicationType,
    item.calculationMethod,
  ]), [
    ["2026-09-07", { headline: "A", publicationType: "A", calculationMethod: "A" },
      "standard", "normal"],
    ["2026-09-08", { headline: "A", publicationType: "A", calculationMethod: "A" },
      "standard", "normal"],
    ["2026-09-09", { headline: "A", publicationType: "A", calculationMethod: "A" },
      "republication", "contingency"],
  ], "RP, CM, and provider observation statuses align by reference date");

  assertThrows(() => normalize([
    row("WT", { BENCHMARK_ITEM: "WRONG" }),
    row("RP", { BENCHMARK_ITEM: "WRONG" }),
    row("CM", { BENCHMARK_ITEM: "WRONG" }),
  ]), "wrong benchmark item rejected");
  assertThrows(() => normalize([
    row("WT", { KEY: "EST.B.WRONG.WT" }),
    row("RP"),
    row("CM"),
  ]), "unexpected series key rejected");
  assertThrows(() => parseEcbEstrCsvV1(csv([
    row("WT", { DATA_TYPE_EST: "XX" }),
  ])), "wrong data type rejected");
  assertThrows(() => normalize([
    row("WT", { UNIT_MEASURE: "PCPA" }),
    row("RP"),
    row("CM"),
  ]), "wrong WT unit rejected");
  assertThrows(() => normalize([
    row("WT", { UNIT_MULT: "1" }),
    row("RP"),
    row("CM"),
  ]), "wrong WT multiplier rejected");
  assertThrows(() => normalize([
    row("WT", { OBS_VALUE: "not-a-number" }),
    row("RP"),
    row("CM"),
  ]), "malformed numeric rejected");
  assertThrows(() => normalize([
    row("WT", { TIME_PERIOD: "2026-02-30" }),
    row("RP", { TIME_PERIOD: "2026-02-30" }),
    row("CM", { TIME_PERIOD: "2026-02-30" }),
  ]), "malformed date rejected");
  assertThrows(() => normalize([
    row("WT", { OBS_VALUE: "" }),
    row("RP"),
    row("CM"),
  ]), "missing headline value rejected rather than fabricated");
  assertThrows(() => normalize([
    row("RP"),
    row("CM"),
  ]), "missing headline series rejected");
  assertThrows(() => normalize([
    row("WT", { CONF_STATUS: "C" }),
    row("RP"),
    row("CM"),
  ]), "non-free confidentiality status rejected");
  assertThrows(() => parseEcbEstrCsvV1(""), "empty response rejected");
  assertThrows(() => parseEcbEstrCsvV1("KEY\n\"unterminated"),
    "malformed CSV rejected");
  assertThrows(() => parseEcbEstrCsvV1(csv(triplet("2026-09-09", "2.189"),
    ECB_ESTR_FULL_CSV_HEADERS_V1.slice(0, -1))), "unexpected schema rejected");

  for (const publication of ["0", "1"] as const) {
    const item = normalize(triplet("2026-09-09", "2.189", publication))
      .observationMetadata[0]!;
    assertEqual(item.publicationType,
      publication === "0" ? "standard" : "republication",
    `RP=${publication} accepted`);
  }
  assertThrows(() => normalize(triplet("2026-09-09", "2.189", "2")),
    "invalid RP rejected");

  for (const calculation of ["0", "1"] as const) {
    const item = normalize(triplet("2026-09-09", "2.189", "0", calculation))
      .observationMetadata[0]!;
    assertEqual(item.calculationMethod,
      calculation === "0" ? "normal" : "contingency",
    `CM=${calculation} accepted`);
  }
  assertThrows(() => normalize(triplet("2026-09-09", "2.189", "0", "-1")),
    "invalid CM rejected");

  assertThrows(() => normalize([
    row("WT", { TIME_PERIOD: "2026-09-09" }),
    row("RP", { TIME_PERIOD: "2026-09-08" }),
    row("CM", { TIME_PERIOD: "2026-09-09" }),
  ]), "mismatched companion date rejected");
  assertThrows(() => normalize([
    ...triplet("2026-09-09", "2.189"),
    row("WT", { OBS_VALUE: "2.190" }),
  ]), "conflicting duplicate rejected");
  const duplicate = normalize([
    ...triplet("2026-09-09", "2.189"),
    row("WT", { OBS_VALUE: "2.189" }),
    row("RP", { OBS_VALUE: "0" }),
    row("CM", { OBS_VALUE: "0" }),
  ]);
  assertEqual(duplicate.canonicalSeries.observations.length, 1,
    "identical duplicates deduplicate deterministically");

  const persisted = normalize([
    ...triplet("2026-09-08", "2.180"),
    ...triplet("2026-09-09", "2.189"),
  ], "2026-09-10T08:05:00Z");
  const overlap = normalize([
    ...triplet("2026-09-09", "2.191", "1"),
    ...triplet("2026-09-10", "2.192"),
  ], "2026-09-11T08:10:00Z");
  const merged = mergeEcbEstrOverlapV1(persisted, overlap);
  assertDeepEqual(merged.canonicalSeries.observations.map((item) => item.value),
    [2.180, 2.191, 2.192], "republication atomically replaces persisted date");
  assertEqual(valueOn(merged, "2026-09-09"), 2.191,
    "only one current value retained for replaced date");
  const standardReplacement = mergeEcbEstrOverlapV1(persisted, normalize([
    ...triplet("2026-09-09", "2.191", "0"),
    ...triplet("2026-09-10", "2.192"),
  ]));
  assertEqual(valueOn(standardReplacement, "2026-09-09"), 2.191,
    "latest official overlap replaces changed value regardless of RP flag");
  assertEqual(standardReplacement.observationMetadata.find(
    (item) => item.referenceDate === "2026-09-09",
  )?.publicationType, "standard", "replacement sidecar remains date-aligned");

  assertEqual(ECB_ESTR_PRODUCTION_DATA_URL_V1,
    "https://data-api.ecb.europa.eu/service/data/EST/B.EU000A2X2A25.WT+RP+CM?format=csvdata&detail=full&lastNObservations=2",
  "production URL exact");
  assertEqual(ECB_ESTR_BOOTSTRAP_DATA_URL_V1,
    "https://data-api.ecb.europa.eu/service/data/EST/B.EU000A2X2A25.WT+RP+CM?format=csvdata&detail=full",
  "bootstrap URL exact");

  const validCsv = csv(triplet("2026-09-09", "2.189"));
  const requestedUrls: string[] = [];
  const client = new EcbClientV1({
    fetchImpl: async (input, init) => {
      requestedUrls.push(String(input));
      assertEqual(new Headers(init?.headers).get("accept"), "text/csv",
        "explicit CSV negotiation");
      return new Response(validCsv, {
        status: 200,
        headers: { "content-type": "text/csv; charset=utf-8" },
      });
    },
  });
  await client.getEstrReferenceRate();
  await client.getEstrReferenceRateHistory();
  assertDeepEqual(requestedUrls,
    [ECB_ESTR_PRODUCTION_DATA_URL_V1, ECB_ESTR_BOOTSTRAP_DATA_URL_V1],
  "production and bootstrap paths remain explicit");

  const wrongContentType = new EcbClientV1({
    fetchImpl: async () => new Response(validCsv, {
      status: 200,
      headers: { "content-type": "application/xml" },
    }),
  });
  await assertRejects(() => wrongContentType.getEstrReferenceRate(),
    "wrong Content-Type rejected");

  let failureCount = 0;
  const failingClient = new EcbClientV1({
    fetchImpl: async () => {
      failureCount += 1;
      return new Response("unavailable", { status: 503 });
    },
  });
  await assertRejects(() => failingClient.getEstrReferenceRate(),
    "ECB error fails closed");
  assertEqual(failureCount, 1, "provider failure performs no fallback call");

  const providerDirectory = fileURLToPath(
    new URL("../../providers/ecb/", import.meta.url),
  );
  const cacheSource = readFileSync(`${providerDirectory}estrSeriesCache.ts`, "utf8");
  const source = [
    "client.ts",
    "estrContract.ts",
    "estrCsv.ts",
    "estrSeries.ts",
    "estrSeriesCache.ts",
  ].map((file) => readFileSync(`${providerDirectory}${file}`, "utf8")).join("\n")
    .toLowerCase();
  assertEqual(cacheSource.match(/= unstable_cache\(/g)?.length, 1,
    "exactly one dedicated €STR cache entry");
  assertEqual(ECB_ESTR_CACHE_SECONDS_V1, 86_400, "daily source cache cadence");
  assertEqual(source.includes("no-store"), false, "no no-store path");
  assertEqual(source.includes("yahoo"), false, "no Yahoo fallback");
  assertEqual(source.includes("fred"), false, "no FRED fallback");
  assertEqual(source.includes("pre-estr") || source.includes("pre-€str"), false,
    "no pre-€STR merge path");

  console.log("PASS: Official ECB €STR Source Backbone V1");
}

void main();
