import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

import { CHRONOVERSE_BACKUP_MAX_PAYLOAD_BYTES_V1 } from "../backupObject";
import {
  buildEurostatMacroVintagesBackupV1,
  type EurostatMacroVintagesBackupManifestV1,
} from "../eurostatMacroVintagesBackup";
import {
  restoreEurostatMacroVintagesBackupV1 as restore,
  compareEurostatMacroVintagesBackupsV1 as compare,
  type EurostatBackupRestoreErrorCodeV1,
} from "../eurostatMacroVintagesBackupRestore";
import { buildEurostatMacroSeriesVintageRedisKeyV1 } from
  "../../markets/persistence/eurostatMacroSeriesVintageRedis";

const timestamp = 1_759_276_800;
const rawMember = '  { "knownAt": 9999999999, "opaque": true } \n';
const makeBackup = (createdAtUnixSeconds = timestamp) => buildEurostatMacroVintagesBackupV1({
  createdAtUnixSeconds,
  hicp: [
    { score: 20, member: rawMember }, { score: 10, member: "😀" },
    { score: 10, member: "\uE000" }, { score: 0, member: "\0raw\r\n" },
  ],
  gdp: [{ score: 30, member: "not vintage JSON" }],
});
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const manifestOf = (backup = makeBackup()): EurostatMacroVintagesBackupManifestV1 =>
  JSON.parse(Buffer.from(backup.payloadBytes).toString("utf8"));
const withText = (text: string, backup = makeBackup()) => {
  const payloadBytes = Buffer.from(text, "utf8");
  return { ...backup, payloadBytes, sha256: hash(payloadBytes) };
};
function malformed(change: (manifest: EurostatMacroVintagesBackupManifestV1) => void) {
  const manifest = manifestOf();
  change(manifest);
  return withText(JSON.stringify(manifest));
}
function invalid(value: unknown, code?: EurostatBackupRestoreErrorCodeV1): void {
  const result = restore(value);
  assert.equal(result.status, "invalid-backup");
  if (result.status === "invalid-backup" && code !== undefined) assert.equal(result.code, code);
  assert.ok(Object.isFrozen(result));
  assert.deepEqual(Object.keys(result).sort(), ["code", "status"]);
}

test("HICP/GDP round-trip preserves represented bytes, scores, key identities and ordering", () => {
  const backup = makeBackup();
  const result = restore(backup);
  assert.equal(result.status, "restored");
  if (result.status !== "restored") assert.fail();
  const manifest = manifestOf(backup);
  assert.equal(result.backup.sha256, backup.sha256);
  assert.equal(result.backup.objectKey, backup.objectKey);
  result.backup.series.forEach((series, index) => {
    assert.equal(series.redisKey, buildEurostatMacroSeriesVintageRedisKeyV1(series.family));
    assert.equal(series.canonicalSeriesId, manifest.series[index]!.canonicalSeriesId);
    assert.deepEqual(series.entries, manifest.series[index]!.entries);
    assert.deepEqual(series.withScores, series.entries.flatMap(({ member, score }) => [member, score]));
    series.entries.forEach((entry, entryIndex) => assert.deepEqual(
      Buffer.from(entry.member, "utf8"), Buffer.from(manifest.series[index]!.entries[entryIndex]!.member, "utf8"),
    ));
  });
  assert.equal(result.backup.series[0]!.entries[3]!.member, rawMember);
});

test("empty per-key captures are preserved", () => {
  const result = restore(buildEurostatMacroVintagesBackupV1({ createdAtUnixSeconds: timestamp, hicp: [], gdp: [] }));
  assert.equal(result.status, "restored");
  if (result.status === "restored") assert.deepEqual(result.backup.series.map((item) => item.withScores), [[], []]);
});

test("output is deeply frozen and retains no caller-owned bytes", () => {
  const original = makeBackup();
  const input = { ...original, payloadBytes: Uint8Array.from(original.payloadBytes) };
  const result = restore(input);
  if (result.status !== "restored") assert.fail();
  input.payloadBytes.fill(0);
  input.objectKey = "mutated";
  assert.equal(result.backup.objectKey, original.objectKey);
  assert.equal(result.backup.series[0]!.entries[3]!.member, rawMember);
  assert.ok(Object.isFrozen(result.backup));
  assert.ok(Object.isFrozen(result.backup.series));
  for (const series of result.backup.series) {
    assert.ok(Object.isFrozen(series));
    assert.ok(Object.isFrozen(series.entries));
    assert.ok(Object.isFrozen(series.withScores));
    series.entries.forEach((entry) => assert.ok(Object.isFrozen(entry)));
  }
});

test("envelope schema, key, hash, content type and timestamps fail closed", () => {
  const backup = makeBackup();
  for (const value of [null, [], "backup", { ...backup, extra: true }]) invalid(value, "invalid-object");
  invalid({ ...backup, schemaVersion: 2 }, "invalid-object");
  invalid({ ...backup, objectKey: "production/../wrong.json" }, "invalid-object-key");
  invalid({ ...backup, objectKey: "test/2025/10/01/x.json" }, "invalid-object-key");
  invalid({ ...backup, backupId: "../escape" }, "invalid-backup-id");
  invalid({ ...backup, contentType: "text/plain" }, "invalid-content-type");
  invalid({ ...backup, sha256: "0".repeat(64) }, "sha256-mismatch");
  invalid({ ...backup, sha256: "F".repeat(64) }, "invalid-sha256");
  invalid({ ...backup, payloadBytes: Buffer.from("corrupt") }, "sha256-mismatch");
  for (const createdAtUnixSeconds of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, "1"]) {
    invalid({ ...backup, createdAtUnixSeconds }, "invalid-timestamp");
  }
});

test("empty, oversized and incorrect byte inputs are rejected before decoding", () => {
  const backup = makeBackup();
  invalid({ ...backup, payloadBytes: new Uint8Array(0) }, "invalid-payload");
  invalid({ ...backup, payloadBytes: new Uint8Array(CHRONOVERSE_BACKUP_MAX_PAYLOAD_BYTES_V1 + 1) }, "payload-too-large");
  for (const payloadBytes of [[], "bytes", new Uint16Array(4), new DataView(new ArrayBuffer(4))]) {
    invalid({ ...backup, payloadBytes }, "invalid-payload");
  }
  invalid({ ...backup, payloadBytes: new Uint8Array(new SharedArrayBuffer(4)) }, "invalid-payload");
});

test("ordinary ArrayBuffer-backed Uint8Array views preserve the exact owned bytes", () => {
  const backup = makeBackup();
  const buffer = new ArrayBuffer(backup.payloadBytes.length + 8);
  const payloadBytes = new Uint8Array(buffer, 4, backup.payloadBytes.length);
  payloadBytes.set(backup.payloadBytes);
  const result = restore({ ...backup, payloadBytes });
  assert.equal(result.status, "restored");
  assert.deepEqual(result, restore(backup));
  new Uint8Array(buffer).fill(0);
  assert.deepEqual(result, restore(backup));
});

test("genuine shared backing buffers are rejected despite prototype and tag spoofing", () => {
  const backup = makeBackup();
  for (const prototype of [SharedArrayBuffer.prototype, ArrayBuffer.prototype, null,
    { [Symbol.toStringTag]: "ArrayBuffer" }]) {
    const buffer = new SharedArrayBuffer(backup.payloadBytes.length);
    const payloadBytes = new Uint8Array(buffer);
    payloadBytes.set(backup.payloadBytes);
    Object.setPrototypeOf(buffer, prototype);
    Object.defineProperty(buffer, Symbol.toStringTag, { value: "ArrayBuffer" });
    Object.defineProperty(buffer, "byteLength", { get() { assert.fail("instance getter must not run"); } });
    Object.defineProperty(payloadBytes, "buffer", { get() { assert.fail("view getter must not run"); } });
    invalid({ ...backup, payloadBytes }, "invalid-payload");
  }
});

test("ordinary backing buffers accept altered prototypes without invoking caller hooks", () => {
  const backup = makeBackup();
  const hostilePrototype = new Proxy({}, {
    get() { assert.fail("prototype get trap must not run"); },
    getPrototypeOf() { assert.fail("prototype traversal must not run"); },
  });
  for (const prototype of [null, { [Symbol.toStringTag]: "SharedArrayBuffer" }, hostilePrototype]) {
    const buffer = new ArrayBuffer(backup.payloadBytes.length);
    const payloadBytes = new Uint8Array(buffer);
    payloadBytes.set(backup.payloadBytes);
    Object.setPrototypeOf(buffer, prototype);
    Object.defineProperty(buffer, "byteLength", { get() { assert.fail("instance getter must not run"); } });
    Object.defineProperty(buffer, Symbol.toStringTag, { get() { assert.fail("tag getter must not run"); } });
    Object.defineProperty(payloadBytes, "buffer", { get() { assert.fail("view getter must not run"); } });
    assert.deepEqual(restore({ ...backup, payloadBytes }), restore(backup));
  }
});

test("genuine cross-realm Uint8Array and ordinary ArrayBuffer backing are accepted", () => {
  const backup = makeBackup();
  const payloadBytes: Uint8Array = runInNewContext("new Uint8Array(bytes)", {
    bytes: Array.from(backup.payloadBytes),
  });
  assert.equal(payloadBytes instanceof Uint8Array, false);
  assert.equal(payloadBytes.buffer instanceof ArrayBuffer, false);
  assert.deepEqual(restore({ ...backup, payloadBytes }), restore(backup));
});

test("fake buffers, spoofed views and Proxy views cannot supply backing memory", () => {
  const backup = makeBackup();
  const fakeBuffer = Object.create(ArrayBuffer.prototype);
  Object.defineProperty(fakeBuffer, Symbol.toStringTag, { value: "ArrayBuffer" });
  Object.defineProperty(fakeBuffer, "byteLength", { get() { assert.fail("fake buffer getter must not run"); } });
  const fakeView = Object.create(Uint8Array.prototype);
  Object.defineProperty(fakeView, Symbol.toStringTag, { value: "Uint8Array" });
  Object.defineProperty(fakeView, "buffer", { get() { assert.fail("fake view getter must not run"); } });
  const wrongView = new Uint16Array(4);
  Object.setPrototypeOf(wrongView, Uint8Array.prototype);
  Object.defineProperty(wrongView, Symbol.toStringTag, { value: "Uint8Array" });
  for (const payloadBytes of [fakeBuffer, fakeView, wrongView,
    new Proxy(backup.payloadBytes, {}), new Proxy(new ArrayBuffer(4), {})]) {
    invalid({ ...backup, payloadBytes }, "invalid-payload");
  }
});

test("cross-realm shared backing remains rejected when its prototype is spoofed", () => {
  const backup = makeBackup();
  const payloadBytes: Uint8Array = runInNewContext(`
    const view = new Uint8Array(new SharedArrayBuffer(bytes.length));
    view.set(bytes);
    view;
  `, { bytes: Array.from(backup.payloadBytes) });
  invalid({ ...backup, payloadBytes }, "invalid-payload");
  Object.setPrototypeOf(payloadBytes.buffer, ArrayBuffer.prototype);
  invalid({ ...backup, payloadBytes }, "invalid-payload");
});

test("exact size limit is allowed when canonical manifest bytes fit", () => {
  const empty = buildEurostatMacroVintagesBackupV1({
    createdAtUnixSeconds: timestamp, hicp: [{ score: 1, member: "x" }], gdp: [],
  });
  const member = "x".repeat(CHRONOVERSE_BACKUP_MAX_PAYLOAD_BYTES_V1 - empty.payloadBytes.length + 1);
  const backup = buildEurostatMacroVintagesBackupV1({
    createdAtUnixSeconds: timestamp, hicp: [{ score: 1, member }], gdp: [],
  });
  assert.equal(backup.payloadBytes.length, CHRONOVERSE_BACKUP_MAX_PAYLOAD_BYTES_V1);
  assert.equal(restore(backup).status, "restored");
});

test("malformed JSON, invalid UTF-8 and noncanonical JSON are rejected even with correct hashes", () => {
  for (const text of ["{", "undefined", "\uFEFF{}", "{\"a\":1,}"]) invalid(withText(text), "malformed-json");
  const payloadBytes = Buffer.from([0xc0, 0xaf]);
  invalid({ ...makeBackup(), payloadBytes, sha256: hash(payloadBytes) }, "invalid-encoding");
  const manifest = manifestOf();
  const canonical = JSON.stringify(manifest);
  for (const text of [
    `${canonical}\n`, JSON.stringify(manifest, null, 2), canonical.replace('"hicp"', '"h\\u0069cp"'),
    canonical.replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1'),
    canonical.replace('"score":0', '"score":-0'),
    JSON.stringify({ backupType: manifest.backupType, schemaVersion: 1,
      createdAtUnixSeconds: timestamp, series: manifest.series, totalEntryCount: manifest.totalEntryCount }),
  ]) invalid(withText(text), "noncanonical-manifest");
});

test("manifest shape, version, time, type and counts must match exactly", () => {
  for (const text of ["null", "[]", "1", "{}", '"manifest"']) invalid(withText(text), "invalid-manifest");
  for (const change of [
    { schemaVersion: 2 }, { backupType: "other" }, { createdAtUnixSeconds: timestamp - 1 },
    { createdAtUnixSeconds: "bad" }, { totalEntryCount: 99 }, { series: [] }, { extra: true },
  ]) invalid(withText(JSON.stringify({ ...manifestOf(), ...change })), "invalid-manifest");
});

test("each family, key and canonical series identity is locked; counts are exact", () => {
  for (const change of [
    { family: "gdp" }, { canonicalSeriesId: "wrong" }, { redisKey: "another:key" },
    { entryCount: 99 }, { entryCount: "4" }, { entries: {} }, { extra: true },
  ]) invalid(malformed((manifest) => Object.assign(manifest.series[0]!, change)), "invalid-series");
  invalid(malformed((manifest) => { (manifest.series as unknown[]).reverse(); }), "invalid-series");
});

test("invalid pairs, duplicate members and conflicting duplicates are never repaired", () => {
  for (const entry of [
    null, {}, { score: -1, member: "x" }, { score: 1.5, member: "x" },
    { score: "1", member: "x" }, { score: Number.MAX_SAFE_INTEGER + 1, member: "x" },
    { score: 1, member: "" }, { score: 1, member: 1 }, { score: 1, member: "x", extra: true },
  ]) invalid(malformed((manifest) => { (manifest.series[0]!.entries as unknown[])[0] = entry; }), "invalid-entry");
  for (const score of [0, 1]) {
    invalid(malformed((manifest) => {
      (manifest.series[0]!.entries as unknown[])[1] = { score, member: "\0raw\r\n" };
    }), "duplicate-member");
  }
  invalid(malformed((manifest) => {
    (manifest.series[0]!.entries as unknown[])[0] = { score: 0, member: "\uD800" };
  }), "invalid-encoding");
});

test("score ordering and equal-score UTF-8 byte ordering are checked without sorting", () => {
  invalid(malformed((manifest) => { (manifest.series[0]!.entries as unknown[]).reverse(); }), "invalid-order");
  invalid(malformed((manifest) => {
    const entries = manifest.series[0]!.entries as unknown[];
    [entries[1], entries[2]] = [entries[2], entries[1]];
  }), "invalid-order");
});

test("accessors, hidden fields and symbols are rejected without executing getters", () => {
  const backup = makeBackup();
  let calls = 0;
  for (const key of Object.keys(backup)) {
    const input = { ...backup };
    Object.defineProperty(input, key, { enumerable: true, get: () => {
      calls++; return calls === 1 ? backup[key as keyof typeof backup] : "changed";
    } });
    invalid(input, "invalid-object");
  }
  assert.equal(calls, 0);
  invalid(Object.defineProperty({ ...backup }, "hidden", { value: 1 }), "invalid-object");
  invalid({ ...backup, [Symbol("hidden")]: true }, "invalid-object");
});

test("changing Proxy get and descriptor values cannot cause validation/use TOCTOU", () => {
  const backup = makeBackup();
  const captures = new Map<PropertyKey, number>();
  const changing = new Proxy({ ...backup }, {
    get() { assert.fail("untrusted get trap must never run"); },
    getOwnPropertyDescriptor(target, key) {
      const calls = (captures.get(key) ?? 0) + 1;
      captures.set(key, calls);
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key)!;
      return { ...descriptor, value: calls === 1 ? descriptor.value : "changed" };
    },
  });
  assert.equal(restore(changing).status, "restored");
  assert.deepEqual([...captures.values()], Object.keys(backup).map(() => 1));
  assert.deepEqual(compare(changing, changing), { status: "invalid-backup", side: "left", code: "invalid-payload" });
  const invalidFirst = new Proxy({ ...backup }, {
    getOwnPropertyDescriptor(target, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key)!;
      return key === "objectKey" ? { ...descriptor, value: "invalid:first" } : descriptor;
    },
  });
  invalid(invalidFirst, "invalid-object-key");
});

test("Proxy failures and hostile thrown objects remain explicit failures", () => {
  const thrown = new Proxy({}, { get() { throw 1; }, getPrototypeOf() { throw 2; } });
  invalid(new Proxy({}, { ownKeys() { throw thrown; } }), "invalid-object");
  const revoked = Proxy.revocable(makeBackup(), {});
  revoked.revoke();
  invalid(revoked.proxy, "invalid-object");
  invalid({ ...makeBackup(), payloadBytes: new Proxy(makeBackup().payloadBytes, {}) }, "invalid-payload");
});

test("cross-field mutation cannot change captured metadata or hide changed bytes", () => {
  const backup = makeBackup();
  const target = { ...backup, payloadBytes: Uint8Array.from(backup.payloadBytes) };
  const changedMetadata = new Proxy(target, {
    getOwnPropertyDescriptor(object, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(object, key);
      if (key === "sha256") object.objectKey = "mutated-after-key-capture";
      return descriptor;
    },
  });
  const result = restore(changedMetadata);
  if (result.status !== "restored") assert.fail();
  assert.equal(result.backup.objectKey, backup.objectKey);
  const changedBytes = new Proxy({ ...backup, payloadBytes: Uint8Array.from(backup.payloadBytes) }, {
    getOwnPropertyDescriptor(object, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(object, key);
      if (key === "sha256") object.payloadBytes.fill(0);
      return descriptor;
    },
  });
  invalid(changedBytes, "sha256-mismatch");
});

test("byte subclass overrides cannot replace captured content", () => {
  class HostileBytes extends Uint8Array {
    [Symbol.iterator](): ArrayIterator<number> { throw new Error("iterator must not run"); }
    get buffer(): ArrayBuffer { throw new Error("buffer getter must not run"); }
    get byteLength(): number { throw new Error("length getter must not run"); }
  }
  const backup = makeBackup();
  assert.equal(restore({ ...backup, payloadBytes: new HostileBytes(backup.payloadBytes) }).status, "restored");
});

test("replay requires validated complete operands; same identity with changed content conflicts", () => {
  const backup = makeBackup();
  assert.deepEqual(compare(backup, backup), { status: "identical" });
  assert.deepEqual(compare(backup, { ...backup, payloadBytes: Uint8Array.from(backup.payloadBytes) }), { status: "identical" });
  const changed = malformed((manifest) => {
    (manifest.series[1]!.entries as unknown[])[0] = { score: 30, member: "different content" };
  });
  assert.equal(changed.objectKey, backup.objectKey);
  assert.notEqual(changed.sha256, backup.sha256);
  assert.deepEqual(compare(backup, changed), { status: "conflicting-duplicate" });
  assert.deepEqual(compare(backup, makeBackup(timestamp + 1)), { status: "different-backup" });
  assert.deepEqual(compare(backup, { status: "already-exists", objectKey: backup.objectKey }),
    { status: "invalid-backup", side: "right", code: "invalid-object" });
  assert.deepEqual(compare({ ...backup, sha256: "0".repeat(64) }, backup),
    { status: "invalid-backup", side: "left", code: "sha256-mismatch" });
});

test("same Proxy operand is captured once per comparison", () => {
  let captures = 0;
  const input = new Proxy(makeBackup(), { ownKeys(target) { captures++; return Reflect.ownKeys(target); } });
  assert.deepEqual(compare(input, input), { status: "identical" });
  assert.equal(captures, 1);
});

test("capturing the second operand cannot mutate the first operand's owned bytes", () => {
  const backup = makeBackup();
  const left = { ...backup, payloadBytes: Uint8Array.from(backup.payloadBytes) };
  const right = new Proxy({ ...backup }, {
    ownKeys(target) { left.payloadBytes.fill(0); return Reflect.ownKeys(target); },
  });
  assert.deepEqual(compare(left, right), { status: "identical" });
  assert.equal(left.payloadBytes[0], 0);
});

test("capture semantics do not interpret opaque members or fabricate historical provenance", () => {
  const result = restore(makeBackup());
  if (result.status !== "restored") assert.fail();
  assert.equal(result.backup.createdAtUnixSeconds, timestamp);
  assert.equal(result.backup.captureSemantics, "backup-capture-only");
  assert.equal(result.backup.crossKeyAtomicity, "not-proven");
  assert.equal(result.backup.redisCommitTimes, "not-recorded");
  assert.equal(result.backup.historicalOwnership, "not-recorded");
  assert.equal(result.backup.series[1]!.entries[0]!.member, "not vintage JSON");
});

test("implementation has no service clients, environment, clocks, transports or runtime wiring", () => {
  const source = readFileSync(fileURLToPath(new URL("../eurostatMacroVintagesBackupRestore.ts", import.meta.url)), "utf8");
  assert.doesNotMatch(source, /@upstash|@aws-sdk|process\.|fetch\(|Date\.now|new Date|r2Production|RedisReader|scheduler/);
  const valueImports = [...source.matchAll(/import(?! type)[\s\S]*?from "([^"]+)";/g)].map((match) => match[1]);
  assert.deepEqual(valueImports, ["node:buffer", "./backupObject"]);
});
