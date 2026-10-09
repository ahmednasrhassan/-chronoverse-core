import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import * as contract from "../../events/temporalTrust";
import {
  createAcquisitionCompletionV1 as completion,
  createEvidenceAvailabilityV1 as availability,
  createEvaluationInstantV1 as evaluation,
  createHistoricalCutoffV1 as historical,
  createQualifiedPublicationInstantV1 as publication,
  createPublicationCivilDateConstraintV1 as civil,
  comparePublicationCivilDateV1,
  createClockAccuracyV1 as accuracy,
  createLegacyAcquisitionBucketV1 as bucket,
  buildAvailabilityBoundV1 as preciseBound,
  buildLegacyAvailabilityBoundV1 as legacyBound,
  combineAvailabilityBoundsV1 as combine,
  compareAvailabilityAsOfV1 as compare,
  compareAvailabilityStatesV1 as states,
  type TemporalInstantInputV1,
  type EvidenceAvailabilityV1,
  type HistoricalCutoffV1,
  type AcquisitionCompletionV1,
  type AvailabilityBoundV1,
} from "../../events/temporalTrust";

const sourcePath = path.resolve("src/lib/markets/events/temporalTrust.ts");
const source = readFileSync(sourcePath, "utf8");
const T = Date.parse("2026-10-09T12:00:00.000Z");
const ms = (value: number): TemporalInstantInputV1 => ({ unit: "epoch-milliseconds", value });
const iso = (value: string): TemporalInstantInputV1 => ({ unit: "offset-iso", value });
const provenance = "owner-asserted-authenticated" as const;
// Synthetic owner assertion: no real clock, source or receipt is authenticated.
const zeroError = accuracy({ status: "bounded", unit: "milliseconds",
  maximumAbsoluteError: 0, provenance });
const at = (value: number) => availability({ completion: completion(ms(value)), at: ms(value) });
const bound = (value: number, error = 0) => preciseBound({
  availability: at(value), acquisitionProvenance: provenance,
  clockAccuracy: accuracy({ status: "bounded", unit: "milliseconds",
    maximumAbsoluteError: error, provenance }),
});
function noCertification(result: ReturnType<typeof compare>): void {
  assert.equal(result.scope, "temporal-comparison-only");
  assert.equal(result.authentication, "not-performed");
  assert.equal(result.evidenceAdmission, "not-certified");
}

for (const [delta, expected] of [[0, "not-satisfied"], [788, "not-satisfied"],
  [789, "satisfied"], [790, "satisfied"], [1000, "satisfied"]] as const) {
  test("completion .789, cutoff +" + delta + " milliseconds", () => {
    const result = compare({ bound: bound(T + 789), cutoff: evaluation(ms(T + delta)) });
    assert.equal(result.status, expected);
    noCertification(result);
  });
}

test("instants use distinct roles, canonical UTC serialization and immutable closed data", () => {
  const c = completion(iso("2026-10-09T12:00:00.789Z"));
  const a = availability({ completion: c, at: ms(T + 789) });
  const e = evaluation(ms(T + 790));
  const h = historical({ evaluation: e, at: ms(T + 789) });
  const p = publication({ at: ms(T + 789), sourceQualification: "owner-asserted-qualified" });
  assert.deepEqual([c.kind, a.kind, e.kind, h.kind, p.kind],
    ["acquisition-completion", "evidence-availability", "evaluation", "historical-cutoff", "qualified-publication"]);
  for (const value of [c, a, e, h, p]) {
    assert.equal(value.schemaVersion, "temporal-trust-v1");
    assert.equal(value.unit, "epoch-milliseconds");
    assert.equal(value.precision, "millisecond");
    assert.equal(value.iso, new Date(value.epochMilliseconds).toISOString());
    assert.equal(Object.isFrozen(value), true);
    assert.deepEqual(JSON.parse(JSON.stringify(value)), value);
  }
  type Distinct<A, B> = A extends B ? false : true;
  const distinct: [Distinct<AcquisitionCompletionV1, EvidenceAvailabilityV1>,
    Distinct<EvidenceAvailabilityV1, HistoricalCutoffV1>] = [true, true];
  assert.deepEqual(distinct, [true, true]);
});

test("offset equivalents normalize without changing the represented millisecond", () => {
  const utc = evaluation(iso("2026-10-09T12:00:00.789Z"));
  for (const value of ["2026-10-09T14:00:00.789+02:00", "2026-10-09T07:00:00.789-05:00"]) {
    assert.deepEqual(evaluation(iso(value)), utc);
  }
  assert.equal(evaluation(iso("2026-10-09T12:00:00.7Z")).epochMilliseconds, T + 700);
  assert.equal(evaluation(iso("2026-10-09T12:00:00.78Z")).epochMilliseconds, T + 780);
  assert.equal(evaluation(iso("2026-10-09T12:00:00Z")).iso, "2026-10-09T12:00:00.000Z");
});

for (const value of [-1, -0, 0.1, T + 0.5, NaN, Infinity, -Infinity,
  Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER]) {
  test("reject invalid or unsupported millisecond value " + (Object.is(value, -0) ? "-0" : String(value)), () => {
    assert.throws(() => completion(ms(value)));
    assert.throws(() => evaluation(ms(value)));
    assert.throws(() => accuracy({ status: "bounded", unit: "milliseconds",
      maximumAbsoluteError: value, provenance }));
  });
}

test("supported instant endpoints are explicit; arithmetic never clamps or overflows", () => {
  assert.equal(completion(ms(0)).iso, "1970-01-01T00:00:00.000Z");
  assert.equal(evaluation(ms(253_402_300_799_999)).iso, "9999-12-31T23:59:59.999Z");
  assert.throws(() => evaluation(ms(253_402_300_800_000)), RangeError);
  assert.throws(() => bound(253_402_300_799_999, 1), RangeError);
  // The last second's exclusive end is outside the four-digit UTC domain.
  assert.throws(() => bucket({ unit: "epoch-seconds", value: 253_402_300_799,
    acquisitionProvenance: provenance }), RangeError);
});

for (const value of ["2026-02-29T12:00:00Z", "2024-02-30T12:00:00Z",
  "2026-04-31T12:00:00Z", "2026-00-10T12:00:00Z", "2026-10-00T12:00:00Z",
  "2026-10-09T24:00:00Z", "2026-10-09T12:00:60Z", "2026-10-09T12:00:00",
  "2026-10-09", "2026-10-09 12:00:00Z", "2026-10-09T12:00:00.7890Z",
  "2026-10-09T12:00:00+0200", "2026-10-09T12:00:00+24:00",
  "2026-10-09T12:00:00-00:00", "2026-10-09T12:00:00+14:01",
  "2026-10-09T12:00:00-14:01", "1969-12-31T23:59:59.999Z"]) {
  test("strict ISO rejects " + value, () => {
    assert.throws(() => evaluation(iso(value)));
  });
}

test("valid leap day is retained; units cannot be silently substituted", () => {
  assert.equal(evaluation(iso("2024-02-29T12:00:00Z")).iso, "2024-02-29T12:00:00.000Z");
  for (const value of [T, { value: T }, { unit: "epoch-seconds", value: T / 1000 },
    { unit: "epoch-milliseconds", value: String(T) }]) {
    assert.throws(() => evaluation(value as TemporalInstantInputV1), TypeError);
  }
});

test("availability and historical cutoff constructors enforce order including equality", () => {
  const c = completion(ms(T + 789));
  assert.throws(() => availability({ completion: c, at: ms(T + 788) }), RangeError);
  assert.equal(availability({ completion: c, at: ms(T + 789) }).epochMilliseconds, T + 789);
  assert.equal(availability({ completion: c, at: ms(T + 790) }).epochMilliseconds, T + 790);
  const e = evaluation(ms(T + 789));
  assert.throws(() => historical({ evaluation: e, at: ms(T + 790) }), RangeError);
  assert.equal(historical({ evaluation: e, at: ms(T + 789) }).epochMilliseconds, T + 789);
  assert.equal(historical({ evaluation: e, at: ms(T + 788) }).epochMilliseconds, T + 788);
  const h = historical({ evaluation: e, at: ms(T + 789) });
  assert.equal(compare({ bound: bound(T + 789), cutoff: h }).status, "satisfied");
});

test("later evidence availability controls eligibility even when completion is earlier", () => {
  const a = availability({ completion: completion(ms(T)), at: ms(T + 790) });
  const b = preciseBound({ availability: a, acquisitionProvenance: provenance, clockAccuracy: zeroError });
  assert.equal(compare({ bound: b, cutoff: evaluation(ms(T + 789)) }).status, "not-satisfied");
  assert.equal(compare({ bound: b, cutoff: evaluation(ms(T + 790)) }).status, "satisfied");
});

test("legacy acquisition records retain an interval, not recovered milliseconds", () => {
  const b = bucket({ unit: "epoch-seconds", value: T / 1000, acquisitionProvenance: provenance });
  assert.equal(b.precision, "second-bucket");
  assert.equal(b.startMs, T);
  assert.equal(b.endExclusiveMs, T + 1000);
  assert.equal(Object.hasOwn(b, "iso"), false);
  assert.equal(Object.hasOwn(b, "epochMilliseconds"), false);
  const threshold = legacyBound({ bucket: b, clockAccuracy: zeroError });
  for (const delta of [0, 788, 789, 790, 999]) {
    assert.equal(compare({ bound: threshold, cutoff: evaluation(ms(T + delta)) }).status, "not-satisfied");
  }
  assert.equal(compare({ bound: threshold, cutoff: evaluation(ms(T + 1000)) }).status, "satisfied");
  assert.equal(compare({ bound: threshold, cutoff: evaluation(ms(T - 1)) }).status, "not-satisfied");
});

test("legacy units, seconds, arithmetic and provenance are validated", () => {
  for (const value of [-1, -0, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => bucket({ unit: "epoch-seconds", value, acquisitionProvenance: provenance }));
  }
  const b = bucket({ unit: "epoch-seconds", value: T / 1000, acquisitionProvenance: provenance });
  assert.throws(() => bucket({ unit: "epoch-seconds", value: T / 1000 } as Parameters<typeof bucket>[0]));
  assert.throws(() => legacyBound({ bucket: { ...b, endExclusiveMs: T } as typeof b, clockAccuracy: zeroError }));
  assert.throws(() => legacyBound({ bucket: { ...b, startMs: T + 789 } as typeof b, clockAccuracy: zeroError }));
  const unknown = bucket({ unit: "epoch-seconds", value: T / 1000, acquisitionProvenance: "unavailable" });
  const result = legacyBound({ bucket: unknown, clockAccuracy: zeroError });
  assert.equal(result.status, "unavailable");
  assert.equal(compare({ bound: result, cutoff: evaluation(ms(T + 1000)) }).status, "unavailable");
});

test("unknown clock uncertainty never becomes a fabricated zero-error bound", () => {
  const b = preciseBound({ availability: at(T), acquisitionProvenance: provenance,
    clockAccuracy: accuracy({ status: "unknown" }) });
  assert.deepEqual(b, { schemaVersion: "temporal-trust-v1", kind: "availability-bound",
    unit: "epoch-milliseconds", authentication: "not-performed",
    status: "unavailable", reason: "clock-uncertainty-unavailable" });
  assert.equal(compare({ bound: b, cutoff: evaluation(ms(T + 1000)) }).status, "unavailable");
  assert.throws(() => accuracy({ status: "bounded", unit: "milliseconds", provenance } as Parameters<typeof accuracy>[0]));
});

test("owner-asserted bounded error delays precise and legacy eligibility conservatively", () => {
  const error = accuracy({ status: "bounded", unit: "milliseconds", maximumAbsoluteError: 25, provenance });
  const precise = preciseBound({ availability: at(T + 789), acquisitionProvenance: provenance, clockAccuracy: error });
  assert.equal(precise.status, "bounded");
  if (precise.status !== "bounded") throw new Error("Expected synthetic arithmetic bound.");
  assert.equal(precise.notBeforeEpochMilliseconds, T + 814);
  assert.equal(compare({ bound: precise, cutoff: evaluation(ms(T + 813)) }).status, "not-satisfied");
  assert.equal(compare({ bound: precise, cutoff: evaluation(ms(T + 814)) }).status, "satisfied");
  const legacy = legacyBound({ bucket: bucket({ unit: "epoch-seconds", value: T / 1000,
    acquisitionProvenance: provenance }), clockAccuracy: error });
  assert.equal(compare({ bound: legacy, cutoff: evaluation(ms(T + 1000)) }).status, "not-satisfied");
  assert.equal(compare({ bound: legacy, cutoff: evaluation(ms(T + 1025)) }).status, "satisfied");
});

test("provenance labels never authenticate clocks, records or evidence admission", () => {
  const assertionsOnly = compare({ bound: bound(T), cutoff: evaluation(ms(T)) });
  assert.equal(assertionsOnly.status, "satisfied");
  noCertification(assertionsOnly);
  for (const [acquisitionProvenance, clockProvenance, expected] of [
    ["unavailable", provenance, "acquisition-provenance-unavailable"],
    [provenance, "unavailable", "clock-provenance-unavailable"],
  ] as const) {
    const result = preciseBound({ availability: at(T), acquisitionProvenance,
      clockAccuracy: accuracy({ status: "bounded", unit: "milliseconds",
        maximumAbsoluteError: 0, provenance: clockProvenance }) });
    assert.equal(result.status, "unavailable");
    if (result.status !== "unavailable") throw new Error("Expected missing prerequisite.");
    assert.equal(result.reason, expected);
    assert.equal(compare({ bound: result, cutoff: evaluation(ms(T + 1000)) }).status, "unavailable");
  }
  assert.throws(() => preciseBound({ availability: at(T), acquisitionProvenance: "trusted" as typeof provenance,
    clockAccuracy: zeroError }));
});

test("civil publication constraints preserve unknown timezone and do not create release instants", () => {
  const c = civil({ date: "2026-10-09", utcOffsetMinutes: null });
  assert.equal(c.precision, "civil-date");
  assert.equal(Object.hasOwn(c, "iso"), false);
  assert.equal(Object.hasOwn(c, "epochMilliseconds"), false);
  const result = comparePublicationCivilDateV1({ constraint: c, instant: evaluation(ms(T)) });
  assert.equal(result.status, "unavailable");
  noCertification(result);
  const midnightJapan = Date.parse("2026-10-08T15:00:00Z");
  const qualified = civil({ date: "2026-10-09", utcOffsetMinutes: 540 });
  assert.equal(comparePublicationCivilDateV1({ constraint: qualified,
    instant: completion(ms(midnightJapan - 1)) }).status, "not-satisfied");
  const equal = comparePublicationCivilDateV1({ constraint: qualified, instant: completion(ms(midnightJapan)) });
  assert.equal(equal.status, "satisfied");
  noCertification(equal);
  assert.equal(qualified.date, "2026-10-09");
});

test("civil date/offset and publication qualification reject unsupported inputs", () => {
  for (const date of ["2026-02-29", "2026-04-31", "2026-10-09T00:00:00Z"]) {
    assert.throws(() => civil({ date, utcOffsetMinutes: null }));
  }
  for (const offset of [NaN, Infinity, -0, 0.1, 841, -841]) {
    assert.throws(() => civil({ date: "2026-10-09", utcOffsetMinutes: offset }));
  }
  assert.throws(() => civil({ date: "2026-10-09" } as Parameters<typeof civil>[0]));
  assert.throws(() => publication({ at: ms(T), sourceQualification: "unavailable" as "owner-asserted-qualified" }));
});

test("composite bounds wait for every independent required component", () => {
  const required = [bound(T + 100), bound(T + 789), bound(T + 788, 25)];
  const result = combine({ required });
  assert.equal(result.status, "bounded");
  if (result.status !== "bounded") throw new Error("Expected synthetic composite.");
  assert.equal(result.notBeforeEpochMilliseconds, T + 813);
  assert.equal(compare({ bound: result, cutoff: evaluation(ms(T + 812)) }).status, "not-satisfied");
  assert.equal(compare({ bound: result, cutoff: evaluation(ms(T + 813)) }).status, "satisfied");
  assert.deepEqual(combine({ required: [...required].reverse() }), result);
  assert.deepEqual(combine({ required: [result, ...required] }), result);
  const legacy = legacyBound({ bucket: bucket({ unit: "epoch-seconds", value: T / 1000,
    acquisitionProvenance: provenance }), clockAccuracy: zeroError });
  assert.equal(compare({ bound: combine({ required: [bound(T + 789), legacy] }),
    cutoff: evaluation(ms(T + 999)) }).status, "not-satisfied");
});

test("missing components, empty sets and invalid later components fail closed", () => {
  const unknown = preciseBound({ availability: at(T), acquisitionProvenance: provenance,
    clockAccuracy: accuracy({ status: "unknown" }) });
  const b = combine({ required: [bound(T), unknown] });
  assert.equal(b.status, "unavailable");
  assert.equal(compare({ bound: b, cutoff: evaluation(ms(T + 1000)) }).status, "unavailable");
  assert.throws(() => combine({ required: [] }));
  assert.throws(() => combine({ required: [unknown, {} as AvailabilityBoundV1] }));
  assert.throws(() => combine({ required: new Array<AvailabilityBoundV1>(1) }));
});

test("equal instants preserve state conflicts instead of inventing an order", () => {
  const left = { at: at(T + 789), stateKey: "state-a" };
  assert.equal(states({ left, right: left }).order, "same-instant-same-state");
  assert.equal(states({ left, right: { ...left, stateKey: "state-b" } }).order, "same-instant-conflict");
  assert.equal(states({ left, right: { at: at(T + 790), stateKey: "state-b" } }).order, "earlier");
  assert.equal(states({ left, right: { at: at(T + 788), stateKey: "state-b" } }).order, "later");
  assert.equal(states({ left, right: left }).authentication, "not-performed");
  assert.throws(() => states({ left, right: { ...left, stateKey: " " } }));
});

test("closed representations reject field injection, wrong roles and inconsistent serialization", () => {
  const e = evaluation(ms(T));
  const b = bound(T);
  for (const extra of ["receipt", "digest", "trusted", "predecessor", "authentication"]) {
    assert.throws(() => evaluation({ ...ms(T), [extra]: true } as TemporalInstantInputV1));
    assert.throws(() => compare({ bound: b, cutoff: e, [extra]: true } as Parameters<typeof compare>[0]));
  }
  assert.throws(() => compare({ bound: { ...b, authentication: "verified" } as unknown as AvailabilityBoundV1, cutoff: e }));
  assert.throws(() => compare({ bound: b, cutoff: { ...e, iso: "2026-10-09T12:00:00.789Z" } }));
  assert.throws(() => compare({ bound: b, cutoff: completion(ms(T)) as unknown as HistoricalCutoffV1 }));
  assert.throws(() => preciseBound({ availability: e as unknown as EvidenceAvailabilityV1,
    acquisitionProvenance: provenance, clockAccuracy: zeroError }));
  assert.throws(() => evaluation({ ...ms(T), schemaVersion: "v2" } as unknown as TemporalInstantInputV1));
});

test("accessors are rejected without reading their values; inputs are not retained", () => {
  let calls = 0;
  const input = { unit: "epoch-milliseconds", get value() { calls++; return T; } };
  assert.throws(() => evaluation(input as TemporalInstantInputV1));
  assert.equal(calls, 0);
  const mutable = { unit: "epoch-milliseconds", value: T };
  const output = evaluation(mutable as TemporalInstantInputV1);
  mutable.value = T + 1000;
  assert.equal(output.epochMilliseconds, T);
});

test("arithmetic does not sample clocks or invoke external services", () => {
  const originalNow = Date.now;
  const originalFetch = globalThis.fetch;
  const forbidden = () => { throw new Error("Unexpected external effect."); };
  try {
    Date.now = forbidden;
    globalThis.fetch = forbidden;
    assert.equal(compare({ bound: bound(T), cutoff: evaluation(ms(T)) }).status, "satisfied");
    assert.equal(combine({ required: [bound(T), bound(T + 1)] }).status, "bounded");
    assert.equal(comparePublicationCivilDateV1({
      constraint: civil({ date: "2026-10-09", utcOffsetMinutes: null }),
      instant: completion(ms(T)),
    }).status, "unavailable");
  } finally {
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
  }
  const ast = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const imports = ast.statements.filter(ts.isImportDeclaration);
  assert.deepEqual(imports.map(node => (node.moduleSpecifier as ts.StringLiteral).text), ["node:util", "./eventClock"]);
  function walk(node: ts.Node): void {
    if (ts.isPropertyAccessExpression(node)) {
      assert.ok(!["Date.now", "performance.now", "process.env"].includes(node.getText(ast)));
    }
    if (ts.isNewExpression(node) && node.expression.getText(ast) === "Date") {
      assert.equal(node.arguments?.length, 1);
    }
    ts.forEachChild(node, walk);
  }
  walk(ast);
  assert.equal(Object.keys(contract).some(key => /receipt|issuer|predecessor/i.test(key)), false);
});

test("serialized ordering bounds are revalidated without authenticating their origin", () => {
  const original = at(T + 789);
  const malformed = { ...original, epochMilliseconds: T + 788, iso: new Date(T + 788).toISOString() };
  assert.throws(() => preciseBound({ availability: malformed,
    acquisitionProvenance: provenance, clockAccuracy: zeroError }), RangeError);
  const cutoff = historical({ evaluation: evaluation(ms(T + 789)), at: ms(T + 789) });
  const future = { ...cutoff, epochMilliseconds: T + 790, iso: new Date(T + 790).toISOString() };
  assert.throws(() => compare({ bound: bound(T), cutoff: future }), RangeError);
  const description = JSON.parse(JSON.stringify(original)) as EvidenceAvailabilityV1;
  const b = preciseBound({ availability: description,
    acquisitionProvenance: provenance, clockAccuracy: zeroError });
  noCertification(compare({ bound: b, cutoff: evaluation(ms(T + 789)) }));
});

test("qualified publication comparisons preserve exact equality and future exclusion", () => {
  const p = publication({ at: ms(T + 789), sourceQualification: "owner-asserted-qualified" });
  for (const [delta, expected] of [[788, "not-satisfied"], [789, "satisfied"], [790, "satisfied"]] as const) {
    const result = contract.compareQualifiedPublicationAsOfV1({ publication: p, at: completion(ms(T + delta)) });
    assert.equal(result.status, expected);
    noCertification(result);
  }
});



const unknownBound = () => preciseBound({ availability: at(T), acquisitionProvenance: provenance,
  clockAccuracy: accuracy({ status: "unknown" }) });

for (const frozen of [false, true]) {
  for (const omitted of ["late", "unavailable"] as const) {
    test("reject " + (frozen ? "frozen " : "mutable ") + "iterator hiding " + omitted + " component", () => {
      const early = bound(T + 100);
      const required = [early, omitted === "late" ? bound(T + 789, 25) : unknownBound()];
      let calls = 0;
      Object.defineProperty(required, Symbol.iterator, { value: function* () { calls++; yield early; } });
      if (frozen) Object.freeze(required);
      assert.throws(() => combine({ required }), TypeError);
      assert.equal(calls, 0);
    });
  }
  test("reject " + (frozen ? "frozen " : "mutable ") + "component and iterator getters without invoking them", () => {
    for (const field of ["0", Symbol.iterator]) {
      const required = [bound(T + 100), bound(T + 789, 25)];
      let calls = 0;
      Object.defineProperty(required, field, { get() { calls++; return bound(T); }, enumerable: true });
      if (frozen) Object.freeze(required);
      assert.throws(() => combine({ required }), TypeError);
      assert.equal(calls, 0);
    }
  });
}

test("composite accepts dense ordinary arrays through the documented maximum and detaches inputs", () => {
  const early = bound(T + 100);
  const late = bound(T + 789, 25);
  for (const required of [[early, late], Object.freeze([early, late]), Object.seal([early, late]),
    Array<AvailabilityBoundV1>(1024).fill(late)]) {
    const result = combine({ required });
    assert.equal(compare({ bound: result, cutoff: evaluation(ms(T + 813)) }).status, "not-satisfied");
    const equal = compare({ bound: result, cutoff: evaluation(ms(T + 814)) });
    assert.equal(equal.status, "satisfied");
    noCertification(equal);
    assert.equal(Object.isFrozen(result), true);
  }
  const mutable = { ...late };
  const required = [early, mutable];
  const result = combine({ required });
  if (mutable.status !== "bounded") throw new Error("Expected bounded fixture.");
  mutable.notBeforeEpochMilliseconds = T;
  required[1] = early;
  assert.equal(compare({ bound: result, cutoff: evaluation(ms(T + 813)) }).status, "not-satisfied");
  assert.throws(() => combine({ required: Array<AvailabilityBoundV1>(1025).fill(early) }), RangeError);
  assert.throws(() => combine({ required: new Array<AvailabilityBoundV1>(0xffffffff) }), RangeError);
});

test("composite rejects sparse, inherited, exotic and noncanonical collections", () => {
  const early = bound(T);
  const sparse = new Array<AvailabilityBoundV1>(2);
  sparse[0] = early;
  let inheritedCalls = 0;
  const inherited = Object.create(Array.prototype);
  Object.defineProperty(inherited, "1", { get() { inheritedCalls++; return early; } });
  const inheritedArray = Object.setPrototypeOf([early, ,], inherited);
  class Bounds extends Array<AvailabilityBoundV1> {}
  const extra = [early];
  Object.defineProperty(extra, "extra", { value: true });
  const symbol = [early];
  Object.defineProperty(symbol, Symbol("metadata"), { value: true });
  const hidden = [early];
  Object.defineProperty(hidden, "0", { value: early, enumerable: false });
  for (const required of [sparse, inheritedArray, new Bounds(early), extra, symbol, hidden,
    Object.setPrototypeOf([early], null), { 0: early, length: 1 }, new Uint8Array([1])]) {
    assert.throws(() => combine({ required: required as readonly AvailabilityBoundV1[] }), TypeError);
  }
  assert.equal(inheritedCalls, 0);
});

test("unavailable components do not short-circuit validation of later descriptors or values", () => {
  for (const required of [[unknownBound(), {} as AvailabilityBoundV1],
    [unknownBound(), { ...bound(T), authentication: "verified" } as unknown as AvailabilityBoundV1]]) {
    assert.throws(() => combine({ required }), TypeError);
  }
  let calls = 0;
  const required = [unknownBound(), bound(T)];
  Object.defineProperty(required, "1", { get() { calls++; return bound(T); }, enumerable: true });
  assert.throws(() => combine({ required }), TypeError);
  assert.equal(calls, 0);
  for (const ordinary of [[bound(T), unknownBound()], [unknownBound(), bound(T)],
    Object.freeze([bound(T + 789, 25), unknownBound()])]) {
    const result = compare({ bound: combine({ required: ordinary }), cutoff: evaluation(ms(T + 1000)) });
    assert.equal(result.status, "unavailable");
    noCertification(result);
  }
});

test("active and revoked proxies at every composite boundary are rejected before traps", () => {
  let traps = 0;
  const handler: ProxyHandler<object> = {
    get(target, key, receiver) { traps++; return Reflect.get(target, key, receiver); },
    getPrototypeOf(target) { traps++; return Reflect.getPrototypeOf(target); },
    ownKeys(target) { traps++; return Reflect.ownKeys(target); },
    getOwnPropertyDescriptor(target, key) { traps++; return Reflect.getOwnPropertyDescriptor(target, key); },
  };
  for (const revoked of [false, true]) {
    const wrap = <V extends object>(value: V): V => {
      const pair = Proxy.revocable<V>(value, handler);
      if (revoked) pair.revoke();
      return pair.proxy;
    };
    assert.throws(() => combine(wrap({ required: [bound(T)] })), TypeError);
    assert.throws(() => combine({ required: wrap([bound(T), bound(T + 789, 25)]) }), TypeError);
    assert.throws(() => combine({ required: [unknownBound(), wrap(bound(T))] }), TypeError);
    assert.throws(() => evaluation(wrap(ms(T))), TypeError);
    assert.throws(() => accuracy(wrap({ status: "unknown" as const })), TypeError);
  }
  assert.equal(traps, 0);
});

test("prototype iterator tampering and inherited numeric getters cannot hide components", () => {
  const result = runProbe(source, [
    "const saved=Object.getOwnPropertyDescriptor(Array.prototype,Symbol.iterator);",
    "const required=[bound(T),bound(T+789,25)];let calls=0;let rejected=false;",
    "try {",
    "Object.defineProperty(Array.prototype,Symbol.iterator,{get(){calls++;return saved.value;},configurable:true});",
    "try{c.combineAvailabilityBoundsV1({required});}catch(e){rejected=e instanceof TypeError;}",
    "}finally{Object.defineProperty(Array.prototype,Symbol.iterator,saved);}",
    "assert.equal(rejected,true);assert.equal(calls,0);rejected=false;",
    "try {",
    "Object.defineProperty(Array.prototype,Symbol.iterator,{value:function*(){calls++;yield required[0];},configurable:true});",
    "try{c.combineAvailabilityBoundsV1({required});}catch(e){rejected=e instanceof TypeError;}",
    "}finally{Object.defineProperty(Array.prototype,Symbol.iterator,saved);}",
    "assert.equal(rejected,true);assert.equal(calls,0);",
    "const numeric=Object.getOwnPropertyDescriptor(Array.prototype,'1');",
    "const sparse=[bound(T),,];let sparseRejected=false;let result;",
    "try {",
    "Object.defineProperty(Array.prototype,'1',{get(){calls++;return required[0];},configurable:true});",
    "result=c.combineAvailabilityBoundsV1({required});",
    "try{c.combineAvailabilityBoundsV1({required:sparse});}catch(e){sparseRejected=e instanceof TypeError;}",
    "}finally{if(numeric)Object.defineProperty(Array.prototype,'1',numeric);else delete Array.prototype[1];}",
    "assert.equal(result.notBeforeEpochMilliseconds,T+814);assert.equal(sparseRejected,true);assert.equal(calls,0);",
  ].join("\n"));
  assert.equal(result.status, 0, result.stderr);
});

for (const offset of [-840, -540, 0, 540, 840]) {
  test("epoch-zero civil constraint with explicit offset " + offset, () => {
    const constraint = civil({ date: "1970-01-01", utcOffsetMinutes: offset });
    const start = -offset * 60_000;
    for (const instant of [0, Math.max(0, start - 1), Math.max(0, start), Math.max(0, start + 1),
      start + 86_400_000 - 1, start + 86_400_000]) {
      const result = comparePublicationCivilDateV1({ constraint, instant: evaluation(ms(instant)) });
      assert.equal(result.status, instant >= start ? "satisfied" : "not-satisfied");
      noCertification(result);
      assert.equal(evaluation(ms(instant)).iso, new Date(instant).toISOString());
    }
  });
}

test("civil day starts are inclusive and ends retain the documented lower-bound semantics", () => {
  for (const offset of [-840, 840]) {
    const constraint = civil({ date: "1970-01-02", utcOffsetMinutes: offset });
    const start = 86_400_000 - offset * 60_000;
    for (const delta of [-1, 0, 1, 86_400_000 - 1, 86_400_000, 86_400_000 + 1]) {
      const result = comparePublicationCivilDateV1({ constraint, instant: evaluation(ms(start + delta)) });
      assert.equal(result.status, delta < 0 ? "not-satisfied" : "satisfied");
      noCertification(result);
    }
  }
  const unavailable = comparePublicationCivilDateV1({ constraint: civil({ date: "1970-01-01", utcOffsetMinutes: null }),
    instant: evaluation(ms(0)) });
  assert.equal(unavailable.status, "unavailable");
  noCertification(unavailable);
  assert.throws(() => completion(ms(-1)), TypeError);
  assert.throws(() => evaluation(ms(-1)), TypeError);
});

// Private arithmetic is exposed only in a child process's in-memory compilation.
// The public module gains no test exports or signed acquisition/evaluation inputs.
const arithmeticHooks = "\nexports.testSigned=signedMilliseconds;exports.testInterval=civilDayInterval;";
test("internal civil arithmetic retains signed safe endpoints and rejects overflow", () => {
  const result = runProbe(source + arithmeticHooks, [
    "const MIN=Number.MIN_SAFE_INTEGER,MAX=Number.MAX_SAFE_INTEGER,DAY=86400000;",
    "for(const value of [MIN,-DAY,-1,0,1,MAX])assert.equal(c.testSigned(value),value);",
    "for(const value of [MIN-1,MAX+1,NaN,Infinity,-Infinity,0.1,'0'])assert.throws(()=>c.testSigned(value),TypeError);",
    "for(const offset of [-840,-540,0,540,840]) {",
    "const value=c.testInterval(0,offset);",
    "assert.deepEqual(value,{startMs:0-offset*60000,endExclusiveMs:0-offset*60000+DAY});",
    "assert.equal(Object.isFrozen(value),true);",
    "}",
    "assert.deepEqual(c.testInterval(MIN,0),{startMs:MIN,endExclusiveMs:MIN+DAY});",
    "assert.deepEqual(c.testInterval(MAX-DAY,0),{startMs:MAX-DAY,endExclusiveMs:MAX});",
    "assert.throws(()=>c.testInterval(MAX-DAY+1,0),TypeError);",
    "assert.throws(()=>c.testInterval(MIN,1),TypeError);",
    "assert.throws(()=>c.testInterval(MAX,-1),TypeError);",
    "assert.throws(()=>c.testInterval(0,MAX),TypeError);",
  ].join("\n"));
  assert.equal(result.status, 0, result.stderr);
});

// Mutate only a child process's compiled source. The repository file is never edited.
// Each independent probe asserts a semantic result (or rejection), not error wording.
const probeSetup = [
  "const c=require(" + JSON.stringify(sourcePath) + ");",
  "const T=Date.parse('2026-10-09T12:00:00Z');",
  "const ms=value=>({unit:'epoch-milliseconds',value});",
  "const p='owner-asserted-authenticated';",
  "const acc=e=>c.createClockAccuracyV1({status:'bounded',unit:'milliseconds',maximumAbsoluteError:e,provenance:p});",
  "const at=t=>c.createEvidenceAvailabilityV1({completion:c.createAcquisitionCompletionV1(ms(t)),at:ms(t)});",
  "const bound=(t,e=0)=>c.buildAvailabilityBoundV1({availability:at(t),acquisitionProvenance:p,clockAccuracy:acc(e)});",
  "const compare=(b,t)=>c.compareAvailabilityAsOfV1({bound:b,cutoff:c.createEvaluationInstantV1(ms(t))}).status;",
].join("\n");
const mutationControls: readonly { name: string; from: string; to: string; probe: string; hooks?: boolean }[] = [
  { name: "caller iterator omission", from: "const bounds = snapshotRequiredBounds(data.required);",
    to: "const bounds = Array.from(data.required as readonly unknown[], readBound);", probe: "const early=bound(T+100),required=[early,bound(T+789,25)];Object.defineProperty(required,Symbol.iterator,{value:function*(){yield early;}});Object.freeze(required);assert.throws(()=>c.combineAvailabilityBoundsV1({required}),TypeError);" },
  { name: "indexed accessor rejection without invocation", from: "const bounds = snapshotRequiredBounds(data.required);",
    to: "const bounds = Array.from(data.required as readonly unknown[], readBound);", probe: "let calls=0;const required=[bound(T),bound(T+789,25)];Object.defineProperty(required,'1',{get(){calls++;return bound(T);},enumerable:true});Object.freeze(required);assert.throws(()=>c.combineAvailabilityBoundsV1({required}),TypeError);assert.equal(calls,0);" },
  { name: "proxy collection rejection", from: "if (isProxy(value) || !Array.isArray(value) ||",
    to: "if (!Array.isArray(value) ||", probe: "const required=new Proxy([bound(T),bound(T+789,25)],{});assert.throws(()=>c.combineAvailabilityBoundsV1({required}),TypeError);" },
  { name: "root proxy rejection before traps", from: "if (isProxy(value) || typeof value !== \"object\" || value === null || Array.isArray(value))",
    to: "if (typeof value !== \"object\" || value === null || Array.isArray(value))", probe: "let traps=0;const input=new Proxy({required:[bound(T)]},{getPrototypeOf(t){traps++;return Reflect.getPrototypeOf(t);}});assert.throws(()=>c.combineAvailabilityBoundsV1(input),TypeError);assert.equal(traps,0);" },
  { name: "variant proxy rejection before descriptor traps", from: "if (isProxy(value) || typeof value !== \"object\" || value === null) throw",
    to: "if (typeof value !== \"object\" || value === null) throw", probe: "let traps=0;const b=new Proxy(bound(T),{getOwnPropertyDescriptor(t,k){traps++;return Reflect.getOwnPropertyDescriptor(t,k);}});assert.throws(()=>c.combineAvailabilityBoundsV1({required:[b]}),TypeError);assert.equal(traps,0);" },
  { name: "declared component count limit", from: "length > MAX_REQUIRED_COMPONENTS",
    to: "false", probe: "assert.throws(()=>c.combineAvailabilityBoundsV1({required:Array(1025).fill(bound(T))}),RangeError);" },
  { name: "validation after unavailable component", from: "const bound = readBound(descriptor.value);",
    to: "if (index > 0 && snapshot[0].status === \"unavailable\") break;\n    const bound = readBound(descriptor.value);", probe: "const u=c.buildAvailabilityBoundV1({availability:at(T),acquisitionProvenance:p,clockAccuracy:c.createClockAccuracyV1({status:'unknown'})});assert.throws(()=>c.combineAvailabilityBoundsV1({required:[u,{}]}),TypeError);" },
  { name: "signed civil interval start", from: "signedMilliseconds(midnight - offsetMs)",
    to: "milliseconds(midnight - offsetMs)", probe: "assert.doesNotThrow(()=>{const constraint=c.createPublicationCivilDateConstraintV1({date:'1970-01-01',utcOffsetMinutes:540});const result=c.comparePublicationCivilDateV1({constraint,instant:c.createEvaluationInstantV1(ms(0))});assert.equal(result.status,'satisfied');assert.equal(result.evidenceAdmission,'not-certified');});" },
  { name: "civil UTC offset direction", from: "signedMilliseconds(midnight - offsetMs)",
    to: "signedMilliseconds(midnight + offsetMs)", probe: "const constraint=c.createPublicationCivilDateConstraintV1({date:'1970-01-01',utcOffsetMinutes:540});assert.equal(c.comparePublicationCivilDateV1({constraint,instant:c.createEvaluationInstantV1(ms(0))}).status,'satisfied');" },
  { name: "civil start equality", from: "at.epochMilliseconds >= interval.startMs",
    to: "at.epochMilliseconds > interval.startMs", probe: "const constraint=c.createPublicationCivilDateConstraintV1({date:'1970-01-01',utcOffsetMinutes:-540});assert.equal(c.comparePublicationCivilDateV1({constraint,instant:c.createEvaluationInstantV1(ms(32400000))}).status,'satisfied');" },
  { name: "signed safe-integer precision", from: "typeof value !== \"number\" || !Number.isSafeInteger(value))",
    to: "typeof value !== \"number\" || !Number.isInteger(value))", probe: "assert.throws(()=>c.testSigned(Number.MAX_SAFE_INTEGER+1),TypeError);", hooks: true },
  { name: "civil exclusive end arithmetic", from: "signedMilliseconds(startMs + DAY_MS)",
    to: "signedMilliseconds(startMs + DAY_MS - 1)", probe: "assert.equal(c.testInterval(0,540).endExclusiveMs,54000000);", hooks: true },
  { name: "civil end overflow rejection", from: "signedMilliseconds(startMs + DAY_MS)",
    to: "startMs + DAY_MS", probe: "assert.throws(()=>c.testInterval(Number.MAX_SAFE_INTEGER-86400000+1,0),TypeError);", hooks: true },
  { name: "serialized availability ordering", from: "completed > rebuilt.epochMilliseconds", to: "false",
    probe: "const a=at(T+789);assert.throws(()=>c.buildAvailabilityBoundV1({availability:{...a,epochMilliseconds:T+788,iso:new Date(T+788).toISOString()},acquisitionProvenance:p,clockAccuracy:acc(0)}),RangeError);" },
  { name: "serialized historical ordering", from: "rebuilt.epochMilliseconds > evaluated", to: "false",
    probe: "const h=c.createHistoricalCutoffV1({evaluation:c.createEvaluationInstantV1(ms(T+789)),at:ms(T+789)});assert.throws(()=>c.compareAvailabilityAsOfV1({bound:bound(T),cutoff:{...h,epochMilliseconds:T+790,iso:new Date(T+790).toISOString()}}),RangeError);" },
  { name: "qualified publication equality", from: "published.epochMilliseconds <= at.epochMilliseconds", to: "published.epochMilliseconds < at.epochMilliseconds",
    probe: "const pub=c.createQualifiedPublicationInstantV1({at:ms(T+789),sourceQualification:\'owner-asserted-qualified\'});assert.equal(c.compareQualifiedPublicationAsOfV1({publication:pub,at:c.createEvaluationInstantV1(ms(T+789))}).status,\'satisfied\');" },
  { name: "availability order", from: "availability.epochMilliseconds < completion.epochMilliseconds",
    to: "false", probe: "assert.throws(()=>c.createEvidenceAvailabilityV1({completion:c.createAcquisitionCompletionV1(ms(T+789)),at:ms(T+788)}),RangeError);" },
  { name: "historical cutoff order", from: "cutoff.epochMilliseconds > evaluation.epochMilliseconds",
    to: "false", probe: "assert.throws(()=>c.createHistoricalCutoffV1({evaluation:c.createEvaluationInstantV1(ms(T+789)),at:ms(T+790)}),RangeError);" },
  { name: "inclusive equality", from: "bound.notBeforeEpochMilliseconds <= cutoff.epochMilliseconds",
    to: "bound.notBeforeEpochMilliseconds < cutoff.epochMilliseconds",
    probe: "assert.equal(compare(bound(T+789),T+789),'satisfied');" },
  { name: "no early admission", from: "bound.notBeforeEpochMilliseconds <= cutoff.epochMilliseconds",
    to: "Math.floor(bound.notBeforeEpochMilliseconds/1000) <= Math.floor(cutoff.epochMilliseconds/1000)",
    probe: "assert.equal(compare(bound(T+789),T+788),'not-satisfied');" },
  { name: "legacy exclusive end", from: "freezeBound(bucket.endExclusiveMs + error)",
    to: "freezeBound(bucket.startMs + error)",
    probe: "const b=c.buildLegacyAvailabilityBoundV1({bucket:c.createLegacyAcquisitionBucketV1({unit:'epoch-seconds',value:T/1000,acquisitionProvenance:p}),clockAccuracy:acc(0)});assert.equal(compare(b,T+999),'not-satisfied');" },
  { name: "clock uncertainty", from: "freezeBound(at.epochMilliseconds + accuracy.maximumAbsoluteError)",
    to: "freezeBound(at.epochMilliseconds)",
    probe: "assert.equal(compare(bound(T+789,25),T+813),'not-satisfied');" },
  { name: "latest required component", from: "Math.max(latest, bound.notBeforeEpochMilliseconds)", to: "Math.min(latest, bound.notBeforeEpochMilliseconds)",
    probe: "assert.equal(compare(c.combineAvailabilityBoundsV1({required:[bound(T+100),bound(T+789)]}),T+788),'not-satisfied');" },
  { name: "equal-instant conflict", from: '"same-instant-same-state" : "same-instant-conflict"',
    to: '"same-instant-same-state" : "same-instant-same-state"',
    probe: "assert.equal(c.compareAvailabilityStatesV1({left:{at:at(T),stateKey:'a'},right:{at:at(T),stateKey:'b'}}).order,'same-instant-conflict');" },
  { name: "unknown clock uncertainty", from: 'if (accuracy.status === "unknown") return "clock-uncertainty-unavailable";',
    to: 'if (accuracy.status === "unknown") return null;',
    probe: "assert.doesNotThrow(()=>{const b=c.buildAvailabilityBoundV1({availability:at(T),acquisitionProvenance:p,clockAccuracy:c.createClockAccuracyV1({status:'unknown'})});assert.equal(compare(b,T+1000),'unavailable');});" },
  { name: "missing composite component", from: 'if (hasUnavailable)',
    to: "if (false)", probe: "assert.doesNotThrow(()=>{const u=c.buildAvailabilityBoundV1({availability:at(T),acquisitionProvenance:p,clockAccuracy:c.createClockAccuracyV1({status:'unknown'})});assert.equal(compare(c.combineAvailabilityBoundsV1({required:[bound(T),u]}),T+1000),'unavailable');});" },
];
function runProbe(text: string, probe: string) {
  const script = [
    "const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');",
    "const sourcePath=" + JSON.stringify(sourcePath) + ";",
    "require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(f===sourcePath ? " +
      JSON.stringify(text) + " : fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,f);",
    probeSetup, probe,
  ].join("\n");
  return spawnSync(process.execPath, [], { cwd: process.cwd(), input: script,
    encoding: "utf8", timeout: 20_000 });
}
for (const mutation of mutationControls) {
  test("negative control detects removal of " + mutation.name, () => {
    assert.equal(source.split(mutation.from).length - 1, 1, "Mutation target must be unique.");
    const instrumented = source + (mutation.hooks ? arithmeticHooks : "");
    const original = runProbe(instrumented, mutation.probe);
    assert.equal(original.status, 0, original.stderr);
    const mutated = runProbe(instrumented.replace(mutation.from, mutation.to), mutation.probe);
    assert.equal(mutated.error, undefined);
    assert.notEqual(mutated.status, 0);
    assert.match(mutated.stderr, /AssertionError/);
    assert.doesNotMatch(mutated.stderr, /SyntaxError|Cannot find module/);
  });
}
