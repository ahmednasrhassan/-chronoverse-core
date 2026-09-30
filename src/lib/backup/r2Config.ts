export const CHRONOVERSE_R2_BACKUP_BUCKET_V1 = "chronoverse-backups" as const;

export type R2BackupConfigErrorCodeV1 =
  | "invalid-account-id"
  | "invalid-access-key-id"
  | "invalid-secret-access-key"
  | "invalid-bucket";

export class R2BackupConfigErrorV1 extends Error {
  constructor(readonly code: R2BackupConfigErrorCodeV1) {
    super(`Invalid R2 backup configuration: ${code}.`);
    this.name = "R2BackupConfigErrorV1";
  }
}

export interface R2BackupConfigV1 {
  readonly accountId: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucket: typeof CHRONOVERSE_R2_BACKUP_BUCKET_V1;
  readonly endpoint: string;
  readonly region: "auto";
}

/** Pure parser; the server-only production adapter supplies process.env at call time. */
export function parseR2BackupConfigV1(
  environment: Readonly<Record<string, string | undefined>>,
): R2BackupConfigV1 {
  const accountId = environment.CHRONOVERSE_R2_ACCOUNT_ID?.trim();
  const accessKeyId = environment.CHRONOVERSE_R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = environment.CHRONOVERSE_R2_SECRET_ACCESS_KEY?.trim();
  const bucket = environment.CHRONOVERSE_R2_BUCKET?.trim();

  if (!accountId || !/^[a-f0-9]{32}$/i.test(accountId)) {
    throw new R2BackupConfigErrorV1("invalid-account-id");
  }
  if (!accessKeyId || /[\x00-\x1f\x7f]/.test(accessKeyId)) {
    throw new R2BackupConfigErrorV1("invalid-access-key-id");
  }
  if (!secretAccessKey || /[\x00-\x1f\x7f]/.test(secretAccessKey)) {
    throw new R2BackupConfigErrorV1("invalid-secret-access-key");
  }
  if (bucket !== CHRONOVERSE_R2_BACKUP_BUCKET_V1) {
    throw new R2BackupConfigErrorV1("invalid-bucket");
  }

  return Object.freeze({
    accountId: accountId.toLowerCase(),
    accessKeyId,
    secretAccessKey,
    bucket: CHRONOVERSE_R2_BACKUP_BUCKET_V1,
    endpoint: `https://${accountId.toLowerCase()}.r2.cloudflarestorage.com`,
    region: "auto" as const,
  });
}
