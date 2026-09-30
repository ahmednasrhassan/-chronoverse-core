import { S3ServiceException } from "@aws-sdk/client-s3";

import {
  ChronoverseBackupObjectValidationErrorV1,
  validateChronoverseBackupObjectV1,
  type ChronoverseBackupObjectValidationCodeV1,
} from "./backupObject";
import type { R2BackupConfigErrorCodeV1, R2BackupConfigV1 } from "./r2Config";

export interface R2BackupPutObjectV1 {
  readonly bucket: R2BackupConfigV1["bucket"];
  readonly objectKey: string;
  readonly contentType: "application/json";
  readonly payloadBytes: Uint8Array;
  readonly ifNoneMatch: "*";
  readonly metadata: Readonly<Record<string, string>>;
}

export type R2BackupPutTransportV1 = (
  object: R2BackupPutObjectV1,
) => Promise<void>;

export type R2BackupWriteResultV1 =
  | { readonly status: "written"; readonly objectKey: string; readonly sha256: string }
  | { readonly status: "already-exists"; readonly objectKey: string }
  | { readonly status: "configuration-failure"; readonly code: R2BackupConfigErrorCodeV1 }
  | { readonly status: "validation-failure"; readonly code: ChronoverseBackupObjectValidationCodeV1 }
  | { readonly status: "transport-failure" }
  | { readonly status: "unexpected-failure" };

export interface R2BackupWriterV1 {
  readonly write: (object: unknown) => Promise<R2BackupWriteResultV1>;
}

/** No transport is called until the complete object has passed validation. */
export function createR2BackupWriterV1(
  config: R2BackupConfigV1,
  putObject: R2BackupPutTransportV1,
): R2BackupWriterV1 {
  return Object.freeze({
    write: async (value: unknown): Promise<R2BackupWriteResultV1> => {
      let object;
      try {
        object = validateChronoverseBackupObjectV1(value);
      } catch (error) {
        if (error instanceof ChronoverseBackupObjectValidationErrorV1) {
          return Object.freeze({ status: "validation-failure", code: error.code });
        }
        return Object.freeze({ status: "unexpected-failure" });
      }

      try {
        await putObject({
          bucket: config.bucket,
          objectKey: object.objectKey,
          contentType: object.contentType,
          payloadBytes: object.payloadBytes,
          ifNoneMatch: "*",
          metadata: Object.freeze({
            "schema-version": String(object.schemaVersion),
            "backup-id": object.backupId,
            "created-at-unix-seconds": String(object.createdAtUnixSeconds),
            sha256: object.sha256,
          }),
        });
        return Object.freeze({
          status: "written",
          objectKey: object.objectKey,
          sha256: object.sha256,
        });
      } catch (error) {
        const status = classifyR2BackupPutErrorV1(error);
        return status === "already-exists"
          ? Object.freeze({ status, objectKey: object.objectKey })
          : Object.freeze({ status });
      }
    },
  });
}

/** Only an S3 precondition failure means the immutable key already exists. */
export function classifyR2BackupPutErrorV1(
  error: unknown,
): "already-exists" | "transport-failure" | "unexpected-failure" {
  if (error instanceof S3ServiceException) {
    return error.$metadata.httpStatusCode === 412 ||
        error.name === "PreconditionFailed"
      ? "already-exists"
      : "transport-failure";
  }
  if (isRecord(error) && typeof error.code === "string" &&
      [
        "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN",
        "ENOTFOUND", "EHOSTUNREACH", "UND_ERR_CONNECT_TIMEOUT",
      ].includes(error.code)) {
    return "transport-failure";
  }
  return "unexpected-failure";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
