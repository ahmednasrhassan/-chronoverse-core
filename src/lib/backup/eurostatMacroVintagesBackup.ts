import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import {
  CHRONOVERSE_BACKUP_CONTENT_TYPE_V1,
  CHRONOVERSE_BACKUP_OBJECT_SCHEMA_VERSION_V1,
  buildChronoverseBackupObjectKeyV1,
  validateChronoverseBackupObjectV1,
  type ChronoverseBackupObjectV1,
} from "./backupObject";
import { buildEurostatMacroSeriesVintageRedisKeyV1 } from
  "../markets/persistence/eurostatMacroSeriesVintageRedis";
import {
  EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1,
  type EurostatEuroAreaMacroFamilyV1,
} from "../markets/providers/eurostat/macroSeries";

export interface EurostatMacroVintageBackupEntryV1 {
  readonly score: number;
  /** Exact Redis sorted-set member string; never parsed or normalized. */
  readonly member: string;
}

export interface EurostatMacroVintagesBackupInputV1 {
  readonly createdAtUnixSeconds: number;
  readonly hicp: readonly EurostatMacroVintageBackupEntryV1[];
  readonly gdp: readonly EurostatMacroVintageBackupEntryV1[];
}

export interface EurostatMacroVintagesBackupManifestV1 {
  readonly schemaVersion: 1;
  readonly backupType: "eurostat-macro-vintages";
  readonly createdAtUnixSeconds: number;
  readonly series: readonly {
    readonly family: EurostatEuroAreaMacroFamilyV1;
    readonly canonicalSeriesId: string;
    readonly redisKey: string;
    readonly entryCount: number;
    readonly entries: readonly EurostatMacroVintageBackupEntryV1[];
  }[];
  readonly totalEntryCount: number;
}

export type EurostatMacroVintagesBackupInputErrorCodeV1 =
  | "invalid-entries"
  | "invalid-score"
  | "invalid-member"
  | "duplicate-member";

export class EurostatMacroVintagesBackupInputErrorV1 extends Error {
  constructor(readonly code: EurostatMacroVintagesBackupInputErrorCodeV1) {
    super(`Invalid Eurostat macro backup input: ${code}.`);
    this.name = "EurostatMacroVintagesBackupInputErrorV1";
  }
}

/** Pure, lossless builder over already-read Redis sorted-set entries. */
export function buildEurostatMacroVintagesBackupV1(
  input: EurostatMacroVintagesBackupInputV1,
): ChronoverseBackupObjectV1 {
  // Validate the capture time before interpolating it into the backup ID.
  buildChronoverseBackupObjectKeyV1(
    "eurostat-macro-vintages",
    input.createdAtUnixSeconds,
  );
  const backupId = `eurostat-macro-vintages-${input.createdAtUnixSeconds}`;
  const objectKey = buildChronoverseBackupObjectKeyV1(
    backupId,
    input.createdAtUnixSeconds,
  );

  const hicp = canonicalEntries(input.hicp);
  const gdp = canonicalEntries(input.gdp);
  const series: EurostatMacroVintagesBackupManifestV1["series"] = (
    ["hicp", "gdp"] as const
  ).map((family) => {
    const entries = family === "hicp" ? hicp : gdp;
    return {
      family,
      canonicalSeriesId:
        EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1[family].canonicalSeriesId,
      redisKey: buildEurostatMacroSeriesVintageRedisKeyV1(family),
      entryCount: entries.length,
      entries,
    };
  });

  const manifest: EurostatMacroVintagesBackupManifestV1 = {
    schemaVersion: 1,
    backupType: "eurostat-macro-vintages",
    createdAtUnixSeconds: input.createdAtUnixSeconds,
    series,
    totalEntryCount: hicp.length + gdp.length,
  };
  const payloadBytes = Buffer.from(JSON.stringify(manifest), "utf8");
  return validateChronoverseBackupObjectV1({
    schemaVersion: CHRONOVERSE_BACKUP_OBJECT_SCHEMA_VERSION_V1,
    backupId,
    createdAtUnixSeconds: input.createdAtUnixSeconds,
    objectKey,
    contentType: CHRONOVERSE_BACKUP_CONTENT_TYPE_V1,
    payloadBytes,
    sha256: createHash("sha256").update(payloadBytes).digest("hex"),
  });
}

function canonicalEntries(
  input: readonly EurostatMacroVintageBackupEntryV1[],
): EurostatMacroVintageBackupEntryV1[] {
  if (!Array.isArray(input)) {
    throw new EurostatMacroVintagesBackupInputErrorV1("invalid-entries");
  }
  const seenMembers = new Set<string>();
  const entries = input.map((entry) => {
    if (!entry || !Number.isSafeInteger(entry.score) || entry.score < 0) {
      throw new EurostatMacroVintagesBackupInputErrorV1("invalid-score");
    }
    if (typeof entry.member !== "string" || entry.member.length === 0) {
      throw new EurostatMacroVintagesBackupInputErrorV1("invalid-member");
    }
    const memberBytes = Buffer.from(entry.member, "utf8");
    const redisMemberIdentity = memberBytes.toString("base64");
    if (seenMembers.has(redisMemberIdentity)) {
      throw new EurostatMacroVintagesBackupInputErrorV1("duplicate-member");
    }
    seenMembers.add(redisMemberIdentity);
    return { score: entry.score, member: entry.member, memberBytes };
  });
  entries.sort((left, right) => left.score < right.score ? -1 :
    left.score > right.score ? 1 :
      Buffer.compare(left.memberBytes, right.memberBytes));
  return entries.map(({ score, member }) => ({ score, member }));
}
