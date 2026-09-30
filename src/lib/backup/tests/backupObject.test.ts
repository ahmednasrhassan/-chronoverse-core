import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  CHRONOVERSE_BACKUP_MAX_PAYLOAD_BYTES_V1,
  ChronoverseBackupObjectValidationErrorV1,
  buildChronoverseBackupObjectKeyV1,
  validateChronoverseBackupObjectV1,
} from "../backupObject";

const createdAtUnixSeconds = Date.parse("2026-10-01T00:00:00Z") / 1_000;
const backupId = "backup-20261001_001";
const key = "production/2026/10/01/backup-20261001_001.json";
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const makeObject = (payloadBytes: Uint8Array) => ({
  schemaVersion: 1,
  backupId,
  createdAtUnixSeconds,
  objectKey: key,
  contentType: "application/json",
  payloadBytes,
  sha256: hash(payloadBytes),
});

assert.equal(buildChronoverseBackupObjectKeyV1(backupId, createdAtUnixSeconds), key);
assert.equal(buildChronoverseBackupObjectKeyV1(backupId, createdAtUnixSeconds), key);
assert.equal(
  buildChronoverseBackupObjectKeyV1("utc", Date.parse("2026-10-01T00:30:00+02:00") / 1_000),
  "production/2026/09/30/utc.json",
);
for (const invalidId of ["", "../escape", "two..dots", "a/b", "a\\b", "a\n", "UPPER", "x".repeat(65)]) {
  assert.throws(
    () => buildChronoverseBackupObjectKeyV1(invalidId, createdAtUnixSeconds),
    (error: unknown) => error instanceof ChronoverseBackupObjectValidationErrorV1 &&
      error.code === "invalid-backup-id",
  );
}
for (const invalidTime of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER]) {
  assert.throws(
    () => buildChronoverseBackupObjectKeyV1(backupId, invalidTime),
    (error: unknown) => error instanceof ChronoverseBackupObjectValidationErrorV1 &&
      error.code === "invalid-timestamp",
  );
}

const payload = new TextEncoder().encode('{"synthetic":true}');
const valid = validateChronoverseBackupObjectV1(makeObject(payload));
assert.equal(valid.sha256, hash(payload));
assert.notEqual(valid.payloadBytes, payload);
assert.deepEqual(valid.payloadBytes, payload);
assert.ok(Object.isFrozen(valid));

for (const [change, code] of [
  [{ objectKey: "test/2026/10/01/backup.json" }, "invalid-object-key"],
  [{ objectKey: "production/../backup.json" }, "invalid-object-key"],
  [{ contentType: "application/octet-stream" }, "invalid-content-type"],
  [{ sha256: "0".repeat(64) }, "sha256-mismatch"],
  [{ sha256: "not-a-hash" }, "invalid-sha256"],
  [{ payloadBytes: new Uint8Array(0) }, "invalid-payload"],
] as const) {
  assert.throws(
    () => validateChronoverseBackupObjectV1({ ...makeObject(payload), ...change }),
    (error: unknown) => error instanceof ChronoverseBackupObjectValidationErrorV1 &&
      error.code === code,
  );
}

const maxBytes = new Uint8Array(CHRONOVERSE_BACKUP_MAX_PAYLOAD_BYTES_V1);
assert.equal(validateChronoverseBackupObjectV1(makeObject(maxBytes)).payloadBytes.byteLength, maxBytes.byteLength);
assert.throws(
  () => validateChronoverseBackupObjectV1(makeObject(new Uint8Array(maxBytes.byteLength + 1))),
  (error: unknown) => error instanceof ChronoverseBackupObjectValidationErrorV1 &&
    error.code === "payload-too-large",
);

console.log("PASS: Chronoverse backup object V1");
