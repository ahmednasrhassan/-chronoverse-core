import "server-only";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import {
  R2BackupConfigErrorV1,
  parseR2BackupConfigV1,
  type R2BackupConfigV1,
} from "./r2Config";
import {
  createR2BackupWriterV1,
  type R2BackupWriteResultV1,
} from "./r2BackupWriter";

/** Future explicit entry point. Importing this module does not read env or send. */
export async function writeChronoverseBackupObjectToR2V1(
  object: unknown,
): Promise<R2BackupWriteResultV1> {
  let config: R2BackupConfigV1;
  try {
    config = parseR2BackupConfigV1(process.env);
  } catch (error) {
    return error instanceof R2BackupConfigErrorV1
      ? Object.freeze({ status: "configuration-failure", code: error.code })
      : Object.freeze({ status: "unexpected-failure" });
  }

  const writer = createR2BackupWriterV1(config, async (prepared) => {
    const client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    try {
      await client.send(new PutObjectCommand({
        Bucket: prepared.bucket,
        Key: prepared.objectKey,
        Body: prepared.payloadBytes,
        ContentLength: prepared.payloadBytes.byteLength,
        ContentType: prepared.contentType,
        Metadata: prepared.metadata,
        IfNoneMatch: prepared.ifNoneMatch,
      }));
    } finally {
      client.destroy();
    }
  });
  return writer.write(object);
}
