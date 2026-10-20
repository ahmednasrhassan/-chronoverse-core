// Offline final gate. Keeps all previous audit artifacts untouched.
// node --require next/dist/server/node-environment-baseline --import ./scripts/tests/server-only-preload.mjs --import tsx scripts/benchmarks/compression-final-gate.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { cpus } from "node:os";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import ts from "typescript";
import { projectFiveProductFreeLiteV1, projectFiveProductVipDeepV1 } from "../../src/lib/markets/projections/fiveProductProjections.ts";

const baseline = "aa323e20b7d41a242497c420f1e38faa26ef0a65";
const codecPath = "src/lib/markets/services/canonicalProductResultQualification.ts";
const codecUrl = new URL(`../../${codecPath}`, import.meta.url);
const currentSource = readFileSync(codecUrl, "utf8");
const baselineSource = execFileSync("git", ["show", `${baseline}:${codecPath}`], { encoding: "utf8", maxBuffer: 1024 * 1024 });
const decoderBoundary = "export function decodeCanonicalProductResultCacheV2";
assert.ok(currentSource.includes(decoderBoundary) && baselineSource.includes(decoderBoundary));
assert.equal(currentSource.slice(currentSource.indexOf(decoderBoundary)), baselineSource.slice(baselineSource.indexOf(decoderBoundary)), "decoder, admission, canonical parsing, provenance and integrity helpers must be byte-identical to baseline");
const decoderDigest = createHash("sha256").update(currentSource.slice(currentSource.indexOf(decoderBoundary))).digest("hex");
// Provider constructors imported after this point capture a blocked fetch.
globalThis.fetch = async () => { throw new Error("Network forbidden in compression final gate"); };
function loadSource(source, url, extraExports = [], requireOverride) {
  const box = { exports: {} };
  const compiled = ts.transpileModule(source + (extraExports.length ? `\nexport { ${extraExports.join(", ")} };` : ""), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const originalRequire = createRequire(url);
  new Function("require", "module", "exports", compiled)(name => requireOverride?.(name) ?? originalRequire(name), box, box.exports);
  return box.exports;
}
const attempts = [];
const candidate = loadSource(currentSource, codecUrl, ["tag"], name => name === "node:zlib" ? {
  inflateRawSync,
  deflateRawSync: (bytes, options) => { attempts.push(options.level); return deflateRawSync(bytes, options); },
} : undefined);
const old = loadSource(baselineSource, codecUrl);
const fixtureUrl = new URL("../../src/lib/markets/tests/services/canonicalProductResultQualification.test.ts", import.meta.url);
const fixtureSource = readFileSync(fixtureUrl, "utf8");
const firstTest = fixtureSource.indexOf('\ntest("');
assert.ok(firstTest > 0);
const fixtures = loadSource(fixtureSource.slice(0, firstTest), fixtureUrl, ["fxPayload", "estrPayload", "fxSources", "runFx"]);
const { computeCanonicalFxResultBundleV1 } = await import("../../src/lib/markets/services/canonicalProductResults.ts");
const ids = ["eurusd", "eurjpy", "eurgbp", "eurchf"];
const mediumFx = await fixtures.fxPayload();
const smallEstr = await fixtures.estrPayload(-0, true, true);
async function fxWithRows(length) {
  const sourceContext = fixtures.fxSources();
  for (const id of ids) {
    const latest = sourceContext[id].observations.at(-1);
    sourceContext[id].observations = Array.from({ length }, (_, index) => ({ timestamp: latest.timestamp - (length - 1 - index) * 86400, value: latest.value * (1 + Math.sin(index / 9) * 0.002) }));
  }
  const computed = await computeCanonicalFxResultBundleV1({ loadSourceBundle: async () => sourceContext, evaluatedAt: mediumFx.evaluatedAt,
    runtimes: Object.fromEntries(ids.map(id => [id, deps => fixtures.runFx(id, deps)])) });
  assert.equal(computed.availability, "available");
  return { ...mediumFx, sourceContext, result: computed.bundle };
}
const configuredFx = await fxWithRows(600);
const largeFx = await fxWithRows(10000);
const MAX_BODY = 1900000;
const MAX_TAGGED = 16 * 1024 * 1024;
const NEXT_LIMIT = 2 * 1024 * 1024;
const wire = payload => Buffer.from(JSON.stringify(candidate.tag(payload)), "utf8");
const bodyLength = bytes => 4 * Math.ceil(bytes.length / 3);
// Deterministic passive analytical-result extension. It does not replace source
// context, receipts or engine calculations. Its entropy stresses storage size.
let state = 0x6d2b79f5;
const alphabet = Buffer.from("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_");
const noiseBuffer = Buffer.alloc(2500000);
for (let i = 0; i < noiseBuffer.length; i++) {
  state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
  noiseBuffer[i] = alphabet[state & 63];
}
const noise = noiseBuffer.toString("ascii");
const padded = length => ({ ...mediumFx, result: { ...mediumFx.result, eurusd: { ...mediumFx.result.eurusd, compressionGatePadding: noise.slice(0, length) } } });
let low = 0, high = noise.length;
while (low < high) {
  const middle = Math.ceil((low + high) / 2);
  if (bodyLength(deflateRawSync(wire(padded(middle)), { level: 9 })) <= MAX_BODY) low = middle;
  else high = middle - 1;
}
const edgeLength = low;
const nearSizes = [Math.max(0, edgeLength - 25000), edgeLength, edgeLength + 25000];
assert.ok(nearSizes.at(-1) < noise.length);
const cases = [
  { name: "small-estr-220", family: "estr", payload: smallEstr, cohort: "representative" },
  { name: "configured-fx-4x600", family: "launch-fx", payload: configuredFx, cohort: "representative" },
  { name: "medium-fx-4x900", family: "launch-fx", payload: mediumFx, cohort: "representative" },
  { name: "large-fx-4x10000", family: "launch-fx", payload: largeFx, cohort: "representative" },
  ...nearSizes.map((length, index) => ({ name: ["near-limit-both-fit", "near-limit-fallback", "over-limit-reject"][index], family: "launch-fx", payload: padded(length), cohort: "constructed-boundary", paddingLength: length })),
];
const results = [];
const roundTrip = value => JSON.parse(JSON.stringify(value));
const fingerprintError = error => ({ name: error.name, message: error.message, result: error.result });
function encodeOutcome(codec, item) {
  try { return { ok: true, transport: codec.encodeCanonicalProductResultCacheV2(item.family, item.payload) }; }
  catch (error) { return { ok: false, error: fingerprintError(error) }; }
}
function checksum(transport) {
  return createHash("sha256").update(`${transport.schemaVersion}\n`).update(transport.body).digest("hex");
}
const event = { status: "runtime-unavailable", reason: "unexpected-runtime-error" };
const assessmentTimes = ["2026-10-10T12:00:00.123Z", "2026-10-11T12:00:00.000Z", "2026-11-10T12:00:00.000Z"];
function verifyEquivalent(item, previous, next) {
  assert.equal(next.ok, previous.ok, `${item.name}: accepted/rejected outcome must match baseline`);
  if (!next.ok) { assert.deepEqual(next.error, previous.error); return; }
  for (const transport of [previous.transport, next.transport]) {
    assert.equal(transport.digest, checksum(transport));
    assert.ok(transport.body.length <= MAX_BODY);
    const envelope = { kind: "FETCH", data: { headers: {}, body: JSON.stringify(transport), status: 200, url: "" }, revalidate: 86400 };
    assert.ok(Buffer.byteLength(JSON.stringify(envelope), "utf8") < NEXT_LIMIT);
  }
  assert.deepEqual(inflateRawSync(Buffer.from(next.transport.body, "base64")), inflateRawSync(Buffer.from(previous.transport.body, "base64")), "decompressed tagged canonical UTF-8 bytes must match exactly");
  const previousPayload = old.decodeCanonicalProductResultCacheV2(item.family, roundTrip(previous.transport));
  const nextPayload = candidate.decodeCanonicalProductResultCacheV2(item.family, roundTrip(next.transport));
  assert.deepEqual(nextPayload, item.payload);
  assert.deepEqual(previousPayload, nextPayload);
  assert.deepEqual(candidate.decodeCanonicalProductResultCacheV2(item.family, roundTrip(previous.transport)), nextPayload, "old level-9 entries remain readable");
  assert.deepEqual(old.decodeCanonicalProductResultCacheV2(item.family, roundTrip(next.transport)), previousPayload, "rollback reader compatibility");
  const productIds = item.family === "estr" ? ["estr"] : ids;
  for (const productId of productIds) {
    const input = result => ({ productId, canonical: item.family === "estr" ? result.result : result.result[productId] });
    for (const assessedAt of assessmentTimes) {
      assert.deepEqual(projectFiveProductFreeLiteV1(input(nextPayload), assessedAt), projectFiveProductFreeLiteV1(input(previousPayload), assessedAt));
      assert.deepEqual(projectFiveProductVipDeepV1(input(nextPayload), event, assessedAt), projectFiveProductVipDeepV1(input(previousPayload), event, assessedAt));
    }
  }
  // Guard failures must be identical for legacy and new compressed entries.
  for (const transport of [previous.transport, next.transport]) {
    const corrupt = { ...transport, digest: "0".repeat(64) };
    let a, b;
    try { old.decodeCanonicalProductResultCacheV2(item.family, corrupt); } catch (error) { a = fingerprintError(error); }
    try { candidate.decodeCanonicalProductResultCacheV2(item.family, corrupt); } catch (error) { b = fingerprintError(error); }
    assert.ok(a && b); assert.deepEqual(a, b);
  }
}
function timed(fn) {
  const cpuStart = process.cpuUsage(); const start = performance.now(); fn();
  const wallMs = performance.now() - start; const cpu = process.cpuUsage(cpuStart);
  return { wallMs, cpuMs: (cpu.user + cpu.system) / 1000 };
}
function summary(samples) {
  const sorted = samples.map(value => value.wallMs).sort((a, b) => a - b);
  return { iterations: samples.length, cpuMeanMs: samples.reduce((sum, value) => sum + value.cpuMs, 0) / samples.length,
    wallMedianMs: sorted[Math.floor(sorted.length / 2)], wallP95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1] };
}
function paired(a, b, count) {
  for (let i = 0; i < 3; i++) { a(); b(); }
  const first = [], second = [];
  for (let i = 0; i < count; i++) {
    if (i % 2 === 0) { first.push(timed(a)); second.push(timed(b)); }
    else { second.push(timed(b)); first.push(timed(a)); }
  }
  return { level6: summary(first), level9: summary(second) };
}
for (const item of cases) {
  const bytes = wire(item.payload);
  assert.ok(bytes.length <= MAX_TAGGED);
  const compressed6 = deflateRawSync(bytes, { level: 6 });
  const compressed9 = deflateRawSync(bytes, { level: 9 });
  assert.deepEqual(inflateRawSync(compressed6), bytes);
  assert.deepEqual(inflateRawSync(compressed9), bytes);
  const previous = encodeOutcome(old, item);
  attempts.length = 0;
  const next = encodeOutcome(candidate, item);
  const chosenLevels = [...attempts];
  assert.deepEqual(chosenLevels, bodyLength(compressed6) > MAX_BODY ? [6, 9] : [6]);
  verifyEquivalent(item, previous, next);
  let writes = 0;
  // Simulate the producer handoff: encode must resolve before the cache receives data.
  const handoff = encodeOutcome(candidate, item);
  if (handoff.ok) { assert.ok(handoff.transport.body.length <= MAX_BODY); writes++; }
  assert.equal(writes, next.ok ? 1 : 0);
  const count = item.cohort === "constructed-boundary" || item.name.startsWith("large") ? 8 : 20;
  const compression = paired(() => deflateRawSync(bytes, { level: 6 }), () => deflateRawSync(bytes, { level: 9 }), count);
  const fullEncode = paired(() => encodeOutcome(candidate, item), () => encodeOutcome(old, item), count);
  results.push({ name: item.name, cohort: item.cohort, family: item.family, paddingLength: item.paddingLength,
    taggedBytes: bytes.length, compressed6Bytes: compressed6.length, compressed9Bytes: compressed9.length,
    base64Level6Chars: bodyLength(compressed6), base64Level9Chars: bodyLength(compressed9),
    accepted: next.ok, chosenLevels, fallback: chosenLevels.length === 2, simulatedCacheWrites: writes,
    transportChars: next.ok ? next.transport.body.length : null, error: next.ok ? null : next.error,
    compression, fullEncode, compressionFallbackCpuEstimateMs: chosenLevels.length === 2 ? compression.level6.cpuMeanMs + compression.level9.cpuMeanMs : null });
  process.stderr.write(`Verified ${item.name}: ${next.ok ? "accepted" : "rejected"}; ${chosenLevels.join("+")}\n`);
}
assert.equal(results.find(item => item.name === "near-limit-both-fit").fallback, false);
assert.equal(results.find(item => item.name === "near-limit-fallback").fallback, true, "must exercise an actual unmodified zlib level-6-over/level-9-under limit case");
assert.equal(results.find(item => item.name === "near-limit-fallback").accepted, true);
assert.equal(results.find(item => item.name === "over-limit-reject").accepted, false);
const representative = results.filter(item => item.cohort === "representative");
const boundary = results.filter(item => item.cohort === "constructed-boundary");
console.log(JSON.stringify({ at: new Date().toISOString(), baseline, node: process.version, cpu: cpus()[0]?.model,
  decoderAndHelpersSha256: decoderDigest, storage: { base64LimitChars: MAX_BODY, taggedLimitBytes: MAX_TAGGED, nextEntryLimitBytes: NEXT_LIMIT },
  boundarySearch: { seed: "0x6d2b79f5", algorithm: "xorshift32-low6-base64url", edgePaddingLength: edgeLength },
  checks: ["Exact baseline-vs-candidate decompressed canonical bytes", "Complete decoded graph, timestamps, provenance, receipts and special scalar equivalence", "Free and VIP projection/freshness parity at three delivery times", "Old level-9 entries readable; candidate entries rollback-compatible", "Unchanged decoder/helper source and error shape", "Actual fallback, accepted near-limit handoff and oversized rejection with zero handoffs"],
  frequency: { representative: { payloads: representative.length, fallback: representative.filter(item => item.fallback).length }, constructedBoundary: { payloads: boundary.length, fallback: boundary.filter(item => item.fallback).length }, production: "Unknown; no production traffic or cache-entry distribution was sampled" },
  caveats: ["Offline synthetic fixtures; no production requests or provider access", "Alternating paired order, three warmups; CPU accounting is quantized on Windows", "Baseline and candidate transpiled identically from real sources; no surrogate level-9 encoder", "Constructed boundary cases are deliberately biased and are not a production frequency estimate", "Compressed-body checksums can differ; canonical source-binding digests and decompressed bytes must not"], results }, null, 2));
