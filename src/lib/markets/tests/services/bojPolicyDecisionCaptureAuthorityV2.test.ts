import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { XMLParser } from "fast-xml-parser";
import * as api from "../../services/bojPolicyDecisionCaptureAuthorityV2";
import {
  createBojPolicyDecisionCaptureAuthorityV2 as create,
  type AcquireBojPolicyDecisionCaptureInputV2, type BojPolicyDecisionCaptureReceiptV2,
  type ReadBojPolicyDecisionCaptureInputV2,
} from "../../services/bojPolicyDecisionCaptureAuthorityV2";
import { createBojPolicyDecisionCaptureAuthorityV1 as createV1,
  type BojPolicyDecisionCaptureReceiptV1 } from "../../services/bojPolicyDecisionCaptureAuthority";
import { bojPolicyDocumentUrlV1 } from "../../providers/boj/transport";
import { parseBojPolicyDocumentV1 } from "../../providers/boj/facts";
import { buildBojPolicyEvidenceV1 } from "../../providers/boj/canonical";
import { prepareBojPolicyDecisionActionEvidenceV1 } from "../../providers/boj/policyDecisionActionEvidence";

const modulePath = path.resolve("src/lib/markets/services/bojPolicyDecisionCaptureAuthorityV2.ts");
const source = readFileSync(modulePath, "utf8");
const T = Date.parse("2026-10-09T12:00:00Z");
const ms = (value: number) => ({ unit: "epoch-milliseconds" as const, value });
const request = (decisionDate: AcquireBojPolicyDecisionCaptureInputV2["decisionDate"] = "2024-06-14") =>
  ({ decisionDate, signal: new AbortController().signal });
// Read complete independently approved references from the existing literal fixtures.
// No test file is executed and no reference is rebuilt by a production parser.
const fixtureSource = readFileSync(path.resolve("src/lib/markets/tests/boj/facts.test.ts"), "utf8");
const fixtureAst = ts.createSourceFile("facts.test.ts", fixtureSource, ts.ScriptTarget.Latest, true);
function fixture(name: string): string {
  for (const statement of fixtureAst.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== name) continue;
      const init = declaration.initializer;
      if (!init || !ts.isCallExpression(init) || !ts.isPropertyAccessExpression(init.expression) ||
          init.expression.name.text !== "join" || !ts.isArrayLiteralExpression(init.expression.expression) ||
          init.arguments.length !== 1 || !ts.isStringLiteral(init.arguments[0]) || init.arguments[0].text !== "") {
        throw new Error("Expected the original literal fixture.");
      }
      return init.expression.expression.elements.map(element => {
        if (!ts.isStringLiteral(element)) throw new Error("Expected literal fixture bytes.");
        return element.text;
      }).join("");
    }
  }
  throw new Error("Missing approved reference fixture.");
}
const references = [
  { date: "2024-04-26", html: fixture("officialAprilHtml"), bytes: 38733,
    digest: "7d79d6b1d0e44fee1e709ec2a1f65fd5141c109d64c3ad52890c01256fcb75bf" },
  { date: "2024-06-14", html: fixture("officialJuneHtml"), bytes: 42692,
    digest: "af0174ad9d0c16c9128292720ddec3fb8e96c601b68c06eadf6f3bea6a77bfff" },
] as const;
const response = (html = references[1].html) => new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
function owner(samples: readonly unknown[] = [T + 789, T + 789], html = references[1].html) {
  let clocks = 0;
  const authority = create({ fetchImpl: async () => response(html),
    nowUnixMilliseconds: () => samples[clocks++] as number });
  return { authority, clocks: () => clocks };
}
function read(authority: ReturnType<typeof create>, receipt: BojPolicyDecisionCaptureReceiptV2, cutoff = T + 1000, evaluatedAt = T + 1000) {
  return authority.readAsKnownAt({ receipt, evaluatedAt: ms(evaluatedAt), knowledgeCutoff: ms(cutoff) });
}
function unadmitted(result: ReturnType<typeof read>): void {
  assert.equal(result.status, "unavailable");
  assert.deepEqual(result.reasons, ["clock-accuracy-unavailable", "publication-date-policy-unavailable"]);
  assert.equal(result.historicalPossession, "not-certified");
  for (const comparison of [result.availabilityComparison, result.publicationComparison]) {
    assert.equal(comparison.status, "unavailable");
    assert.equal(comparison.authentication, "not-performed");
    assert.equal(comparison.evidenceAdmission, "not-certified");
  }
  assert.equal(Object.hasOwn(result, "capture"), false);
  assert.equal(Object.hasOwn(result, "evidence"), false);
}
function frozenTree(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) frozenTree(child);
}

for (const reference of references) test("approved " + reference.date + " retains exact source, native action and temporal roles", async () => {
  assert.equal(Buffer.byteLength(reference.html), reference.bytes);
  assert.equal(createHash("sha256").update(reference.html, "utf8").digest("hex"), reference.digest);
  const configured = owner([T + 789, T + 814], reference.html);
  const acquired = await configured.authority.acquire(request(reference.date));
  assert.equal(acquired.status, "acquired"); assert.equal(configured.clocks(), 2);
  const capture = acquired.capture;
  assert.equal(capture.schemaVersion, "boj-policy-decision-capture-v2");
  assert.equal(capture.semantic, "qualified-acquisition-description");
  assert.equal(capture.acquisitionCompletion.kind, "acquisition-completion");
  assert.equal(capture.evidenceAvailability.kind, "evidence-availability");
  assert.equal(capture.acquisitionCompletion.epochMilliseconds, T + 789);
  assert.equal(capture.evidenceAvailability.epochMilliseconds, T + 814);
  assert.equal(capture.evidenceAvailability.acquisitionCompletedAtMs, T + 789);
  assert.equal(capture.acquisitionCompletion.iso, "2026-10-09T12:00:00.789Z");
  assert.equal(capture.evidenceAvailability.iso, "2026-10-09T12:00:00.814Z");
  assert.equal(capture.acquisitionCompletion.unit, "epoch-milliseconds");
  assert.equal(capture.evidenceAvailability.precision, "millisecond");
  assert.equal(capture.legacy.completionBucket.precision, "second-bucket");
  assert.equal(capture.legacy.completionBucket.startMs, T);
  assert.equal(capture.legacy.completionBucket.endExclusiveMs, T + 1000);
  assert.equal(capture.legacy.capture.knownAt, T / 1000);
  assert.equal(capture.legacy.capture.decodedSourceDigest, "sha256:" + reference.digest);
  const document = { url: bojPolicyDocumentUrlV1(reference.date), html: reference.html };
  const fact = parseBojPolicyDocumentV1(document, reference.date);
  assert.deepEqual(capture.legacy.capture.evidence, buildBojPolicyEvidenceV1(fact, T / 1000));
  assert.deepEqual(capture.legacy.capture.evidence.fact.target, { shape: "range", lower: 0, upper: 0.1, qualification: "around" });
  assert.equal(capture.legacy.capture.evidence.fact.releaseTimestamp, null);
  assert.equal(capture.legacy.actionEvidence.action, "set-guideline");
  assert.deepEqual(capture.legacy.actionEvidence, prepareBojPolicyDecisionActionEvidenceV1({ document,
    decisionDate: reference.date })(capture.legacy.capture));
  assert.deepEqual(capture.clock.accuracy.status, "unknown");
  assert.equal(capture.publication.constraint.utcOffsetMinutes, null);
  assert.equal(capture.publication.constraint.date, reference.date);
  assert.equal(capture.publication.releaseInstant, "unavailable");
  assert.equal(Object.hasOwn(capture.publication.constraint, "epochMilliseconds"), false);
  assert.equal(Object.getPrototypeOf(acquired.receipt), null);
  assert.deepEqual(Reflect.ownKeys(acquired.receipt), []);
  frozenTree(acquired);
  assert.equal(Reflect.set(capture.evidenceAvailability, "epochMilliseconds", 0), false);
  const copied = structuredClone(capture);
  Reflect.set(copied.acquisitionCompletion, "epochMilliseconds", 0);
  assert.equal(capture.acquisitionCompletion.epochMilliseconds, T + 789);
  unadmitted(read(configured.authority, acquired.receipt));
});

for (const availabilityAt of [T + 789, T + 814, T + 1000]) test("exact reported availability " + availabilityAt + " never substitutes clock accuracy", async () => {
  const configured = owner([T + 789, availabilityAt]);
  const acquired = await configured.authority.acquire(request());
  assert.equal(acquired.capture.acquisitionCompletion.epochMilliseconds, T + 789);
  assert.equal(acquired.capture.evidenceAvailability.epochMilliseconds, availabilityAt);
  for (const cutoff of [T, T + 788, T + 789, T + 790, availabilityAt - 1, availabilityAt, T + 1000]) {
    unadmitted(read(configured.authority, acquired.receipt, cutoff, Math.max(T + 1000, cutoff)));
  }
  unadmitted(read(configured.authority, acquired.receipt, T)); // Reusing the same receipt re-evaluates.
  assert.equal(configured.clocks(), 2);
});

test("a valid owner receipt is checked against every evaluation/cutoff and cannot admit future cutoffs", async () => {
  const configured = owner(); const acquired = await configured.authority.acquire(request());
  assert.throws(() => read(configured.authority, acquired.receipt, T + 790, T + 789), RangeError);
  unadmitted(read(configured.authority, acquired.receipt, T + 789, T + 789));
  for (const value of [-1, -0, NaN, Infinity, 0.1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => read(configured.authority, acquired.receipt, value));
    assert.throws(() => read(configured.authority, acquired.receipt, T, value));
  }
  for (const value of ["2026-02-30T00:00:00Z", "2026-10-09T12:00:00", "2026-10-09T12:00:60Z", "2026-10-09T12:00:00.7890Z"]) {
    assert.throws(() => configured.authority.readAsKnownAt({ receipt: acquired.receipt,
      evaluatedAt: ms(T + 1000), knowledgeCutoff: { unit: "offset-iso", value } }));
  }
  unadmitted(configured.authority.readAsKnownAt({ receipt: acquired.receipt,
    evaluatedAt: { unit: "offset-iso", value: "2026-10-09T14:00:01+02:00" },
    knowledgeCutoff: { unit: "offset-iso", value: "2026-10-09T12:00:00.789Z" } }));
});

for (const phase of [0, 1]) for (const invalid of [-1, -0, 0.5, NaN, Infinity, -Infinity,
  Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, "1791547200789", null, undefined]) {
  test("invalid clock sample " + phase + ": " + String(invalid) + " issues no receipt", async () => {
    const samples: unknown[] = [T + 789, T + 814]; samples[phase] = invalid;
    const configured = owner(samples); let issued: unknown;
    await assert.rejects(async () => { issued = await configured.authority.acquire(request()); });
    assert.equal(issued, undefined); assert.equal(configured.clocks(), phase + 1);
    assert.throws(() => read(configured.authority, {} as BojPolicyDecisionCaptureReceiptV2), TypeError);
  });
}

for (const phase of [0, 1]) test("throwing completion/availability clock " + phase + " issues nothing", async () => {
  let clocks = 0; let issued: unknown; const sentinel = new ReferenceError("clock sentinel");
  const authority = create({ fetchImpl: async () => response(), nowUnixMilliseconds: () => {
    if (clocks++ === phase) throw sentinel; return T + 789;
  } });
  await assert.rejects(async () => { issued = await authority.acquire(request()); }, error => error === sentinel);
  assert.equal(issued, undefined); assert.equal(clocks, phase + 1);
});

test("regression within acquisition and between acquisitions fails without clamping", async () => {
  const within = owner([T + 789, T + 788]);
  await assert.rejects(within.authority.acquire(request()), RangeError);
  const between = owner([T + 789, T + 1000, T + 900, T + 950]);
  const original = await between.authority.acquire(request()); let issued: unknown;
  await assert.rejects(async () => { issued = await between.authority.acquire(request()); }, RangeError);
  assert.equal(issued, undefined); assert.equal(between.clocks(), 3);
  assert.equal(original.capture.evidenceAvailability.epochMilliseconds, T + 1000);
  unadmitted(read(between.authority, original.receipt));
});

for (const reference of references) for (const change of [
  (html: string) => html.replace("Copyright Bank of Japan", "copyright Bank of Japan"),
  (html: string) => html.replace("0 to 0.1 percent", "0 to 0.5 percent"),
  (html: string) => html.replace("<!-- [END] CONTENT_2 -->", '<p>Maintain the guideline.</p><!-- [END] CONTENT_2 -->'),
]) test("modified approved " + reference.date + " source rejects before clocks and issuance", async () => {
  const html = change(reference.html); assert.notEqual(html, reference.html);
  const configured = owner([], html); let issued: unknown;
  await assert.rejects(async () => { issued = await configured.authority.acquire(request(reference.date)); });
  assert.equal(configured.clocks(), 0); assert.equal(issued, undefined);
});

test("failed/incomplete acquisition cannot reach either clock or issue a receipt", async () => {
  for (const fetchImpl of [async () => { throw new TypeError("fetch failed sentinel"); },
    async () => new Response(null), async () => new Response("failure", { status: 503 }),
    async () => new Response(new Uint8Array([0xc3, 0x28]), { headers: { "Content-Type": "text/html;charset=UTF-8" } }),
    async () => response("<html>incomplete</html>")]) {
    let clocks = 0; let issued: unknown;
    const authority = create({ fetchImpl, nowUnixMilliseconds: () => { clocks++; return T; } });
    await assert.rejects(async () => { issued = await authority.acquire(request()); });
    assert.equal(clocks, 0); assert.equal(issued, undefined);
  }
});

test("complete streamed body and required native-action parsing precede completion; cloning precedes availability", async () => {
  const events: string[] = []; let finish!: () => void; let started!: () => void;
  const streamReady = new Promise<void>(resolve => { started = resolve; });
  const originalParse = XMLParser.prototype.parse; const originalClone = globalThis.structuredClone;
  let clocks = 0;
  try {
    XMLParser.prototype.parse = function (this: XMLParser, ...args: Parameters<typeof originalParse>) {
      events.push("parse"); return originalParse.apply(this, args);
    } as typeof originalParse;
    globalThis.structuredClone = function <V>(value: V, options?: StructuredSerializeOptions): V {
      events.push("clone"); return originalClone(value, options);
    };
    const authority = create({ fetchImpl: async () => responseStream(), nowUnixMilliseconds: () => {
      clocks++;
      assert.ok(events.includes("body-complete")); assert.ok(events.includes("parse"));
      if (clocks === 1) assert.equal(events.includes("clone"), false);
      else assert.equal(events.includes("clone"), true);
      return clocks === 1 ? T + 789 : T + 814;
    } });
    function responseStream() {
      return new Response(new ReadableStream<Uint8Array>({ start(controller) {
        controller.enqueue(new TextEncoder().encode(references[1].html.slice(0, 80)));
        finish = () => { controller.enqueue(new TextEncoder().encode(references[1].html.slice(80)));
          events.push("body-complete"); controller.close(); };
        started();
      } }), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
    }
    const pending = authority.acquire(request()); await streamReady;
    assert.equal(clocks, 0); finish(); const acquired = await pending;
    assert.equal(clocks, 2); assert.equal(acquired.capture.evidenceAvailability.epochMilliseconds, T + 814);
  } finally { XMLParser.prototype.parse = originalParse; globalThis.structuredClone = originalClone; }
});

test("required action extraction failure cannot be hidden behind successful setting extraction", async () => {
  const originalParse = XMLParser.prototype.parse; let parses = 0; let clocks = 0;
  const document = { url: bojPolicyDocumentUrlV1("2024-06-14"), html: references[1].html };
  const sentinel = new ReferenceError("action preparation sentinel");
  try {
    XMLParser.prototype.parse = function (this: XMLParser, ...args: Parameters<typeof originalParse>) {
      parses++; return originalParse.apply(this, args);
    } as typeof originalParse;
    parseBojPolicyDocumentV1(document, "2024-06-14"); const settingParses = parses; parses = 0;
    XMLParser.prototype.parse = function (this: XMLParser, ...args: Parameters<typeof originalParse>) {
      if (++parses > settingParses) throw sentinel; return originalParse.apply(this, args);
    } as typeof originalParse;
    const authority = create({ fetchImpl: async () => response(), nowUnixMilliseconds: () => { clocks++; return T; } });
    await assert.rejects(authority.acquire(request()), error => error === sentinel); assert.equal(clocks, 0);
  } finally { XMLParser.prototype.parse = originalParse; }
});

for (const phase of [0, 1]) test("cancellation during clock " + phase + " cannot register/issue", async () => {
  const controller = new AbortController(); let clocks = 0; let issued: unknown;
  const authority = create({ fetchImpl: async () => response(), nowUnixMilliseconds: () => {
    if (clocks++ === phase) controller.abort(); return T + 789;
  } });
  await assert.rejects(async () => { issued = await authority.acquire({ decisionDate: "2024-06-14", signal: controller.signal }); });
  assert.equal(issued, undefined); assert.equal(clocks, phase + 1);
});

test("receipt copies, serialization, proxies, foreign owners and V1/V2 crossings cannot authorize reads", async () => {
  const first = owner(), second = owner(); const a = await first.authority.acquire(request());
  const b = await second.authority.acquire(request());
  const v1 = createV1({ fetchImpl: async () => response(), nowUnixSeconds: () => T / 1000 });
  const old = await v1.acquire(request()); let traps = 0;
  for (const receipt of [{}, [], null, { ...a.receipt }, structuredClone(a.receipt), JSON.parse(JSON.stringify(a.receipt)),
    Object.freeze(Object.create(null)), { [Symbol("receiptBrandV2")]: true }, b.receipt, old.receipt, a.capture,
    new Proxy(a.receipt, { get() { traps++; throw new Error("trap"); }, ownKeys() { traps++; return []; } })]) {
    assert.throws(() => read(first.authority, receipt as BojPolicyDecisionCaptureReceiptV2), TypeError);
  }
  assert.equal(traps, 0);
  assert.throws(() => v1.readAsKnownAt({ receipt: a.receipt as unknown as BojPolicyDecisionCaptureReceiptV1,
    evaluatedAt: new Date(T + 1000).toISOString() }), TypeError);
  assert.throws(() => api.readBojPolicyDecisionCaptureAsKnownAtV2({ receipt: a.receipt,
    evaluatedAt: ms(T + 1000), knowledgeCutoff: ms(T + 1000) }), TypeError);
  unadmitted(read(first.authority, a.receipt));
});

test("input descriptors and configuration cannot smuggle timing, approval, clock trust or publication policy", async () => {
  const configured = owner(); const acquired = await configured.authority.acquire(request()); let getters = 0;
  for (const extra of ["clockAccuracy", "provenance", "utcOffsetMinutes", "releaseTimestamp", "nowUnixSeconds", "knownAt", "html", "digest", "approval", Symbol("override")]) {
    const input = request(); Object.defineProperty(input, extra, { get() { getters++; return 0; } });
    await assert.rejects(configured.authority.acquire(input));
    const assessment = { receipt: acquired.receipt, evaluatedAt: ms(T + 1000), knowledgeCutoff: ms(T + 1000) };
    Object.defineProperty(assessment, extra, { value: 0 }); assert.throws(() => configured.authority.readAsKnownAt(assessment));
    const dependencies = { fetchImpl: async () => response(), nowUnixMilliseconds: () => T };
    Object.defineProperty(dependencies, extra, { value: 0 }); assert.throws(() => create(dependencies));
  }
  const assessment = { receipt: {} as BojPolicyDecisionCaptureReceiptV2,
    get evaluatedAt() { getters++; return ms(T); }, get knowledgeCutoff() { getters++; return ms(T); } };
  assert.throws(() => configured.authority.readAsKnownAt(assessment)); assert.equal(getters, 0);
  const proxy = new Proxy(request(), { ownKeys() { getters++; return []; } });
  await assert.rejects(configured.authority.acquire(proxy)); assert.equal(getters, 0);
});

test("unsupported dates and overridden cancellation signals fail before fetch or clocks", async () => {
  let calls = 0;
  const authority = create({ fetchImpl: async () => { calls++; return response(); }, nowUnixMilliseconds: () => { calls++; return T; } });
  for (const date of ["2025-01-24", "2024-06-13", "invalid"]) await assert.rejects(authority.acquire({ ...request(), decisionDate: date } as AcquireBojPolicyDecisionCaptureInputV2));
  const controller = new AbortController(); controller.abort(); await assert.rejects(authority.acquire({ ...request(), signal: controller.signal }));
  const overridden = new AbortController().signal; Object.defineProperty(overridden, "aborted", { value: false });
  await assert.rejects(authority.acquire({ ...request(), signal: overridden }));
  await assert.rejects(authority.acquire({ ...request(), signal: new Proxy(new AbortController().signal, {}) }));
  assert.equal(calls, 0);
});

test("default production owner samples milliseconds twice and does not promote unknown accuracy", async () => {
  const originalFetch = globalThis.fetch, originalNow = Date.now; let clocks = 0;
  try {
    globalThis.fetch = async url => { assert.equal(url, bojPolicyDocumentUrlV1("2024-06-14")); return response(); };
    Date.now = () => ++clocks === 1 ? T + 789 : T + 814;
    const acquired = await api.acquireBojPolicyDecisionCaptureV2(request());
    assert.equal(acquired.capture.acquisitionCompletion.epochMilliseconds, T + 789);
    assert.equal(acquired.capture.evidenceAvailability.epochMilliseconds, T + 814);
    globalThis.fetch = () => { throw new Error("reader fetched"); }; Date.now = () => { throw new Error("reader clock"); };
    unadmitted(api.readBojPolicyDecisionCaptureAsKnownAtV2({ receipt: acquired.receipt,
      evaluatedAt: ms(T + 1000), knowledgeCutoff: ms(T + 814) }));
    assert.equal(clocks, 2);
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
});

test("final availability-to-registration region has no asynchronous or external gap", () => {
  const ast = ts.createSourceFile(modulePath, source, ts.ScriptTarget.Latest, true);
  const start = source.indexOf("const availabilitySample = sample();");
  const end = source.indexOf("return result;", start);
  assert.ok(start > 0 && end > start);
  const forbidden = new Set(["setTimeout", "setInterval", "setImmediate", "fetch", "Date.now", "Math.random"]);
  function visit(node: ts.Node): void {
    if (node.getStart(ast) >= start && node.getEnd() <= end) {
      assert.equal(ts.isAwaitExpression(node), false);
      if (ts.isCallExpression(node)) assert.equal(forbidden.has(node.expression.getText(ast)), false);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.deepEqual(Object.keys(api).sort(), ["BOJ_POLICY_DECISION_CAPTURE_SCHEMA_VERSION_V2", "createBojPolicyDecisionCaptureAuthorityV2",
    "acquireBojPolicyDecisionCaptureV2", "readBojPolicyDecisionCaptureAsKnownAtV2"].sort());
  assert.doesNotMatch(source, /from ["'][^"']*(?:persistence|redis|r2|Continuity|Predecessor)[^"']*["']/i);
});


test("finalization failure after completion withholds the receipt and availability sample", async () => {
  const originalClone = globalThis.structuredClone; let clocks = 0; let issued: unknown;
  const sentinel = new ReferenceError("finalization sentinel");
  try {
    globalThis.structuredClone = () => { throw sentinel; };
    const authority = create({ fetchImpl: async () => response(), nowUnixMilliseconds: () => { clocks++; return T + 789; } });
    await assert.rejects(async () => { issued = await authority.acquire(request()); }, error => error === sentinel);
    assert.equal(clocks, 1); assert.equal(issued, undefined);
  } finally { globalThis.structuredClone = originalClone; }
});

test("infrastructure aliases are detached before asynchronous acquisition", async () => {
  let release!: (response: Response) => void; let fetching!: () => void;
  const ready = new Promise<void>(resolve => { fetching = resolve; });
  const supplied = new Promise<Response>(resolve => { release = resolve; });
  let clocks = 0;
  const dependencies = { fetchImpl: async () => { fetching(); return supplied; },
    nowUnixMilliseconds: () => ++clocks === 1 ? T + 789 : T + 814 };
  const authority = create(dependencies); const pending = authority.acquire(request()); await ready;
  dependencies.fetchImpl = async () => { throw new Error("changed dependency"); };
  dependencies.nowUnixMilliseconds = () => { throw new Error("changed clock"); };
  release(response()); const acquired = await pending;
  assert.equal(clocks, 2); assert.equal(acquired.capture.acquisitionCompletion.epochMilliseconds, T + 789);
  assert.equal(acquired.capture.evidenceAvailability.epochMilliseconds, T + 814);
  assert.equal(Object.isFrozen(dependencies), false);
});

test("reconstructed temporal descriptions are data, never owner membership or an accuracy assertion", async () => {
  const configured = owner(); const acquired = await configured.authority.acquire(request());
  for (const description of [acquired.capture.acquisitionCompletion, acquired.capture.evidenceAvailability,
    acquired.capture.clock.accuracy, acquired.capture.publication.constraint, structuredClone(acquired.capture)]) {
    assert.throws(() => read(configured.authority, description as unknown as BojPolicyDecisionCaptureReceiptV2), TypeError);
  }
  assert.throws(() => configured.authority.readAsKnownAt({ receipt: acquired.receipt,
    evaluatedAt: acquired.capture.acquisitionCompletion, knowledgeCutoff: ms(T) } as unknown as ReadBojPolicyDecisionCaptureInputV2));
});

test("date-only documents never gain an invented UTC/JST release floor, even with epoch-zero owner samples", async () => {
  for (const reference of references) {
    const configured = owner([0, 0], reference.html);
    const acquired = await configured.authority.acquire(request(reference.date));
    assert.equal(acquired.capture.acquisitionCompletion.epochMilliseconds, 0);
    assert.equal(acquired.capture.publication.constraint.utcOffsetMinutes, null);
    unadmitted(read(configured.authority, acquired.receipt, 0, 0));
  }
});

test("V2 declares no predecessor or continuity evidence and V1 keeps its original seconds semantics", async () => {
  const v1 = createV1({ fetchImpl: async () => response(), nowUnixSeconds: () => T / 1000 });
  const old = await v1.acquire(request());
  const earlier = v1.readAsKnownAt({ receipt: old.receipt, evaluatedAt: new Date(T - 1).toISOString() });
  assert.deepEqual(earlier, { status: "not-known-as-of" });
  const equal = v1.readAsKnownAt({ receipt: old.receipt, evaluatedAt: new Date(T).toISOString() });
  assert.equal(equal.status, "available");
  if (equal.status !== "available") throw new Error("Expected preserved V1 behavior.");
  assert.equal(equal.capture.knownAt, T / 1000);
  assert.deepEqual(Object.keys(equal.capture).sort(), ["decodedSourceDigest", "evidence", "knownAt"]);
  const configured = owner(); const acquired = await configured.authority.acquire(request());
  assert.equal(Object.hasOwn(acquired.capture, "predecessor"), false);
  assert.equal(Object.hasOwn(acquired.capture, "continuity"), false);
  assert.equal(acquired.capture.legacy.actionEvidence.action, "set-guideline");
});

// Child-process source mutations only. Baselines must succeed; mutants must fail
// assertions about retained timestamps, issuance, cutoff order or owner isolation.
const controls = [
  { name: "synchronous availability registration", from: "const availabilitySample = sample();",
    to: "const availabilitySample = sample();\n    await Promise.resolve();",
    probe: "const controller=new AbortController();const atomic=c.createBojPolicyDecisionCaptureAuthorityV2({fetchImpl:async()=>response(),nowUnixMilliseconds:()=>{if(++clocks===2)queueMicrotask(()=>controller.abort());return T+789;}});const a=await atomic.acquire({decisionDate:'2024-06-14',signal:controller.signal});assert.equal(a.status,'acquired');assert.equal(atomic.readAsKnownAt({receipt:a.receipt,evaluatedAt:ms(T+1000),knowledgeCutoff:ms(T+1000)}).status,'unavailable');" },
  { name: "millisecond retention", from: "value: nowUnixMilliseconds()",
    to: "value: Math.floor(nowUnixMilliseconds() / 1000) * 1000",
    probe: "const a=await owner.acquire(request());assert.equal(a.capture.acquisitionCompletion.epochMilliseconds,T+789);assert.equal(a.capture.evidenceAvailability.epochMilliseconds,T+814);" },
  { name: "separate availability sample", from: "const availabilitySample = sample();",
    to: "const availabilitySample = acquisitionCompletion;",
    probe: "const a=await owner.acquire(request());assert.equal(a.capture.evidenceAvailability.epochMilliseconds,T+814);assert.equal(clocks,2);" },
  { name: "owner clock regression guard", from: "if (lastSample !== null)", to: "if (false)",
    probe: "times=[T+789,T+1000,T+900,T+950];await owner.acquire(request());await assert.rejects(owner.acquire(request()),RangeError);" },
  { name: "future historical cutoff guard", from: "const cutoff = createHistoricalCutoffV1({ evaluation, at: data.knowledgeCutoff as TemporalInstantInputV1 });",
    to: "const cutoff = createEvaluationInstantV1(data.knowledgeCutoff as TemporalInstantInputV1);",
    probe: "const a=await owner.acquire(request());assert.throws(()=>owner.readAsKnownAt({receipt:a.receipt,evaluatedAt:ms(T+789),knowledgeCutoff:ms(T+790)}),RangeError);" },
  { name: "unknown clock accuracy", from: 'const accuracy = createClockAccuracyV1({ status: "unknown" });',
    to: 'const accuracy = createClockAccuracyV1({ status: "bounded", unit: "milliseconds", maximumAbsoluteError: 0, provenance: "owner-asserted-authenticated" });',
    probe: "const a=await owner.acquire(request());assert.equal(a.capture.clock.accuracy.status,'unknown');assert.equal(owner.readAsKnownAt({receipt:a.receipt,evaluatedAt:ms(T+1000),knowledgeCutoff:ms(T+1000)}).status,'unavailable');" },
  { name: "unqualified publication timezone", from: "utcOffsetMinutes: null", to: "utcOffsetMinutes: 540",
    probe: "const a=await owner.acquire(request());assert.equal(a.capture.publication.constraint.utcOffsetMinutes,null);assert.equal(owner.readAsKnownAt({receipt:a.receipt,evaluatedAt:ms(T+1000),knowledgeCutoff:ms(T+1000)}).publicationComparison.status,'unavailable');" },
  { name: "final cancellation guard", from: "checkCancellation(signal);\n    const description:", to: "const description:",
    probe: "const controller=new AbortController();const canceled=c.createBojPolicyDecisionCaptureAuthorityV2({fetchImpl:async()=>response(),nowUnixMilliseconds:()=>{if(++clocks===2)controller.abort();return T+789;}});await assert.rejects(canceled.acquire({decisionDate:'2024-06-14',signal:controller.signal}));" },
  { name: "private owner isolation", from: "const captures = new WeakMap<object, BojPolicyDecisionCaptureV2>();",
    to: "const captures = (createBojPolicyDecisionCaptureAuthorityV2 as unknown as { captures?: WeakMap<object, BojPolicyDecisionCaptureV2> }).captures ??= new WeakMap<object, BojPolicyDecisionCaptureV2>();",
    probe: "const a=await owner.acquire(request());const foreign=c.createBojPolicyDecisionCaptureAuthorityV2({fetchImpl:async()=>response(),nowUnixMilliseconds:()=>T+1000});assert.throws(()=>foreign.readAsKnownAt({receipt:a.receipt,evaluatedAt:ms(T+1000),knowledgeCutoff:ms(T+1000)}),TypeError);" },
];
function probe(text: string, body: string) {
  const script = [
    "const fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),assert=require('node:assert/strict');",
    "const target=" + JSON.stringify(modulePath) + ";const base=Module._load;Module._load=function(name,parent,main){if(name==='server-only')return {};return base.call(this,name,parent,main);};",
    "require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(f===target ? " + JSON.stringify(text) + " : fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2017,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,f);",
    "const c=require(target),html=" + JSON.stringify(references[1].html) + ";const T=1791547200000,ms=value=>({unit:'epoch-milliseconds',value});let times=[T+789,T+814],clocks=0;",
    "const response=()=>new Response(html,{headers:{'Content-Type':'text/html;charset=UTF-8'}}),request=()=>({decisionDate:'2024-06-14',signal:new AbortController().signal});const owner=c.createBojPolicyDecisionCaptureAuthorityV2({fetchImpl:async()=>response(),nowUnixMilliseconds:()=>times[clocks++]});",
    "assert.doesNotReject(async()=>{" + body + "}).catch(error=>{console.error(error);process.exitCode=1;});",
  ].join("\n");
  return spawnSync(process.execPath, [], { cwd: process.cwd(), input: script, encoding: "utf8", timeout: 20_000 });
}
for (const control of controls) test("mutation control: " + control.name, () => {
  assert.equal(source.split(control.from).length - 1, 1);
  const baseline = probe(source, control.probe);
  assert.equal(baseline.status, 0, baseline.stderr);
  const mutant = probe(source.replace(control.from, control.to), control.probe);
  assert.equal(mutant.error, undefined); assert.notEqual(mutant.status, 0);
  assert.match(mutant.stderr, /AssertionError/); assert.doesNotMatch(mutant.stderr, /SyntaxError|Cannot find module/);
});


test("microtasks scheduled by the final clock cannot interleave with registration", async () => {
  const controller = new AbortController(); let clocks = 0;
  const authority = create({ fetchImpl: async () => response(), nowUnixMilliseconds: () => {
    if (++clocks === 2) queueMicrotask(() => controller.abort());
    return T + 789;
  } });
  const acquired = await authority.acquire({ decisionDate: "2024-06-14", signal: controller.signal });
  assert.equal(acquired.status, "acquired"); assert.equal(controller.signal.aborted, true);
  unadmitted(read(authority, acquired.receipt));
});

test("actual Next server-only alias performs no acquisition, clock, scheduling, environment or storage work", () => {
  const script = [
    "const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict'),Module=require('node:module');",
    "const serverOnly=require('next/dist/compiled/server-only/empty'),base=Module._load;Module._load=function(name,parent,main){return name==='server-only'?serverOnly:base.call(this,name,parent,main);};",
    "require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2017,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,f);",
    "const forbidden=()=>{throw new Error('import side effect');};globalThis.fetch=forbidden;Date.now=forbidden;Math.random=forbidden;globalThis.setTimeout=forbidden;globalThis.setInterval=forbidden;globalThis.setImmediate=forbidden;",
    "const env=process.env;process.env=new Proxy(env,{get:forbidden,ownKeys:forbidden});let loaded;",
    "try{loaded=require(" + JSON.stringify(modulePath) + ");}finally{process.env=env;}",
    "assert.deepEqual(Object.keys(loaded).sort(),['BOJ_POLICY_DECISION_CAPTURE_SCHEMA_VERSION_V2','createBojPolicyDecisionCaptureAuthorityV2','acquireBojPolicyDecisionCaptureV2','readBojPolicyDecisionCaptureAsKnownAtV2'].sort());",
  ].join("\n");
  const result = spawnSync(process.execPath, ["--conditions=react-server"], { cwd: process.cwd(), input: script, encoding: "utf8", timeout: 20_000 });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr);
});
