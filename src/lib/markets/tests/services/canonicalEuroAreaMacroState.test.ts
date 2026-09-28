import assert from "node:assert/strict";

import {
  CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1,
  type CanonicalStatisticalFrequencyV1,
  type CanonicalStatisticalSeriesInputV1,
} from "../../services/canonicalObservationSeries";
import {
  CANONICAL_EURO_AREA_MACRO_STATE_SCHEMA_VERSION_V1,
  buildCanonicalEuroAreaMacroStateV1,
  type CanonicalEuroAreaMacroComponentV1,
  type CanonicalEuroAreaMacroStateInputV1,
} from "../../services/canonicalEuroAreaMacroState";
import {
  advanceCanonicalStatisticalSeriesMemoryV1,
  selectCanonicalStatisticalSeriesAsKnownAtV1,
  type CanonicalStatisticalSeriesMemoryV1,
} from "../../services/canonicalStatisticalSeriesMemory";

const SERIES_IDS = Object.freeze({
  hicp: "test-euro-area-hicp",
  gdp: "test-euro-area-gdp",
  unemployment: "test-euro-area-unemployment",
});

interface SeriesOptions {
  readonly canonicalSeriesId: string;
  readonly frequency: CanonicalStatisticalFrequencyV1;
  readonly fetchedAt: number;
  readonly sourceVersionId: string;
  readonly value: number;
  readonly referencePeriod?: string;
}

function series(options: SeriesOptions): CanonicalStatisticalSeriesInputV1 {
  return {
    observations: [{
      referencePeriod: options.referencePeriod ??
        (options.frequency === "monthly" ? "2026-08" : "2026-Q2"),
      value: options.value,
    }],
    metadata: {
      provenanceVersion: CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1,
      provider: "official-test-provider",
      source: "Official Test Publisher",
      originalPublisher: "Official Test Publisher",
      substitution: { status: "none" },
      canonicalSeriesId: options.canonicalSeriesId,
      sourceSeriesId: `TEST.${options.canonicalSeriesId}`,
      sourceUrl: "https://statistics.example.test/dataset",
      sourceVersionId: options.sourceVersionId,
      frequency: options.frequency,
      fetchedAt: options.fetchedAt,
      unit: "test-unit",
    },
  };
}

function memory(
  ...inputs: readonly CanonicalStatisticalSeriesInputV1[]
): CanonicalStatisticalSeriesMemoryV1 {
  let current: CanonicalStatisticalSeriesMemoryV1 | null = null;

  for (const input of inputs) {
    current = advanceCanonicalStatisticalSeriesMemoryV1(current, input).memory;
  }

  if (current === null) {
    throw new Error("Expected at least one canonical statistical-series input.");
  }
  return current;
}

function monthlyMemory(
  canonicalSeriesId: string,
  fetchedAt = 100,
  sourceVersionId = "version-1",
  value = 100,
): CanonicalStatisticalSeriesMemoryV1 {
  return memory(series({
    canonicalSeriesId,
    frequency: "monthly",
    fetchedAt,
    sourceVersionId,
    value,
  }));
}

function quarterlyMemory(
  canonicalSeriesId: string,
  fetchedAt = 100,
  sourceVersionId = "version-1",
  value = 1,
): CanonicalStatisticalSeriesMemoryV1 {
  return memory(series({
    canonicalSeriesId,
    frequency: "quarterly",
    fetchedAt,
    sourceVersionId,
    value,
  }));
}

function input(
  overrides: Partial<CanonicalEuroAreaMacroStateInputV1> = {},
): CanonicalEuroAreaMacroStateInputV1 {
  return {
    asOf: 100,
    hicp: {
      expectedCanonicalSeriesId: SERIES_IDS.hicp,
      memory: monthlyMemory(SERIES_IDS.hicp),
    },
    gdp: {
      expectedCanonicalSeriesId: SERIES_IDS.gdp,
      memory: quarterlyMemory(SERIES_IDS.gdp),
    },
    unemployment: {
      expectedCanonicalSeriesId: SERIES_IDS.unemployment,
      memory: monthlyMemory(SERIES_IDS.unemployment),
    },
    ...overrides,
  };
}

function availableSnapshot(component: CanonicalEuroAreaMacroComponentV1) {
  assert.equal(component.availability, "available");
  if (component.availability !== "available") {
    throw new Error("Expected an available macro component.");
  }
  return component.snapshot;
}

function unavailableReason(component: CanonicalEuroAreaMacroComponentV1) {
  assert.equal(component.availability, "unavailable");
  if (component.availability !== "unavailable") {
    throw new Error("Expected an unavailable macro component.");
  }
  return component.reason;
}

const complete = buildCanonicalEuroAreaMacroStateV1(input());
assert.equal(
  complete.schemaVersion,
  CANONICAL_EURO_AREA_MACRO_STATE_SCHEMA_VERSION_V1,
);
assert.equal(complete.availability, "available");
assert.deepEqual(complete.missingFamilies, []);
assert.equal(complete.hicp.availability, "available");
assert.equal(complete.gdp.availability, "available");
assert.equal(complete.unemployment.availability, "available");

const oneMissing = buildCanonicalEuroAreaMacroStateV1(input({
  gdp: { expectedCanonicalSeriesId: SERIES_IDS.gdp, memory: null },
}));
assert.equal(oneMissing.availability, "partial");
assert.deepEqual(oneMissing.missingFamilies, ["gdp"]);
assert.equal(unavailableReason(oneMissing.gdp), "memory-unavailable");

const twoMissing = buildCanonicalEuroAreaMacroStateV1(input({
  hicp: { expectedCanonicalSeriesId: SERIES_IDS.hicp, memory: null },
  unemployment: {
    expectedCanonicalSeriesId: SERIES_IDS.unemployment,
    memory: null,
  },
}));
assert.equal(twoMissing.availability, "partial");
assert.deepEqual(twoMissing.missingFamilies, ["hicp", "unemployment"]);

const allMissing = buildCanonicalEuroAreaMacroStateV1(input({
  hicp: { expectedCanonicalSeriesId: SERIES_IDS.hicp, memory: null },
  gdp: { expectedCanonicalSeriesId: SERIES_IDS.gdp, memory: null },
  unemployment: {
    expectedCanonicalSeriesId: SERIES_IDS.unemployment,
    memory: null,
  },
}));
assert.equal(allMissing.availability, "unavailable");
assert.deepEqual(allMissing.missingFamilies, ["hicp", "gdp", "unemployment"]);

const futureHicpMemory = monthlyMemory(
  SERIES_IDS.hicp,
  200,
  "hicp-future-v1",
  100,
);
const beforeHicpWasKnown = buildCanonicalEuroAreaMacroStateV1(input({
  asOf: 150,
  hicp: {
    expectedCanonicalSeriesId: SERIES_IDS.hicp,
    memory: futureHicpMemory,
  },
}));
assert.equal(beforeHicpWasKnown.availability, "partial");
assert.equal(unavailableReason(beforeHicpWasKnown.hicp), "not-known-as-of");
assert.equal("snapshot" in beforeHicpWasKnown.hicp, false);

const hicpRevisions = memory(
  series({
    canonicalSeriesId: SERIES_IDS.hicp,
    frequency: "monthly",
    fetchedAt: 100,
    sourceVersionId: "hicp-v1",
    value: 100,
  }),
  series({
    canonicalSeriesId: SERIES_IDS.hicp,
    frequency: "monthly",
    fetchedAt: 200,
    sourceVersionId: "hicp-v2",
    value: 102,
  }),
);
const hicpAt150 = buildCanonicalEuroAreaMacroStateV1(input({
  asOf: 150,
  hicp: { expectedCanonicalSeriesId: SERIES_IDS.hicp, memory: hicpRevisions },
}));
const hicpAt200 = buildCanonicalEuroAreaMacroStateV1(input({
  asOf: 200,
  hicp: { expectedCanonicalSeriesId: SERIES_IDS.hicp, memory: hicpRevisions },
}));
assert.equal(availableSnapshot(hicpAt150.hicp).sourceVersionId, "hicp-v1");
assert.equal(
  availableSnapshot(hicpAt150.hicp).series.observations[0]?.value,
  100,
);
assert.equal(availableSnapshot(hicpAt200.hicp).sourceVersionId, "hicp-v2");
assert.equal(
  availableSnapshot(hicpAt200.hicp).series.observations[0]?.value,
  102,
);

const gdpRevisions = memory(
  series({
    canonicalSeriesId: SERIES_IDS.gdp,
    frequency: "quarterly",
    fetchedAt: 100,
    sourceVersionId: "gdp-v1",
    value: 1,
  }),
  series({
    canonicalSeriesId: SERIES_IDS.gdp,
    frequency: "quarterly",
    fetchedAt: 200,
    sourceVersionId: "gdp-v2",
    value: 1.5,
  }),
);
const gdpAt150 = buildCanonicalEuroAreaMacroStateV1(input({
  asOf: 150,
  gdp: { expectedCanonicalSeriesId: SERIES_IDS.gdp, memory: gdpRevisions },
}));
const gdpAt200 = buildCanonicalEuroAreaMacroStateV1(input({
  asOf: 200,
  gdp: { expectedCanonicalSeriesId: SERIES_IDS.gdp, memory: gdpRevisions },
}));
assert.equal(availableSnapshot(gdpAt150.gdp).sourceVersionId, "gdp-v1");
assert.equal(
  availableSnapshot(gdpAt150.gdp).series.observations[0]?.value,
  1,
);
assert.equal(availableSnapshot(gdpAt200.gdp).sourceVersionId, "gdp-v2");
assert.equal(
  availableSnapshot(gdpAt200.gdp).series.observations[0]?.value,
  1.5,
);

const exactBoundaryMemory = monthlyMemory(
  SERIES_IDS.unemployment,
  300,
  "unemployment-v1",
  6,
);
const exactBoundary = buildCanonicalEuroAreaMacroStateV1(input({
  asOf: 300,
  unemployment: {
    expectedCanonicalSeriesId: SERIES_IDS.unemployment,
    memory: exactBoundaryMemory,
  },
}));
assert.equal(availableSnapshot(exactBoundary.unemployment).knownAt, 300);

assert.throws(
  () => buildCanonicalEuroAreaMacroStateV1(input({ asOf: -1 })),
  /asOf is invalid/,
);
assert.throws(
  () => buildCanonicalEuroAreaMacroStateV1(input({ asOf: 1.5 })),
  /asOf is invalid/,
);
assert.throws(
  () => buildCanonicalEuroAreaMacroStateV1(input({
    hicp: { expectedCanonicalSeriesId: " ", memory: null },
  })),
  /expected series ID is invalid/,
);
assert.throws(
  () => buildCanonicalEuroAreaMacroStateV1(input({
    hicp: { expectedCanonicalSeriesId: ` ${SERIES_IDS.hicp}`, memory: null },
  })),
  /expected series ID is invalid/,
);
assert.throws(
  () => buildCanonicalEuroAreaMacroStateV1(input({
    hicp: {
      expectedCanonicalSeriesId: "different-hicp-series",
      memory: monthlyMemory(SERIES_IDS.hicp),
    },
  })),
  /does not match its binding/,
);
assert.throws(
  () => buildCanonicalEuroAreaMacroStateV1(input({
    gdp: {
      expectedCanonicalSeriesId: SERIES_IDS.hicp,
      memory: quarterlyMemory(SERIES_IDS.gdp),
    },
  })),
  /must be distinct/,
);
assert.throws(
  () => buildCanonicalEuroAreaMacroStateV1(input({
    hicp: {
      expectedCanonicalSeriesId: SERIES_IDS.hicp,
      memory: quarterlyMemory(SERIES_IDS.hicp),
    },
  })),
  /hicp memory frequency must be monthly/,
);
assert.throws(
  () => buildCanonicalEuroAreaMacroStateV1(input({
    gdp: {
      expectedCanonicalSeriesId: SERIES_IDS.gdp,
      memory: monthlyMemory(SERIES_IDS.gdp),
    },
  })),
  /gdp memory frequency must be quarterly/,
);
assert.throws(
  () => buildCanonicalEuroAreaMacroStateV1(input({
    unemployment: {
      expectedCanonicalSeriesId: SERIES_IDS.unemployment,
      memory: quarterlyMemory(SERIES_IDS.unemployment),
    },
  })),
  /unemployment memory frequency must be monthly/,
);

const malformedMemory = JSON.parse(JSON.stringify(hicpRevisions)) as {
  snapshots: Array<{ sourceVersionId: string }>;
};
malformedMemory.snapshots[0]!.sourceVersionId = "forged-version";
assert.throws(
  () => buildCanonicalEuroAreaMacroStateV1(input({
    hicp: {
      expectedCanonicalSeriesId: SERIES_IDS.hicp,
      memory: malformedMemory as unknown as CanonicalStatisticalSeriesMemoryV1,
    },
  })),
  /Invalid canonical statistical-series memory/,
);

assert.equal(Object.isFrozen(complete), true);
assert.equal(Object.isFrozen(complete.hicp), true);
assert.equal(Object.isFrozen(complete.gdp), true);
assert.equal(Object.isFrozen(complete.unemployment), true);
assert.equal(Object.isFrozen(complete.missingFamilies), true);
assert.equal(Object.isFrozen(allMissing.missingFamilies), true);

const preservedHicpMemory = monthlyMemory(SERIES_IDS.hicp);
const preservedGdpMemory = quarterlyMemory(SERIES_IDS.gdp);
const preservedUnemploymentMemory = monthlyMemory(SERIES_IDS.unemployment);
const preservedInput = input({
  hicp: {
    expectedCanonicalSeriesId: SERIES_IDS.hicp,
    memory: preservedHicpMemory,
  },
  gdp: {
    expectedCanonicalSeriesId: SERIES_IDS.gdp,
    memory: preservedGdpMemory,
  },
  unemployment: {
    expectedCanonicalSeriesId: SERIES_IDS.unemployment,
    memory: preservedUnemploymentMemory,
  },
});
const serializedInputBeforeBuild = JSON.stringify(preservedInput);
const preservedState = buildCanonicalEuroAreaMacroStateV1(preservedInput);
assert.equal(JSON.stringify(preservedInput), serializedInputBeforeBuild);
assert.equal(preservedInput.hicp.memory, preservedHicpMemory);
assert.equal(preservedInput.gdp.memory, preservedGdpMemory);
assert.equal(preservedInput.unemployment.memory, preservedUnemploymentMemory);

const selectedHicp = selectCanonicalStatisticalSeriesAsKnownAtV1(
  preservedHicpMemory,
  preservedInput.asOf,
);
assert.notEqual(selectedHicp, null);
assert.equal(availableSnapshot(preservedState.hicp), selectedHicp);

console.log("PASS: Canonical Euro-area Macro State V1");
