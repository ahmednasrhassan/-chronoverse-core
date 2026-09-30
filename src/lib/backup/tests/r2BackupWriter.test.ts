import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { S3ServiceException } from "@aws-sdk/client-s3";

import { CHRONOVERSE_BACKUP_MAX_PAYLOAD_BYTES_V1 } from "../backupObject";
import { parseR2BackupConfigV1 } from "../r2Config";
import {
  createR2BackupWriterV1,
  type R2BackupPutObjectV1,
} from "../r2BackupWriter";

const config = parseR2BackupConfigV1({
  CHRONOVERSE_R2_ACCOUNT_ID: "a".repeat(32),
  CHRONOVERSE_R2_ACCESS_KEY_ID: "synthetic-access-id",
  CHRONOVERSE_R2_SECRET_ACCESS_KEY: "synthetic-secret-value",
  CHRONOVERSE_R2_BUCKET: "chronoverse-backups",
});
const payloadBytes = new TextEncoder().encode('{"synthetic":true}');
const sha256 = createHash("sha256").update(payloadBytes).digest("hex");
const backupObject = {
  schemaVersion: 1,
  backupId: "synthetic-backup-1",
  createdAtUnixSeconds: Date.parse("2026-10-01T00:00:00Z") / 1_000,
  objectKey: "production/2026/10/01/synthetic-backup-1.json",
  contentType: "application/json",
  payloadBytes,
  sha256,
};

async function run(): Promise<void> {
  let calls = 0;
  let received: R2BackupPutObjectV1 | undefined;
  const writer = createR2BackupWriterV1(config, async (object) => {
    calls += 1;
    received = object;
  });
  assert.equal(calls, 0, "constructing the writer must not upload");
  assert.deepEqual(await writer.write(backupObject), {
    status: "written",
    objectKey: backupObject.objectKey,
    sha256,
  });
  assert.equal(calls, 1);
  assert.equal(received?.bucket, "chronoverse-backups");
  assert.equal(received?.objectKey, backupObject.objectKey);
  assert.equal(received?.contentType, "application/json");
  assert.equal(received?.ifNoneMatch, "*");
  assert.notEqual(received?.payloadBytes, payloadBytes);
  assert.deepEqual(received?.payloadBytes, payloadBytes);
  assert.deepEqual(received?.metadata, {
    "schema-version": "1",
    "backup-id": "synthetic-backup-1",
    "created-at-unix-seconds": String(backupObject.createdAtUnixSeconds),
    sha256,
  });
  assert.ok(!JSON.stringify(received?.metadata).includes(config.secretAccessKey));

  assert.deepEqual(await writer.write({ ...backupObject, objectKey: "test/escape.json" }), {
    status: "validation-failure",
    code: "invalid-object-key",
  });
  assert.deepEqual(await writer.write({ ...backupObject, sha256: "0".repeat(64) }), {
    status: "validation-failure",
    code: "sha256-mismatch",
  });
  assert.deepEqual(await writer.write({
    ...backupObject,
    payloadBytes: new Uint8Array(CHRONOVERSE_BACKUP_MAX_PAYLOAD_BYTES_V1 + 1),
  }), {
    status: "validation-failure",
    code: "payload-too-large",
  });
  assert.equal(calls, 1, "invalid or oversize payloads must not reach transport");

  const precondition = new S3ServiceException({
    name: "PreconditionFailed",
    $fault: "client",
    $metadata: { httpStatusCode: 412 },
  });
  assert.deepEqual(
    await createR2BackupWriterV1(config, async () => { throw precondition; }).write(backupObject),
    { status: "already-exists", objectKey: backupObject.objectKey },
  );
  const serviceFailure = new S3ServiceException({
    name: "ServiceUnavailable",
    $fault: "server",
    $metadata: { httpStatusCode: 503 },
  });
  assert.deepEqual(
    await createR2BackupWriterV1(config, async () => { throw serviceFailure; }).write(backupObject),
    { status: "transport-failure" },
  );
  assert.deepEqual(
    await createR2BackupWriterV1(config, async () => {
      throw Object.assign(new Error("synthetic network error"), { code: "ECONNRESET" });
    }).write(backupObject),
    { status: "transport-failure" },
  );
  for (const error of [new ReferenceError("programming error"), new TypeError("programming error")]) {
    assert.deepEqual(
      await createR2BackupWriterV1(config, async () => { throw error; }).write(backupObject),
      { status: "unexpected-failure" },
    );
  }
}

run().then(() => console.log("PASS: R2 backup writer V1"), (error) => {
  console.error(error);
  process.exitCode = 1;
});
