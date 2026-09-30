import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import {
  CHRONOVERSE_BACKUP_MAX_PAYLOAD_BYTES_V1,
  ChronoverseBackupObjectValidationErrorV1,
  validateChronoverseBackupObjectV1,
} from "../backupObject";
import {
  EurostatMacroVintagesBackupInputErrorV1,
  buildEurostatMacroVintagesBackupV1,
  type EurostatMacroVintagesBackupInputV1,
  type EurostatMacroVintagesBackupManifestV1,
} from "../eurostatMacroVintagesBackup";

const createdAtUnixSeconds = Date.parse("2026-10-01T00:00:00Z") / 1_000;
const rawMember = '  { "source" : "unchanged" } \n';
const input: EurostatMacroVintagesBackupInputV1 = {
  createdAtUnixSeconds,
  hicp: [
    { score: 20, member: rawMember },
    { score: 10, member: "a" },
    { score: 10, member: "Z" },
  ],
  gdp: [{ score: 30, member: "gdp-member" }],
};
const originalHicp = input.hicp.map((entry) => ({ ...entry }));
const originalGdp = input.gdp.map((entry) => ({ ...entry }));
const object = buildEurostatMacroVintagesBackupV1(input);
const manifest = JSON.parse(Buffer.from(object.payloadBytes).toString("utf8")) as
  EurostatMacroVintagesBackupManifestV1;

assert.equal(object.backupId, `eurostat-macro-vintages-${createdAtUnixSeconds}`);
assert.equal(
  object.objectKey,
  `production/2026/10/01/eurostat-macro-vintages-${createdAtUnixSeconds}.json`,
);
assert.equal(object.contentType, "application/json");
assert.equal(object.sha256, createHash("sha256").update(object.payloadBytes).digest("hex"));
assert.deepEqual(validateChronoverseBackupObjectV1(object), object);
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.backupType, "eurostat-macro-vintages");
assert.equal(manifest.createdAtUnixSeconds, createdAtUnixSeconds);
assert.deepEqual(manifest.series.map((series) => series.family), ["hicp", "gdp"]);
assert.deepEqual(manifest.series.map((series) => series.canonicalSeriesId), [
  "euro-area-hicp-all-items-annual-rate",
  "euro-area-real-gdp-qoq-sca",
]);
assert.deepEqual(manifest.series.map((series) => series.redisKey), [
  "chronoverse:markets:eurostat:macro-series-vintages-v1:euro-area-hicp-all-items-annual-rate",
  "chronoverse:markets:eurostat:macro-series-vintages-v1:euro-area-real-gdp-qoq-sca",
]);
assert.deepEqual(manifest.series.map((series) => series.entryCount), [3, 1]);
assert.equal(manifest.totalEntryCount, 4);
assert.deepEqual(manifest.series[0]?.entries, [
  { score: 10, member: "Z" },
  { score: 10, member: "a" },
  { score: 20, member: rawMember },
]);
assert.equal(manifest.series[0]?.entries[2]?.member, rawMember);
assert.deepEqual(input.hicp, originalHicp);
assert.deepEqual(input.gdp, originalGdp);

const reordered = buildEurostatMacroVintagesBackupV1({
  ...input,
  hicp: [...input.hicp].reverse(),
  gdp: [...input.gdp].reverse(),
});
assert.deepEqual(reordered.payloadBytes, object.payloadBytes);
assert.equal(reordered.sha256, object.sha256);
assert.equal(reordered.objectKey, object.objectKey);

const binary = buildEurostatMacroVintagesBackupV1({
  createdAtUnixSeconds,
  hicp: [
    { score: 1, member: "😀" },
    { score: 1, member: "\uE000" },
  ],
  gdp: [],
});
const binaryManifest = JSON.parse(Buffer.from(binary.payloadBytes).toString("utf8")) as
  EurostatMacroVintagesBackupManifestV1;
assert.deepEqual(binaryManifest.series[0]?.entries.map((entry) => entry.member), ["\uE000", "😀"]);

const empty = buildEurostatMacroVintagesBackupV1({
  createdAtUnixSeconds,
  hicp: [],
  gdp: [],
});
const emptyManifest = JSON.parse(Buffer.from(empty.payloadBytes).toString("utf8")) as
  EurostatMacroVintagesBackupManifestV1;
assert.deepEqual(emptyManifest.series.map((series) => series.family), ["hicp", "gdp"]);
assert.deepEqual(emptyManifest.series.map((series) => series.entryCount), [0, 0]);
assert.equal(emptyManifest.totalEntryCount, 0);

for (const [entry, code] of [
  [{ score: -1, member: "negative" }, "invalid-score"],
  [{ score: 1.5, member: "fractional" }, "invalid-score"],
  [{ score: Number.MAX_SAFE_INTEGER + 1, member: "unsafe" }, "invalid-score"],
  [{ score: 1, member: "" }, "invalid-member"],
] as const) {
  assert.throws(
    () => buildEurostatMacroVintagesBackupV1({ createdAtUnixSeconds, hicp: [entry], gdp: [] }),
    (error: unknown) => error instanceof EurostatMacroVintagesBackupInputErrorV1 &&
      error.code === code &&
      (entry.member.length === 0 || !error.message.includes(entry.member)),
  );
}
assert.throws(
  () => buildEurostatMacroVintagesBackupV1({
    createdAtUnixSeconds,
    hicp: [
      { score: 1, member: "sensitive-raw-member" },
      { score: 2, member: "sensitive-raw-member" },
    ],
    gdp: [],
  }),
  (error: unknown) => error instanceof EurostatMacroVintagesBackupInputErrorV1 &&
    error.code === "duplicate-member" && !error.message.includes("sensitive-raw-member"),
);
assert.throws(
  () => buildEurostatMacroVintagesBackupV1({
    createdAtUnixSeconds,
    hicp: [],
    gdp: undefined as unknown as EurostatMacroVintagesBackupInputV1["gdp"],
  }),
  (error: unknown) => error instanceof EurostatMacroVintagesBackupInputErrorV1 &&
    error.code === "invalid-entries",
);

for (const invalidTime of [-1, 1.5, Number.MAX_SAFE_INTEGER, 8_640_000_000_001]) {
  assert.throws(
    () => buildEurostatMacroVintagesBackupV1({
      createdAtUnixSeconds: invalidTime,
      hicp: [],
      gdp: [],
    }),
    (error: unknown) => error instanceof ChronoverseBackupObjectValidationErrorV1 &&
      error.code === "invalid-timestamp",
  );
}

assert.throws(
  () => buildEurostatMacroVintagesBackupV1({
    createdAtUnixSeconds,
    hicp: [{ score: 1, member: "x".repeat(CHRONOVERSE_BACKUP_MAX_PAYLOAD_BYTES_V1) }],
    gdp: [],
  }),
  (error: unknown) => error instanceof ChronoverseBackupObjectValidationErrorV1 &&
    error.code === "payload-too-large",
);

console.log("PASS: Inactive Eurostat macro vintages backup V1");
