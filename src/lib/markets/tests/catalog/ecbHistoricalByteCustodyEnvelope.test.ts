import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  createEcbHistoricalByteCustodyEnvelopeV1,
  ECB_HISTORICAL_BYTE_CUSTODY_ENVELOPE_SCHEMA_V1,
  ECB_HISTORICAL_MAX_ENVELOPE_JSON_BYTES_V1,
  ECB_HISTORICAL_MAX_ENVELOPE_METADATA_BYTES_V1,
  ECB_HISTORICAL_MAX_ENVELOPE_METADATA_STRING_BYTES_V1,
  rehydrateEcbHistoricalByteCustodyEnvelopeV1,
  type EcbHistoricalByteCustodyEnvelopeV1,
  type EcbHistoricalByteCustodyEnvelopeResultV1,
  type EcbHistoricalByteCustodyEnvelopeFailureV1,
} from "../../catalog/ecbHistoricalByteCustodyEnvelope";
import {
  createEcbHistoricalAdmissionModelV1,
  ECB_HISTORICAL_MAX_PAYLOAD_BYTES_V1,
  ECB_HISTORICAL_PAYLOAD_ENCODING_V1,
  planEcbHistoricalAdmissionV1,
  prepareEcbHistoricalAdmissionCandidateV1,
} from "../../catalog/ecbHistoricalAdmissionPlanning";
import { normalizeEcbMonetaryPolicyEventV1 } from "../../events/ecbMonetaryPolicy";
import { buildEcbMonetaryPolicyEventSnapshotV1 } from "../../events/ecbMonetaryPolicyMemory";

// Synthetic capture evidence only; no real history, ownership or storage claims.
const BASE = Date.parse("2026-09-10T12:20:00.000Z") / 1_000;
const DECISION_URL = "https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp260910~abc123.en.html";

function payload(offset = 0, documentUrl = DECISION_URL) {
  return JSON.stringify(buildEcbMonetaryPolicyEventSnapshotV1(normalizeEcbMonetaryPolicyEventV1({
    canonicalMeetingDate: "2026-09-10",
    schedule: { meetingDate: "2026-09-10", fetchedAt: BASE + offset - 1 },
    decision: {
      decisionDate: "2026-09-10", documentUrl, contentDigest: "a".repeat(64),
      fetchedAt: BASE + offset, firstObservedAt: BASE + offset - 2, actualReleasedAt: null,
      rates: { depositFacility: 2, mainRefinancingOperations: 2.15,
        marginalLendingFacility: 2.4, effectiveDate: "2026-09-16" },
    },
  })));
}

function envelope(text = payload()): EcbHistoricalByteCustodyEnvelopeV1 {
  const result = createEcbHistoricalByteCustodyEnvelopeV1(text);
  assert.equal(result.status, "envelope");
  if (result.status !== "envelope") throw new Error("Invalid synthetic envelope");
  return result;
}

function rejected(
  result: EcbHistoricalByteCustodyEnvelopeResultV1,
  reason?: EcbHistoricalByteCustodyEnvelopeFailureV1["reason"],
) {
  assert.equal(result.status, "invalid-envelope");
  if (result.status !== "invalid-envelope") throw new Error("Expected rejection");
  if (reason !== undefined) assert.equal(result.reason, reason);
  assert.equal(result.mode, "offline-model-only");
  assert.equal(result.coverage, "provided-history-only");
  assert.equal(result.ownershipVerified, false);
  assert.equal(result.objectVerified, false);
  assert.ok(Object.isFrozen(result));
  return result;
}

test("creation describes exact canonical UTF-8 bytes with no receipt authority", () => {
  const text = payload();
  const actual = envelope(text);
  const candidate = prepareEcbHistoricalAdmissionCandidateV1(text);
  assert.equal(candidate.status, "candidate");
  if (candidate.status !== "candidate") throw new Error("Invalid fixture");
  assert.equal(actual.schemaVersion, ECB_HISTORICAL_BYTE_CUSTODY_ENVELOPE_SCHEMA_V1);
  assert.equal(actual.encoding, ECB_HISTORICAL_PAYLOAD_ENCODING_V1);
  assert.equal(actual.payloadText, text);
  assert.equal(actual.canonicalEventId, candidate.snapshot.canonicalEventId);
  assert.equal(actual.eventSourceVersionId, candidate.snapshot.eventSourceVersionId);
  assert.equal(actual.knownAt, BASE);
  assert.equal(actual.sha256, createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex"));
  assert.equal(actual.byteLength, Buffer.byteLength(text, "utf8"));
  assert.match(actual.sha256, /^[0-9a-f]{64}$/);
  assert.equal(actual.mode, "offline-model-only");
  assert.equal(actual.coverage, "provided-history-only");
  assert.equal(actual.ownershipVerified, false);
  assert.equal(actual.objectVerified, false);
  assert.equal(Object.getPrototypeOf(actual), Object.prototype);
  assert.ok(Object.values(actual).every(value => ["string", "number", "boolean"].includes(typeof value)));
});

test("JSON round-trip preserves bytes and scalars, rehydration restores freezing", () => {
  const original = envelope();
  const wire = JSON.stringify(original);
  const parsed = JSON.parse(wire);
  assert.deepEqual(parsed, original);
  assert.equal(Object.isFrozen(parsed), false);
  const restored = rehydrateEcbHistoricalByteCustodyEnvelopeV1(wire);
  assert.deepEqual(restored, original);
  assert.notEqual(restored, original);
  assert.ok(Object.isFrozen(restored));
  if (restored.status !== "envelope") throw new Error("Expected envelope");
  assert.deepEqual(Buffer.from(restored.payloadText, "utf8"), Buffer.from(original.payloadText, "utf8"));
  // Caller mutation after serialization cannot alias any returned scalar.
  assert.equal(Reflect.set(parsed, "payloadText", "tampered"), true);
  assert.equal(Reflect.set(parsed, "sha256", "0".repeat(64)), true);
  assert.deepEqual(restored, original);
  rejected(rehydrateEcbHistoricalByteCustodyEnvelopeV1(parsed), "INVALID_ENVELOPE");
});

test("an actual fresh process rehydrates wire bytes without prior envelope handles", () => {
  // Local in-memory compilation only; no emitted files, services or configuration.
  // The child TS loader can read only these five explicitly permitted source files.
  const script = String.raw`
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const ts = require("typescript");
    const allowed = new Set([
      "src/lib/markets/catalog/ecbHistoricalByteCustodyEnvelope.ts",
      "src/lib/markets/catalog/ecbHistoricalAdmissionPlanning.ts",
      "src/lib/markets/catalog/ecbHistoricalCatalogProjection.ts",
      "src/lib/markets/events/ecbMonetaryPolicyMemory.ts",
      "src/lib/markets/events/ecbMonetaryPolicy.ts",
    ].map(file => path.resolve(file)));
    require.extensions[".ts"] = (module, filename) => {
      assert.ok(allowed.has(path.resolve(filename)), "Unexpected source dependency");
      module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
        fileName: filename,
      }).outputText, filename);
    };
    const api = require("./src/lib/markets/catalog/ecbHistoricalByteCustodyEnvelope.ts");
    const result = api.rehydrateEcbHistoricalByteCustodyEnvelopeV1(fs.readFileSync(0, "utf8"));
    assert.equal(result.status, "envelope");
    assert.ok(Object.isFrozen(result));
    process.stdout.write(JSON.stringify(result));
  `;
  const original = envelope();
  const child = spawnSync(process.execPath, ["-e", script], {
    cwd: process.cwd(), input: JSON.stringify(original), encoding: "utf8",
    timeout: 10_000, maxBuffer: 1_048_576,
  });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), original);
});

test("independently assembled consistent wire data is representation, not authenticity", () => {
  const text = payload(30);
  const snapshot = JSON.parse(text);
  const assembled = {
    schemaVersion: ECB_HISTORICAL_BYTE_CUSTODY_ENVELOPE_SCHEMA_V1,
    status: "envelope", mode: "offline-model-only", coverage: "provided-history-only",
    encoding: ECB_HISTORICAL_PAYLOAD_ENCODING_V1, payloadText: text,
    canonicalEventId: snapshot.canonicalEventId, eventSourceVersionId: snapshot.eventSourceVersionId,
    knownAt: snapshot.knownAt,
    sha256: createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex"),
    byteLength: Buffer.byteLength(text, "utf8"), ownershipVerified: false, objectVerified: false,
  };
  assert.deepEqual(rehydrateEcbHistoricalByteCustodyEnvelopeV1(JSON.stringify(assembled)), assembled);
});

test("every scalar metadata claim is compared with authoritative repreparation", () => {
  const original = envelope();
  const mutations: Record<string, unknown> = {
    schemaVersion: "ecb-historical-byte-custody-envelope-v2", status: "verified-readable",
    mode: "production", coverage: "complete-history", encoding: "sorted-json-utf8-v1",
    canonicalEventId: "ECB:ecb-monetary-policy-decision:2026-09-11",
    eventSourceVersionId: "b".repeat(64), knownAt: BASE + 1,
    sha256: "0".repeat(64), byteLength: original.byteLength + 1,
    ownershipVerified: true, objectVerified: true,
  };
  for (const [field, value] of Object.entries(mutations)) {
    rejected(rehydrateEcbHistoricalByteCustodyEnvelopeV1(JSON.stringify({ ...original, [field]: value })),
      "ENVELOPE_METADATA_MISMATCH");
  }
  assert.deepEqual(envelope(), original);
});

test("replacement payload cannot borrow original byte identity or capture metadata", () => {
  const original = envelope();
  const replacement = envelope(payload(1));
  rejected(rehydrateEcbHistoricalByteCustodyEnvelopeV1(JSON.stringify({
    ...original, payloadText: replacement.payloadText,
  })), "ENVELOPE_METADATA_MISMATCH");
  assert.deepEqual(rehydrateEcbHistoricalByteCustodyEnvelopeV1(JSON.stringify(replacement)), replacement);
});

test("missing fields and unknown authority fields are rejected", () => {
  const original = envelope();
  for (const field of Object.keys(original)) {
    const missing: Record<string, unknown> = { ...original };
    delete missing[field];
    rejected(rehydrateEcbHistoricalByteCustodyEnvelopeV1(JSON.stringify(missing)), "INVALID_ENVELOPE");
  }
  for (const field of ["extra", "durable", "durableCustody", "receipt", "snapshot", "toJSON", "__proto__", "constructor"]) {
    // Build wire data directly: downlevel object spread can erase __proto__.
    const unknown = JSON.stringify(original).slice(0, -1) + "," + JSON.stringify(field) + ":true}";
    rejected(rehydrateEcbHistoricalByteCustodyEnvelopeV1(unknown), "INVALID_ENVELOPE");
  }
});

test("every field rejects non-scalar or incorrect JSON types", () => {
  const original = envelope();
  for (const field of Object.keys(original)) {
    for (const value of [null, [], {}, { toString: "data" }]) {
      rejected(rehydrateEcbHistoricalByteCustodyEnvelopeV1(JSON.stringify({ ...original, [field]: value })),
        "INVALID_ENVELOPE");
    }
    const wrongScalar = typeof original[field as keyof typeof original] === "string" ? 1 : "false";
    rejected(rehydrateEcbHistoricalByteCustodyEnvelopeV1(JSON.stringify({ ...original, [field]: wrongScalar })),
      "INVALID_ENVELOPE");
  }
});

test("duplicate literal and escaped envelope keys fail despite last-key-wins parsing", () => {
  const original = envelope();
  const wire = JSON.stringify(original);
  for (const prefix of ['{"schemaVersion":"discarded",', '{"\\u0073chemaVersion":"discarded",']) {
    const duplicate = prefix + wire.slice(1);
    assert.deepEqual(JSON.parse(duplicate), original);
    rejected(rehydrateEcbHistoricalByteCustodyEnvelopeV1(duplicate), "INVALID_ENVELOPE_JSON");
  }
});

test("wire JSON rejects whitespace, ordering, alternate escapes and number spellings", () => {
  const original = envelope();
  const wire = JSON.stringify(original);
  const reversed = Object.fromEntries(Object.entries(original).reverse());
  const alternatives = [
    " " + wire, wire + "\n", JSON.stringify(original, null, 2), JSON.stringify(reversed),
    wire.replace('"schemaVersion"', '"\\u0073chemaVersion"'),
    wire.replace(`"knownAt":${BASE}`, `"knownAt":${BASE}.0`),
    wire.replace(`"knownAt":${BASE}`, `"knownAt":${BASE}e0`),
  ];
  for (const text of alternatives) {
    assert.deepEqual(JSON.parse(text), original);
    rejected(rehydrateEcbHistoricalByteCustodyEnvelopeV1(text), "INVALID_ENVELOPE_JSON");
  }
});

test("malformed JSON and non-record roots fail with bounded reasons", () => {
  const wire = JSON.stringify(envelope());
  for (const text of ["", "{", wire + "x", wire.slice(0, -1) + ",}", "/*comment*/" + wire]) {
    rejected(rehydrateEcbHistoricalByteCustodyEnvelopeV1(text), "INVALID_ENVELOPE_JSON");
  }
  for (const value of [null, [], 1, true, "text"]) {
    rejected(rehydrateEcbHistoricalByteCustodyEnvelopeV1(JSON.stringify(value)), "INVALID_ENVELOPE");
  }
});

test("noncanonical snapshot text is never normalized into acceptance", () => {
  const text = payload();
  const parsed = JSON.parse(text);
  const original = envelope(text);
  for (const invalid of [
    text + " ", JSON.stringify(parsed, null, 2),
    JSON.stringify(Object.fromEntries(Object.entries(parsed).reverse())),
    '{"knownAt":0,' + text.slice(1),
    text.replace('"schemaVersion"', '"\\u0073chemaVersion"'),
    text.replace("2.15", "2.150"), JSON.stringify({ ...parsed, extra: true }),
  ]) {
    rejected(createEcbHistoricalByteCustodyEnvelopeV1(invalid), "INVALID_PAYLOAD");
    rejected(rehydrateEcbHistoricalByteCustodyEnvelopeV1(JSON.stringify({ ...original, payloadText: invalid })),
      "INVALID_PAYLOAD");
  }
});

test("lossy UTF-16 and malformed UTF-8 byte inputs are rejected without conversion", () => {
  const text = payload();
  const wire = JSON.stringify(envelope(text));
  for (const surrogate of ["\ud800", "\udfff"]) {
    rejected(createEcbHistoricalByteCustodyEnvelopeV1(text + surrogate), "INVALID_PAYLOAD");
    rejected(rehydrateEcbHistoricalByteCustodyEnvelopeV1(wire + surrogate), "INVALID_ENVELOPE_JSON");
    // Escaped lone surrogates are valid outer JSON but invalid canonical payload.
    rejected(rehydrateEcbHistoricalByteCustodyEnvelopeV1(JSON.stringify({
      ...envelope(text), payloadText: text + surrogate,
    })), "INVALID_PAYLOAD");
  }
  for (const bytes of [
    Buffer.from([0xc0, 0xaf]), Buffer.from([0xc3, 0x28]), Buffer.from([0xed, 0xa0, 0x80]),
    Buffer.from([0xf0, 0x9f]), Buffer.from([0xff]), new Uint8Array([0xff]), Buffer.from(wire, "utf8"),
  ]) {
    rejected(createEcbHistoricalByteCustodyEnvelopeV1(bytes), "INVALID_PAYLOAD");
    rejected(rehydrateEcbHistoricalByteCustodyEnvelopeV1(bytes), "INVALID_ENVELOPE");
  }
});

test("payload limit accepts exactly 65,536 bytes and rejects overflow", () => {
  const padding = ECB_HISTORICAL_MAX_PAYLOAD_BYTES_V1 - Buffer.byteLength(payload(), "utf8");
  const atLimit = payload(0, DECISION_URL.replace("abc123", "abc123" + "x".repeat(padding)));
  assert.equal(Buffer.byteLength(atLimit, "utf8"), ECB_HISTORICAL_MAX_PAYLOAD_BYTES_V1);
  const original = envelope(atLimit);
  assert.deepEqual(rehydrateEcbHistoricalByteCustodyEnvelopeV1(JSON.stringify(original)), original);
  const overflow = payload(0, DECISION_URL.replace("abc123", "abc123" + "x".repeat(padding + 1)));
  rejected(createEcbHistoricalByteCustodyEnvelopeV1(overflow), "INVALID_PAYLOAD");
  rejected(rehydrateEcbHistoricalByteCustodyEnvelopeV1(JSON.stringify({ ...original, payloadText: overflow })),
    "INVALID_PAYLOAD");
});

test("envelope JSON is bounded by actual UTF-8 bytes before parsing", () => {
  const limit = ECB_HISTORICAL_MAX_ENVELOPE_JSON_BYTES_V1;
  rejected(rehydrateEcbHistoricalByteCustodyEnvelopeV1(" ".repeat(limit)), "INVALID_ENVELOPE_JSON");
  rejected(rehydrateEcbHistoricalByteCustodyEnvelopeV1(" ".repeat(limit + 1)), "ENVELOPE_LIMIT_EXCEEDED");
  const multibyte = "\u00e9".repeat(Math.floor(limit / 2) + 1);
  assert.ok(multibyte.length < limit);
  assert.ok(Buffer.byteLength(multibyte, "utf8") > limit);
  rejected(rehydrateEcbHistoricalByteCustodyEnvelopeV1(multibyte), "ENVELOPE_LIMIT_EXCEEDED");
});

test("metadata has independent per-string and aggregate UTF-8 byte limits", () => {
  const original = envelope();
  const stringLimit = ECB_HISTORICAL_MAX_ENVELOPE_METADATA_STRING_BYTES_V1;
  rejected(rehydrateEcbHistoricalByteCustodyEnvelopeV1(JSON.stringify({
    ...original, schemaVersion: "x".repeat(stringLimit),
  })), "ENVELOPE_METADATA_MISMATCH");
  for (const schemaVersion of ["x".repeat(stringLimit + 1), "\u00e9".repeat(stringLimit / 2 + 1)]) {
    rejected(rehydrateEcbHistoricalByteCustodyEnvelopeV1(JSON.stringify({ ...original, schemaVersion })),
      "ENVELOPE_LIMIT_EXCEEDED");
  }
  const inflated = { ...original } as Record<string, unknown>;
  for (const [field, value] of Object.entries(inflated)) {
    if (field !== "payloadText" && typeof value === "string") inflated[field] = "x".repeat(stringLimit);
  }
  assert.ok(Buffer.byteLength(JSON.stringify({ ...inflated, payloadText: "" }), "utf8") >
    ECB_HISTORICAL_MAX_ENVELOPE_METADATA_BYTES_V1);
  rejected(rehydrateEcbHistoricalByteCustodyEnvelopeV1(JSON.stringify(inflated)), "ENVELOPE_LIMIT_EXCEEDED");
});

test("knowledge and length reject invalid numeric domains including negative zero", () => {
  const original = envelope();
  for (const knownAt of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity]) {
    rejected(rehydrateEcbHistoricalByteCustodyEnvelopeV1(JSON.stringify({ ...original, knownAt })),
      "INVALID_ENVELOPE");
  }
  const wire = JSON.stringify(original);
  rejected(rehydrateEcbHistoricalByteCustodyEnvelopeV1(wire.replace(`"knownAt":${BASE}`, '"knownAt":-0')),
    "INVALID_ENVELOPE");
  for (const byteLength of [0, -1, 0.5, ECB_HISTORICAL_MAX_PAYLOAD_BYTES_V1 + 1, NaN, Infinity]) {
    rejected(rehydrateEcbHistoricalByteCustodyEnvelopeV1(JSON.stringify({ ...original, byteLength })),
      "INVALID_ENVELOPE");
  }
});

test("safe integer knowledge bounds and schedule revisions remain authoritative", () => {
  for (const fetchedAt of [0, Number.MAX_SAFE_INTEGER]) {
    const text = JSON.stringify(buildEcbMonetaryPolicyEventSnapshotV1(normalizeEcbMonetaryPolicyEventV1({
      canonicalMeetingDate: "2026-09-10", schedule: { meetingDate: "2026-09-11", fetchedAt },
    })));
    const actual = envelope(text);
    assert.equal(actual.knownAt, fetchedAt);
    assert.equal(actual.canonicalEventId, "ECB:ecb-monetary-policy-decision:2026-09-10");
    assert.deepEqual(rehydrateEcbHistoricalByteCustodyEnvelopeV1(JSON.stringify(actual)), actual);
  }
});

test("hostile objects never invoke caller getters, methods or Proxy traps", () => {
  let calls = 0;
  const trap = () => { calls += 1; throw "synthetic-secret-must-not-escape"; };
  const accessor = Object.defineProperty({}, "payloadText", { get: trap });
  const methods = { toString: trap, toJSON: trap, [Symbol.toPrimitive]: trap };
  const prototype = Object.create({ get payloadText() { return trap(); } });
  const proxy = new Proxy({}, { get: trap, ownKeys: trap, getPrototypeOf: trap, getOwnPropertyDescriptor: trap });
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  const fnProxy = new Proxy(trap, { apply: trap, get: trap });
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  for (const input of [
    accessor, methods, prototype, proxy, revoked.proxy, fnProxy, cycle, Object.create(null),
    new String(payload()), new String(JSON.stringify(envelope())), new Number(1), new Boolean(false),
    new Date(0), new Map(), new Set(), [], envelope(), null, undefined, 1, true, Symbol("input"),
  ]) {
    const badPayload = rejected(createEcbHistoricalByteCustodyEnvelopeV1(input), "INVALID_PAYLOAD");
    const badEnvelope = rejected(rehydrateEcbHistoricalByteCustodyEnvelopeV1(input), "INVALID_ENVELOPE");
    assert.ok(!JSON.stringify(badPayload).includes("synthetic-secret"));
    assert.ok(!JSON.stringify(badEnvelope).includes("synthetic-secret"));
  }
  assert.equal(calls, 0);
});

test("success and failure are immutable plain scalar results without byte aliases", () => {
  const original = envelope();
  for (const result of [original, rehydrateEcbHistoricalByteCustodyEnvelopeV1(JSON.stringify(original)),
    rejected(createEcbHistoricalByteCustodyEnvelopeV1("{"))]) {
    assert.ok(Object.isFrozen(result));
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(result))) {
      assert.ok("value" in descriptor);
      assert.equal(descriptor.enumerable, true);
      assert.equal(descriptor.writable, false);
      assert.equal(descriptor.configurable, false);
    }
    assert.equal(Reflect.set(result, "objectVerified", true), false);
    assert.equal(Reflect.set(result, "payloadText", "tampered"), false);
    assert.equal(Reflect.set(result, "reason", "caller-secret"), false);
  }
  assert.deepEqual(envelope(), original);
});

test("same semantic recapture retains different canonical bytes instead of deduplicating", () => {
  const original = envelope();
  const recaptured = envelope(payload(1));
  assert.equal(original.eventSourceVersionId, recaptured.eventSourceVersionId);
  assert.notEqual(original.knownAt, recaptured.knownAt);
  assert.notEqual(original.payloadText, recaptured.payloadText);
  assert.notEqual(original.sha256, recaptured.sha256);
  for (const value of [original, recaptured]) {
    assert.deepEqual(rehydrateEcbHistoricalByteCustodyEnvelopeV1(JSON.stringify(value)), value);
  }
  const model = createEcbHistoricalAdmissionModelV1();
  const first = planEcbHistoricalAdmissionV1(model, prepareEcbHistoricalAdmissionCandidateV1(original.payloadText));
  if (first.kind !== "plan") throw new Error("Expected offline admission plan");
  const conflict = planEcbHistoricalAdmissionV1(first.nextModel,
    prepareEcbHistoricalAdmissionCandidateV1(recaptured.payloadText));
  assert.equal(conflict.status, "integrity-conflict");
  if (conflict.kind === "plan") assert.equal(conflict.nextModel, first.nextModel);
});

test("equal semantic identity and knownAt still cannot prove equal bytes", () => {
  const original = envelope();
  const snapshot = JSON.parse(original.payloadText);
  snapshot.event.schedule.fetchedAt -= 4;
  const other = envelope(JSON.stringify(snapshot));
  assert.equal(original.eventSourceVersionId, other.eventSourceVersionId);
  assert.equal(original.knownAt, other.knownAt);
  assert.notEqual(original.payloadText, other.payloadText);
  assert.notEqual(original.sha256, other.sha256);
  assert.deepEqual(rehydrateEcbHistoricalByteCustodyEnvelopeV1(JSON.stringify(other)), other);
});

test("portable results are never admission handles or verified object evidence", () => {
  const original = envelope();
  const restored = rehydrateEcbHistoricalByteCustodyEnvelopeV1(JSON.stringify(original));
  assert.equal(planEcbHistoricalAdmissionV1(createEcbHistoricalAdmissionModelV1(), original).kind, "invalid-request");
  assert.equal(planEcbHistoricalAdmissionV1(createEcbHistoricalAdmissionModelV1(), restored).kind, "invalid-request");
  assert.equal(restored.ownershipVerified, false);
  assert.equal(restored.objectVerified, false);
  rejected(rehydrateEcbHistoricalByteCustodyEnvelopeV1(JSON.stringify({ ...original, objectVerified: true })),
    "ENVELOPE_METADATA_MISMATCH");
});
