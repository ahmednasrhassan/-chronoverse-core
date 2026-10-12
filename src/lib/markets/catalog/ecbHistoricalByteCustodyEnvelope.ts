import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  ECB_HISTORICAL_MAX_PAYLOAD_BYTES_V1,
  ECB_HISTORICAL_PAYLOAD_ENCODING_V1,
  prepareEcbHistoricalAdmissionCandidateV1,
} from "./ecbHistoricalAdmissionPlanning";

export const ECB_HISTORICAL_BYTE_CUSTODY_ENVELOPE_SCHEMA_V1 =
  "ecb-historical-byte-custody-envelope-v1";
/** Metadata budget includes the JSON field names and an empty payloadText value. */
export const ECB_HISTORICAL_MAX_ENVELOPE_METADATA_BYTES_V1 = 1_024;
export const ECB_HISTORICAL_MAX_ENVELOPE_METADATA_STRING_BYTES_V1 = 128;
/** Six JSON escape bytes per payload byte is a conservative upper bound. */
export const ECB_HISTORICAL_MAX_ENVELOPE_JSON_BYTES_V1 =
  6 * ECB_HISTORICAL_MAX_PAYLOAD_BYTES_V1 + ECB_HISTORICAL_MAX_ENVELOPE_METADATA_BYTES_V1;

interface OfflineScope {
  readonly mode: "offline-model-only";
  readonly coverage: "provided-history-only";
  readonly ownershipVerified: false;
  readonly objectVerified: false;
}

/**
 * Portable representation only: not committed custody, a storage/ownership receipt,
 * proof of historical possession, or a verified object. Hashes describe payload
 * bytes, not semantic-version identity. No admission or deduplication occurs here.
 */
export interface EcbHistoricalByteCustodyEnvelopeV1 extends OfflineScope {
  readonly schemaVersion: typeof ECB_HISTORICAL_BYTE_CUSTODY_ENVELOPE_SCHEMA_V1;
  readonly status: "envelope";
  readonly encoding: typeof ECB_HISTORICAL_PAYLOAD_ENCODING_V1;
  readonly payloadText: string;
  readonly canonicalEventId: string;
  readonly eventSourceVersionId: string;
  readonly knownAt: number;
  readonly sha256: string;
  readonly byteLength: number;
}

export interface EcbHistoricalByteCustodyEnvelopeFailureV1 extends OfflineScope {
  readonly status: "invalid-envelope";
  readonly reason: "INVALID_PAYLOAD" | "INVALID_ENVELOPE" | "INVALID_ENVELOPE_JSON" |
    "ENVELOPE_LIMIT_EXCEEDED" | "ENVELOPE_METADATA_MISMATCH";
}

export type EcbHistoricalByteCustodyEnvelopeResultV1 = EcbHistoricalByteCustodyEnvelopeV1 |
  EcbHistoricalByteCustodyEnvelopeFailureV1;

const stringFields = Object.freeze([
  "schemaVersion", "status", "mode", "coverage", "encoding", "payloadText",
  "canonicalEventId", "eventSourceVersionId", "sha256",
] as const);
const fields = Object.freeze([
  ...stringFields, "knownAt", "byteLength", "ownershipVerified", "objectVerified",
] as const);

/** Only primitive payload strings reach the authoritative preparation boundary. */
export function createEcbHistoricalByteCustodyEnvelopeV1(
  payloadText: unknown,
): EcbHistoricalByteCustodyEnvelopeResultV1 {
  const prepared = prepareEcbHistoricalAdmissionCandidateV1(payloadText);
  if (prepared.status !== "candidate") return failure("INVALID_PAYLOAD");
  const bytes = Buffer.from(prepared.payloadText, "utf8");
  const envelope: EcbHistoricalByteCustodyEnvelopeV1 = Object.freeze({
    schemaVersion: ECB_HISTORICAL_BYTE_CUSTODY_ENVELOPE_SCHEMA_V1,
    status: "envelope", mode: "offline-model-only", coverage: "provided-history-only",
    encoding: ECB_HISTORICAL_PAYLOAD_ENCODING_V1,
    payloadText: prepared.payloadText,
    canonicalEventId: prepared.snapshot.canonicalEventId,
    eventSourceVersionId: prepared.snapshot.eventSourceVersionId,
    knownAt: prepared.snapshot.knownAt,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    byteLength: bytes.length,
    ownershipVerified: false, objectVerified: false,
  });
  return metadataFits(envelope) ? envelope : failure("ENVELOPE_LIMIT_EXCEEDED");
}

/**
 * Accept ONLY a primitive string equal to JSON.stringify(a valid V1 envelope).
 * The entire wire text must have lossless UTF-8 encoding. Exact reconstruction
 * rejects duplicate keys, alternate key order/whitespace/escapes and lossy number
 * spellings without trusting JSON.parse's last-key-wins representation.
 *
 * A JSON round-trip preserves scalar values and exact canonical payload bytes;
 * rehydration returns a fresh frozen envelope after authoritative repreparation
 * and independently recomputed byte hash/length. It does NOT preserve object
 * identity, freezing, process-local admission handles, or establish any custody,
 * provenance, ownership, historical-possession or object-verification authority.
 *
 * Previously parsed objects and raw byte arrays are deliberately unsupported.
 * Transport bytes must be decoded strictly before this boundary: already replaced
 * invalid bytes or duplicate keys erased by an earlier parser cannot be recovered.
 */
export function rehydrateEcbHistoricalByteCustodyEnvelopeV1(
  envelopeJson: unknown,
): EcbHistoricalByteCustodyEnvelopeResultV1 {
  // No caller-owned objects are inspected, coerced or serialized, including Proxies.
  if (typeof envelopeJson !== "string") return failure("INVALID_ENVELOPE");
  if (envelopeJson.length > ECB_HISTORICAL_MAX_ENVELOPE_JSON_BYTES_V1) {
    return failure("ENVELOPE_LIMIT_EXCEEDED");
  }
  const bytes = Buffer.from(envelopeJson, "utf8");
  if (bytes.length > ECB_HISTORICAL_MAX_ENVELOPE_JSON_BYTES_V1) {
    return failure("ENVELOPE_LIMIT_EXCEEDED");
  }
  if (bytes.toString("utf8") !== envelopeJson) return failure("INVALID_ENVELOPE_JSON");

  let parsed: unknown;
  try {
    parsed = JSON.parse(envelopeJson);
  } catch {
    return failure("INVALID_ENVELOPE_JSON");
  }
  // JSON.parse without a reviver owns this data; it cannot contain getters/Proxies.
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return failure("INVALID_ENVELOPE");
  }
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).length !== fields.length || fields.some(field =>
    !Object.prototype.hasOwnProperty.call(record, field))) {
    return failure("INVALID_ENVELOPE");
  }
  if (stringFields.some(field => typeof record[field] !== "string") ||
    typeof record.knownAt !== "number" || !Number.isSafeInteger(record.knownAt) ||
    record.knownAt < 0 || Object.is(record.knownAt, -0) ||
    typeof record.byteLength !== "number" || !Number.isSafeInteger(record.byteLength) ||
    record.byteLength <= 0 || record.byteLength > ECB_HISTORICAL_MAX_PAYLOAD_BYTES_V1 ||
    typeof record.ownershipVerified !== "boolean" || typeof record.objectVerified !== "boolean") {
    return failure("INVALID_ENVELOPE");
  }
  if (!metadataFits(record)) return failure("ENVELOPE_LIMIT_EXCEEDED");

  // Never trust supplied metadata, including matching hash/length or false flags.
  const expected = createEcbHistoricalByteCustodyEnvelopeV1(record.payloadText);
  if (expected.status !== "envelope") return expected;
  if (fields.some(field => !Object.is(record[field], expected[field]))) {
    return failure("ENVELOPE_METADATA_MISMATCH");
  }
  if (JSON.stringify(expected) !== envelopeJson) return failure("INVALID_ENVELOPE_JSON");
  return expected;
}

/** Private: invoked only on fresh scalar output or our own type-checked JSON data. */
function metadataFits(value: object): boolean {
  const metadata = { ...value, payloadText: "" } as Record<string, unknown>;
  return stringFields.every(field => {
    const text = metadata[field] as string;
    return text.length <= ECB_HISTORICAL_MAX_ENVELOPE_METADATA_STRING_BYTES_V1 &&
      Buffer.byteLength(text, "utf8") <= ECB_HISTORICAL_MAX_ENVELOPE_METADATA_STRING_BYTES_V1;
  }) && Buffer.byteLength(JSON.stringify(metadata), "utf8") <= ECB_HISTORICAL_MAX_ENVELOPE_METADATA_BYTES_V1;
}

function failure(
  reason: EcbHistoricalByteCustodyEnvelopeFailureV1["reason"],
): EcbHistoricalByteCustodyEnvelopeFailureV1 {
  return Object.freeze({
    status: "invalid-envelope", reason,
    mode: "offline-model-only", coverage: "provided-history-only",
    ownershipVerified: false, objectVerified: false,
  });
}
