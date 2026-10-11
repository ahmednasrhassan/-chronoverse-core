import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";
import {
  advanceEcbMonetaryPolicyEventMemoryV1,
  ECB_MONETARY_POLICY_EVENT_MEMORY_SCHEMA_VERSION_V1,
  parseEcbMonetaryPolicyEventMemoryV1,
  selectEcbMonetaryPolicyEventAsKnownAtV1,
  type EcbMonetaryPolicyEventMemoryV1,
  type EcbMonetaryPolicyEventSnapshotV1,
} from "../events/ecbMonetaryPolicyMemory";
import {
  projectEcbHistoricalCatalogCandidateV1,
  type EcbHistoricalCatalogProjectionV1,
} from "./ecbHistoricalCatalogProjection";

export const ECB_HISTORICAL_ADMISSION_MODEL_SCHEMA_V1 = "ecb-historical-admission-offline-model-v1";
export const ECB_HISTORICAL_PAYLOAD_ENCODING_V1 = "ecb-normalized-snapshot-json-utf8-v1";
export const ECB_HISTORICAL_MAX_PAYLOAD_BYTES_V1 = 65_536;
export const ECB_HISTORICAL_MAX_MODEL_ENTRIES_V1 = 128;

interface OfflineScope {
  readonly mode: "offline-model-only";
  readonly coverage: "provided-history-only";
  readonly ownershipVerified: false;
  /** No durable object, transport response or storage receipt is verified here. */
  readonly objectVerified: false;
}

const scope: OfflineScope = Object.freeze({
  mode: "offline-model-only", coverage: "provided-history-only",
  ownershipVerified: false, objectVerified: false,
});

export interface EcbHistoricalAdmissionCandidateV1 extends OfflineScope {
  readonly status: "candidate";
  readonly encoding: typeof ECB_HISTORICAL_PAYLOAD_ENCODING_V1;
  /** Exact UTF-8 encoding of JSON.stringify(the authoritative parsed snapshot). */
  readonly payloadText: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly snapshot: EcbMonetaryPolicyEventSnapshotV1;
  readonly projection: EcbHistoricalCatalogProjectionV1;
}

export type EcbHistoricalAdmissionStateV1 = "admitted-pending-object" |
  "verified-readable" | "verification-failed";

export interface EcbHistoricalAdmissionEntryV1 {
  readonly status: EcbHistoricalAdmissionStateV1;
  readonly candidate: EcbHistoricalAdmissionCandidateV1;
}

export interface EcbHistoricalAdmissionModelV1 extends OfflineScope {
  readonly schemaVersion: typeof ECB_HISTORICAL_ADMISSION_MODEL_SCHEMA_V1;
  readonly revision: number;
  readonly entries: readonly EcbHistoricalAdmissionEntryV1[];
}

export interface EcbHistoricalAdmissionFailureV1 extends OfflineScope {
  readonly kind: "invalid-request";
  readonly status: "verification-failed";
  readonly reason: "INVALID_INPUT" | "INVALID_PAYLOAD";
}

export interface EcbHistoricalAdmissionPlanV1 extends OfflineScope {
  readonly kind: "plan";
  readonly status: EcbHistoricalAdmissionStateV1 | "integrity-conflict" | "stale" |
    "chronology-conflict" | "event-id-mismatch";
  readonly duplicate: boolean;
  /** A future coordinator must enforce a real transaction precondition. */
  readonly expectedModel: EcbHistoricalAdmissionModelV1;
  /** Proposed model only; its existence does not mean a write occurred. */
  readonly nextModel: EcbHistoricalAdmissionModelV1;
}

export type EcbHistoricalAdmissionPlanResultV1 = EcbHistoricalAdmissionPlanV1 |
  EcbHistoricalAdmissionFailureV1;

export type EcbHistoricalAdmissionReadResultV1 = OfflineScope & (
  | { readonly status: "verified-readable"; readonly readable: true;
      readonly asOf: number; readonly selectedSnapshot: EcbMonetaryPolicyEventSnapshotV1 }
  | { readonly status: "admitted-pending-object" | "integrity-conflict";
      readonly readable: false; readonly asOf: number }
  | { readonly status: "ambiguous-history"; readonly readable: false; readonly asOf: number;
      readonly reason: "AMBIGUOUS_HISTORY" }
  | { readonly status: "unavailable"; readonly readable: false; readonly asOf: number;
      readonly reason: "INSUFFICIENT_HISTORY" }
  | ({ readonly status: "verification-failed"; readonly readable: false } & (
      | { readonly reason: "INVALID_HISTORY" | "ENTRY_VERIFICATION_FAILED"; readonly asOf: number }
      | { readonly reason: "INVALID_AS_OF"; readonly asOf: null }
    ))
);

interface ModelData {
  readonly memory: EcbMonetaryPolicyEventMemoryV1 | null;
}

// These are process-local model handles, not signatures, ownership receipts or
// persisted records. JSON round-trips and structurally forged handles fail closed.
const candidates = new WeakSet<object>();
const models = new WeakMap<object, ModelData>();

/** No toJSON/getters/Proxies: the only supplied payload representation is a string. */
export function prepareEcbHistoricalAdmissionCandidateV1(
  payloadText: unknown,
): EcbHistoricalAdmissionCandidateV1 | EcbHistoricalAdmissionFailureV1 {
  try {
    if (typeof payloadText !== "string" || payloadText.length > ECB_HISTORICAL_MAX_PAYLOAD_BYTES_V1) {
      return failure("INVALID_PAYLOAD");
    }
    const bytes = Buffer.from(payloadText, "utf8");
    if (bytes.length > ECB_HISTORICAL_MAX_PAYLOAD_BYTES_V1 || bytes.toString("utf8") !== payloadText) {
      return failure("INVALID_PAYLOAD");
    }
    const raw: unknown = JSON.parse(payloadText);
    // Projection owns the public ECB trust boundary; the parser supplies the
    // normalized full snapshot needed by the explicitly defined byte encoding.
    const projection = projectEcbHistoricalCatalogCandidateV1(raw);
    const memory = parseEcbMonetaryPolicyEventMemoryV1({
      schemaVersion: ECB_MONETARY_POLICY_EVENT_MEMORY_SCHEMA_VERSION_V1,
      canonicalEventId: projection.canonicalEventId, snapshots: [raw],
    });
    if (memory === null) return failure("INVALID_PAYLOAD");
    const snapshot = memory.snapshots[0]!;
    // Reject duplicate JSON keys, ignored fields, alternate ordering/whitespace,
    // and lossy numbers rather than silently changing the supplied bytes.
    if (JSON.stringify(snapshot) !== payloadText) return failure("INVALID_PAYLOAD");
    const candidate: EcbHistoricalAdmissionCandidateV1 = Object.freeze({
      ...scope, status: "candidate", encoding: ECB_HISTORICAL_PAYLOAD_ENCODING_V1,
      payloadText, byteLength: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"), snapshot, projection,
    });
    candidates.add(candidate);
    return candidate;
  } catch {
    return failure("INVALID_PAYLOAD");
  }
}

export function createEcbHistoricalAdmissionModelV1(): EcbHistoricalAdmissionModelV1 {
  return model(null, [], 0);
}

/**
 * One canonical event per model. Chronology is exclusively the existing memory
 * advance contract, with the stricter required byte-conflict check BEFORE its
 * semantic-version-only unchanged outcome. No timestamp or ownership is invented.
 * Conflicts reject this proposal without invalidating accepted evidence. If the
 * caller discards the outcome, no quarantine or audit record survives here.
 */
export function planEcbHistoricalAdmissionV1(
  suppliedModel: unknown, suppliedCandidate: unknown,
): EcbHistoricalAdmissionPlanResultV1 {
  const current = modelHandle(suppliedModel);
  const candidate = candidateHandle(suppliedCandidate);
  if (current === null || candidate === null) return failure("INVALID_INPUT");
  const data = models.get(current)!;
  if (data.memory !== null && data.memory.canonicalEventId !== candidate.snapshot.canonicalEventId) {
    return plan(current, current, "event-id-mismatch");
  }
  const existing = current.entries.findIndex(entry =>
    entry.candidate.snapshot.eventSourceVersionId === candidate.snapshot.eventSourceVersionId);
  if (existing !== -1) {
    const entry = current.entries[existing]!;
    if (sameBytes(entry.candidate, candidate.payloadText)) {
      return plan(current, current, entry.status, true);
    }
    return plan(current, current, "integrity-conflict");
  }
  const advance = advanceEcbMonetaryPolicyEventMemoryV1(data.memory, candidate.snapshot.event);
  if (advance.status === "stale") return plan(current, current, "stale");
  if (advance.status === "conflict") return plan(current, current, "chronology-conflict");
  if (advance.status !== "initialized" && advance.status !== "advanced") {
    return failure("INVALID_INPUT");
  }
  if (current.entries.length >= ECB_HISTORICAL_MAX_MODEL_ENTRIES_V1) return failure("INVALID_INPUT");
  const entry: EcbHistoricalAdmissionEntryV1 = Object.freeze({
    status: "admitted-pending-object", candidate,
  });
  return plan(current, model(advance.memory, [...current.entries, entry], current.revision + 1), entry.status);
}

/**
 * Checks independently supplied bytes against the planned exact bytes. Readable
 * means PROCESS-LOCAL BYTE VERIFICATION ONLY, never ownership/durable-object proof.
 * Verification state is current operational state, NOT verification-as-of history.
 * A bad attempt never downgrades a verified entry. Pending/failed entries remain
 * unreadable after any failed attempt; only exact canonical bytes permit recovery.
 * Conflicts describe rejected attempts, not proven corruption of accepted bytes.
 */
export function planEcbHistoricalByteVerificationV1(
  suppliedModel: unknown, eventSourceVersionId: unknown, payloadText: unknown,
): EcbHistoricalAdmissionPlanResultV1 {
  const current = modelHandle(suppliedModel);
  if (current === null) return failure("INVALID_INPUT");
  if (typeof eventSourceVersionId !== "string") return plan(current, current, "verification-failed");
  const index = current.entries.findIndex(entry =>
    entry.candidate.snapshot.eventSourceVersionId === eventSourceVersionId);
  if (index === -1) return plan(current, current, "verification-failed");
  const entry = current.entries[index]!;
  const attempt = prepareEcbHistoricalAdmissionCandidateV1(payloadText);
  if (attempt.status !== "candidate") {
    return rejectedVerification(current, index, "verification-failed");
  }
  if (!sameBytes(entry.candidate, attempt.payloadText)) {
    return rejectedVerification(current, index, "integrity-conflict");
  }
  return replaceStatus(current, index, "verified-readable");
}

/**
 * Supplied branches of ONE event, not complete historical coverage or prior-event
 * discovery. Select latest source knowledge BEFORE readiness; never stale fallback.
 * Differing selected knowledge coordinates (including absent evidence) are
 * AMBIGUOUS_HISTORY; no branch merge or complete-coverage claim is made. Only
 * equal selected knownAt can be compared for byte integrity and readiness.
 */
export function selectEcbHistoricalAdmissionAsKnownAtV1(
  suppliedModels: unknown, asOf: unknown,
): EcbHistoricalAdmissionReadResultV1 {
  if (typeof asOf !== "number" || !Number.isSafeInteger(asOf) || asOf < 0) {
    return Object.freeze({ ...scope, status: "verification-failed", readable: false, asOf: null, reason: "INVALID_AS_OF" });
  }
  const branches = readBranches(suppliedModels);
  if (branches === null) {
    return Object.freeze({ ...scope, status: "verification-failed", readable: false, asOf, reason: "INVALID_HISTORY" });
  }
  const identities = new Set(branches.flatMap(branch => {
    const memory = models.get(branch)!.memory;
    return memory === null ? [] : [memory.canonicalEventId];
  }));
  if (identities.size > 1) {
    return Object.freeze({ ...scope, status: "verification-failed", readable: false, asOf, reason: "INVALID_HISTORY" });
  }
  const eligible: EcbHistoricalAdmissionEntryV1[] = [];
  for (const branch of branches) {
    const memory = models.get(branch)!.memory;
    if (memory === null) continue;
    const snapshot = selectEcbMonetaryPolicyEventAsKnownAtV1(memory, asOf);
    if (snapshot === null) continue;
    eligible.push(branch.entries.find(entry =>
      entry.candidate.snapshot.knownAt === snapshot.knownAt)!);
  }
  if (eligible.length === 0) {
    return Object.freeze({ ...scope, status: "unavailable", readable: false, asOf, reason: "INSUFFICIENT_HISTORY" });
  }
  const first = eligible[0]!;
  if (eligible.length !== branches.length || eligible.some(entry =>
    entry.candidate.snapshot.knownAt !== first.candidate.snapshot.knownAt)) {
    return Object.freeze({ ...scope, status: "ambiguous-history", readable: false, asOf, reason: "AMBIGUOUS_HISTORY" });
  }
  // Failure precedence is independent of supplied branch ordering.
  const conflict = eligible.some(entry => entry.candidate.payloadText !== first.candidate.payloadText);
  if (conflict) return Object.freeze({ ...scope, status: "integrity-conflict", readable: false, asOf });
  if (eligible.some(entry => entry.status === "verification-failed")) {
    return Object.freeze({ ...scope, status: "verification-failed", readable: false, asOf, reason: "ENTRY_VERIFICATION_FAILED" });
  }
  if (eligible.some(entry => entry.status === "admitted-pending-object")) {
    return Object.freeze({ ...scope, status: "admitted-pending-object", readable: false, asOf });
  }
  return Object.freeze({ ...scope, status: "verified-readable", readable: true, asOf,
    selectedSnapshot: first.candidate.snapshot });
}

function sameBytes(candidate: EcbHistoricalAdmissionCandidateV1, text: string): boolean {
  const bytes = Buffer.from(text, "utf8");
  return bytes.toString("utf8") === text && bytes.length === candidate.byteLength &&
    createHash("sha256").update(bytes).digest("hex") === candidate.sha256 &&
    text === candidate.payloadText;
}

function failure(reason: EcbHistoricalAdmissionFailureV1["reason"]): EcbHistoricalAdmissionFailureV1 {
  return Object.freeze({ ...scope, kind: "invalid-request", status: "verification-failed", reason });
}

function model(memory: EcbMonetaryPolicyEventMemoryV1 | null,
  entries: readonly EcbHistoricalAdmissionEntryV1[], revision: number): EcbHistoricalAdmissionModelV1 {
  const result = Object.freeze({ ...scope, schemaVersion: ECB_HISTORICAL_ADMISSION_MODEL_SCHEMA_V1,
    revision, entries: Object.freeze([...entries]) });
  models.set(result, { memory });
  return result;
}

function modelHandle(value: unknown): EcbHistoricalAdmissionModelV1 | null {
  return typeof value === "object" && value !== null && models.has(value)
    ? value as EcbHistoricalAdmissionModelV1 : null;
}

function candidateHandle(value: unknown): EcbHistoricalAdmissionCandidateV1 | null {
  return typeof value === "object" && value !== null && candidates.has(value)
    ? value as EcbHistoricalAdmissionCandidateV1 : null;
}

function plan(current: EcbHistoricalAdmissionModelV1, next: EcbHistoricalAdmissionModelV1,
  status: EcbHistoricalAdmissionPlanV1["status"], duplicate = false): EcbHistoricalAdmissionPlanV1 {
  return Object.freeze({ ...scope, kind: "plan", status, duplicate, expectedModel: current, nextModel: next });
}

function rejectedVerification(current: EcbHistoricalAdmissionModelV1, index: number,
  outcome: "integrity-conflict" | "verification-failed"): EcbHistoricalAdmissionPlanV1 {
  const next = current.entries[index]!.status === "verified-readable"
    ? current : replaceStatus(current, index, "verification-failed").nextModel;
  return plan(current, next, outcome);
}

function replaceStatus(current: EcbHistoricalAdmissionModelV1, index: number,
  status: EcbHistoricalAdmissionStateV1): EcbHistoricalAdmissionPlanV1 {
  if (current.entries[index]!.status === status) return plan(current, current, status, true);
  const entries = current.entries.map((entry, position) => position === index
    ? Object.freeze({ ...entry, status }) : entry);
  return plan(current, model(models.get(current)!.memory, entries, current.revision + 1), status);
}

function readBranches(value: unknown): readonly EcbHistoricalAdmissionModelV1[] | null {
  if (typeof value !== "object" || value === null || isProxy(value) || !Array.isArray(value)) return null;
  const length = Object.getOwnPropertyDescriptor(value, "length")!.value as number;
  if (length > ECB_HISTORICAL_MAX_MODEL_ENTRIES_V1) return null;
  const branches: EcbHistoricalAdmissionModelV1[] = [];
  for (let index = 0; index < length; index += 1) {
    // Only array positions are history inputs; unrelated properties are ignored.
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !("value" in descriptor)) return null;
    const branch = modelHandle(descriptor.value);
    if (branch === null) return null;
    branches.push(branch);
  }
  return Object.freeze(branches);
}
