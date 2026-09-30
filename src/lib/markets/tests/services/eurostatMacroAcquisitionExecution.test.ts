import assert from "node:assert/strict";

import {
  EurostatMacroSeriesVintagePersistenceError,
  type AppendEurostatMacroSeriesVintageRedisResultV1,
} from "../../persistence/eurostatMacroSeriesVintageRedis";
import {
  EUROSTAT_MAX_RESPONSE_BYTES_V1,
  EurostatClientV1,
  EurostatTransportError,
} from "../../providers/eurostat/client";
import {
  EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1,
  type EurostatEuroAreaMacroFamilyV1,
} from "../../providers/eurostat/macroSeries";
import type { CanonicalStatisticalSeriesV1 } from
  "../../services/canonicalObservationSeries";
import { buildCanonicalStatisticalSeriesSnapshotV1 } from
  "../../services/canonicalStatisticalSeriesMemory";
import type { EurostatMacroAcquisitionDependenciesV1 } from
  "../../services/eurostatMacroAcquisition";
import {
  EUROSTAT_MACRO_FAILURE_RETRY_BACKOFF_SECONDS_V1,
  EUROSTAT_MACRO_MIN_ACQUISITION_CADENCE_SECONDS_V1,
  createEurostatMacroAcquisitionExecutorV1,
  type EurostatMacroAcquisitionExecutionResultV1,
} from "../../services/eurostatMacroAcquisitionExecution";

const START = 1_790_500_000;

function fixture(family: EurostatEuroAreaMacroFamilyV1): unknown {
  const spec = EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1[family];
  const periods = family === "hicp"
    ? ["2026-01", "2026-02"]
    : ["2026-Q1", "2026-Q2"];
  return {
    version: "2.0",
    class: "dataset",
    source: "ESTAT",
    updated: "2026-09-27T11:00:00Z",
    id: spec.dimensionIds,
    size: spec.dimensionIds.map((id) => id === "time" ? 2 : 1),
    dimension: Object.fromEntries(spec.dimensionIds.map((id) => [
      id,
      { category: { index: id === "time"
        ? Object.fromEntries(periods.map((period, index) => [period, index]))
        : { [spec.selectors[id]!]: 0 } } },
    ])),
    value: [1.25, 0],
  };
}

function initialized(
  series: CanonicalStatisticalSeriesV1,
): AppendEurostatMacroSeriesVintageRedisResultV1 {
  return {
    status: "initialized",
    snapshot: buildCanonicalStatisticalSeriesSnapshotV1(series),
  };
}

function defaults(
  nowUnixSeconds: () => number,
): EurostatMacroAcquisitionDependenciesV1 {
  return {
    nowUnixSeconds,
    loadDataset: async (sourceUrl) => ({
      sourceUrl,
      payload: sourceUrl === EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1.hicp.sourceUrl
        ? fixture("hicp")
        : fixture("gdp"),
    }),
    appendVintage: async (_family, series) => initialized(series),
  };
}

function nextEligibleAt(result: EurostatMacroAcquisitionExecutionResultV1): number {
  assert.ok(result.status === "skipped-cooldown" ||
    result.status === "skipped-failure-backoff");
  return result.nextEligibleAt;
}

async function successfulCadenceAndIsolation(): Promise<void> {
  let now = START;
  let releaseHicp!: () => void;
  const hicpBlock = new Promise<void>((resolve) => { releaseHicp = resolve; });
  const fetches = { hicp: 0, gdp: 0 };
  const base = defaults(() => now);
  const executor = createEurostatMacroAcquisitionExecutorV1({
    ...base,
    loadDataset: async (sourceUrl) => {
      const family = sourceUrl ===
          EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1.hicp.sourceUrl
        ? "hicp" : "gdp";
      fetches[family] += 1;
      if (family === "hicp") await hicpBlock;
      return base.loadDataset(sourceUrl);
    },
  });

  const firstHicp = executor.execute("hicp");
  assert.equal((await executor.execute("hicp")).status, "skipped-in-flight");
  now = START + 100;
  assert.equal((await executor.execute("gdp")).status, "acquired");
  now = START + 400;
  releaseHicp();
  assert.equal((await firstHicp).status, "acquired");
  assert.deepEqual(fetches, { hicp: 1, gdp: 1 });

  now = START + 100 + EUROSTAT_MACRO_MIN_ACQUISITION_CADENCE_SECONDS_V1 - 1;
  assert.equal(nextEligibleAt(await executor.execute("hicp")),
    START + 400 + EUROSTAT_MACRO_MIN_ACQUISITION_CADENCE_SECONDS_V1);
  assert.equal(nextEligibleAt(await executor.execute("gdp")),
    START + 100 + EUROSTAT_MACRO_MIN_ACQUISITION_CADENCE_SECONDS_V1);
  assert.deepEqual(fetches, { hicp: 1, gdp: 1 });

  now += 1;
  assert.equal((await executor.execute("gdp")).status, "acquired");
  assert.equal((await executor.execute("hicp")).status, "skipped-cooldown");
  assert.deepEqual(fetches, { hicp: 1, gdp: 2 });
  now = START + 400 + EUROSTAT_MACRO_MIN_ACQUISITION_CADENCE_SECONDS_V1;
  assert.equal((await executor.execute("hicp")).status, "acquired");
  assert.deepEqual(fetches, { hicp: 2, gdp: 2 });
}

async function providerFailureBackoff(): Promise<void> {
  let now = START;
  let fetches = 0;
  const base = defaults(() => now);
  const providerError = new EurostatTransportError(
    "network", "provider unavailable",
  );
  const executor = createEurostatMacroAcquisitionExecutorV1({
    ...base,
    loadDataset: async (sourceUrl) => {
      fetches += 1;
      if (fetches === 1) {
        now = START + 400;
        throw providerError;
      }
      if (fetches === 2) {
        now += 450;
        throw providerError;
      }
      return base.loadDataset(sourceUrl);
    },
  });

  const first = await executor.execute("hicp");
  assert.equal(first.status, "provider-failure");
  assert.equal(first.status === "provider-failure" ? first.error : null,
    providerError);
  assert.equal(nextEligibleAt(await executor.execute("hicp")),
    START + 400 + EUROSTAT_MACRO_FAILURE_RETRY_BACKOFF_SECONDS_V1);
  now += EUROSTAT_MACRO_FAILURE_RETRY_BACKOFF_SECONDS_V1 - 1;
  assert.equal((await executor.execute("hicp")).status,
    "skipped-failure-backoff");
  assert.equal(fetches, 1);
  now += 1;
  assert.equal((await executor.execute("hicp")).status, "provider-failure");
  assert.equal(fetches, 2);
  assert.equal(nextEligibleAt(await executor.execute("hicp")),
    now + EUROSTAT_MACRO_FAILURE_RETRY_BACKOFF_SECONDS_V1);
  now += EUROSTAT_MACRO_FAILURE_RETRY_BACKOFF_SECONDS_V1;
  assert.equal((await executor.execute("hicp")).status, "acquired");
  assert.equal(fetches, 3);
  assert.equal(nextEligibleAt(await executor.execute("hicp")),
    now + EUROSTAT_MACRO_MIN_ACQUISITION_CADENCE_SECONDS_V1);
}

async function assertFailureBackoff(
  expected: EurostatMacroAcquisitionExecutionResultV1["status"],
  overrides: (base: EurostatMacroAcquisitionDependenciesV1) =>
    EurostatMacroAcquisitionDependenciesV1,
): Promise<void> {
  let now = START;
  const base = defaults(() => now);
  const executor = createEurostatMacroAcquisitionExecutorV1(overrides(base));
  assert.equal((await executor.execute("hicp")).status, expected);
  const skipped = await executor.execute("hicp");
  assert.equal(skipped.status, "skipped-failure-backoff");
  assert.equal(nextEligibleAt(skipped), START + 300);
  now += 300;
  assert.equal((await executor.execute("hicp")).status, expected,
    "retry is allowed after five minutes, not six hours");
}

async function expectedFailures(): Promise<void> {
  let appends = 0;
  const oversizedClient = new EurostatClientV1({
    fetchImpl: async () => new Response("{}", {
      headers: {
        "content-type": "application/json",
        "content-length": String(EUROSTAT_MAX_RESPONSE_BYTES_V1 + 1),
      },
    }),
  });
  await assertFailureBackoff("resource-limit-failure", (base) => ({
    ...base,
    loadDataset: (url) => oversizedClient.getDataset(url),
    appendVintage: async () => {
      appends += 1;
      throw new Error("oversized response reached persistence");
    },
  }));
  assert.equal(appends, 0);

  const actualOversizedClient = new EurostatClientV1({
    fetchImpl: async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(EUROSTAT_MAX_RESPONSE_BYTES_V1));
        controller.enqueue(Uint8Array.of(1));
        controller.close();
      },
    }), { headers: { "content-type": "application/json", "content-length": "1" } }),
  });
  const actualOversized = createEurostatMacroAcquisitionExecutorV1({
    ...defaults(() => START),
    loadDataset: (url) => actualOversizedClient.getDataset(url),
    appendVintage: async () => {
      appends += 1;
      throw new Error("oversized body reached persistence");
    },
  });
  assert.equal((await actualOversized.execute("hicp")).status,
    "resource-limit-failure");
  assert.equal(appends, 0);

  await assertFailureBackoff("validation-failure", (base) => ({
    ...base,
    loadDataset: async (sourceUrl) => ({ sourceUrl, payload: {} }),
    appendVintage: async () => {
      appends += 1;
      throw new Error("invalid source reached persistence");
    },
  }));
  assert.equal(appends, 0);

  const redisError = new EurostatMacroSeriesVintagePersistenceError(
    "redis-failure", "Redis unavailable",
  );
  await assertFailureBackoff("persistence-failure", (base) => ({
    ...base,
    appendVintage: async () => { throw redisError; },
  }));
  const invalidCurrent = new EurostatMacroSeriesVintagePersistenceError(
    "invalid-current", "Invalid candidate",
  );
  await assertFailureBackoff("validation-failure", (base) => ({
    ...base,
    appendVintage: async () => { throw invalidCurrent; },
  }));

  for (const status of ["stale", "conflict"] as const) {
    await assertFailureBackoff("persistence-rejected", (base) => ({
      ...base,
      appendVintage: async (_family, series) => {
        const snapshot = buildCanonicalStatisticalSeriesSnapshotV1(series);
        return { status, latest: snapshot, candidate: snapshot };
      },
    }));

    let completedAt = START;
    const delayed = createEurostatMacroAcquisitionExecutorV1({
      ...defaults(() => completedAt),
      appendVintage: async (_family, series) => {
        if (completedAt === START) completedAt = START + 420;
        const snapshot = buildCanonicalStatisticalSeriesSnapshotV1(series);
        return { status, latest: snapshot, candidate: snapshot };
      },
    });
    assert.equal((await delayed.execute("hicp")).status, "persistence-rejected");
    assert.equal(nextEligibleAt(await delayed.execute("hicp")),
      START + 420 + EUROSTAT_MACRO_FAILURE_RETRY_BACKOFF_SECONDS_V1);
    completedAt = START + 420 + EUROSTAT_MACRO_FAILURE_RETRY_BACKOFF_SECONDS_V1;
    assert.equal((await delayed.execute("hicp")).status, "persistence-rejected",
      "stale/conflict use five-minute rejection backoff, not success cadence");
  }

  const readError = new Error("body read failed");
  const readFailureClient = new EurostatClientV1({
    fetchImpl: async () => new Response(new ReadableStream<Uint8Array>({
      pull() { throw readError; },
    }), { headers: { "content-type": "application/json" } }),
  });
  const noPersistence = createEurostatMacroAcquisitionExecutorV1({
    ...defaults(() => START),
    loadDataset: (url) => readFailureClient.getDataset(url),
    appendVintage: async () => {
      appends += 1;
      throw new Error("transport failure reached persistence");
    },
  });
  assert.equal((await noPersistence.execute("hicp")).status, "provider-failure");
  assert.equal(appends, 0);

  const invalidFamily = createEurostatMacroAcquisitionExecutorV1(
    defaults(() => START),
  );
  assert.equal((await invalidFamily.execute(
    "unemployment" as EurostatEuroAreaMacroFamilyV1
  )).status, "validation-failure");
}

async function clockAndUnexpectedFailures(): Promise<void> {
  let providerCalls = 0;
  const thrownClock = new Error("clock unavailable");
  const thrown = createEurostatMacroAcquisitionExecutorV1({
    ...defaults(() => START),
    nowUnixSeconds: () => { throw thrownClock; },
    loadDataset: async () => {
      providerCalls += 1;
      throw new Error("provider must not be called");
    },
  });
  const thrownResult = await thrown.execute("hicp");
  assert.equal(thrownResult.status, "clock-failure");
  assert.equal(thrownResult.status === "clock-failure"
    ? thrownResult.error : null, thrownClock);
  assert.equal(providerCalls, 0);

  const invalid = createEurostatMacroAcquisitionExecutorV1({
    ...defaults(() => -1),
    loadDataset: async () => {
      providerCalls += 1;
      throw new Error("provider must not be called");
    },
  });
  assert.equal((await invalid.execute("hicp")).status, "clock-failure");
  assert.equal(providerCalls, 0);

  let clockCalls = 0;
  const invalidAfterFetch = createEurostatMacroAcquisitionExecutorV1({
    ...defaults(() => START),
    nowUnixSeconds: () => ++clockCalls === 2 ? Number.NaN : START,
  });
  assert.equal((await invalidAfterFetch.execute("hicp")).status, "clock-failure");
  assert.equal((await invalidAfterFetch.execute("hicp")).status,
    "acquired", "invalid core clock does not write an untrusted backoff");

  let now = START;
  let completionCalls = 0;
  const invalidCompletion = createEurostatMacroAcquisitionExecutorV1({
    ...defaults(() => now),
    nowUnixSeconds: () => ++completionCalls === 6 ? Number.NaN : now,
  });
  assert.equal((await invalidCompletion.execute("hicp")).status, "acquired");
  now += EUROSTAT_MACRO_MIN_ACQUISITION_CADENCE_SECONDS_V1;
  assert.equal((await invalidCompletion.execute("hicp")).status, "clock-failure");
  assert.equal((await invalidCompletion.execute("hicp")).status, "acquired",
    "invalid completion clock does not overwrite prior success time");

  let failureClockCalls = 0;
  let failureFetches = 0;
  const expectedNetworkError = new EurostatTransportError("network", "offline");
  const thrownCompletion = createEurostatMacroAcquisitionExecutorV1({
    ...defaults(() => now),
    nowUnixSeconds: () => {
      failureClockCalls += 1;
      if (failureClockCalls === 4) throw thrownClock;
      return now;
    },
    loadDataset: async () => {
      failureFetches += 1;
      throw expectedNetworkError;
    },
  });
  assert.equal((await thrownCompletion.execute("gdp")).status, "provider-failure");
  now += EUROSTAT_MACRO_FAILURE_RETRY_BACKOFF_SECONDS_V1;
  assert.equal((await thrownCompletion.execute("gdp")).status, "clock-failure");
  assert.equal((await thrownCompletion.execute("gdp")).status, "provider-failure",
    "failed completion clock does not overwrite the prior backoff deadline");
  assert.equal(failureFetches, 3);

  for (const programmingError of [
    new Error("unexpected parser fault"),
    new TypeError("unexpected parser type fault"),
  ]) {
    const payload = Object.defineProperty({}, "version", {
      get() { throw programmingError; },
    });
    const unexpected = createEurostatMacroAcquisitionExecutorV1({
      ...defaults(() => START),
      loadDataset: async (sourceUrl) => ({ sourceUrl, payload }),
    });
    const result = await unexpected.execute("hicp");
    assert.equal(result.status, "unexpected-failure");
    assert.equal(result.status === "unexpected-failure" ? result.error : null,
      programmingError);
    assert.equal((await unexpected.execute("hicp")).status,
      "skipped-failure-backoff");
  }
}

async function unexpectedStageFailures(): Promise<void> {
  for (const programmingError of [
    new ReferenceError("provider programming fault"),
    new TypeError("unrelated provider type fault"),
  ]) {
    const unexpectedProvider = createEurostatMacroAcquisitionExecutorV1({
      ...defaults(() => START),
      loadDataset: async () => { throw programmingError; },
    });
    const result = await unexpectedProvider.execute("hicp");
    assert.equal(result.status, "unexpected-failure");
    assert.equal(result.status === "unexpected-failure" ? result.error : null,
      programmingError);
    assert.equal(nextEligibleAt(await unexpectedProvider.execute("hicp")),
      START + EUROSTAT_MACRO_FAILURE_RETRY_BACKOFF_SECONDS_V1);
  }

  for (const programmingError of [
    new ReferenceError("persistence programming fault"),
    new TypeError("unrelated persistence type fault"),
  ]) {
    const unexpectedPersistence = createEurostatMacroAcquisitionExecutorV1({
      ...defaults(() => START),
      appendVintage: async () => { throw programmingError; },
    });
    const result = await unexpectedPersistence.execute("gdp");
    assert.equal(result.status, "unexpected-failure");
    assert.equal(result.status === "unexpected-failure" ? result.error : null,
      programmingError);
    assert.equal(nextEligibleAt(await unexpectedPersistence.execute("gdp")),
      START + EUROSTAT_MACRO_FAILURE_RETRY_BACKOFF_SECONDS_V1);
  }
}

async function main(): Promise<void> {
  await successfulCadenceAndIsolation();
  await providerFailureBackoff();
  await expectedFailures();
  await clockAndUnexpectedFailures();
  await unexpectedStageFailures();
  console.log("PASS: Inactive Eurostat macro acquisition execution V1");
}

void main();
