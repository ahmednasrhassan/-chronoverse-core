import { Buffer } from "node:buffer";

import {
  CHRONOVERSE_BACKUP_MAX_PAYLOAD_BYTES_V1,
  ChronoverseBackupObjectValidationErrorV1,
  validateChronoverseBackupObjectV1,
  type ChronoverseBackupObjectValidationCodeV1,
} from "./backupObject";
import type {
  EurostatMacroVintageBackupEntryV1,
  EurostatMacroVintagesBackupManifestV1,
} from "./eurostatMacroVintagesBackup";

export type EurostatBackupRestoreErrorCodeV1 =
  | ChronoverseBackupObjectValidationCodeV1
  | "invalid-encoding"
  | "malformed-json"
  | "invalid-manifest"
  | "invalid-series"
  | "invalid-entry"
  | "duplicate-member"
  | "invalid-order"
  | "noncanonical-manifest";

export interface RestoredEurostatBackupV1 {
  readonly backupId: string;
  readonly objectKey: string;
  readonly sha256: string;
  readonly createdAtUnixSeconds: number;
  /** Supplied export-completion time; not an authenticated Redis commit time. */
  readonly captureSemantics: "backup-capture-only";
  readonly crossKeyAtomicity: "not-proven";
  readonly redisCommitTimes: "not-recorded";
  readonly historicalOwnership: "not-recorded";
  readonly series: readonly {
    readonly family: "hicp" | "gdp";
    readonly canonicalSeriesId: string;
    readonly redisKey: string;
    readonly entries: readonly EurostatMacroVintageBackupEntryV1[];
    /** The manifest's numeric scores, not reconstructed wire-format strings. */
    readonly withScores: readonly (string | number)[];
  }[];
}

export type EurostatBackupRestoreResultV1 =
  | { readonly status: "restored"; readonly backup: RestoredEurostatBackupV1 }
  | { readonly status: "invalid-backup"; readonly code: EurostatBackupRestoreErrorCodeV1 };

export type EurostatBackupReplayComparisonV1 =
  | { readonly status: "identical" | "different-backup" | "conflicting-duplicate" }
  | { readonly status: "invalid-backup"; readonly side: "left" | "right";
      readonly code: EurostatBackupRestoreErrorCodeV1 };

// Locked V1 identities, kept local to avoid importing Redis/provider clients.
const SERIES_IDS = [
  "euro-area-hicp-all-items-annual-rate",
  "euro-area-real-gdp-qoq-sca",
] as const;
const ENVELOPE_KEYS = "backupId,contentType,createdAtUnixSeconds,objectKey,payloadBytes,schemaVersion,sha256";
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const byteLengthGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteLength")!.get!;
const bufferGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, "buffer")!.get!;
const tagGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag)!.get!;
const arrayBufferByteLengthGetter = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength")!.get!;
const failureCodes = new WeakMap<object, EurostatBackupRestoreErrorCodeV1>();

class InvalidBackup extends Error {
  constructor(code: EurostatBackupRestoreErrorCodeV1) { super(code); failureCodes.set(this, code); }
}

interface CapturedEnvelope {
  readonly fields: Readonly<Record<string, unknown>>;
  /** Immutable byte snapshot; no caller-owned typed array survives capture. */
  readonly payloadBase64: string;
}

/**
 * Offline only: consumes a supplied object and returns data, never write commands.
 * V1 members are opaque capture data. Pair validity does not certify vintage JSON,
 * score = knownAt, source authenticity, original wire score formatting or admission.
 */
export function restoreEurostatMacroVintagesBackupV1(value: unknown): EurostatBackupRestoreResultV1 {
  try {
    return Object.freeze({ status: "restored", backup: validateCaptured(capture(value)).backup });
  } catch (error) {
    return Object.freeze({ status: "invalid-backup", code: errorCode(error) });
  }
}

/** Both operands must be complete supplied objects; a 412 or hash claim is insufficient. */
export function compareEurostatMacroVintagesBackupsV1(
  left: unknown, right: unknown,
): EurostatBackupReplayComparisonV1 {
  let side: "left" | "right" = "left";
  try {
    const leftCaptured = capture(left);
    side = "right";
    const rightCaptured = right === left ? leftCaptured : capture(right);
    side = "left";
    const a = validateCaptured(leftCaptured);
    side = "right";
    const b = validateCaptured(rightCaptured);
    if (a.backup.backupId !== b.backup.backupId && a.backup.objectKey !== b.backup.objectKey) {
      return Object.freeze({ status: "different-backup" });
    }
    return Object.freeze({ status:
      a.backup.backupId === b.backup.backupId && a.backup.objectKey === b.backup.objectKey &&
      a.backup.sha256 === b.backup.sha256 && a.text === b.text
        ? "identical" : "conflicting-duplicate" });
  } catch (error) {
    return Object.freeze({ status: "invalid-backup", side, code: errorCode(error) });
  }
}

function capture(value: unknown): CapturedEnvelope {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail("invalid-object");
  // Descriptor values are read exactly once. Accessors are rejected without invocation;
  // Proxy get traps are never used. Changing descriptor traps cannot change owned values.
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string") || keys.sort().join(",") !== ENVELOPE_KEYS) {
    fail("invalid-object");
  }
  const fields: Record<string, unknown> = {};
  for (const key of keys as string[]) {
    const descriptor = descriptors[key]!;
    if (!descriptor.enumerable || !("value" in descriptor)) fail("invalid-object");
    fields[key] = descriptor.value;
  }
  const source = fields.payloadBytes;
  // Intrinsic brand/getters reject Proxy views and ignore subclass/iterator overrides.
  if (!ArrayBuffer.isView(source) || tagGetter.call(source) !== "Uint8Array") fail("invalid-payload");
  const size: number = byteLengthGetter.call(source);
  if (size === 0) fail("invalid-payload");
  if (size > CHRONOVERSE_BACKUP_MAX_PAYLOAD_BYTES_V1) fail("payload-too-large");
  // Shared memory cannot provide a coherent, synchronous byte snapshot.
  // The intrinsic getter checks the backing buffer's brand, never its prototype or tag.
  try { arrayBufferByteLengthGetter.call(bufferGetter.call(source)); }
  catch { fail("invalid-payload"); }
  const bytes = new Uint8Array(size);
  Uint8Array.prototype.set.call(bytes, source as Uint8Array);
  delete fields.payloadBytes;
  return Object.freeze({ fields: Object.freeze(fields), payloadBase64: Buffer.from(bytes).toString("base64") });
}

function validateCaptured(captured: CapturedEnvelope): { backup: RestoredEurostatBackupV1; text: string } {
  let object;
  try {
    object = validateChronoverseBackupObjectV1({
      ...captured.fields, payloadBytes: Buffer.from(captured.payloadBase64, "base64"),
    });
  } catch (error) {
    if (error instanceof ChronoverseBackupObjectValidationErrorV1) fail(error.code);
    throw error;
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(object.payloadBytes);
  } catch { return fail("invalid-encoding"); }
  let parsed: unknown;
  try { parsed = JSON.parse(text) as unknown; } catch { return fail("malformed-json"); }
  if (!exactKeys(parsed, "backupType,createdAtUnixSeconds,schemaVersion,series,totalEntryCount") ||
      parsed.schemaVersion !== 1 || parsed.backupType !== "eurostat-macro-vintages" ||
      parsed.createdAtUnixSeconds !== object.createdAtUnixSeconds ||
      object.backupId !== `eurostat-macro-vintages-${object.createdAtUnixSeconds}` ||
      !Array.isArray(parsed.series) || parsed.series.length !== 2) fail("invalid-manifest");

  const parsedSeries = parsed.series;
  const series = (["hicp", "gdp"] as const).map((family, index) => {
    const item: unknown = parsedSeries[index];
    const canonicalSeriesId = SERIES_IDS[index]!;
    const redisKey = `chronoverse:markets:eurostat:macro-series-vintages-v1:${canonicalSeriesId}`;
    if (!exactKeys(item, "canonicalSeriesId,entries,entryCount,family,redisKey") ||
        item.family !== family || item.canonicalSeriesId !== canonicalSeriesId || item.redisKey !== redisKey ||
        !Array.isArray(item.entries) || item.entryCount !== item.entries.length) fail("invalid-series");
    const seen = new Set<string>();
    let previousScore = -1;
    let previousBytes: Buffer | undefined;
    const entries = item.entries.map((entry: unknown) => {
      if (!exactKeys(entry, "member,score") || !Number.isSafeInteger(entry.score) ||
          (entry.score as number) < 0 || typeof entry.member !== "string" || entry.member.length === 0) {
        fail("invalid-entry");
      }
      const score = entry.score as number;
      const member = entry.member as string;
      const bytes = Buffer.from(member, "utf8");
      if (bytes.toString("utf8") !== member) fail("invalid-encoding");
      const identity = bytes.toString("base64");
      if (seen.has(identity)) fail("duplicate-member");
      if (score < previousScore || (score === previousScore && previousBytes !== undefined &&
          Buffer.compare(previousBytes, bytes) >= 0)) fail("invalid-order");
      seen.add(identity);
      previousScore = score;
      previousBytes = bytes;
      return Object.freeze({ score, member });
    });
    return { family, canonicalSeriesId, redisKey, entryCount: entries.length, entries };
  });
  const manifest: EurostatMacroVintagesBackupManifestV1 = {
    schemaVersion: 1, backupType: "eurostat-macro-vintages", createdAtUnixSeconds: object.createdAtUnixSeconds,
    series, totalEntryCount: series[0]!.entryCount + series[1]!.entryCount,
  };
  if (parsed.totalEntryCount !== manifest.totalEntryCount) fail("invalid-manifest");
  // Reconstruct only for equality checking, never return normalized/reordered input.
  // Reject alternate escapes, whitespace, property order and duplicate JSON keys.
  if (JSON.stringify(manifest) !== text) fail("noncanonical-manifest");
  return { text, backup: Object.freeze({
    backupId: object.backupId, objectKey: object.objectKey, sha256: object.sha256,
    createdAtUnixSeconds: object.createdAtUnixSeconds,
    captureSemantics: "backup-capture-only", crossKeyAtomicity: "not-proven",
    redisCommitTimes: "not-recorded", historicalOwnership: "not-recorded",
    series: Object.freeze(series.map((item) => Object.freeze({
      family: item.family, canonicalSeriesId: item.canonicalSeriesId, redisKey: item.redisKey,
      entries: Object.freeze(item.entries),
      withScores: Object.freeze(item.entries.flatMap(({ member, score }) => [member, score])),
    }))),
  }) };
}

function exactKeys(value: unknown, keys: string): value is Record<string, unknown> {
  // Used only on private JSON.parse results, never on caller objects.
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === keys;
}

function fail(code: EurostatBackupRestoreErrorCodeV1): never { throw new InvalidBackup(code); }

function errorCode(error: unknown): EurostatBackupRestoreErrorCodeV1 {
  // Never inspect an untrusted thrown object's properties or prototype.
  return typeof error === "object" && error !== null
    ? failureCodes.get(error) ?? "invalid-object" : "invalid-object";
}
