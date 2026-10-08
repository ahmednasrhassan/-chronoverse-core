import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import * as contract from "../../events/officialPolicyPredecessorProof";
import {
  buildUnavailableOfficialPolicyPredecessorProofV1 as build,
  OFFICIAL_POLICY_PREDECESSOR_PROOF_SCHEMA_VERSION_V1 as version,
  type OfficialPolicyPredecessorProofInputV1 as Input,
  type OfficialPolicyPredecessorUnavailableReasonV1 as Reason,
  type TrustedOfficialPolicyPredecessorProofCapabilityV1 as Capability,
} from "../../events/officialPolicyPredecessorProof";

// Synthetic request identities; these fixtures assert no real decision occurrence.
const requests = [
  { provider: "ecb", requestedCurrentDecision: { kind: "ecb-event", canonicalEventId: "ECB:ecb-monetary-policy-decision:2026-10-04" } },
  { provider: "federal-reserve", requestedCurrentDecision: { kind: "policy-series", canonicalSeriesId: "us-fomc-policy-decision:2026-10-04" } },
  { provider: "boj", requestedCurrentDecision: { kind: "policy-series", canonicalSeriesId: "japan-boj-policy-decision:2026-10-04" } },
  { provider: "boe", requestedCurrentDecision: { kind: "policy-series", canonicalSeriesId: "uk-boe-bank-rate-decision:2026-10-04" } },
  { provider: "snb", requestedCurrentDecision: { kind: "policy-series", canonicalSeriesId: "switzerland-snb-policy-decision:2026-10-04" } },
] as const;
const institutions = ["ECB", "Board of Governors of the Federal Reserve System / FOMC", "Bank of Japan", "Bank of England", "Swiss National Bank"];
const reasons: readonly Reason[] = [
  "INSUFFICIENT_EVIDENCE", "AMBIGUOUS_CANDIDATE", "OFFICIAL_SEQUENCE_CONTINUITY_UNPROVEN",
  "CONFLICTING_OFFICIAL_SOURCES", "FUTURE_OR_INADMISSIBLE_EVIDENCE",
  "TRUSTED_ACQUISITION_PROVENANCE_UNAVAILABLE",
];
const evaluatedAt = "2026-10-08T12:00:00.999Z";
const cutoff = Math.floor(Date.parse(evaluatedAt) / 1000);
function fixture(index = 0): Input {
  return {
    ...structuredClone(requests[index]),
    evaluatedAt, knowledgeCutoff: cutoff,
    unavailableReason: "TRUSTED_ACQUISITION_PROVENANCE_UNAVAILABLE",
    comparisonUnavailableReason: "OFFICIAL_PREDECESSOR_UNAVAILABLE",
  };
}
function mutable(index = 0): Record<string, unknown> {
  return fixture(index) as unknown as Record<string, unknown>;
}
function reject(value: unknown): void {
  assert.throws(() => build(value as Input), TypeError);
}
function assertFrozenTree(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  assert.ok(Object.isFrozen(value));
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    assertFrozenTree(descriptor.value);
  }
}

for (const [index, request] of requests.entries()) {
  for (const reason of reasons) {
    test(`${request.provider}: ${reason} never certifies predecessor or comparison`, () => {
      for (const comparisonReason of ["OFFICIAL_PREDECESSOR_UNAVAILABLE", "INSTRUMENT_OR_REGIME_MISMATCH"] as const) {
        const input: Input = { ...fixture(index), unavailableReason: reason, comparisonUnavailableReason: comparisonReason, includeDiagnostics: true };
        const result = build(input);
        assert.equal(result.schemaVersion, version);
        assert.equal(result.semantic, "unavailable-proof-description");
        assert.equal(result.provider, request.provider);
        assert.equal(result.institution, institutions[index]);
        assert.deepEqual(result.requestedCurrentDecision, { ...request.requestedCurrentDecision, semantic: "request-metadata" });
        assert.deepEqual(result.officialPredecessor, { status: "unavailable", reason, reasonBasis: "caller-declared-diagnostic" });
        assert.deepEqual(result.comparisonEligibility, { status: "unavailable", reason: comparisonReason, reasonBasis: "caller-declared-diagnostic" });
        assert.deepEqual(result.diagnostics, { verification: "not-performed", trustedCapabilityIssuance: "unavailable" });
        assert.deepEqual(Object.keys(result).sort(), ["schemaVersion", "semantic", "provider", "institution", "requestedCurrentDecision", "evaluatedAt", "knowledgeCutoff", "officialPredecessor", "comparisonEligibility", "diagnostics"].sort());
        assert.deepEqual(Object.keys(result.officialPredecessor).sort(), ["status", "reason", "reasonBasis"].sort());
        assert.deepEqual(build(input), result);
        assertFrozenTree(result);
        assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
      }
    });
  }
}

test("the public API exposes only the version and an unavailable builder; capability is uninhabitable", () => {
  assert.deepEqual(Object.keys(contract).sort(), ["OFFICIAL_POLICY_PREDECESSOR_PROOF_SCHEMA_VERSION_V1", "buildUnavailableOfficialPolicyPredecessorProofV1"].sort());
  const capabilityIsNever: [Capability] extends [never] ? true : false = true;
  assert.equal(capabilityIsNever, true);
  // @ts-expect-error A serializable description cannot inhabit a trusted capability.
  const forgedCapability: Capability = build(fixture());
  assert.equal((forgedCapability as unknown as { officialPredecessor: { status: string } }).officialPredecessor.status, "unavailable");
});

test("diagnostics are optional, generated, and never accept a caller payload", () => {
  for (const includeDiagnostics of [undefined, false]) {
    const input = fixture();
    const result = build(includeDiagnostics === undefined ? input : { ...input, includeDiagnostics });
    assert.equal(Object.hasOwn(result, "diagnostics"), false);
  }
  for (const value of [undefined, null, 0, 1, "true", {}, []]) reject({ ...fixture(), includeDiagnostics: value });
  reject({ ...fixture(), diagnostics: { verified: true } });
});

test("explicit evaluation and integral cutoff use the millisecond floor", () => {
  for (const instant of ["1970-01-01T00:00:00.000Z", "1970-01-01T00:00:00.001Z", "1970-01-01T00:00:00.999Z", "1970-01-01T00:00:01.000Z", "2026-10-08T12:00:00.000Z", evaluatedAt]) {
    const boundary = Math.floor(Date.parse(instant) / 1000);
    assert.equal(build({ ...fixture(), evaluatedAt: instant, knowledgeCutoff: boundary }).knowledgeCutoff, boundary);
    reject({ ...fixture(), evaluatedAt: instant, knowledgeCutoff: boundary + 1 });
    if (boundary > 0) assert.equal(build({ ...fixture(), evaluatedAt: instant, knowledgeCutoff: boundary - 1 }).knowledgeCutoff, boundary - 1);
  }
  assert.equal(Object.is(build({ ...fixture(), evaluatedAt: "1970-01-01T00:00:00Z", knowledgeCutoff: -0 }).knowledgeCutoff, -0), false);
  for (const value of [-1, NaN, Infinity, -Infinity, 0.5, cutoff + 0.1, Number.MAX_SAFE_INTEGER + 1, "0", null, undefined, {}, BigInt(1)]) reject({ ...fixture(), knowledgeCutoff: value });
});

test("offsets normalize to the same UTC evaluation without relaxing the cutoff", () => {
  const reference = build(fixture());
  for (const instant of ["2026-10-08T15:00:00.999+03:00", "2026-10-08T07:00:00.999-05:00", "2026-10-09T01:30:00.999+13:30"]) {
    assert.deepEqual(build({ ...fixture(), evaluatedAt: instant }), reference);
    reject({ ...fixture(), evaluatedAt: instant, knowledgeCutoff: cutoff + 1 });
  }
  reject({ ...fixture(), evaluatedAt: "1970-01-01T00:00:00+00:01", knowledgeCutoff: 0 });
});

test("invalid instants and missing required fields fail closed", () => {
  for (const value of [undefined, null, 0, {}, "", "2026-10-08", "2026-10-08T12:00:00", "2026-02-29T12:00:00Z", "2026-04-31T12:00:00Z", "2026-10-08T24:00:00Z", "2026-10-08T12:00:60Z", "2026-10-08T12:00:00.1234Z", "2026-10-08T12:00:00+24:00", "1969-12-31T23:59:59.999Z"]) reject({ ...fixture(), evaluatedAt: value });
  for (const key of Object.keys(fixture())) {
    const input = mutable();
    delete input[key];
    reject(input);
  }
});

test("all provider identities are bound to their kind, canonical prefix and valid civil date", () => {
  for (let index = 0; index < requests.length; index++) {
    for (let other = 0; other < requests.length; other++) {
      if (index !== other) reject({ ...fixture(index), requestedCurrentDecision: fixture(other).requestedCurrentDecision });
    }
    const original = requests[index].requestedCurrentDecision;
    const key = "canonicalEventId" in original ? "canonicalEventId" : "canonicalSeriesId";
    const id = original[key as keyof typeof original] as string;
    const prefix = id.slice(0, -10);
    for (const date of ["2026-02-29", "2026-04-31", "2026-13-01", "2026-00-01", "2026-01-00", "2026-1-01", "2026-10-04:extra", "2026-10-04T00:00:00Z"]) reject({ ...fixture(index), requestedCurrentDecision: { kind: original.kind, [key]: prefix + date } });
    reject({ ...fixture(index), requestedCurrentDecision: { kind: original.kind === "ecb-event" ? "policy-series" : "ecb-event", [key]: id } });
    for (const value of [null, undefined, 0, {}, [], new Date(), { kind: original.kind }, { [key]: id }, { kind: original.kind, [key]: null }]) reject({ ...fixture(index), requestedCurrentDecision: value });
    // A valid future request is metadata, never future evidence or sequence proof.
    const future = build({ ...fixture(index), requestedCurrentDecision: { kind: original.kind, [key]: prefix + "2099-02-28" } } as Input);
    assert.equal(future.officialPredecessor.status, "unavailable");
    assert.equal(future.comparisonEligibility.status, "unavailable");
    assert.equal(build({ ...fixture(index), requestedCurrentDecision: { kind: original.kind, [key]: prefix + "2024-02-29" } } as Input).officialPredecessor.status, "unavailable");
  }
  for (const provider of ["estr", "euro-short-term-rate", "fomc", "ECB", "", null, {}, undefined]) reject({ ...fixture(), provider });
});

test("unknown reasons and attempts to request verified status are rejected", () => {
  for (const reason of ["VERIFIED", "OFFICIAL_PREDECESSOR_NOT_ESTABLISHED", "", null, undefined, {}, []]) reject({ ...fixture(), unavailableReason: reason });
  for (const reason of ["ELIGIBLE", "VERIFIED", "INSUFFICIENT_EVIDENCE", "", null, undefined, {}]) reject({ ...fixture(), comparisonUnavailableReason: reason });
  for (const value of [null, undefined, [], new Date(), new Map(), () => fixture(), "proof"]) reject(value);
});

test("unknown, hidden and symbol fields are rejected at both record levels", () => {
  for (const nested of [false, true]) {
    for (const mode of ["extra", "hidden-extra", "symbol", "hidden-required"] as const) {
      const input = mutable();
      const target = nested ? input.requestedCurrentDecision as Record<string, unknown> : input;
      if (mode === "extra") target.extra = true;
      if (mode === "hidden-extra") Object.defineProperty(target, "extra", { value: true });
      if (mode === "symbol") Object.defineProperty(target, Symbol("trust"), { value: true, enumerable: true });
      if (mode === "hidden-required") Object.defineProperty(target, nested ? "kind" : "provider", { enumerable: false });
      reject(input);
    }
  }
  const input = mutable();
  Object.defineProperty(input, "includeDiagnostics", { value: true, enumerable: false });
  reject(input);
});

test("accessors and setters cannot execute or swap validated values before detachment", () => {
  let calls = 0;
  for (const nested of [false, true]) {
    for (const setterOnly of [false, true]) {
      for (const key of nested ? ["kind", "canonicalEventId"] : [...Object.keys(fixture()), "includeDiagnostics"]) {
        const input = mutable();
        const target = nested ? input.requestedCurrentDecision as Record<string, unknown> : input;
        Object.defineProperty(target, key, {
          enumerable: true, configurable: true,
          ...(setterOnly ? { set() { calls++; } } : { get() {
            calls++;
            input.provider = "snb";
            input.requestedCurrentDecision = requests[4].requestedCurrentDecision;
            throw new Error("caller getter executed");
          } }),
        });
        reject(input);
      }
    }
  }
  assert.equal(calls, 0);
});

test("root, nested, scalar and revoked proxies reject without executing a trap", () => {
  let calls = 0;
  const trap = () => { calls++; throw new Error("caller proxy trap executed"); };
  const handler = { get: trap, ownKeys: trap, getPrototypeOf: trap, getOwnPropertyDescriptor: trap, has: trap, set: trap };
  reject(new Proxy(fixture(), handler));
  reject({ ...fixture(), requestedCurrentDecision: new Proxy(requests[0].requestedCurrentDecision, handler) });
  const revoked = Proxy.revocable(fixture(), handler);
  revoked.revoke();
  reject(revoked.proxy);
  reject({ ...fixture(), requestedCurrentDecision: revoked.proxy });
  for (const key of ["provider", "evaluatedAt", "knowledgeCutoff", "unavailableReason", "comparisonUnavailableReason", "includeDiagnostics"]) reject({ ...fixture(), [key]: new Proxy({}, handler) });
  reject({ ...fixture(), requestedCurrentDecision: { kind: new Proxy({}, handler), canonicalEventId: requests[0].requestedCurrentDecision.canonicalEventId } });
  reject({ ...fixture(), requestedCurrentDecision: { kind: "ecb-event", canonicalEventId: new Proxy({}, handler) } });
  const proxyPrototype = new Proxy({}, handler);
  reject(Object.create(proxyPrototype, Object.getOwnPropertyDescriptors(fixture())));
  reject({ ...fixture(), requestedCurrentDecision: Object.create(proxyPrototype, Object.getOwnPropertyDescriptors(requests[0].requestedCurrentDecision)) });
  assert.equal(calls, 0);
});

test("custom and accessor prototypes and coercible scalar objects cannot run caller code", () => {
  let calls = 0;
  const hostile = { get hidden() { calls++; return true; } };
  reject(Object.assign(Object.create(hostile), fixture()));
  reject({ ...fixture(), requestedCurrentDecision: Object.assign(Object.create(hostile), requests[0].requestedCurrentDecision) });
  const coercible = { [Symbol.toPrimitive]() { calls++; throw new Error("coercion executed"); }, toString() { calls++; return evaluatedAt; } };
  for (const key of ["provider", "evaluatedAt", "knowledgeCutoff", "unavailableReason", "comparisonUnavailableReason", "includeDiagnostics"]) reject({ ...fixture(), [key]: coercible });
  reject({ ...fixture(), requestedCurrentDecision: { kind: "ecb-event", canonicalEventId: coercible } });
  assert.equal(calls, 0);
});

test("plain, frozen, sealed and null-prototype records preserve identical detached results", () => {
  const baseline = build(fixture());
  for (const transform of [Object.freeze, Object.seal, (value: object) => Object.assign(Object.create(null), value)]) {
    const original = fixture();
    const input = transform({ ...original, requestedCurrentDecision: transform({ ...original.requestedCurrentDecision }) });
    assert.deepEqual(build(input), baseline);
  }
  const input = fixture();
  const before = Object.getOwnPropertyDescriptors(input);
  const nestedBefore = Object.getOwnPropertyDescriptors(input.requestedCurrentDecision);
  const first = build({ ...input, includeDiagnostics: true });
  const second = build({ ...input, includeDiagnostics: true });
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.notEqual(first.requestedCurrentDecision, input.requestedCurrentDecision);
  assert.notEqual(first.requestedCurrentDecision, second.requestedCurrentDecision);
  assert.notEqual(first.officialPredecessor, second.officialPredecessor);
  assert.notEqual(first.comparisonEligibility, second.comparisonEligibility);
  assert.notEqual(first.diagnostics, second.diagnostics);
  assert.deepEqual(Object.getOwnPropertyDescriptors(input), before);
  assert.deepEqual(Object.getOwnPropertyDescriptors(input.requestedCurrentDecision), nestedBefore);
  assert.equal(Object.isFrozen(input), false);
  assert.equal(Object.isFrozen(input.requestedCurrentDecision), false);
  (input.requestedCurrentDecision as unknown as Record<string, unknown>).canonicalEventId = "changed";
  (input as unknown as Record<string, unknown>).knowledgeCutoff = 0;
  assert.equal(first.knowledgeCutoff, cutoff);
  assert.deepEqual(first.requestedCurrentDecision, { ...requests[0].requestedCurrentDecision, semantic: "request-metadata" });
  assert.throws(() => { (first.officialPredecessor as unknown as Record<string, unknown>).status = "verified"; }, TypeError);
  assert.throws(() => { (first as unknown as Record<string, unknown>).predecessor = requests[1]; }, TypeError);
});

test("JSON, brands, receipts, supplied history and evidence cannot mint verified capabilities", () => {
  const forgeries = [
    { status: "verified", predecessor: requests[0].requestedCurrentDecision },
    { verified: true, knownAt: 0, digest: "matching-digest" },
    { schemaVersion: version, semantic: "trusted-proof-capability", receipt: Object.freeze(Object.create(null)) },
    JSON.parse(JSON.stringify(build(fixture()))),
  ];
  for (const forged of forgeries) reject(forged);
  for (const key of ["proof", "capability", "receipt", "digest", "knownAt", "officialPredecessor", "predecessor", "history", "calendar", "evidence", "futureEvidence", "settings", "action", "instrument", "regime", "institution", "schemaVersion", "verified", "trusted", "brand", "__proto__"]) {
    for (const forged of forgeries) {
      const input = mutable();
      Object.defineProperty(input, key, { value: forged, enumerable: true });
      reject(input);
    }
  }
  for (const index of requests.keys()) {
    const input = mutable(index);
    Object.defineProperty(input.requestedCurrentDecision, "knownAt", { value: 0, enumerable: true });
    reject(input);
  }
  const branded = mutable();
  Object.defineProperty(branded, Symbol.for("trusted-official-predecessor"), { value: true });
  reject(branded);
  assert.equal(build(fixture()).officialPredecessor.status, "unavailable");
});

test("source import graph contains no provider, authority, acquisition or storage wiring", () => {
  const source = readFileSync(path.resolve("src/lib/markets/events/officialPolicyPredecessorProof.ts"), "utf8");
  const imports = [...source.matchAll(/^import\s+(?:[^\n]*?\s+from\s+)?"([^"]+)";/gm)].map(match => match[1]);
  assert.deepEqual(imports, ["server-only", "node:util", "./eventClock"]);
  assert.equal(/\b(?:Date\.now|process\.env|fetch|setTimeout|setInterval|WeakMap|WeakSet)\b/.test(source), false);
});

test("fresh import and every provider build avoid implicit clocks, environment, network and storage", () => {
  // Compile in memory first, then deny all imports except the pure clock and util.
  // No test loader, generated JS or environment file is written to the workspace.
  const script = String.raw`
    const fs = require('node:fs');
    const path = require('node:path');
    const ts = require('typescript');
    const Module = require('node:module');
    const util = require('node:util');
    const entry = path.resolve('src/lib/markets/events/officialPolicyPredecessorProof.ts');
    const clock = path.resolve('src/lib/markets/events/eventClock.ts');
    const compile = filename => ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    const compiledEntry = compile(entry), compiledClock = compile(clock);
    let calls = 0;
    const denied = () => { calls++; throw new Error('forbidden side effect'); };
    const restore = [];
    const patch = (object, key, value) => { const old = Object.getOwnPropertyDescriptor(object, key); Object.defineProperty(object, key, { configurable: true, writable: true, value }); restore.push(() => old ? Object.defineProperty(object, key, old) : delete object[key]); };
    patch(Date, 'now', denied);
    patch(Math, 'random', denied);
    for (const key of ['fetch', 'setTimeout', 'setInterval', 'setImmediate', 'queueMicrotask']) patch(globalThis, key, denied);
    for (const key of ['readFileSync', 'writeFileSync', 'appendFileSync', 'mkdirSync', 'renameSync', 'rmSync', 'unlinkSync', 'openSync', 'statSync', 'readdirSync']) patch(fs, key, denied);
    for (const key of ['readFile', 'writeFile', 'appendFile', 'mkdir', 'rename', 'rm', 'unlink', 'open', 'stat', 'readdir']) patch(fs.promises, key, denied);
    const oldEnv = process.env;
    patch(process, 'env', new Proxy({}, { get: denied, ownKeys: denied, getOwnPropertyDescriptor: denied, set: denied, has: denied }));
    patch(Module, '_load', function(id, parent) {
      if (id === 'server-only') return {};
      if (id === 'node:util') return util;
      if (id === './eventClock' && parent.filename === entry) { const m = new Module(clock); m.filename = clock; m._compile(compiledClock, clock); return m.exports; }
      throw new Error('unapproved import: ' + id);
    });
    let output;
    try {
      const m = new Module(entry); m.filename = entry; m._compile(compiledEntry, entry);
      const api = m.exports;
      if (Object.keys(api).sort().join('|') !== 'OFFICIAL_POLICY_PREDECESSOR_PROOF_SCHEMA_VERSION_V1|buildUnavailableOfficialPolicyPredecessorProofV1') throw new Error('unexpected public API');
      const providers = ['ecb', 'federal-reserve', 'boj', 'boe', 'snb'];
      const prefixes = ['ECB:ecb-monetary-policy-decision:', 'us-fomc-policy-decision:', 'japan-boj-policy-decision:', 'uk-boe-bank-rate-decision:', 'switzerland-snb-policy-decision:'];
      output = providers.map((provider, index) => api.buildUnavailableOfficialPolicyPredecessorProofV1({ provider, requestedCurrentDecision: { kind: index === 0 ? 'ecb-event' : 'policy-series', [index === 0 ? 'canonicalEventId' : 'canonicalSeriesId']: prefixes[index] + '2026-10-04' }, evaluatedAt: '2026-10-08T12:00:00.999Z', knowledgeCutoff: 0, unavailableReason: 'TRUSTED_ACQUISITION_PROVENANCE_UNAVAILABLE', comparisonUnavailableReason: 'OFFICIAL_PREDECESSOR_UNAVAILABLE' }));
    } finally { for (const undo of restore.reverse()) undo(); }
    if (process.env !== oldEnv || calls !== 0 || output.length !== 5 || output.some(result => result.officialPredecessor.status !== 'unavailable' || result.comparisonEligibility.status !== 'unavailable')) throw new Error('side effect or certification');
    process.stdout.write('PURE_UNAVAILABLE_ONLY');
  `;
  const result = spawnSync(process.execPath, ["-e", script], { cwd: process.cwd(), encoding: "utf8", timeout: 20_000 });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  assert.equal(result.stdout, "PURE_UNAVAILABLE_ONLY");
});
