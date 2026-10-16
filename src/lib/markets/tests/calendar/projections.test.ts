import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CALENDAR_PROJECTION_SCHEMA_V1 } from "../../calendar/contracts";
import { projectCalendarFreeLiteV1, projectCalendarVipDeepV1 } from "../../calendar/projections";
import { calendarFixtureV1, revisionFixturesV1, FIXTURE_ACK_V1 } from "./fixtures";

const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
const first = calendarFixtureV1();
const input = { versions: [first], knowledgeCutoff: FIXTURE_ACK_V1, evaluatedAt: FIXTURE_ACK_V1 };
const unavailable = (tier: "free-lite" | "vip-deep") => ({ schemaVersion: CALENDAR_PROJECTION_SCHEMA_V1,
  tier, sourceAuthentication: "not-performed", historicalOwnership: "not-certified",
  availability: "unavailable", reason: "calendar-unavailable" });

test("Free Lite uses an exact field allowlist and omits all Deep timing and persistence fields", () => {
  const result = projectCalendarFreeLiteV1(input, FIXTURE_ACK_V1);
  if (result.availability !== "available") assert.fail();
  assert.deepEqual(Object.keys(result.event).sort(), ["eventId", "title", "family", "state", "eventTime", "publisher", "sourceUrl", "products", "freshness"].sort());
  assert.deepEqual(result.event.products, ["eurjpy"]);
  const serialized = JSON.stringify(result);
  for (const key of ["revision", "versionId", "sourceVersionId", "parserVersion", "publication", "timing",
    "completedAt", "availableAt", "acknowledgedAt", "recordId", "fixture-internal-persistence-record",
    "referencePeriod", "effectiveDate", "knowledgeCutoff"]) assert.equal(serialized.includes(key), false, key);
  assert.equal(Object.isFrozen(result.event.eventTime), true);
  assert.equal(Object.isFrozen(result.event.products), true);
  assert.equal(result.sourceAuthentication, "not-performed");
  assert.equal(result.historicalOwnership, "not-certified");
});

test("VIP Deep retains distinct source and capture clocks, but never exposes internal record IDs", () => {
  const result = projectCalendarVipDeepV1(input, FIXTURE_ACK_V1);
  if (result.availability !== "available") assert.fail();
  assert.equal(result.event.versionId, first.versionId);
  assert.deepEqual(plain(result.event.publication), first.publication);
  assert.equal(result.event.timing.acquisition.status, "recorded");
  assert.equal(result.event.timing.evidenceAvailability.status, "recorded");
  assert.equal(result.event.timing.persistence.acknowledgedAt, FIXTURE_ACK_V1);
  assert.deepEqual(Object.keys(result.event.timing.persistence).sort(), ["status", "acknowledgedAt"].sort());
  assert.equal(JSON.stringify(result).includes("fixture-internal-persistence-record"), false);
  assert.equal(Object.isFrozen(result.event.timing.persistence), true);
  assert.equal(result.sourceAuthentication, "not-performed");
  assert.equal(result.historicalOwnership, "not-certified");
});

test("freshness expires exactly at policy age; unqualified cadence remains explicitly unavailable", () => {
  for (const [assessedAt, expected] of [
    ["2026-10-16T08:01:00.099Z", "within-cadence"],
    ["2026-10-16T08:01:00.100Z", "stale"],
    ["2026-10-16T08:01:00.101Z", "stale"],
  ] as const) {
    for (const project of [projectCalendarFreeLiteV1, projectCalendarVipDeepV1]) {
      const result = project(input, assessedAt);
      if (result.availability !== "available") assert.fail();
      assert.equal(result.event.freshness.status, expected);
      assert.equal(result.event.state, "scheduled");
      assert.deepEqual(plain(result.event.eventTime), first.eventTime);
    }
  }
  const unknownCadence = { ...input, versions: [calendarFixtureV1({ freshnessPolicy: { maximumAgeMilliseconds: null } })] };
  const result = projectCalendarFreeLiteV1(unknownCadence, FIXTURE_ACK_V1);
  if (result.availability !== "available") assert.fail();
  assert.deepEqual(plain(result.event.freshness), { status: "unavailable", assessedAt: FIXTURE_ACK_V1, reason: "cadence-unqualified" });
});

test("later delivery can change freshness but cannot select later revisions or manufacture publication", () => {
  const history = { ...input, versions: revisionFixturesV1() };
  const early = projectCalendarVipDeepV1(history, FIXTURE_ACK_V1);
  const late = projectCalendarVipDeepV1(history, "2026-11-03T00:00:00Z");
  if (early.availability !== "available" || late.availability !== "available") assert.fail();
  assert.equal(late.event.versionId, early.event.versionId);
  assert.equal(late.event.state, "scheduled");
  assert.deepEqual(late.event.publication, early.event.publication);
  assert.deepEqual(late.event.timing, early.event.timing);
  assert.equal(late.event.freshness.status, "stale");
  for (const key of ["probability", "marketReaction", "opportunity", "recommendation", "confidence", "trade", "releaseAt"])
    assert.equal(JSON.stringify(late).includes(key), false, key);
});

test("unavailable and malformed history yield identical sanitized errors in both tiers", () => {
  const inputs = [
    { ...input, versions: [] },
    { ...input, knowledgeCutoff: "invalid" },
    { ...input, evaluatedAt: "2026-10-16T07:00:00Z" },
    { ...input, versions: [{ ...first, secret: "synthetic-private-content" }] },
    { ...input, versions: [{ ...first, timing: { ...first.timing, persistence: { status: "not-persisted" } } }] },
  ];
  for (const history of inputs) {
    assert.deepEqual(projectCalendarFreeLiteV1(history, FIXTURE_ACK_V1), unavailable("free-lite"));
    assert.deepEqual(projectCalendarVipDeepV1(history, FIXTURE_ACK_V1), unavailable("vip-deep"));
  }
  assert.deepEqual(projectCalendarFreeLiteV1(input, "2026-10-16T08:00:00.199Z"), unavailable("free-lite"));
  assert.deepEqual(projectCalendarVipDeepV1(input, "invalid"), unavailable("vip-deep"));
});

test("projection never invokes accessors and never echoes unexpected caller content", () => {
  let calls = 0;
  const getter = Object.defineProperty({ ...input }, "versions", { enumerable: true, get() { calls++; return []; } });
  assert.deepEqual(projectCalendarFreeLiteV1(getter, FIXTURE_ACK_V1), unavailable("free-lite"));
  assert.deepEqual(projectCalendarVipDeepV1(getter, FIXTURE_ACK_V1), unavailable("vip-deep"));
  assert.equal(calls, 0);
});

test("public and VIP projections are deterministic with network and ambient clock disabled", () => {
  const expectedFree = projectCalendarFreeLiteV1(input, FIXTURE_ACK_V1);
  const expectedVip = projectCalendarVipDeepV1(input, FIXTURE_ACK_V1);
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  try {
    globalThis.fetch = () => { throw new Error("Network forbidden"); };
    Date.now = () => { throw new Error("Ambient clock forbidden"); };
    assert.deepEqual(projectCalendarFreeLiteV1(input, FIXTURE_ACK_V1), expectedFree);
    assert.deepEqual(projectCalendarVipDeepV1(input, FIXTURE_ACK_V1), expectedVip);
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
});

test("isolated modules have only explicit leaf dependencies and server-only projection boundaries", () => {
  // Read only these new files. No directory scan or application module loading.
  const dependencies = {
    contracts: ["../services/canonicalProductResultOwnership"],
    validation: ["server-only", "node:util", "../events/eventClock", "./contracts"],
    history: ["server-only", "./contracts", "./validation"],
    projections: ["server-only", "./contracts", "./history", "./validation"],
  } as const;
  for (const [name, allowed] of Object.entries(dependencies)) {
    const source = readFileSync(`src/lib/markets/calendar/${name}.ts`, "utf8");
    const imports = [...source.matchAll(/(?:from\s+|import\s+)["']([^"']+)["']/g)].map(match => match[1]);
    assert.deepEqual(imports.sort(), [...allowed].sort());
    if (name !== "contracts") assert.match(source, /import "server-only"/);
    assert.doesNotMatch(source, /process\.env|globalThis\.fetch|Date\.now|unstable_cache|setInterval|setTimeout|require\s*\(|import\s*\(/);
  }
});
