import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1,
  type CanonicalStatisticalObservationValueV1,
  type CanonicalStatisticalSeriesInputV1,
} from "../../services/canonicalObservationSeries";
import {
  buildCanonicalStatisticalSeriesSnapshotV1,
} from "../../services/canonicalStatisticalSeriesMemory";
import {
  EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1,
  buildEurostatSelectedSeriesSourceVersionIdV1,
  type EurostatEuroAreaMacroFamilyV1,
} from "../../providers/eurostat/macroSeries";
import {
  EurostatMacroSeriesVintagePersistenceError,
  buildEurostatMacroSeriesVintageRedisKeyV1,
  createEurostatMacroSeriesVintageRedisAdapterV1,
  type EurostatMacroSeriesVintageRedisCompareAndAppend,
} from "../../persistence/eurostatMacroSeriesVintageRedis";

interface SeriesOptions {
  readonly fetchedAt: number;
  readonly values?: readonly number[];
  readonly sourceVersionId?: string;
}

interface Entry {
  readonly score: number;
  readonly member: string;
}

interface FakeOptions {
  readonly failHead?: boolean;
  readonly failRead?: boolean;
  readonly failAppend?: boolean;
  readonly appendResponse?: unknown;
  readonly beforeAppend?: (
    call: number,
    key: string,
    entries: Map<string, Entry[]>,
  ) => void;
}

function observations(
  family: EurostatEuroAreaMacroFamilyV1,
  values: readonly number[],
): readonly CanonicalStatisticalObservationValueV1[] {
  return family === "hicp"
    ? values.map((value, index) => ({
        referencePeriod: `2026-${String(index + 7).padStart(2, "0")}`,
        value,
      }))
    : values.map((value, index) => ({
        referencePeriod: `2026-Q${index + 1}`,
        value,
      }));
}

function series(
  family: EurostatEuroAreaMacroFamilyV1,
  options: SeriesOptions,
): CanonicalStatisticalSeriesInputV1 {
  const spec = EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1[family];
  const selected = observations(family, options.values ?? [1, 2]);
  return {
    observations: selected,
    metadata: {
      provenanceVersion: CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1,
      provider: "eurostat",
      source: "Eurostat Statistics API",
      originalPublisher: "Eurostat",
      substitution: { status: "none" },
      canonicalSeriesId: spec.canonicalSeriesId,
      sourceSeriesId: spec.sourceSeriesId,
      sourceUrl: spec.sourceUrl,
      sourceVersionId: options.sourceVersionId ??
        buildEurostatSelectedSeriesSourceVersionIdV1(family, selected),
      frequency: spec.frequency,
      fetchedAt: options.fetchedAt,
      unit: spec.unit,
    },
  };
}

function serialized(
  family: EurostatEuroAreaMacroFamilyV1,
  options: SeriesOptions,
): string {
  return JSON.stringify(buildCanonicalStatisticalSeriesSnapshotV1(
    series(family, options),
  ));
}

function createFakeRedis(
  initial: ReadonlyMap<string, readonly Entry[]> = new Map(),
  options: FakeOptions = {},
) {
  const entries = new Map<string, Entry[]>(
    [...initial].map(([key, values]) => [key, [...values]]),
  );
  let headReads = 0;
  let asOfReads = 0;
  let appends = 0;

  function window(values: readonly Entry[]): unknown[] {
    return [...values]
      .sort((left, right) => right.score - left.score)
      .slice(0, 2)
      .flatMap((entry) => [entry.member, String(entry.score)]);
  }

  const compareAndAppend: EurostatMacroSeriesVintageRedisCompareAndAppend =
    async (key, expected, score, member) => {
      appends += 1;
      if (options.failAppend) throw new Error("Redis append failed");
      options.beforeAppend?.(appends, key, entries);
      if (options.appendResponse !== undefined) {
        return options.appendResponse;
      }
      const values = entries.get(key) ?? [];
      const head = [...values].sort((left, right) => right.score - left.score)[0];
      if (
        (expected === null && head !== undefined) ||
        (expected !== null &&
          (head === undefined ||
            head.score !== expected.score ||
            head.member !== expected.member))
      ) {
        return "race";
      }
      const sameScore = values.filter((entry) => entry.score === score);
      if (sameScore.length > 1) return "duplicate-score";
      if (sameScore.length === 1) {
        return sameScore[0]!.member === member
          ? "already-present"
          : "score-conflict";
      }
      if (values.some((entry) => entry.member === member)) {
        return "member-conflict";
      }
      entries.set(key, [...values, { score, member }]);
      return "written";
    };

  const adapter = createEurostatMacroSeriesVintageRedisAdapterV1({
    readHead: async (key) => {
      headReads += 1;
      if (options.failHead) throw new Error("Redis head read failed");
      return window(entries.get(key) ?? []);
    },
    readAsKnownAt: async (key, asOf) => {
      asOfReads += 1;
      if (options.failRead) throw new Error("Redis as-of read failed");
      return window((entries.get(key) ?? []).filter(
        (entry) => entry.score <= asOf,
      ));
    },
    compareAndAppend,
  });

  return {
    adapter,
    entries,
    headReads: () => headReads,
    asOfReads: () => asOfReads,
    appends: () => appends,
    history: (family: EurostatEuroAreaMacroFamilyV1) =>
      [...(entries.get(buildEurostatMacroSeriesVintageRedisKeyV1(family)) ?? [])]
        .sort((left, right) => left.score - right.score),
  };
}

function hasCode(code: string): (error: unknown) => boolean {
  return (error) =>
    error instanceof EurostatMacroSeriesVintagePersistenceError &&
    error.code === code;
}

async function main(): Promise<void> {
  const hicpKey = buildEurostatMacroSeriesVintageRedisKeyV1("hicp");
  const gdpKey = buildEurostatMacroSeriesVintageRedisKeyV1("gdp");
  assert.notEqual(hicpKey, gdpKey, "each locked canonical series has one key");
  assert.match(hicpKey, /euro-area-hicp-all-items-annual-rate$/);
  assert.match(gdpKey, /euro-area-real-gdp-qoq-sca$/);
  assert.throws(
    () => buildEurostatMacroSeriesVintageRedisKeyV1(
      "unemployment" as EurostatEuroAreaMacroFamilyV1,
    ),
    /Invalid Eurostat macro family/,
  );

  const invalidFamily = createFakeRedis();
  await assert.rejects(
    invalidFamily.adapter.append(
      "unemployment" as EurostatEuroAreaMacroFamilyV1,
      series("hicp", { fetchedAt: 100 }),
    ),
    hasCode("invalid-current"),
  );
  assert.equal(invalidFamily.headReads(), 0, "family rejected pre-Redis");

  const invalidCandidates: CanonicalStatisticalSeriesInputV1[] = [
    {
      ...series("hicp", { fetchedAt: 100 }),
      observations: [],
    },
    {
      ...series("hicp", { fetchedAt: 100 }),
      metadata: {
        ...series("hicp", { fetchedAt: 100 }).metadata,
        provider: "not-eurostat",
      },
    },
    {
      ...series("hicp", { fetchedAt: 100 }),
      metadata: {
        ...series("hicp", { fetchedAt: 100 }).metadata,
        provider: " eurostat ",
      },
    },
    series("hicp", { fetchedAt: 100, sourceVersionId: "forged" }),
  ];
  for (const candidate of invalidCandidates) {
    const fake = createFakeRedis();
    await assert.rejects(
      fake.adapter.append("hicp", candidate),
      hasCode("invalid-current"),
    );
    assert.equal(fake.headReads(), 0, "candidate rejected pre-Redis");
    assert.equal(fake.appends(), 0, "invalid candidate is never appended");
  }

  const fake = createFakeRedis();
  const a100 = series("hicp", { fetchedAt: 100, values: [1, 2] });
  const b200 = series("hicp", { fetchedAt: 200, values: [1.1, 2] });
  const a300 = series("hicp", { fetchedAt: 300, values: [1, 2] });
  const initialized = await fake.adapter.append("hicp", a100);
  assert.equal(initialized.status, "initialized");
  assert.equal(initialized.snapshot.series.metadata.fetchedAt, 100);
  assert.equal((await fake.adapter.append("hicp", b200)).status, "advanced");
  assert.equal((await fake.adapter.append("hicp", a300)).status, "advanced");
  assert.deepEqual(fake.history("hicp").map((entry) => entry.score), [100, 200, 300]);
  assert.deepEqual(
    fake.history("hicp").map((entry) =>
      (JSON.parse(entry.member) as { series: { metadata: { fetchedAt: number } } })
        .series.metadata.fetchedAt
    ),
    [100, 200, 300],
    "persistence preserves supplied fetchedAt",
  );

  const unchanged = await fake.adapter.append(
    "hicp",
    series("hicp", { fetchedAt: 400, values: [1, 2] }),
  );
  assert.equal(unchanged.status, "unchanged");
  assert.equal(fake.history("hicp").length, 3);
  const stale = await fake.adapter.append(
    "hicp",
    series("hicp", { fetchedAt: 250, values: [8, 9] }),
  );
  assert.equal(stale.status, "stale");
  const conflict = await fake.adapter.append(
    "hicp",
    series("hicp", { fetchedAt: 300, values: [8, 9] }),
  );
  assert.equal(conflict.status, "conflict");
  assert.equal(fake.history("hicp").length, 3);

  assert.deepEqual(await fake.adapter.readAsKnownAt("hicp", 99), {
    status: "absent",
  });
  const at100 = await fake.adapter.readAsKnownAt("hicp", 100);
  assert.equal(at100.status, "available");
  assert.equal(at100.status === "available" ? at100.snapshot.knownAt : -1, 100);
  const at250 = await fake.adapter.readAsKnownAt("hicp", 250);
  assert.equal(at250.status, "available");
  assert.equal(at250.status === "available" ? at250.snapshot.knownAt : -1, 200);
  const at300 = await fake.adapter.readAsKnownAt("hicp", 300);
  assert.equal(at300.status, "available");
  assert.equal(at300.status === "available" ? at300.snapshot.knownAt : -1, 300);

  const futureOnly = createFakeRedis(new Map([[hicpKey, [{
    score: 500,
    member: serialized("hicp", { fetchedAt: 500 }),
  }]]]));
  assert.deepEqual(await futureOnly.adapter.readAsKnownAt("hicp", 499), {
    status: "absent",
  });

  const malformed = createFakeRedis(new Map([[hicpKey, [{
    score: 100,
    member: "{malformed",
  }]]]));
  await assert.rejects(
    malformed.adapter.append("hicp", b200),
    hasCode("stored-snapshot-invalid"),
  );
  assert.equal(malformed.appends(), 0, "corrupt head is never repaired");
  assert.deepEqual(await malformed.adapter.readAsKnownAt("hicp", 200), {
    status: "stored-snapshot-invalid",
  });

  const corruptSecond = createFakeRedis(new Map([[hicpKey, [
    { score: 200, member: serialized("hicp", { fetchedAt: 200 }) },
    { score: 100, member: "{malformed-lower-member" },
  ]]]));
  await assert.rejects(
    corruptSecond.adapter.append(
      "hicp",
      series("hicp", { fetchedAt: 300, values: [7, 8] }),
    ),
    hasCode("stored-snapshot-invalid"),
  );
  assert.deepEqual(await corruptSecond.adapter.readAsKnownAt("hicp", 300), {
    status: "stored-snapshot-invalid",
  });

  const forgedRaw = JSON.parse(serialized("hicp", { fetchedAt: 100 })) as {
    sourceVersionId: string;
    series: { metadata: { sourceVersionId: string } };
  };
  forgedRaw.sourceVersionId = "forged";
  forgedRaw.series.metadata.sourceVersionId = "forged";
  const forged = createFakeRedis(new Map([[hicpKey, [{
    score: 100,
    member: JSON.stringify(forgedRaw),
  }]]]));
  assert.deepEqual(await forged.adapter.readAsKnownAt("hicp", 100), {
    status: "stored-snapshot-invalid",
  });

  const duplicate = createFakeRedis(new Map([[hicpKey, [
    { score: 100, member: serialized("hicp", { fetchedAt: 100 }) },
    { score: 100, member: serialized("hicp", { fetchedAt: 100, values: [3, 4] }) },
  ]]]));
  await assert.rejects(
    duplicate.adapter.append("hicp", b200),
    hasCode("duplicate-score"),
  );
  assert.deepEqual(await duplicate.adapter.readAsKnownAt("hicp", 100), {
    status: "duplicate-score",
  });

  const failedHead = createFakeRedis(new Map(), { failHead: true });
  await assert.rejects(
    failedHead.adapter.append("hicp", a100),
    hasCode("redis-failure"),
  );
  const failedRead = createFakeRedis(new Map(), { failRead: true });
  assert.deepEqual(await failedRead.adapter.readAsKnownAt("hicp", 100), {
    status: "redis-failure",
  });
  const invalidReadResponse = createEurostatMacroSeriesVintageRedisAdapterV1({
    readHead: async () => [],
    readAsKnownAt: async () => ({ unexpected: true }),
    compareAndAppend: async () => "written",
  });
  assert.deepEqual(await invalidReadResponse.readAsKnownAt("hicp", 100), {
    status: "invalid-response",
  });
  const failedAppend = createFakeRedis(new Map(), { failAppend: true });
  await assert.rejects(
    failedAppend.adapter.append("hicp", a100),
    hasCode("redis-failure"),
  );
  const unexpected = createFakeRedis(new Map(), { appendResponse: "wat" });
  await assert.rejects(
    unexpected.adapter.append("hicp", a100),
    hasCode("invalid-response"),
  );

  const exhausted = createFakeRedis(new Map(), { appendResponse: "race" });
  await assert.rejects(
    exhausted.adapter.append("hicp", a100),
    hasCode("concurrency-conflict"),
  );
  assert.equal(exhausted.headReads(), 3);
  assert.equal(exhausted.appends(), 3);

  const raceWinner = serialized("hicp", { fetchedAt: 150, values: [5, 6] });
  const raced = createFakeRedis(new Map(), {
    beforeAppend: (call, key, entries) => {
      if (call === 1) entries.set(key, [{ score: 150, member: raceWinner }]);
    },
  });
  const racedResult = await raced.adapter.append("hicp", b200);
  assert.equal(racedResult.status, "advanced");
  assert.deepEqual(raced.history("hicp").map((entry) => entry.score), [150, 200]);

  assert.deepEqual(
    await fake.adapter.readAsKnownAt(
      "unemployment" as EurostatEuroAreaMacroFamilyV1,
      100,
    ),
    { status: "invalid-response" },
  );
  assert.deepEqual(await fake.adapter.readAsKnownAt("hicp", -1), {
    status: "invalid-response",
  });

  assertAppendOnlyLua();
  console.log("PASS: Inactive Redis Eurostat macro-series vintages V1");
}

function assertAppendOnlyLua(): void {
  const source = readFileSync(fileURLToPath(new URL(
    "../../persistence/canonicalStatisticalSeriesVintageRedis.ts",
    import.meta.url,
  )), "utf8");
  const script =
    /const CANONICAL_STATISTICAL_VINTAGE_COMPARE_AND_APPEND_SCRIPT = String\.raw`([\s\S]*?)`;/.exec(
      source,
    )?.[1];
  assert.notEqual(script, undefined, "atomic Lua script is present");
  assert.match(script!, /ZREVRANGE/);
  assert.match(script!, /ZRANGEBYSCORE/);
  assert.match(script!, /ZADD", key, "NX"/);
  assert.match(script!, /return "score-conflict"/);
  assert.doesNotMatch(script!, /EXPIRE|PEXPIRE|ZREM|DEL|ZPOPMIN|ZPOPMAX/i);
  assert.match(source, /zrange<unknown\[\]>\(\s*key,\s*asOf,\s*"-inf"/);
  assert.doesNotMatch(source, /unemployment/i);
}

void main();
