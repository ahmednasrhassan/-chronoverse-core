import assert from "node:assert/strict";

import type { AppendEurostatMacroSeriesVintageRedisResultV1 } from
  "../../persistence/eurostatMacroSeriesVintageRedis";
import type { EurostatDatasetLoadResultV1 } from
  "../../providers/eurostat/client";
import {
  EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1,
  type EurostatEuroAreaMacroFamilyV1,
} from "../../providers/eurostat/macroSeries";
import type { CanonicalStatisticalSeriesV1 } from
  "../../services/canonicalObservationSeries";
import { buildCanonicalStatisticalSeriesSnapshotV1 } from
  "../../services/canonicalStatisticalSeriesMemory";
import {
  acquireEurostatMacroSeriesV1,
  type EurostatMacroAcquisitionDependenciesV1,
} from "../../services/eurostatMacroAcquisition";

const FETCHED_AT = 1_790_500_000;
const UPDATED = "2020-01-01T00:00:00Z";

function fixture(family: EurostatEuroAreaMacroFamilyV1): unknown {
  const spec = EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1[family];
  const periods = family === "hicp"
    ? ["2026-01", "2026-02"]
    : ["2026-Q1", "2026-Q2"];
  return {
    version: "2.0",
    class: "dataset",
    source: "ESTAT",
    updated: UPDATED,
    id: spec.dimensionIds,
    size: spec.dimensionIds.map((id) => id === "time" ? 2 : 1),
    dimension: Object.fromEntries(spec.dimensionIds.map((id) => [
      id,
      {
        category: {
          index: id === "time"
            ? Object.fromEntries(periods.map((period, index) => [period, index]))
            : { [spec.selectors[id]!]: 0 },
        },
      },
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

async function successAndOrdering(
  family: EurostatEuroAreaMacroFamilyV1,
): Promise<void> {
  const events: string[] = [];
  const spec = EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1[family];
  let completeBody!: (result: EurostatDatasetLoadResultV1) => void;
  const body = new Promise<EurostatDatasetLoadResultV1>((resolve) => {
    completeBody = resolve;
  });
  let fetches = 0;
  const appended: CanonicalStatisticalSeriesV1[] = [];
  const appendOutcomes: AppendEurostatMacroSeriesVintageRedisResultV1[] = [];
  const dependencies: EurostatMacroAcquisitionDependenciesV1 = {
    loadDataset: async (sourceUrl) => {
      events.push("fetch");
      fetches += 1;
      assert.equal(sourceUrl, spec.sourceUrl, "locked URL is used exactly");
      const parsed = await body;
      events.push("body-parsed");
      return parsed;
    },
    nowUnixSeconds: () => {
      events.push("clock");
      return FETCHED_AT;
    },
    appendVintage: async (appendedFamily, series) => {
      events.push("append");
      assert.equal(appendedFamily, family);
      appended.push(series);
      const outcome = initialized(series);
      appendOutcomes.push(outcome);
      return outcome;
    },
  };

  const pending = acquireEurostatMacroSeriesV1(family, dependencies);
  assert.equal(events.join(","), "fetch", "clock waits for the complete body");
  completeBody({ sourceUrl: spec.sourceUrl, payload: fixture(family) });
  const result = await pending;
  assert.equal(events.join(","), "fetch,body-parsed,clock,append");
  assert.equal(fetches, 1, "normalization reuses the fetched response");
  assert.equal(result, appendOutcomes[0], "the append outcome is returned intact");
  assert.equal(result.status, "initialized");
  assert.equal(appended.length, 1);
  const captured = appended[0]!;
  assert.equal(captured.metadata.fetchedAt, FETCHED_AT);
  assert.equal(captured.metadata.sourceUrl, spec.sourceUrl);
  assert.equal(captured.metadata.canonicalSeriesId, spec.canonicalSeriesId);
  assert.deepEqual(captured.observations.map((observation) => observation.value),
    [1.25, 0]);
  assert.equal(result.status === "initialized" ? result.snapshot.knownAt : -1,
    FETCHED_AT);
}

async function failureBoundaries(): Promise<void> {
  const hicp = EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1.hicp;
  const events: string[] = [];
  const dependencies: EurostatMacroAcquisitionDependenciesV1 = {
    loadDataset: async () => {
      events.push("fetch");
      return { sourceUrl: hicp.sourceUrl, payload: fixture("hicp") };
    },
    nowUnixSeconds: () => {
      events.push("clock");
      return FETCHED_AT;
    },
    appendVintage: async (_family, series) => {
      events.push("append");
      return initialized(series);
    },
  };

  await assert.rejects(
    acquireEurostatMacroSeriesV1(
      "unemployment" as EurostatEuroAreaMacroFamilyV1,
      dependencies,
    ),
    /macro family is invalid/,
  );
  assert.equal(events.join(","), "", "unsupported family is rejected pre-fetch");

  const fetchFailure = new Error("fetch failed");
  await assert.rejects(
    acquireEurostatMacroSeriesV1("hicp", {
      ...dependencies,
      loadDataset: async () => {
        events.push("fetch-failed");
        throw fetchFailure;
      },
    }),
    (error) => error === fetchFailure,
  );
  assert.equal(events.join(","), "fetch-failed",
    "fetch failure skips clock and append");
  events.length = 0;

  await assert.rejects(
    acquireEurostatMacroSeriesV1("hicp", {
      ...dependencies,
      loadDataset: async () => {
        events.push("fetch");
        return { sourceUrl: hicp.sourceUrl, payload: {} };
      },
    }),
    /JSON-stat version is invalid/,
  );
  assert.equal(events.join(","), "fetch,clock",
    "normalization failure skips append");
  events.length = 0;

  await assert.rejects(
    acquireEurostatMacroSeriesV1("hicp", {
      ...dependencies,
      loadDataset: async () => {
        events.push("fetch");
        return {
          sourceUrl: EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1.gdp.sourceUrl,
          payload: fixture("hicp"),
        };
      },
    }),
    /source URL identity is invalid/,
  );
  assert.equal(events.join(","), "fetch,clock",
    "source identity failure skips append");
  events.length = 0;

  for (const invalidClock of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(
      acquireEurostatMacroSeriesV1("hicp", {
        ...dependencies,
        nowUnixSeconds: () => {
          events.push("clock");
          return invalidClock;
        },
      }),
      /acquisition clock is invalid/,
    );
    assert.equal(events.join(","), "fetch,clock",
      "invalid clock skips append");
    events.length = 0;
  }

  const clockFailure = new Error("trusted clock failed");
  await assert.rejects(
    acquireEurostatMacroSeriesV1("hicp", {
      ...dependencies,
      nowUnixSeconds: async () => {
        events.push("clock");
        throw clockFailure;
      },
    }),
    (error) => error === clockFailure,
  );
  assert.equal(events.join(","), "fetch,clock",
    "clock failure skips append");
  events.length = 0;

  const storageFailure = new Error("storage failed");
  await assert.rejects(
    acquireEurostatMacroSeriesV1("hicp", {
      ...dependencies,
      appendVintage: async () => {
        events.push("append");
        throw storageFailure;
      },
    }),
    (error) => error === storageFailure,
  );
  assert.equal(events.join(","), "fetch,clock,append",
    "storage failure propagates");
}

async function appendOutcomes(): Promise<void> {
  for (const status of ["initialized", "advanced", "unchanged", "stale", "conflict"] as const) {
    const outcomes: AppendEurostatMacroSeriesVintageRedisResultV1[] = [];
    const result = await acquireEurostatMacroSeriesV1("hicp", {
      loadDataset: async (sourceUrl) => ({
        sourceUrl,
        payload: fixture("hicp"),
      }),
      nowUnixSeconds: () => FETCHED_AT,
      appendVintage: async (_family, series) => {
        const snapshot = buildCanonicalStatisticalSeriesSnapshotV1(series);
        const outcome: AppendEurostatMacroSeriesVintageRedisResultV1 =
          status === "initialized"
            ? { status, snapshot }
            : status === "advanced"
              ? { status, previous: snapshot, snapshot }
              : status === "unchanged"
                ? { status, latest: snapshot }
                : { status, latest: snapshot, candidate: snapshot };
        outcomes.push(outcome);
        return outcome;
      },
    });
    assert.equal(result, outcomes[0], `${status} remains an explicit outcome`);
    assert.equal(result.status, status);
  }
}

async function main(): Promise<void> {
  await successAndOrdering("hicp");
  await successAndOrdering("gdp");
  await failureBoundaries();
  await appendOutcomes();
  console.log("PASS: Inactive Eurostat macro acquisition coordinator V1");
}

void main();
