import { createHash } from "node:crypto";

export const CHRONOVERSE_BACKUP_OBJECT_SCHEMA_VERSION_V1 = 1 as const;
export const CHRONOVERSE_BACKUP_CONTENT_TYPE_V1 = "application/json" as const;
/** Initial single-object safety cap; revisit when a real backup producer exists. */
export const CHRONOVERSE_BACKUP_MAX_PAYLOAD_BYTES_V1 = 10 * 1024 * 1024;

export type ChronoverseBackupObjectValidationCodeV1 =
  | "invalid-object"
  | "invalid-backup-id"
  | "invalid-timestamp"
  | "invalid-object-key"
  | "invalid-content-type"
  | "invalid-payload"
  | "payload-too-large"
  | "invalid-sha256"
  | "sha256-mismatch";

export class ChronoverseBackupObjectValidationErrorV1 extends Error {
  constructor(readonly code: ChronoverseBackupObjectValidationCodeV1) {
    super(`Invalid backup object: ${code}.`);
    this.name = "ChronoverseBackupObjectValidationErrorV1";
  }
}

export interface ChronoverseBackupObjectV1 {
  readonly schemaVersion: typeof CHRONOVERSE_BACKUP_OBJECT_SCHEMA_VERSION_V1;
  readonly backupId: string;
  readonly createdAtUnixSeconds: number;
  readonly objectKey: string;
  readonly contentType: typeof CHRONOVERSE_BACKUP_CONTENT_TYPE_V1;
  readonly payloadBytes: Uint8Array;
  readonly sha256: string;
}

/** JSON objects live under the locked production prefix and UTC date path. */
export function buildChronoverseBackupObjectKeyV1(
  backupId: string,
  createdAtUnixSeconds: number,
): string {
  if (typeof backupId !== "string" ||
      !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(backupId)) {
    throw new ChronoverseBackupObjectValidationErrorV1("invalid-backup-id");
  }
  if (!Number.isSafeInteger(createdAtUnixSeconds) ||
      createdAtUnixSeconds < 0) {
    throw new ChronoverseBackupObjectValidationErrorV1("invalid-timestamp");
  }
  const date = new Date(createdAtUnixSeconds * 1_000);
  const year = date.getUTCFullYear();
  if (!Number.isFinite(date.getTime()) || year < 1970 || year > 9999) {
    throw new ChronoverseBackupObjectValidationErrorV1("invalid-timestamp");
  }
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `production/${year}/${month}/${day}/${backupId}.json`;
}

/** Revalidates and copies the bytes immediately before a transport receives them. */
export function validateChronoverseBackupObjectV1(
  value: unknown,
): ChronoverseBackupObjectV1 {
  if (!isRecord(value) ||
      Object.keys(value).sort().join(",") !==
        "backupId,contentType,createdAtUnixSeconds,objectKey,payloadBytes,schemaVersion,sha256" ||
      value.schemaVersion !== CHRONOVERSE_BACKUP_OBJECT_SCHEMA_VERSION_V1) {
    throw new ChronoverseBackupObjectValidationErrorV1("invalid-object");
  }
  if (typeof value.backupId !== "string") {
    throw new ChronoverseBackupObjectValidationErrorV1("invalid-backup-id");
  }
  if (typeof value.createdAtUnixSeconds !== "number") {
    throw new ChronoverseBackupObjectValidationErrorV1("invalid-timestamp");
  }
  const expectedKey = buildChronoverseBackupObjectKeyV1(
    value.backupId,
    value.createdAtUnixSeconds,
  );
  if (value.objectKey !== expectedKey) {
    throw new ChronoverseBackupObjectValidationErrorV1("invalid-object-key");
  }
  if (value.contentType !== CHRONOVERSE_BACKUP_CONTENT_TYPE_V1) {
    throw new ChronoverseBackupObjectValidationErrorV1("invalid-content-type");
  }
  if (!(value.payloadBytes instanceof Uint8Array) ||
      value.payloadBytes.byteLength === 0) {
    throw new ChronoverseBackupObjectValidationErrorV1("invalid-payload");
  }
  if (value.payloadBytes.byteLength > CHRONOVERSE_BACKUP_MAX_PAYLOAD_BYTES_V1) {
    throw new ChronoverseBackupObjectValidationErrorV1("payload-too-large");
  }
  if (typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256)) {
    throw new ChronoverseBackupObjectValidationErrorV1("invalid-sha256");
  }
  const payloadBytes = Uint8Array.from(value.payloadBytes);
  const actualHash = createHash("sha256").update(payloadBytes).digest("hex");
  if (actualHash !== value.sha256) {
    throw new ChronoverseBackupObjectValidationErrorV1("sha256-mismatch");
  }
  return Object.freeze({
    schemaVersion: CHRONOVERSE_BACKUP_OBJECT_SCHEMA_VERSION_V1,
    backupId: value.backupId,
    createdAtUnixSeconds: value.createdAtUnixSeconds,
    objectKey: expectedKey,
    contentType: CHRONOVERSE_BACKUP_CONTENT_TYPE_V1,
    payloadBytes,
    sha256: actualHash,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
