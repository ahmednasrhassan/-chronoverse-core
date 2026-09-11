import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  handleEstrIntelligenceGetV1,
  type EstrIntelligenceApiResponseV1,
} from "../../assets/estr/apiResponse";
import {
  getEstrProductionRuntimeV1,
  type EstrProductionRuntimeResultV1,
} from "../../assets/estr/runtime";
import {
  ECB_ESTR_CALCULATION_METHOD_SERIES_ID_V1,
  ECB_ESTR_PUBLICATION_TYPE_SERIES_ID_V1,
  ECB_ESTR_SERIES_ID_V1,
} from "../../providers/ecb/estrContract";
import { normalizeEcbEstrSeriesV1 } from "../../providers/ecb/estrSeries";
import type {
  EcbEstrDataTypeV1,
  EcbEstrRawObservationV1,
} from "../../providers/ecb/estrTypes";

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

function row(
  dataType: EcbEstrDataTypeV1,
  period: string,
  value: string,
): EcbEstrRawObservationV1 {
  return Object.freeze({
    seriesId: {
      WT: ECB_ESTR_SERIES_ID_V1,
      RP: ECB_ESTR_PUBLICATION_TYPE_SERIES_ID_V1,
      CM: ECB_ESTR_CALCULATION_METHOD_SERIES_ID_V1,
    }[dataType],
    frequency: "B",
    benchmarkItem: "EU000A2X2A25",
    dataType,
    period,
    value,
    observationStatus: "A",
    confidentialityStatus: "F",
    unitMeasure: dataType === "WT" ? "PC" : "_Z",
    unitMultiplier: "0",
  });
}

async function availableRuntime(): Promise<EstrProductionRuntimeResultV1> {
  const observations = Array.from({ length: 220 }, (_, index) => {
    const period = new Date(Date.UTC(2025, 0, 1 + index))
      .toISOString().slice(0, 10);
    const rate = 1.75 + index * 0.0004 + Math.sin(index / 8) * 0.008;

    return [
      row("WT", period, String(rate)),
      row("RP", period, "0"),
      row("CM", period, "0"),
    ];
  }).flat();
  const source = normalizeEcbEstrSeriesV1({
    provider: "ecb",
    observations,
  }, () => new Date("2025-08-09T08:00:00.000Z"));

  return getEstrProductionRuntimeV1({ loadSource: async () => source });
}

async function readBody(response: Response): Promise<EstrIntelligenceApiResponseV1> {
  return response.json() as Promise<EstrIntelligenceApiResponseV1>;
}

async function main(): Promise<void> {
  const runtime = await availableRuntime();
  if (runtime.availability !== "available") {
    throw new Error(`Expected available runtime fixture: ${runtime.reason}`);
  }

  let runtimeCalls = 0;
  const response = await handleEstrIntelligenceGetV1(async () => {
    runtimeCalls += 1;
    return runtime;
  });
  const body = await readBody(response);

  assertEqual(runtimeCalls, 1, "runtime invoked once per GET execution");
  assertEqual(response.status, 200, "available response status");
  assertEqual(body.availability, "available", "available response semantics");
  if (body.availability !== "available") {
    throw new Error("Expected available API response.");
  }

  assertEqual(body.productId, "estr", "canonical product ID propagated");
  assertEqual(body.product, "€STR", "canonical product label propagated");
  assertEqual(body.currentRatePercent, runtime.data.currentRatePercent,
    "current rate propagated");
  assertDeepEqual(body.signal, {
    score: runtime.data.signal.data.score,
    direction: runtime.data.signal.data.direction,
    strength: runtime.data.signal.data.strength,
    coverage: runtime.data.signal.data.coverage,
  }, "narrow Signal semantics propagated");
  assertDeepEqual(body.risk, {
    score: runtime.data.risk.data.score,
    level: runtime.data.risk.data.level,
    coverage: runtime.data.risk.data.coverage,
  }, "narrow Risk semantics propagated");
  assertDeepEqual(body.marketState, runtime.data.marketState.data,
    "Market State propagated");
  assertDeepEqual(body.engineAdapter,
    runtime.data.engineAdapter.data.engineEvidence,
  "safe Engine adapter evidence propagated");
  assertEqual(body.latestReferenceDate, runtime.data.latestReferenceDate,
    "latest reference date propagated");
  assertEqual(body.fetchedAt, runtime.data.fetchedAt,
    "source fetch time propagated");
  assertEqual(body.sourceTimestamp, runtime.data.sourceTimestamp,
    "source timestamp propagated");
  assertEqual(body.source.provider, "ecb", "provider identity propagated");
  assertEqual(body.source.source, "European Central Bank",
    "source identity propagated");
  assertEqual(body.source.seriesId, "EST.B.EU000A2X2A25.WT",
    "series identity propagated");
  assertDeepEqual(Object.keys(body).sort(), [
    "availability",
    "currentRatePercent",
    "engineAdapter",
    "fetchedAt",
    "latestReferenceDate",
    "marketState",
    "product",
    "productId",
    "risk",
    "signal",
    "source",
    "sourceTimestamp",
  ], "stable available response shape");
  assertEqual("features" in body, false,
    "internal feature snapshot is not exposed");
  assertEqual("observations" in body, false,
    "raw full history is not exposed");

  const unavailableRuntime = Object.freeze({
    availability: "unavailable",
    reason: "Official ECB €STR source is unavailable.",
    missing: Object.freeze(["source"] as const),
  }) satisfies EstrProductionRuntimeResultV1;
  let unavailableCalls = 0;
  const unavailableResponse = await handleEstrIntelligenceGetV1(async () => {
    unavailableCalls += 1;
    return unavailableRuntime;
  });
  const unavailableBody = await readBody(unavailableResponse);
  assertEqual(unavailableCalls, 1, "unavailable runtime invoked once");
  assertEqual(unavailableResponse.status, 503,
    "domain unavailable response status");
  assertDeepEqual(unavailableBody, {
    availability: "unavailable",
    productId: "estr",
    product: "€STR",
    reason: unavailableRuntime.reason,
    missing: unavailableRuntime.missing,
  }, "runtime unavailable state preserved without neutral fabrication");

  const secret = "sk-test-secret-that-must-not-leak";
  const originalConsoleError = console.error;
  let logged = "";
  console.error = (...values: unknown[]) => {
    logged += values.map(String).join(" ");
  };
  let errorResponse: Response;
  try {
    errorResponse = await handleEstrIntelligenceGetV1(async () => {
      throw new Error(secret);
    });
  } finally {
    console.error = originalConsoleError;
  }
  const errorText = await errorResponse.text();
  const errorBody = JSON.parse(errorText) as EstrIntelligenceApiResponseV1;
  assertEqual(errorResponse.status, 500, "unexpected error status");
  assertDeepEqual(errorBody, {
    availability: "unavailable",
    productId: "estr",
    product: "€STR",
    reason: "€STR production intelligence is temporarily unavailable.",
    missing: ["runtime"],
  }, "unexpected exception returns controlled response");
  assertEqual(errorText.includes(secret), false,
    "unexpected response excludes secret");
  assertEqual(logged.includes(secret), false,
    "controlled server log excludes secret");

  const firstText = await (await handleEstrIntelligenceGetV1(
    async () => runtime,
  )).text();
  const secondText = await (await handleEstrIntelligenceGetV1(
    async () => runtime,
  )).text();
  assertEqual(secondText, firstText, "deterministic JSON serialization");

  const publicPayloads = `${firstText}\n${JSON.stringify(unavailableBody)}\n${errorText}`
    .toLowerCase();
  assertEqual(publicPayloads.includes('"observations"'), false,
    "serialized responses contain no raw full history");
  for (const forbidden of ["bullish", "bearish", "price", "target", "stop",
    "probability", "trade instruction", "sk-"]) {
    assertEqual(publicPayloads.includes(forbidden), false,
      `public responses exclude ${forbidden}`);
  }

  const routePath = fileURLToPath(new URL(
    "../../../../app/api/markets/estr/intelligence/route.ts",
    import.meta.url,
  ));
  const responsePath = fileURLToPath(new URL(
    "../../assets/estr/apiResponse.ts",
    import.meta.url,
  ));
  const routeSource = readFileSync(routePath, "utf8");
  const responseSource = readFileSync(responsePath, "utf8");
  const routeLower = routeSource.toLowerCase();

  assertEqual(
    routeSource.match(/getFiveProductVipDeepResponseV1\("estr"\)/g)?.length,
    1,
    "route invokes one protected VIP Deep adapter",
  );
  assertEqual(routeSource.includes("getCanonicalProductResultV1"), false,
    "route cannot read canonical data before authorization");
  assertEqual(routeLower.includes("provider"), false,
    "route has no provider dependency");
  assertEqual(routeLower.includes("ecb"), false,
    "route has no direct ECB dependency");
  assertEqual(routeLower.includes("fetch("), false,
    "route has no direct fetch");
  assertEqual(routeLower.includes("calculateratefeatures"), false,
    "route does not recompute features");
  assertEqual(routeLower.includes("calculateestrratesignal"), false,
    "route does not recompute Signal");
  assertEqual(routeLower.includes("calculateestrraterisk"), false,
    "route does not recompute Risk");
  assertEqual(routeLower.includes("unstable_cache"), false,
    "route adds no duplicate cache layer");
  assertEqual(routeSource.includes("export async function GET"), true,
    "GET route is exported");
  for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
    assertEqual(routeSource.includes(`function ${method}`), false,
      `${method} route is not implemented`);
  }
  assertEqual(/\bprice\b/i.test(responseSource), false,
    "response contract contains no price semantics");

  console.log("PASS: €STR Production Intelligence API V1");
}

void main();
