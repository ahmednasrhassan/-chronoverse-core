import "server-only";

import { calendarRecordV1, snapshotCalendarDataV1 } from "./validation";

export const R2_CALENDAR_ARCHIVE_CONFIG_V1 = "calendar-r2-archive-config-v1" as const;
export interface R2CalendarArchiveConfigInputV1 {
  readonly schemaVersion: typeof R2_CALENDAR_ARCHIVE_CONFIG_V1;
  readonly accountId: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly jurisdiction: "default";
  readonly bucket: {
    readonly name: string;
    /** An explicit operator declaration, not verified remote bucket state. */
    readonly purpose: "dedicated-calendar-capture-archive";
    readonly environment: "non-production";
  };
}
export interface R2CalendarArchiveConfigV1 extends R2CalendarArchiveConfigInputV1 {
  readonly endpoint: string;
  readonly region: "auto";
}
export class R2CalendarArchiveConfigErrorV1 extends TypeError {
  constructor() { super("Invalid calendar R2 archive configuration."); this.name = "R2CalendarArchiveConfigErrorV1"; }
}

/** Pure closed-data parser. Never reads env, resolves credentials, or checks a bucket.
 * There is no bucket default. Remote isolation/permissions require separate qualification. */
export function parseR2CalendarArchiveConfigV1(value: unknown): R2CalendarArchiveConfigV1 {
  try {
    const data = calendarRecordV1(snapshotCalendarDataV1(value), [
      "schemaVersion", "accountId", "accessKeyId", "secretAccessKey", "jurisdiction", "bucket",
    ]);
    const bucket = calendarRecordV1(data.bucket, ["name", "purpose", "environment"]);
    if (data.schemaVersion !== R2_CALENDAR_ARCHIVE_CONFIG_V1 || data.jurisdiction !== "default" ||
        typeof data.accountId !== "string" || !/^[a-f0-9]{32}$/i.test(data.accountId) ||
        typeof data.accessKeyId !== "string" || !/^[\x21-\x7e]{1,256}$/.test(data.accessKeyId) ||
        typeof data.secretAccessKey !== "string" || !/^[\x21-\x7e]{1,512}$/.test(data.secretAccessKey) ||
        bucket.purpose !== "dedicated-calendar-capture-archive" || bucket.environment !== "non-production" ||
        typeof bucket.name !== "string" || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket.name) ||
        bucket.name === "chronoverse-backups") throw new R2CalendarArchiveConfigErrorV1();
    const accountId = data.accountId.toLowerCase();
    return Object.freeze({ schemaVersion: R2_CALENDAR_ARCHIVE_CONFIG_V1, accountId,
      accessKeyId: data.accessKeyId, secretAccessKey: data.secretAccessKey, jurisdiction: "default",
      bucket: Object.freeze({ name: bucket.name, purpose: "dedicated-calendar-capture-archive", environment: "non-production" }),
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`, region: "auto" });
  } catch { throw new R2CalendarArchiveConfigErrorV1(); }
}
