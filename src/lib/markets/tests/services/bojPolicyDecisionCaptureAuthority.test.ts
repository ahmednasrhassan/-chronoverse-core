import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { XMLParser } from "fast-xml-parser";
import ts from "typescript";
import {
  acquireBojPolicyDecisionCaptureV1, createBojPolicyDecisionCaptureAuthorityV1, readBojPolicyDecisionCaptureAsKnownAtV1,
  type AcquireBojPolicyDecisionCaptureInputV1, type BojPolicyDecisionCaptureAuthorityV1,
  type BojPolicyDecisionCaptureDependenciesV1, type BojPolicyDecisionCaptureReceiptV1, type ReadBojPolicyDecisionCaptureInputV1,
} from "../../services/bojPolicyDecisionCaptureAuthority";
import { BOJ_POLICY_MAX_RESPONSE_BYTES_V1, BojPolicyTransportError, bojPolicyDocumentUrlV1 } from "../../providers/boj/transport";
import { BojPolicyValidationError, parseBojPolicyDocumentV1 } from "../../providers/boj/facts";
import { buildBojPolicyEvidenceV1, readBojPolicyFactV1 } from "../../providers/boj/canonical";
import { buildBojPolicyVintageKeyV1 } from "../../persistence/bojPolicyVintageRedis";
import { captureTime as F, date, document, storage } from "../boj/fixtures";

// Existing reduced offline publisher-layout fixtures; no live official acquisition.
const at = (time = F) => new Date(time * 1_000).toISOString();
const request = (decisionDate = date): AcquireBojPolicyDecisionCaptureInputV1 => ({ decisionDate, signal: new AbortController().signal });
const response = (body: BodyInit | null = document().html) => new Response(body, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
const authority = (body = document().html, time = F) => createBojPolicyDecisionCaptureAuthorityV1({
  fetchImpl: async () => response(body), nowUnixSeconds: () => time,
});
async function acquire(owner: BojPolicyDecisionCaptureAuthorityV1, input = request()) {
  const result = await owner.acquire(input);
  assert.deepEqual(Reflect.ownKeys(result), ["status", "receipt"]); assert.equal(result.status, "acquired");
  assert.ok(Object.isFrozen(result)); return result.receipt;
}
function read(owner: BojPolicyDecisionCaptureAuthorityV1, receipt: BojPolicyDecisionCaptureReceiptV1, evaluatedAt = at()) {
  const result = owner.readAsKnownAt({ receipt, evaluatedAt }); assert.ok(result.status === "available"); return result;
}
const rejectReceipt = (owner: BojPolicyDecisionCaptureAuthorityV1, receipt: unknown) =>
  assert.throws(() => owner.readAsKnownAt({ receipt: receipt as BojPolicyDecisionCaptureReceiptV1, evaluatedAt: at() }), /Unrecognized/);
function eachObject(value: unknown, visit: (object: object) => void): void {
  if (typeof value !== "object" || value === null) return;
  visit(value); for (const key of Reflect.ownKeys(value)) eachObject(Reflect.get(value, key), visit);
}
function deferred<T>() {
  let complete!: (value: T) => void;
  const promise = new Promise<T>((resolve) => { complete = resolve; }); return { promise, complete };
}

for (const [kind, decisionDate, target] of [
  ["statement", date, "0"], ["guideline-change", date, "0.5"],
  ["guideline-change", date, "0.5 to 0.75"], ["framework-transition", "2024-03-19", "0 to 0.1"],
] as const) test("trusted capture preserves " + kind + " " + target, async () => {
  const doc = document({ kind, date: decisionDate, target });
  const owner = authority(doc.html); const receipt = await acquire(owner, request(decisionDate)); const result = read(owner, receipt);
  const expected = buildBojPolicyEvidenceV1(parseBojPolicyDocumentV1(doc, decisionDate), F);
  assert.deepEqual(result.capture.evidence, expected);
  assert.equal(result.capture.evidence.fact.target.qualification, "around");
  assert.equal(result.capture.knownAt, F); assert.equal(result.capture.evidence.metadata.fetchedAt, F);
  assert.equal(result.capture.decodedSourceDigest, `sha256:${createHash("sha256").update(doc.html, "utf8").digest("hex")}`);
  assert.deepEqual(Reflect.ownKeys(receipt), []); assert.equal(Object.getPrototypeOf(receipt), null); assert.ok(Object.isFrozen(receipt));
  assert.deepEqual(Object.keys(result.capture).sort(), ["decodedSourceDigest", "evidence", "knownAt"]);
  assert.equal(Object.hasOwn(result.capture, "html"), false);
  assert.equal(expected.metadata.provider, "boj"); assert.equal(expected.fact.productId, "eurjpy");
  assert.equal(expected.metadata.originalPublisher, "Bank of Japan");
  assert.equal(expected.fact.instrument, "uncollateralized-overnight-call-rate-guideline");
  assert.equal(expected.fact.documentKind, kind); assert.equal(expected.fact.decisionDate, decisionDate);
  assert.equal(expected.metadata.canonicalSeriesId, `japan-boj-policy-decision:${decisionDate}`);
  assert.equal(expected.metadata.sourceSeriesId, `BOJ:overnight-call-rate-guideline:${decisionDate}`);
  assert.equal(expected.metadata.sourceUrl, doc.url);
});

test("clock follows complete streamed body, decoding and parsing exactly once", async () => {
  const order: string[] = []; const fetching = deferred<void>(); const delivered = deferred<Response>(); const reading = deferred<void>();
  let finish!: () => void; let clocks = 0;
  const originalDecode = TextDecoder.prototype.decode; const originalParse = XMLParser.prototype.parse;
  try {
    TextDecoder.prototype.decode = function (this: TextDecoder, ...args: Parameters<typeof originalDecode>) {
      const decoded = originalDecode.apply(this, args); order.push("decoded"); return decoded;
    };
    XMLParser.prototype.parse = function (this: XMLParser, ...args: Parameters<typeof originalParse>) {
      const parsed = originalParse.apply(this, args); order.push("parsed"); return parsed;
    } as typeof originalParse;
    const owner = createBojPolicyDecisionCaptureAuthorityV1({
      fetchImpl: async (url, init) => {
        assert.equal(url, document().url); assert.equal(init?.method, "GET");
        assert.equal(init?.cache, "no-store"); assert.equal(init?.redirect, "error");
        order.push("fetch"); fetching.complete(); return delivered.promise;
      },
      nowUnixSeconds: () => {
        clocks++; assert.equal(order[0], "fetch"); assert.ok(order.indexOf("body-complete") < order.indexOf("decoded"));
        assert.ok(order.indexOf("decoded") < order.indexOf("parsed")); assert.ok(order.includes("parsed")); order.push("clock"); return F;
      },
    });
    const pending = acquire(owner); await fetching.promise; assert.equal(clocks, 0);
    const html = document().html;
    delivered.complete(response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(html.slice(0, 80)));
        finish = () => { controller.enqueue(new TextEncoder().encode(html.slice(80))); order.push("body-complete"); controller.close(); };
      }, pull() { reading.complete(); },
    })));
    await reading.promise; assert.equal(clocks, 0); assert.equal(order.includes("decoded"), false);
    finish(); const receipt = await pending;
    assert.equal(order.at(-1), "clock"); assert.equal(clocks, 1); assert.equal(read(owner, receipt).capture.knownAt, F);
  } finally { TextDecoder.prototype.decode = originalDecode; XMLParser.prototype.parse = originalParse; }
});

for (const [label, fetchImpl, code] of [
  ["transport", async () => { throw new BojPolicyTransportError("network"); }, "network"],
  ["HTTP", async () => new Response("failure", { status: 503 }), "http"],
  ["oversized body", async () => response("x".repeat(BOJ_POLICY_MAX_RESPONSE_BYTES_V1 + 1)), "response-too-large"],
  ["invalid UTF-8", async () => response(new Uint8Array([0xc3, 0x28])), "invalid-encoding"],
  ["missing body", async () => response(null), "missing-body"],
  ["wrong content type", async () => new Response("bad", { headers: { "Content-Type": "application/pdf" } }), "content-type"],
] as const) test(label + " failure issues no receipt and samples no clock", async () => {
  let clocks = 0;
  const owner = createBojPolicyDecisionCaptureAuthorityV1({ fetchImpl, nowUnixSeconds: () => { clocks++; return F; } });
  await assert.rejects(owner.acquire(request()), (error) => error instanceof BojPolicyTransportError && error.code === code);
  assert.equal(clocks, 0); rejectReceipt(owner, {});
});

for (const [property, value] of [["redirected", true], ["url", "https://evil.example/decision"],
  ["url", document().url.replace("state_2025", "mpr_2025")], ["url", bojPolicyDocumentUrlV1("2025-01-25")]] as const) {
  test("owned transport rejects " + property + " " + value + " before clock", async () => {
    let clocks = 0; const escaped = response(); Object.defineProperty(escaped, property, { value });
    const owner = createBojPolicyDecisionCaptureAuthorityV1({ fetchImpl: async () => escaped, nowUnixSeconds: () => { clocks++; return F; } });
    await assert.rejects(owner.acquire(request()), (error) => error instanceof BojPolicyTransportError && error.code === "redirect"); assert.equal(clocks, 0);
  });
}

test("invalid requested dates and caller-supplied URLs cannot initiate acquisition", async () => {
  let fetches = 0; let clocks = 0;
  const owner = createBojPolicyDecisionCaptureAuthorityV1({
    fetchImpl: async () => { fetches++; throw new Error("unexpected fetch"); },
    nowUnixSeconds: () => { clocks++; throw new Error("unexpected clock"); },
  });
  for (const [decisionDate, code] of [["invalid", "date"], ["2025-02-30", "date"],
    ["2024-03-18", "unsupported-historical-regime"], ["https://evil.example/decision", "date"]] as const) {
    let acquisitionResult: Awaited<ReturnType<typeof owner.acquire>> | undefined;
    await assert.rejects(async () => { acquisitionResult = await owner.acquire(request(decisionDate)); },
      (error) => error instanceof BojPolicyValidationError && error.code === code);
    assert.equal(fetches, 0, decisionDate + " must fail before fetch");
    assert.equal(clocks, 0, decisionDate + " must fail before clock");
    assert.equal(acquisitionResult, undefined, decisionDate + " must issue no receipt");
  }
  for (const documentUrl of ["https://evil.example/decision", document().url + "?query=1", document().url.replace("https:", "http:")]) {
    await assert.rejects(owner.acquire({ ...request(), documentUrl } as AcquireBojPolicyDecisionCaptureInputV1), /closed/);
    await assert.rejects(acquireBojPolicyDecisionCaptureV1({ ...request(), documentUrl } as AcquireBojPolicyDecisionCaptureInputV1), /closed/);
  }
});

for (const [body, decisionDate, code] of [
  ["<html>malformed</html>", date, "document"],
  [document().html.replace("<h1>Change in the Guideline for Money Market Operations", "<h1>Unsupported title"), date, "document"],
  [document({ target: "-0.1" }).html, date, "target"],
  [document({ target: "0.75 to 0.5" }).html, date, "target"],
  [document({ date: "2025-01-25", effective: null }).html, date, "date"],
  [document({ date: "2024-03-19" }).html, "2024-03-19", "unsupported-historical-regime"],
] as const) test("source/canonical failure " + code + " precedes clock", async () => {
  let clocks = 0;
  const owner = createBojPolicyDecisionCaptureAuthorityV1({ fetchImpl: async () => response(body), nowUnixSeconds: () => { clocks++; return F; } });
  await assert.rejects(owner.acquire(request(decisionDate)), (error) => error instanceof BojPolicyValidationError && error.code === code);
  assert.equal(clocks, 0); rejectReceipt(owner, {});
});

test("clock failure and invalid values issue no capability", async () => {
  const defect = new ReferenceError("clock sentinel");
  for (const value of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, null, undefined, "1791115200"]) {
    let calls = 0;
    const owner = createBojPolicyDecisionCaptureAuthorityV1({ fetchImpl: async () => response(), nowUnixSeconds: () => { calls++; return value as number; } });
    await assert.rejects(owner.acquire(request()), /authoritative BoJ capture time/); assert.equal(calls, 1); rejectReceipt(owner, {});
  }
  const owner = createBojPolicyDecisionCaptureAuthorityV1({ fetchImpl: async () => response(), nowUnixSeconds: () => { throw defect; } });
  await assert.rejects(owner.acquire(request()), (error) => error === defect); rejectReceipt(owner, {});
});

test("explicit release later than capture fails existing canonical time validation", async () => {
  const doc = document({ release: "Change in the Guideline for Money Market Operations -- Friday, January 24 at 12:23 JST" });
  const fact = parseBojPolicyDocumentV1(doc, date); assert.ok(fact.releaseTimestamp !== null);
  const owner = authority(doc.html, fact.releaseTimestamp - 1);
  await assert.rejects(owner.acquire(request()), (error) => error instanceof BojPolicyValidationError && error.code === "date"); rejectReceipt(owner, {});
});

test("cancellation before fetch, during body and during clock cannot issue receipts", async () => {
  const before = new AbortController(); before.abort(); let clocks = 0;
  const owner = createBojPolicyDecisionCaptureAuthorityV1({
    fetchImpl: async () => { throw new Error("unexpected fetch"); }, nowUnixSeconds: () => { clocks++; return F; },
  });
  await assert.rejects(owner.acquire({ ...request(), signal: before.signal }), (e) => e instanceof BojPolicyTransportError && e.code === "aborted"); assert.equal(clocks, 0);
  const during = new AbortController(); const reading = deferred<void>(); let cancelled = false;
  const bodyOwner = createBojPolicyDecisionCaptureAuthorityV1({
    fetchImpl: async () => response(new ReadableStream<Uint8Array>({ pull() { reading.complete(); }, cancel() { cancelled = true; } })),
    nowUnixSeconds: () => { clocks++; return F; },
  });
  const pending = bodyOwner.acquire({ ...request(), signal: during.signal }); await reading.promise; during.abort();
  await assert.rejects(pending, (e) => e instanceof BojPolicyTransportError && e.code === "aborted"); assert.equal(clocks, 0); assert.equal(cancelled, true);
  const after = new AbortController();
  const clockOwner = createBojPolicyDecisionCaptureAuthorityV1({ fetchImpl: async () => response(), nowUnixSeconds: () => { after.abort(); return F; } });
  await assert.rejects(clockOwner.acquire({ ...request(), signal: after.signal }), (e) => e instanceof BojPolicyTransportError && e.code === "aborted"); rejectReceipt(clockOwner, {});
});

test("programming defects propagate unchanged without issuing receipts", async () => {
  for (const defect of [new TypeError("fetch defect"), new ReferenceError("fetch defect")]) {
    const owner = createBojPolicyDecisionCaptureAuthorityV1({ fetchImpl: async () => { throw defect; }, nowUnixSeconds: () => F });
    await assert.rejects(owner.acquire(request()), (error) => error === defect); rejectReceipt(owner, {});
  }
  const original = XMLParser.prototype.parse; const defect = new ReferenceError("parser defect"); const owner = authority();
  try {
    XMLParser.prototype.parse = () => { throw defect; };
    await assert.rejects(owner.acquire(request()), (error) => error === defect); rejectReceipt(owner, {});
  } finally { XMLParser.prototype.parse = original; }
});

test("copies, serialization, frozen fakes, brands and Proxy wrappers cannot mint membership", async () => {
  const owner = authority(); const receipt = await acquire(owner);
  for (const imitation of [
    {}, [], null, undefined, "receipt", { ...receipt }, Object.assign({}, receipt), structuredClone(receipt),
    JSON.parse(JSON.stringify(receipt)), Object.freeze(Object.create(null)),
    Object.create(Object.getPrototypeOf(receipt), Object.getOwnPropertyDescriptors(receipt)),
    { brand: "BojPolicyDecisionCaptureReceiptV1" }, { [Symbol("receiptBrand")]: true },
    new Proxy(receipt, { get() { throw new Error("inspected receipt"); }, ownKeys() { throw new Error("inspected receipt"); } }),
  ]) rejectReceipt(owner, imitation);
  assert.equal(read(owner, receipt).capture.knownAt, F);
});

test("membership precedes assessment getters even for future or malformed assessment", () => {
  const sentinel = new ReferenceError("assessment getter reached");
  const input = { receipt: {}, get evaluatedAt(): string { throw sentinel; } };
  assert.throws(() => authority().readAsKnownAt(input as ReadBojPolicyDecisionCaptureInputV1), /Unrecognized/);
  for (const evaluatedAt of [at(F - 1), "invalid"]) assert.throws(() => readBojPolicyDecisionCaptureAsKnownAtV1({ receipt: {} as BojPolicyDecisionCaptureReceiptV1, evaluatedAt }), /Unrecognized/);
});

test("separate configured authorities and production isolate receipts", async () => {
  const first = authority(); const second = authority(); const a = await acquire(first); const b = await acquire(second);
  rejectReceipt(first, b); rejectReceipt(second, a);
  for (const receipt of [a, b]) assert.throws(() => readBojPolicyDecisionCaptureAsKnownAtV1({ receipt, evaluatedAt: at() }), /Unrecognized/);
});

test("consistent earlier canonical evidence and coordinated legacy storage backdating confer no authority", async () => {
  const owner = authority(); const receipt = await acquire(owner); const original = read(owner, receipt).capture;
  const earlier = F - 60; const rebuilt = buildBojPolicyEvidenceV1(original.evidence.fact, earlier);
  assert.deepEqual(readBojPolicyFactV1(date, rebuilt), original.evidence.fact);
  assert.equal(rebuilt.metadata.sourceVersionId, original.evidence.metadata.sourceVersionId);
  const store = storage(); await store.adapter.append(date, original.evidence);
  const key = buildBojPolicyVintageKeyV1(date); const stored = JSON.parse(store.entries.get(key)![0]!.member);
  stored.knownAt = earlier; stored.series.metadata.fetchedAt = earlier;
  store.entries.set(key, [{ score: earlier, member: JSON.stringify(stored) }]);
  const selected = await store.adapter.readAsKnownAt(date, earlier); assert.ok(selected.status === "available"); assert.equal(selected.snapshot.knownAt, earlier);
  for (const imitation of [rebuilt, selected.snapshot, stored, { ...original, knownAt: earlier, evidence: rebuilt },
    { ...receipt, evidence: rebuilt }, { html: document().html, evidence: rebuilt, knownAt: earlier }]) {
    rejectReceipt(owner, imitation);
    assert.throws(() => readBojPolicyDecisionCaptureAsKnownAtV1({ receipt: imitation as BojPolicyDecisionCaptureReceiptV1, evaluatedAt: at(earlier) }), /Unrecognized/);
  }
  assert.deepEqual(owner.readAsKnownAt({ receipt, evaluatedAt: at(earlier) }), { status: "not-known-as-of" });
  assert.equal(read(owner, receipt).capture.knownAt, F); assert.deepEqual(Object.keys(owner).sort(), ["acquire", "readAsKnownAt"]);
});

test("assessment boundaries, subseconds, timezone offsets and payload-free future redaction", async () => {
  const owner = authority(); const receipt = await acquire(owner);
  for (const evaluatedAt of [at(F - 1), new Date(F * 1_000 - 1).toISOString()]) {
    const result = owner.readAsKnownAt({ receipt, evaluatedAt }); assert.deepEqual(result, { status: "not-known-as-of" });
    assert.deepEqual(Reflect.ownKeys(result), ["status"]); assert.ok(Object.isFrozen(result));
  }
  const equal = read(owner, receipt);
  for (const evaluatedAt of [at(F + 1), at().replace(".000", ".001"), at().replace(".000", ".999"),
    new Date((F + 2 * 60 * 60) * 1_000).toISOString().replace("Z", "+02:00")]) assert.deepEqual(read(owner, receipt, evaluatedAt), equal);
  for (const evaluatedAt of [null, undefined, F, "2026-10-04", "2026-02-30T00:00:00Z", "2026-10-04T12:00:00", "1969-12-31T23:59:59Z"]) {
    assert.throws(() => owner.readAsKnownAt({ receipt, evaluatedAt } as ReadBojPolicyDecisionCaptureInputV1));
  }
});

test("recapture preserves legacy hash semantics with independent immutable acquisition times", async () => {
  let time = F; let body = document().html;
  const owner = createBojPolicyDecisionCaptureAuthorityV1({ fetchImpl: async () => response(body), nowUnixSeconds: () => time });
  const first = await acquire(owner); time += 60; const second = await acquire(owner);
  const a = read(owner, first).capture; const b = read(owner, second, at(time)).capture;
  assert.notEqual(first, second); assert.equal(a.evidence.metadata.sourceVersionId, b.evidence.metadata.sourceVersionId);
  assert.equal(a.decodedSourceDigest, b.decodedSourceDigest); assert.equal(a.knownAt, F); assert.equal(b.knownAt, F + 60);
  assert.deepEqual(owner.readAsKnownAt({ receipt: second, evaluatedAt: at() }), { status: "not-known-as-of" });
  body = body.replace("Basic loan rate 0.75", "Basic loan rate 0.85"); time += 60;
  const c = read(owner, await acquire(owner), at(time)).capture;
  assert.equal(c.evidence.metadata.sourceVersionId, a.evidence.metadata.sourceVersionId); assert.notEqual(c.decodedSourceDigest, a.decodedSourceDigest);
});

test("admitted reads are detached and recursively frozen without mutating caller objects", async () => {
  const owner = authority(); const input = request(); const receipt = await acquire(owner, input);
  const readInput = { receipt, evaluatedAt: at() }; const first = owner.readAsKnownAt(readInput); const second = read(owner, receipt);
  assert.deepEqual(first, second); const objects = new Set<object>();
  eachObject(first, (object) => { objects.add(object); assert.ok(Object.isFrozen(object)); });
  eachObject(second, (object) => { assert.ok(!objects.has(object)); assert.ok(Object.isFrozen(object)); });
  const copy = structuredClone(second); Reflect.set(copy.capture, "knownAt", 0);
  Reflect.set(copy.capture.evidence.metadata, "fetchedAt", 0); Reflect.set(copy.capture.evidence.fact, "sourceUrl", "https://evil.example/");
  assert.equal(Reflect.set(receipt, "knownAt", 0), false); assert.equal(Reflect.set(second.capture.evidence.fact.target, "value", 99), false);
  assert.deepEqual(read(owner, receipt), second);
  assert.ok(!Object.isFrozen(input)); assert.ok(!Object.isFrozen(input.signal)); assert.ok(!Object.isFrozen(readInput)); assert.deepEqual(Object.keys(input), ["decisionDate", "signal"]);
});

test("caller fields and infrastructure functions are read once and detached before asynchronous acquisition", async () => {
  const delivered = deferred<Response>(); const fetching = deferred<void>(); let dates = 0; let signals = 0;
  const signal = new AbortController().signal;
  const deps = { fetchImpl: async () => { fetching.complete(); return delivered.promise; }, nowUnixSeconds: () => F };
  const owner = createBojPolicyDecisionCaptureAuthorityV1(deps);
  const input = { get decisionDate() { return ++dates === 1 ? date : "invalid"; }, get signal() { signals++; return signal; } };
  const pending = acquire(owner, input); await fetching.promise;
  Reflect.set(deps, "fetchImpl", async () => { throw new Error("replacement fetch used"); }); Reflect.set(deps, "nowUnixSeconds", () => 0);
  delivered.complete(response()); const result = read(owner, await pending);
  assert.equal(dates, 1); assert.equal(signals, 1); assert.equal(result.capture.knownAt, F); assert.ok(!Object.isFrozen(deps)); assert.ok(!Object.isFrozen(input));
});

test("closed requests, reads and factory dependencies reject visible, hidden and symbol overrides", async () => {
  const owner = authority(); const receipt = await acquire(owner);
  for (const key of ["html", "capture", "fetchedAt", "knownAt", "fact", "evidence", "provenance", "sourceVersionId", "parserVersion",
    "semanticDigest", "rawDigest", "decodedSourceDigest", "clock", "fetchImpl", "loadDocument", "sourceAction", Symbol("extra")]) {
    for (const enumerable of [true, false]) {
      const input = request(); Object.defineProperty(input, key, { value: 0, enumerable });
      await assert.rejects(owner.acquire(input), /closed/); await assert.rejects(acquireBojPolicyDecisionCaptureV1(input), /closed/);
      const assessment = { receipt, evaluatedAt: at() }; Object.defineProperty(assessment, key, { value: 0, enumerable }); assert.throws(() => owner.readAsKnownAt(assessment), /closed/);
      if (key !== "fetchImpl") {
        const deps = { fetchImpl: async () => response(), nowUnixSeconds: () => F }; Object.defineProperty(deps, key, { value: 0, enumerable });
        assert.throws(() => createBojPolicyDecisionCaptureAuthorityV1(deps), /closed/);
      }
    }
  }
  for (const input of [null, undefined, [], {}, { ...request(), signal: null }]) await assert.rejects(owner.acquire(input as AcquireBojPolicyDecisionCaptureInputV1));
  for (const deps of [null, [], {}, { fetchImpl: 1, nowUnixSeconds: () => F }, { fetchImpl: async () => response(), nowUnixSeconds: 0 }]) {
    assert.throws(() => createBojPolicyDecisionCaptureAuthorityV1(deps as unknown as BojPolicyDecisionCaptureDependenciesV1));
  }
});

test("production infrastructure owns acquisition and assessment uses no current clock or network", async () => {
  const localOwner = authority(); const localReceipt = await acquire(localOwner);
  const originalFetch = globalThis.fetch; const originalNow = Date.now; let fetches = 0; let clocks = 0;
  try {
    globalThis.fetch = async (url) => { fetches++; assert.equal(url, document().url); return response(); };
    Date.now = () => { clocks++; assert.equal(fetches, 1); return F * 1_000 + 999; };
    const result = await acquireBojPolicyDecisionCaptureV1(request()); const receipt = result.receipt; rejectReceipt(localOwner, receipt);
    assert.throws(() => readBojPolicyDecisionCaptureAsKnownAtV1({ receipt: localReceipt, evaluatedAt: at() }), /Unrecognized/);
    globalThis.fetch = () => { throw new Error("reader fetched"); }; Date.now = () => { throw new Error("reader sampled clock"); };
    assert.deepEqual(readBojPolicyDecisionCaptureAsKnownAtV1({ receipt, evaluatedAt: at(F - 1) }), { status: "not-known-as-of" });
    const known = readBojPolicyDecisionCaptureAsKnownAtV1({ receipt, evaluatedAt: at() }); assert.ok(known.status === "available"); assert.equal(known.capture.knownAt, F);
    assert.equal(fetches, 1); assert.equal(clocks, 1);
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
});

test("reader performs no acquisition, clock sampling, randomness or scheduling", async () => {
  const owner = authority(); const receipt = await acquire(owner); const expected = read(owner, receipt);
  const originalFetch = globalThis.fetch; const originalNow = Date.now; const originalRandom = Math.random;
  const timers = ["setTimeout", "setInterval", "setImmediate"] as const; const originals = timers.map((key) => globalThis[key]);
  const forbidden = () => { throw new Error("reader side effect"); };
  try {
    globalThis.fetch = forbidden; Date.now = forbidden; Math.random = forbidden; timers.forEach((key) => Reflect.set(globalThis, key, forbidden));
    assert.deepEqual(read(owner, receipt), expected); assert.deepEqual(owner.readAsKnownAt({ receipt, evaluatedAt: at(F - 1) }), { status: "not-known-as-of" });
  } finally {
    globalThis.fetch = originalFetch; Date.now = originalNow; Math.random = originalRandom;
    timers.forEach((key, index) => Reflect.set(globalThis, key, originals[index]));
  }
});

test("browser acquisition and factory access are rejected", async () => {
  const owner = authority(); Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  try { await assert.rejects(owner.acquire(request()), /server-only/); assert.throws(() => authority(), /server-only/); }
  finally { Reflect.deleteProperty(globalThis, "window"); }
});

test("fresh import performs no source reads, clock, timers, environment or storage work", () => {
  const modulePath = resolve("src/lib/markets/services/bojPolicyDecisionCaptureAuthority.ts");
  const script = `
    const fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path');
    const forbidden=()=>{throw new Error('import side effect');};
    const original=Module._load;
    Module._load=function(name,parent,main){
      if(name==='server-only')return {};
      if(/redis|persistence|r2|aws-sdk/i.test(name))throw new Error('storage import');
      if(name.startsWith('@/'))name=path.resolve('src',name.slice(2));
      return original.call(this,name,parent,main);
    };
    require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{
      compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}
    }).outputText,f);
    const assert=require('node:assert/strict');
    globalThis.fetch=forbidden;Date.now=forbidden;Math.random=forbidden;
    globalThis.setTimeout=forbidden;globalThis.setInterval=forbidden;globalThis.setImmediate=forbidden;
    const originalEnv=process.env;
    process.env=new Proxy(originalEnv,{get:forbidden,ownKeys:forbidden});
    let exports;
    try{exports=require(${JSON.stringify(modulePath)});}finally{process.env=originalEnv;}
    assert.deepEqual(Object.keys(exports).sort(),[
      'acquireBojPolicyDecisionCaptureV1','createBojPolicyDecisionCaptureAuthorityV1','readBojPolicyDecisionCaptureAsKnownAtV1'
    ].sort());
  `;
  const result = spawnSync(process.execPath, ["-e", script], { cwd: process.cwd(), encoding: "utf8", timeout: 20_000 });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("minimal semantic surface has no action, analytic, invented event or raw-source fields", async () => {
  const owner = authority(); const result = read(owner, await acquire(owner));
  const prohibited = new Set(["action", "sourceAction", "sourceActionEvidence", "direction", "predecessor", "priorSelection",
    "delta", "midpoint", "representativeRate", "differential", "spread", "stance", "fxDirection", "confidence", "recommendation",
    "tradeSignal", "marketConfirmation", "canonicalEventId", "parserVersion", "rawCaptureDigest", "html"]);
  eachObject(result, (object) => { for (const key of Reflect.ownKeys(object)) assert.ok(typeof key === "string" && !prohibited.has(key)); });
  const modulePath = resolve("src/lib/markets/services/bojPolicyDecisionCaptureAuthority.ts");
  const source = readFileSync(modulePath, "utf8"); const ast = ts.createSourceFile(modulePath, source, ts.ScriptTarget.Latest, true);
  const imports = ast.statements.filter(ts.isImportDeclaration).map((node) => (node.moduleSpecifier as ts.StringLiteral).text);
  assert.deepEqual(imports, ["server-only", "node:crypto", "../events/eventClock", "../providers/boj/transport", "../providers/boj/facts", "../providers/boj/canonical"]);
  const forbiddenCalls = new Set(["setTimeout", "setInterval", "setImmediate", "Math.random"]);
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) assert.ok(!forbiddenCalls.has(node.expression.getText(ast)));
    if (ts.isPropertyAccessExpression(node)) assert.notEqual(node.getText(ast), "process.env");
    ts.forEachChild(node, visit);
  }
  visit(ast);
});
