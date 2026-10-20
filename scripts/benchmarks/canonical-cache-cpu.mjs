// Offline profiling of the real cache codec and existing adversarial-test fixtures.
// node --import ./scripts/tests/server-only-preload.mjs --import tsx scripts/benchmarks/canonical-cache-cpu.mjs
// Optional: AUDIT_BENCH_ITERATIONS=20 (PowerShell: $env:AUDIT_BENCH_ITERATIONS='20').
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { cpus } from "node:os";
import { fileURLToPath } from "node:url";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import ts from "typescript";
import * as codec from "../../src/lib/markets/services/canonicalProductResultQualification.ts";
import { validateCanonicalTemporalQualificationV1 } from "../../src/lib/markets/services/canonicalTemporalQualification.ts";
import { projectFiveProductFreeLiteV1 } from "../../src/lib/markets/projections/fiveProductProjections.ts";

// All runtime sources/lifecycle callbacks come from deterministic existing tests.
// Even an accidental default provider call fails locally instead of reaching production.
globalThis.fetch = async () => { throw new Error("Network is forbidden in this benchmark"); };
function exposeLocalFunctions(relativePath, names, beforeFirstTest = false, level9Baseline = false) {
  const url = new URL(relativePath, import.meta.url);
  let source = readFileSync(url, "utf8");
  if (beforeFirstTest) {
    const boundary = source.indexOf('\ntest("');
    assert.ok(boundary > 0, "fixture boundary must exist");
    source = source.slice(0, boundary);
  }
  if (level9Baseline) {
    const needle = 'let body = deflateRawSync(bytes, { level: 6 })';
    assert.ok(source.includes(needle), "compression baseline anchor must exist");
    source = source.replace(needle, 'let body = deflateRawSync(bytes, { level: 9 })');
  }
  const compiled = ts.transpileModule(`${source}\nexport { ${names.join(", ")} };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const box = { exports: {} };
  // Trusted local source only; no application files are rewritten or instrumented on disk.
  new Function("require", "module", "exports", compiled)(createRequire(url), box, box.exports);
  return box.exports;
}
const fixtures = exposeLocalFunctions("../../src/lib/markets/tests/services/canonicalProductResultQualification.test.ts", ["fxPayload", "estrPayload", "fxSources", "runFx"], true);
const internals = exposeLocalFunctions("../../src/lib/markets/services/canonicalProductResultQualification.ts", ["parseTagged", "tag", "validatePayload", "freeze"]);
const baselineCodec = exposeLocalFunctions("../../src/lib/markets/services/canonicalProductResultQualification.ts", ["tag"], false, true);
const iterations = Number(process.env.AUDIT_BENCH_ITERATIONS ?? 15);
assert.ok(Number.isInteger(iterations) && iterations >= 5 && iterations <= 100);
const rows = [];
function measure(fixture, operation, fn, count = iterations) {
  for (let index = 0; index < 2; index++) fn();
  const samples = [];
  const cpuStart = process.cpuUsage();
  for (let index = 0; index < count; index++) {
    const start = performance.now(); fn(); samples.push(performance.now() - start);
  }
  const cpu = process.cpuUsage(cpuStart);
  samples.sort((a, b) => a - b);
  rows.push({ fixture, operation, iterations: count,
    cpuMsPerOp: (cpu.user + cpu.system) / 1000 / count,
    wallMedianMs: samples[Math.floor(samples.length / 2)],
    wallP95Ms: samples[Math.ceil(samples.length * 0.95) - 1] });
}
const sizes = [];
const fx = await fixtures.fxPayload();
const estr = await fixtures.estrPayload();
const { computeCanonicalFxResultBundleV1 } = await import("../../src/lib/markets/services/canonicalProductResults.ts");
async function fxWithRows(length) {
  const sources = fixtures.fxSources();
  for (const id of ["eurusd", "eurjpy", "eurgbp", "eurchf"]) {
    const latest = sources[id].observations.at(-1);
    sources[id].observations = Array.from({ length }, (_, index) => ({ timestamp: latest.timestamp - (length - 1 - index) * 86400, value: latest.value * (1 + Math.sin(index / 9) * 0.002) }));
  }
  const computed = await computeCanonicalFxResultBundleV1({ loadSourceBundle: async () => sources, evaluatedAt: fx.evaluatedAt,
    runtimes: Object.fromEntries(["eurusd", "eurjpy", "eurgbp", "eurchf"].map(id => [id, deps => fixtures.runFx(id, deps)])) });
  assert.equal(computed.availability, "available");
  return { ...fx, sourceContext: sources, result: computed.bundle };
}
const configuredFx = await fxWithRows(600);
const fullFx = await fxWithRows(10000);
for (const [name, family, payload] of [
  ["fx-4x600", "launch-fx", configuredFx],
  ["fx-4x900", "launch-fx", fx],
  ["estr-220", "estr", estr],
  ["fx-4x10000", "launch-fx", fullFx],
]) {
  const count = name === "fx-4x10000" ? 5 : iterations;
  const bench = (operation, fn) => measure(name, operation, fn, count);
  const transport = JSON.parse(JSON.stringify(codec.encodeCanonicalProductResultCacheV2(family, payload)));
  const compressed = Buffer.from(transport.body, "base64");
  const taggedBuffer = inflateRawSync(compressed);
  const tagged = taggedBuffer.toString("utf8");
  const decoded = codec.decodeCanonicalProductResultCacheV2(family, transport);
  assert.deepEqual(decoded, payload);
  const compressionBytes = {};
  for (const level of [1, 6, 9]) {
    const candidate = deflateRawSync(taggedBuffer, { level });
    assert.deepEqual(inflateRawSync(candidate), taggedBuffer);
    compressionBytes[level] = candidate.length;
    bench(`compression-level-${level}`, () => deflateRawSync(taggedBuffer, { level }));
  }
  sizes.push({ name, taggedBytes: taggedBuffer.length, transportBytes: Buffer.byteLength(JSON.stringify(transport)), compressionBytes });
  bench("cache-hit-full-decode", () => codec.decodeCanonicalProductResultCacheV2(family, transport));
  bench("encode-with-validation-level9-baseline", () => baselineCodec.encodeCanonicalProductResultCacheV2(family, payload));
  bench("encode-with-validation-level6-candidate", () => codec.encodeCanonicalProductResultCacheV2(family, payload));
  bench("transport-checksum", () => createHash("sha256").update(`${transport.schemaVersion}\n`).update(transport.body).digest("hex"));
  bench("base64-inflate-utf8", () => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(inflateRawSync(Buffer.from(transport.body, "base64"), { maxOutputLength: 16 * 1024 * 1024 })));
  bench("parser-preflight", () => internals.parseTagged(tagged, false));
  bench("parser-construct", () => internals.parseTagged(tagged, true));
  bench("canonical-tag-serialization", () => JSON.stringify(internals.tag(decoded)));
  bench("payload-and-temporal-validation", () => internals.validatePayload(family, decoded));
  bench("passive-snapshot-freeze", () => codec.ownCanonicalResultPassiveDataV2(payload));
  const ids = family === "launch-fx" ? ["eurusd", "eurjpy", "eurgbp", "eurchf"] : ["estr"];
  bench("temporal-requalification-family", () => {
    for (const productId of ids) {
      const source = family === "launch-fx" ? decoded.sourceContext[productId] : decoded.sourceContext;
      const receipt = family === "launch-fx" ? decoded.result[productId].temporalQualification : decoded.result.data.temporalQualification;
      assert.equal(validateCanonicalTemporalQualificationV1(receipt, { productId, source, evaluatedAt: decoded.evaluatedAt }).status, "qualified");
    }
  });
  bench("free-projection-family", () => {
    for (const productId of ids) projectFiveProductFreeLiteV1({ productId, canonical: family === "launch-fx" ? decoded.result[productId] : decoded.result }, "2026-10-11T12:00:00.000Z");
  });
  bench("four-independent-cache-hit-reads", () => {
    for (let index = 0; index < 4; index++) codec.decodeCanonicalProductResultCacheV2(family, transport);
  });
}
console.log(JSON.stringify({ at: new Date().toISOString(), node: process.version, platform: process.platform,
  cpu: cpus()[0]?.model, fixtureDefinition: fileURLToPath(new URL("../../src/lib/markets/tests/services/canonicalProductResultQualification.test.ts", import.meta.url)),
  caveats: ["Synthetic fixed histories, not production payloads or measured traffic", "Warmups excluded; synchronous process CPU; phase timings are isolated, not additive", "Windows process CPU accounting is quantized; a zero for a short operation is not zero work; wall time is provided separately", "Four reads are a scenario, not a claim about the homepage; the homepage already reads each family once", "No network, cache writes, auth, clocks or lifecycle side effects"], sizes, rows }, null, 2));
