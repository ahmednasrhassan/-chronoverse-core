import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { XMLParser } from "fast-xml-parser";
import ts from "typescript";
import {
  acquireEcbPolicyDecisionActionCaptureV1,
  createEcbPolicyDecisionActionCaptureAuthorityV1,
  readEcbPolicyDecisionActionCaptureAsKnownAtV1,
  type AcquireEcbPolicyDecisionActionCaptureInputV1,
  type EcbPolicyDecisionActionCaptureAuthorityV1,
  type EcbPolicyDecisionActionCaptureDependenciesV1,
  type EcbPolicyDecisionActionCaptureReceiptV1,
  type ReadEcbPolicyDecisionActionCaptureInputV1,
} from "../../services/ecbPolicyDecisionActionCaptureAuthority";
import { ECB_EVENT_MAX_RESPONSE_BYTES_V1, EcbEventTransportError } from "../../providers/ecb/monetaryPolicy/acquisitionTransport";
import { captureKnownEcbDecisionDocumentHtmlV1 } from "../../providers/ecb/monetaryPolicy/parser";
import { buildEcbPolicyDecisionActionEvidenceV1, reconstructEcbPolicyDecisionActionEvidenceV1 } from "../../providers/ecb/monetaryPolicy/policyDecisionActionEvidence";

// Reduced offline publisher-layout fixtures, not live official captures.
const REFERENCE = { sourceInstitution: "ECB", decisionDate: "2026-09-10",
  documentUrl: "https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp260910~314e508016.en.html" };
const F = 1_789_100_000;
const at = (time = F) => new Date(time * 1_000).toISOString();
const SENTENCE = "The interest rates on the deposit facility, the main refinancing operations and the marginal lending facility " +
  "will be increased to 2.50%, 2.65% and 2.90% respectively, with effect from 16 September 2026.";
const RAISE = "The Governing Council decided to raise the three key ECB interest rates by 25 basis points. Accordingly, " + SENTENCE;
const LOWER = RAISE.replace("raise", "lower").replace("increased", "decreased");
const MAINTAIN = SENTENCE.replace("will be increased to", "will remain unchanged at");
const html = (sentence = RAISE) => `<html><body><main><h1>Monetary policy decisions</h1>` +
  `<h2>Key ECB interest rates</h2><p>${sentence}</p></main></body></html>`;
const response = (body = html()) => new Response(body, { headers: { "Content-Type": "text/html" } });
const request = (): AcquireEcbPolicyDecisionActionCaptureInputV1 => ({ reference: { ...REFERENCE }, signal: new AbortController().signal });
const authority = (body = html(), time = F) => createEcbPolicyDecisionActionCaptureAuthorityV1({
  fetchImpl: async () => response(body), nowUnixSeconds: () => time,
});
async function acquire(owner: EcbPolicyDecisionActionCaptureAuthorityV1, input = request()) {
  const result = await owner.acquire(input);
  assert.equal(result.status, "acquired");
  if (result.status !== "acquired") throw new Error("Expected fixture receipt.");
  return result.receipt;
}
function read(owner: EcbPolicyDecisionActionCaptureAuthorityV1, receipt: EcbPolicyDecisionActionCaptureReceiptV1, evaluatedAt = at()) {
  const result = owner.readAsKnownAt({ receipt, evaluatedAt });
  assert.equal(result.status, "available");
  if (result.status !== "available") throw new Error("Expected admitted fixture.");
  return result;
}
const rejectReceipt = (owner: EcbPolicyDecisionActionCaptureAuthorityV1, receipt: unknown) =>
  assert.throws(() => owner.readAsKnownAt({ receipt: receipt as EcbPolicyDecisionActionCaptureReceiptV1, evaluatedAt: at() }), /Unrecognized/);
function eachObject(value: unknown, visit: (object: object) => void): void {
  if (typeof value !== "object" || value === null) return;
  visit(value);
  for (const key of Reflect.ownKeys(value)) eachObject(Reflect.get(value, key), visit);
}
function deferred<T>() {
  let complete!: (value: T) => void;
  const promise = new Promise<T>((resolve) => { complete = resolve; });
  return { promise, complete };
}

for (const [action, sentence] of [["raise", RAISE], ["lower", LOWER], ["maintain", MAINTAIN]] as const) {
  test("authority retains canonical shared " + action + " without new source semantics", async () => {
    const owner = authority(html(sentence)); const receipt = await acquire(owner); const result = read(owner, receipt);
    assert.equal(result.evidence.action, action);
    assert.equal(result.evidence.scope, "three-key-ecb-interest-rates");
    assert.equal(result.evidence.knownAt, F); assert.equal(result.evidence.capture.fetchedAt, F);
    const captured = captureKnownEcbDecisionDocumentHtmlV1(html(sentence), REFERENCE, F);
    assert.ok(captured.status === "available");
    const canonical = buildEcbPolicyDecisionActionEvidenceV1({ html: html(sentence), capture: captured.data });
    assert.ok(canonical.status === "available"); assert.deepEqual(result.evidence, canonical.evidence);
    assert.deepEqual(Reflect.ownKeys(receipt), []); assert.equal(Object.getPrototypeOf(receipt), null);
    assert.ok(Object.isFrozen(receipt));
  });
}

test("owned clock is sampled only after response and complete streamed body consumption", async () => {
  const order: string[] = []; const fetched = deferred<void>(); const delivered = deferred<Response>(); const reading = deferred<void>();
  let finish!: () => void; let clocks = 0;
  const owner = createEcbPolicyDecisionActionCaptureAuthorityV1({
    fetchImpl: async (url, init) => {
      assert.equal(url, REFERENCE.documentUrl);
      assert.equal(init?.cache, "no-store"); assert.equal(init?.redirect, "error");
      order.push("fetch"); fetched.complete(); return delivered.promise;
    },
    nowUnixSeconds: () => { order.push("clock"); clocks++; assert.ok(order.includes("body-complete")); return F; },
  });
  const pending = acquire(owner); assert.equal(clocks, 0);
  await fetched.promise; assert.equal(clocks, 0, "fetch response is still pending");
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(html().slice(0, 40)));
      finish = () => { controller.enqueue(new TextEncoder().encode(html().slice(40))); order.push("body-complete"); controller.close(); };
    },
    pull() { reading.complete(); },
  });
  delivered.complete(new Response(stream, { headers: { "Content-Type": "text/html" } }));
  await reading.promise; assert.equal(clocks, 0, "partial buffered body is not a capture");
  finish(); const receipt = await pending;
  assert.deepEqual(order, ["fetch", "body-complete", "clock"]); assert.equal(clocks, 1);
  assert.equal(read(owner, receipt).evidence.knownAt, F);
});

for (const [name, fetchImpl, code] of [
  ["transport failure", async () => { throw new EcbEventTransportError("network"); }, "network"],
  ["HTTP failure", async () => new Response("bad", { status: 503 }), "http"],
  ["oversized actual body", async () => response("x".repeat(ECB_EVENT_MAX_RESPONSE_BYTES_V1 + 1)), "response-too-large"],
  ["invalid encoding", async () => new Response(new Uint8Array([0xc3, 0x28]), { headers: { "Content-Type": "text/html" } }), "invalid-encoding"],
] as const) test(name + " issues no receipt and never samples the clock", async () => {
  let clocks = 0;
  const owner = createEcbPolicyDecisionActionCaptureAuthorityV1({ fetchImpl, nowUnixSeconds: () => { clocks++; return F; } });
  await assert.rejects(owner.acquire(request()), (error) => error instanceof EcbEventTransportError && error.code === code);
  assert.equal(clocks, 0); rejectReceipt(owner, {});
});

test("invalid official references fail before source reads or clock sampling", async () => {
  const owner = createEcbPolicyDecisionActionCaptureAuthorityV1({
    fetchImpl: async () => { throw new Error("unexpected source read"); }, nowUnixSeconds: () => { throw new Error("unexpected clock"); },
  });
  for (const reference of [
    { ...REFERENCE, sourceInstitution: "NOT_ECB" }, { ...REFERENCE, decisionDate: "2026-09-11" },
    { ...REFERENCE, documentUrl: REFERENCE.documentUrl.replace("www.ecb.europa.eu", "evil.example") },
    { ...REFERENCE, documentUrl: REFERENCE.documentUrl + "?extra=1" },
    { ...REFERENCE, documentUrl: REFERENCE.documentUrl.replace("https:", "http:") },
  ]) {
    const result = await owner.acquire({ ...request(), reference });
    assert.equal(result.status, "invalid-reference"); assert.ok(Object.isFrozen(result));
    assert.ok(!Object.hasOwn(result, "receipt")); rejectReceipt(owner, result);
  }
});

for (const [body, status] of [
  ["<main>Not a decision</main>", "decision-document-malformed"],
  [html("No supported rates."), "policy-facts-unavailable"],
  [html(RAISE.replace("increased", "decreased")), "policy-facts-unavailable"],
] as const) test(status + " never issues a trusted receipt", async () => {
  const owner = authority(body); const result = await owner.acquire(request());
  assert.equal(result.status, status); assert.ok(Object.isFrozen(result));
  assert.ok(!Object.hasOwn(result, "receipt")); rejectReceipt(owner, result);
});

test("invalid infrastructure clock values reject after source completion without issuing receipts", async () => {
  for (const value of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, null, undefined, "1789100000"]) {
    let fetched = false;
    const owner = createEcbPolicyDecisionActionCaptureAuthorityV1({
      fetchImpl: async () => { fetched = true; return response(); }, nowUnixSeconds: () => { assert.ok(fetched); return value as number; },
    });
    await assert.rejects(owner.acquire(request()), /authoritative ECB capture time/); rejectReceipt(owner, {});
  }
});

test("capture, canonicalization and reconstruction defects propagate without issuing receipts", async () => {
  const original = XMLParser.prototype.parse;
  for (const failingCall of [1, 2, 3]) {
    const owner = authority(); const defect = new ReferenceError("canonical sentinel"); let calls = 0;
    try {
      XMLParser.prototype.parse = function (this: XMLParser, ...args: Parameters<typeof original>) {
        if (++calls === failingCall) throw defect;
        return original.apply(this, args);
      } as typeof original;
      await assert.rejects(owner.acquire(request()), (caught) => caught === defect);
      assert.equal(calls, failingCall); rejectReceipt(owner, {});
    } finally { XMLParser.prototype.parse = original; }
    await acquire(owner);
  }
});

test("cancellation before fetch or during the clock cannot issue a receipt", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(authority().acquire({ ...request(), signal: controller.signal }),
    (error) => error instanceof EcbEventTransportError && error.code === "aborted");
  const later = new AbortController();
  const owner = createEcbPolicyDecisionActionCaptureAuthorityV1({
    fetchImpl: async () => response(), nowUnixSeconds: () => { later.abort(); return F; },
  });
  await assert.rejects(owner.acquire({ ...request(), signal: later.signal }),
    (error) => error instanceof EcbEventTransportError && error.code === "aborted");
  rejectReceipt(owner, {});
});

test("fully consistent backdated canonical bundles do not acquire runtime authority", async () => {
  const owner = authority(); const receipt = await acquire(owner); const visible = read(owner, receipt);
  const capture = captureKnownEcbDecisionDocumentHtmlV1(html(), REFERENCE, F - 60);
  assert.ok(capture.status === "available");
  const child = buildEcbPolicyDecisionActionEvidenceV1({ html: html(), capture: capture.data });
  assert.ok(child.status === "available");
  const forged = reconstructEcbPolicyDecisionActionEvidenceV1({ html: html(), capture: capture.data, evidence: child.evidence });
  assert.equal(forged.knownAt, F - 60); assert.equal(forged.sourceVersionId, visible.evidence.sourceVersionId);
  const copy = structuredClone(visible.evidence);
  Reflect.set(copy, "knownAt", F - 60); Reflect.set(copy.capture, "fetchedAt", F - 60);
  for (const imitation of [forged, copy, { html: html(), capture: capture.data, evidence: forged }, { ...receipt, ...forged }]) rejectReceipt(owner, imitation);
  assert.equal(Reflect.set(visible.evidence, "knownAt", F - 60), false);
  assert.equal(Reflect.set(receipt, "knownAt", F - 60), false);
  assert.deepEqual(owner.readAsKnownAt({ receipt, evaluatedAt: at(F - 1) }), { status: "not-known-as-of" });
  assert.equal(read(owner, receipt).evidence.knownAt, F);
});

test("copies, serialization, structural brands and proxy wrapping cannot forge membership", async () => {
  const owner = authority(); const receipt = await acquire(owner);
  const copies: unknown[] = [
    { ...receipt }, Object.assign({}, receipt), structuredClone(receipt), JSON.parse(JSON.stringify(receipt)),
    Object.create(Object.getPrototypeOf(receipt), Object.getOwnPropertyDescriptors(receipt)),
    {}, [], null, undefined, "receipt", { brand: "EcbPolicyDecisionActionCaptureReceiptV1" }, { [Symbol("receiptBrand")]: true },
    new Proxy(receipt, { get() { throw new Error("receipt field inspected"); }, ownKeys() { throw new Error("receipt fields inspected"); } }),
  ];
  for (const copy of copies) rejectReceipt(owner, copy);
  assert.equal(read(owner, receipt).evidence.action, "raise");
});

test("membership rejects before inspecting assessment time or caller evidence", () => {
  const sentinel = new ReferenceError("assessment must not be read");
  const input = { receipt: {}, get evaluatedAt(): string { throw sentinel; } };
  assert.throws(() => authority().readAsKnownAt(input as unknown as ReadEcbPolicyDecisionActionCaptureInputV1), /Unrecognized/);
});

test("assessment equality, offsets and subsecond boundaries use retained Unix seconds", async () => {
  const owner = authority(); const receipt = await acquire(owner);
  for (const evaluatedAt of [at(F - 1), new Date(F * 1_000 - 1).toISOString()]) {
    const result = owner.readAsKnownAt({ receipt, evaluatedAt });
    assert.deepEqual(result, { status: "not-known-as-of" }); assert.ok(Object.isFrozen(result));
    assert.deepEqual(Reflect.ownKeys(result), ["status"]);
  }
  const equal = read(owner, receipt);
  assert.deepEqual(read(owner, receipt, at(F + 1)), equal);
  assert.deepEqual(read(owner, receipt, at().replace(".000", ".999")), equal);
  const offset = new Date((F + 2 * 60 * 60) * 1_000).toISOString().replace("Z", "+02:00");
  assert.deepEqual(read(owner, receipt, offset), equal);
  for (const evaluatedAt of [null, undefined, F, "2026-09-10", "2026-02-30T00:00:00Z", "2026-09-10T12:00:00", "1969-12-31T23:59:59Z"]) {
    assert.throws(() => owner.readAsKnownAt({ receipt, evaluatedAt } as ReadEcbPolicyDecisionActionCaptureInputV1));
  }
});

test("authority instances isolate receipts even for identical source/version semantics", async () => {
  const first = authority(html(), F); const second = authority(html(), F + 60);
  const a = await acquire(first); const b = await acquire(second);
  assert.notEqual(a, b); rejectReceipt(first, b); rejectReceipt(second, a);
  const earlier = read(first, a); const later = read(second, b, at(F + 60));
  assert.equal(earlier.evidence.sourceVersionId, later.evidence.sourceVersionId);
  assert.equal(earlier.evidence.knownAt, F); assert.equal(later.evidence.knownAt, F + 60);
  assert.deepEqual(second.readAsKnownAt({ receipt: b, evaluatedAt: at() }), { status: "not-known-as-of" });
});

test("recapture keeps semantic identity while retaining distinct immutable capture times", async () => {
  let time = F;
  const owner = createEcbPolicyDecisionActionCaptureAuthorityV1({ fetchImpl: async () => response(), nowUnixSeconds: () => time });
  const first = await acquire(owner); time += 60; const second = await acquire(owner);
  assert.notEqual(first, second);
  const a = read(owner, first); const b = read(owner, second, at(time));
  assert.equal(a.evidence.sourceVersionId, b.evidence.sourceVersionId);
  assert.equal(a.evidence.capture.rawCaptureDigest, b.evidence.capture.rawCaptureDigest);
  assert.equal(a.evidence.knownAt, F); assert.equal(b.evidence.knownAt, time);
  assert.equal(read(owner, first, at(time)).evidence.knownAt, F);
  assert.deepEqual(owner.readAsKnownAt({ receipt: second, evaluatedAt: at() }), { status: "not-known-as-of" });
});

test("results are recursively frozen, separately detached and unaffected by exported copies", async () => {
  const owner = authority(); const input = request(); const referenceBefore = structuredClone(input.reference);
  const receipt = await acquire(owner, input);
  assert.deepEqual(input.reference, referenceBefore);
  assert.ok(!Object.isFrozen(input)); assert.ok(!Object.isFrozen(input.reference)); assert.ok(!Object.isFrozen(input.signal));
  const first = read(owner, receipt); const second = read(owner, receipt);
  assert.deepEqual(first, second);
  const objects = new Set<object>();
  eachObject(first, (object) => { objects.add(object); assert.ok(Object.isFrozen(object)); });
  eachObject(second, (object) => { assert.ok(!objects.has(object)); assert.ok(Object.isFrozen(object)); });
  const copy = structuredClone(first); Reflect.set(copy.evidence, "knownAt", 0); Reflect.set(copy.evidence, "action", "lower");
  Reflect.set(copy.evidence.capture.reference, "documentUrl", "https://evil.example/");
  Reflect.set(input.reference, "decisionDate", "2026-09-11");
  assert.deepEqual(read(owner, receipt), second);
});

test("dependency functions and validated reference are detached before asynchronous acquisition", async () => {
  const delivered = deferred<Response>(); const fetching = deferred<void>();
  const dependencies = { fetchImpl: async () => { fetching.complete(); return delivered.promise; }, nowUnixSeconds: () => F };
  const owner = createEcbPolicyDecisionActionCaptureAuthorityV1(dependencies); const input = request();
  const pending = acquire(owner, input); await fetching.promise;
  Reflect.set(input, "reference", { ...REFERENCE, documentUrl: "https://evil.example/" });
  Reflect.set(dependencies, "nowUnixSeconds", () => 0);
  Reflect.set(dependencies, "fetchImpl", async () => { throw new Error("replacement transport used"); });
  delivered.complete(response());
  const result = read(owner, await pending);
  assert.equal(result.evidence.knownAt, F); assert.deepEqual(result.evidence.capture.reference, REFERENCE);
  assert.ok(!Object.isFrozen(dependencies)); assert.ok(!Object.isFrozen(input));
});

test("closed requests, references, reader and dependency inputs reject enumerable/hidden/symbol overrides", async () => {
  const owner = authority(); const receipt = await acquire(owner);
  for (const key of ["clock", "fetchImpl", "fetchedAt", "html", "capture", "evidence", "knownAt", "parserOutput", "sourceAction", Symbol("extra")]) {
    for (const enumerable of [true, false]) {
      const input = request(); Object.defineProperty(input, key, { value: 0, enumerable });
      await assert.rejects(owner.acquire(input), /closed/);
      await assert.rejects(acquireEcbPolicyDecisionActionCaptureV1(input), /closed/);
      const nested = request(); Object.defineProperty(nested.reference, key, { value: 0, enumerable });
      await assert.rejects(owner.acquire(nested), /closed/);
      const readInput = { receipt, evaluatedAt: at() }; Object.defineProperty(readInput, key, { value: 0, enumerable });
      assert.throws(() => owner.readAsKnownAt(readInput), /closed/);
      const dependencies = { fetchImpl: async () => response(), nowUnixSeconds: () => F };
      if (key !== "fetchImpl") {
        Object.defineProperty(dependencies, key, { value: 0, enumerable });
        assert.throws(() => createEcbPolicyDecisionActionCaptureAuthorityV1(dependencies), /closed/);
      }
    }
  }
  for (const input of [null, undefined, [], {}, { ...request(), signal: null }]) {
    await assert.rejects(owner.acquire(input as AcquireEcbPolicyDecisionActionCaptureInputV1));
  }
  for (const dependencies of [null, [], {}, { nowUnixSeconds: 0 }, { nowUnixSeconds: () => F, fetchImpl: 1 }]) {
    assert.throws(() => createEcbPolicyDecisionActionCaptureAuthorityV1(dependencies as unknown as EcbPolicyDecisionActionCaptureDependenciesV1));
  }
});
test("production authority owns its infrastructure and rejects configured-instance receipts", async () => {
  const localOwner = authority(); const localReceipt = await acquire(localOwner);
  assert.throws(() => readEcbPolicyDecisionActionCaptureAsKnownAtV1({ receipt: localReceipt, evaluatedAt: at() }), /Unrecognized/);
  const originalFetch = globalThis.fetch; const originalNow = Date.now;
  let fetches = 0; let clocks = 0;
  try {
    globalThis.fetch = async (url) => { assert.equal(url, REFERENCE.documentUrl); fetches++; return response(); };
    Date.now = () => { assert.equal(fetches, 1); clocks++; return F * 1_000 + 999; };
    const acquired = await acquireEcbPolicyDecisionActionCaptureV1(request());
    assert.ok(acquired.status === "acquired");
    assert.equal(fetches, 1); assert.equal(clocks, 1);
    assert.deepEqual(readEcbPolicyDecisionActionCaptureAsKnownAtV1({ receipt: acquired.receipt, evaluatedAt: at(F - 1) }), { status: "not-known-as-of" });
    const known = readEcbPolicyDecisionActionCaptureAsKnownAtV1({ receipt: acquired.receipt, evaluatedAt: at() });
    assert.ok(known.status === "available"); assert.equal(known.evidence.knownAt, F);
    rejectReceipt(localOwner, acquired.receipt);
    assert.equal(fetches, 1); assert.equal(clocks, 1);
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
});

test("reader uses retained state without source reads, clocks, environment, randomness or timers", async () => {
  let fetches = 0; let clocks = 0;
  const owner = createEcbPolicyDecisionActionCaptureAuthorityV1({
    fetchImpl: async () => { fetches++; return response(); }, nowUnixSeconds: () => { clocks++; return F; },
  });
  const receipt = await acquire(owner);
  const expected = read(owner, receipt);
  const originalNow = Date.now; const originalRandom = Math.random; const originalFetch = globalThis.fetch;
  const timerKeys = ["setTimeout", "setInterval", "setImmediate"] as const;
  const originalTimers = timerKeys.map((key) => globalThis[key]);
  const forbidden = () => { throw new Error("reader performed a side effect"); };
  try {
    Date.now = forbidden; Math.random = forbidden; globalThis.fetch = forbidden;
    for (const key of timerKeys) Reflect.set(globalThis, key, forbidden);
    assert.deepEqual(owner.readAsKnownAt({ receipt, evaluatedAt: at(F - 1) }), { status: "not-known-as-of" });
    assert.deepEqual(read(owner, receipt), expected); assert.deepEqual(read(owner, receipt), expected);
    assert.equal(fetches, 1); assert.equal(clocks, 1);
  } finally {
    Date.now = originalNow; Math.random = originalRandom; globalThis.fetch = originalFetch;
    timerKeys.forEach((key, index) => Reflect.set(globalThis, key, originalTimers[index]));
  }
});

test("fresh authority import performs no fetch, clock sampling, randomness or scheduling", () => {
  const modulePath = resolve("src/lib/markets/services/ecbPolicyDecisionActionCaptureAuthority.ts");
  const script = `
    const fs = require('node:fs'), ts = require('typescript'), Module = require('node:module'), path = require('node:path');
    const originalLoad = Module._load;
    Module._load = function(name, parent, main) {
      if (name === 'server-only') return {};
      if (name.startsWith('@/')) name = path.resolve('src', name.slice(2));
      return originalLoad.call(this, name, parent, main);
    };
    require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
    }).outputText, filename);
    const forbidden = () => { throw new Error('import-time side effect'); };
    globalThis.fetch = forbidden; Date.now = forbidden; Math.random = forbidden;
    globalThis.setTimeout = forbidden; globalThis.setInterval = forbidden; globalThis.setImmediate = forbidden;
    const exports = require(${JSON.stringify(modulePath)});
    require('node:assert/strict').deepEqual(Object.keys(exports).sort(), [
      'acquireEcbPolicyDecisionActionCaptureV1', 'createEcbPolicyDecisionActionCaptureAuthorityV1',
      'readEcbPolicyDecisionActionCaptureAsKnownAtV1'
    ].sort());
  `;
  const result = spawnSync(process.execPath, ["-e", script], { cwd: process.cwd(), encoding: "utf8", timeout: 20_000 });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("authority dependency surface excludes persistence, environment and consumer wiring", () => {
  const modulePath = resolve("src/lib/markets/services/ecbPolicyDecisionActionCaptureAuthority.ts");
  const source = readFileSync(modulePath, "utf8");
  const ast = ts.createSourceFile(modulePath, source, ts.ScriptTarget.Latest, true);
  const imports = ast.statements.filter(ts.isImportDeclaration).map((node) => (node.moduleSpecifier as ts.StringLiteral).text);
  assert.deepEqual(imports, ["server-only", "../events/eventClock",
    "../providers/ecb/monetaryPolicy/acquisitionTransport", "../providers/ecb/monetaryPolicy/parser",
    "../providers/ecb/monetaryPolicy/policyDecisionActionEvidence", "../providers/ecb/monetaryPolicy/policyDecisionFacts"]);
  const forbiddenCalls = new Set(["setTimeout", "setInterval", "setImmediate", "Math.random"]);
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) assert.ok(!forbiddenCalls.has(node.expression.getText(ast)));
    if (ts.isPropertyAccessExpression(node)) assert.notEqual(node.getText(ast), "process.env");
    ts.forEachChild(node, visit);
  }
  visit(ast);
});

test("closed source reference is read once before validation and detachment", async () => {
  const owner = authority(); let reads = 0;
  const laterReference = { ...REFERENCE, documentUrl: "https://evil.example/", knownAt: 0 };
  const input = { get reference() { return ++reads === 1 ? { ...REFERENCE } : laterReference; }, signal: new AbortController().signal };
  const receipt = await acquire(owner, input);
  assert.equal(reads, 1); assert.deepEqual(read(owner, receipt).evidence.capture.reference, REFERENCE);
});
