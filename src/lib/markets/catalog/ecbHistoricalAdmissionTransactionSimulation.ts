import { Buffer } from "node:buffer";
import {
  createEcbHistoricalAdmissionModelV1,
  planEcbHistoricalAdmissionV1,
  prepareEcbHistoricalAdmissionCandidateV1,
  type EcbHistoricalAdmissionCandidateV1,
  type EcbHistoricalAdmissionModelV1,
} from "./ecbHistoricalAdmissionPlanning";
import {
  rehydrateEcbHistoricalByteCustodyEnvelopeV1,
  type EcbHistoricalByteCustodyEnvelopeV1,
} from "./ecbHistoricalByteCustodyEnvelope";

export const ECB_HISTORICAL_SIMULATION_CHECKPOINT_SCHEMA_V1 =
  "ecb-historical-admission-simulation-checkpoint-v1";
export const ECB_HISTORICAL_SIMULATION_MAX_TRANSACTIONS_V1 = 256;
export const ECB_HISTORICAL_SIMULATION_MAX_VERSIONS_V1 = 128;
export const ECB_HISTORICAL_SIMULATION_MAX_CHECKPOINT_BYTES_V1 = 32 * 1_024 * 1_024;
export const ECB_HISTORICAL_SIMULATION_FAULT_POINTS_V1 = Object.freeze([
  "after-bytes", "after-model", "after-receipt", "after-audit", "after-outbox",
  "after-journal", "before-swap",
] as const);
export type EcbHistoricalSimulationFaultPointV1 =
  typeof ECB_HISTORICAL_SIMULATION_FAULT_POINTS_V1[number];

/** Fixed synthetic request context, NOT an authenticated principal or authority. */
interface Context {
  readonly scope: "offline-synthetic-ecb-history-v1";
  readonly principal: "offline-synthetic-principal-v1";
  readonly operation: "admit";
  readonly mode: "offline-model-only";
  readonly coverage: "provided-history-only";
  readonly ownershipVerified: false;
  readonly objectVerified: false;
}
const context: Context = Object.freeze({
  scope: "offline-synthetic-ecb-history-v1", principal: "offline-synthetic-principal-v1",
  operation: "admit", mode: "offline-model-only", coverage: "provided-history-only",
  ownershipVerified: false, objectVerified: false,
});

export interface EcbHistoricalSimulationProposalV1 extends Context {
  readonly kind: "proposal";
  readonly baseCommitSequence: number;
  readonly requestKey: string;
}
export interface EcbHistoricalSimulationRefusalV1 extends Context {
  readonly kind: "refused";
  readonly auditRecorded: false;
  readonly reason: "INVALID_REQUEST_KEY" | "INVALID_ENVELOPE" | "INVALID_PROPOSAL" |
    "PRECONDITION_FAILED" | "INVALID_FAULT_POINT" | "INJECTED_ABORT" |
    "TRANSACTION_LIMIT" | "VERSION_LIMIT" | "CHECKPOINT_LIMIT" | "INVALID_CHECKPOINT";
}
export type EcbHistoricalSimulationOutcomeV1 = "accepted" | "duplicate" |
  "idempotency-conflict" | "integrity-conflict" | "stale" | "chronology-conflict" |
  "event-id-mismatch";
export interface EcbHistoricalSimulationReceiptV1 extends Context {
  readonly commitSequence: number;
  readonly modelRevision: number;
  readonly requestKey: string;
  readonly envelopeJson: string;
  readonly outcome: EcbHistoricalSimulationOutcomeV1;
  readonly acceptedVersionId: number | null;
}
export interface EcbHistoricalSimulationCommitV1 extends Context {
  readonly kind: "committed" | "replay";
  /** Replay returns the ORIGINAL receipt, not a newly synthesized current view. */
  readonly receipt: EcbHistoricalSimulationReceiptV1;
  readonly auditRecorded: boolean;
}
interface ByteRecord extends Context {
  readonly acceptedVersionId: number;
  readonly envelopeJson: string;
  readonly envelope: EcbHistoricalByteCustodyEnvelopeV1;
}
interface AcceptedVersion extends Context {
  readonly acceptedVersionId: number;
  readonly commitSequence: number;
  readonly canonicalEventId: string;
  readonly eventSourceVersionId: string;
  readonly knownAt: number;
  readonly sha256: string;
  readonly byteLength: number;
  readonly status: "admitted-pending-object";
}
interface AuditRecord extends Context {
  readonly commitSequence: number;
  readonly requestKey: string;
  readonly outcome: EcbHistoricalSimulationOutcomeV1;
}
interface OutboxTask extends Context {
  readonly taskId: number;
  readonly acceptedVersionId: number;
  readonly commitSequence: number;
  readonly operation: "admit";
  readonly taskType: "persist-canonical-bytes";
  readonly status: "queued";
}
interface JournalEntry {
  readonly requestKey: string;
  readonly envelopeJson: string;
}
export interface EcbHistoricalSimulationViewV1 extends Context {
  readonly commitSequence: number;
  readonly modelRevision: number;
  readonly canonicalEventId: string | null;
  readonly bytes: readonly ByteRecord[];
  readonly acceptedVersions: readonly AcceptedVersion[];
  readonly receipts: readonly EcbHistoricalSimulationReceiptV1[];
  readonly audit: readonly AuditRecord[];
  readonly outbox: readonly OutboxTask[];
  readonly journal: readonly JournalEntry[];
}
export interface EcbHistoricalAdmissionTransactionSimulationV1 extends Context {
  propose(requestKey: unknown, envelopeJson: unknown):
    EcbHistoricalSimulationProposalV1 | EcbHistoricalSimulationRefusalV1;
  commit(proposal: unknown, faultPoint?: unknown):
    EcbHistoricalSimulationCommitV1 | EcbHistoricalSimulationRefusalV1;
  inspect(): EcbHistoricalSimulationViewV1;
  exportCheckpoint(): string;
}
interface Head {
  readonly model: EcbHistoricalAdmissionModelV1;
  readonly view: EcbHistoricalSimulationViewV1;
  readonly checkpoint: string;
}
interface ProposalData {
  /** Origin is the coordinator-private WeakMap; this counter never resets there. */
  readonly baseCommitSequence: number;
  readonly requestKey: string;
  readonly envelopeJson: string;
  readonly envelope: EcbHistoricalByteCustodyEnvelopeV1;
  readonly candidate: EcbHistoricalAdmissionCandidateV1;
}

/**
 * A bounded, synchronous, single-event simulation. One private head assignment is
 * the simulated commit point. There is no I/O, durable custody, historical capture
 * authentication, database isolation proof, worker, object verification or read
 * readiness. All data views are frozen; process-local model/proposal handles stay
 * private. Logical row IDs are local sequence numbers, not globally unique IDs.
 */
export function createEcbHistoricalAdmissionTransactionSimulationV1():
EcbHistoricalAdmissionTransactionSimulationV1 {
  const proposals = new WeakMap<object, ProposalData>();
  const empty = Object.freeze([]);
  const initialView: EcbHistoricalSimulationViewV1 = Object.freeze({
    ...context, commitSequence: 0, modelRevision: 0, canonicalEventId: null,
    bytes: empty, acceptedVersions: empty, receipts: empty, audit: empty, outbox: empty, journal: empty,
  });
  let head: Head = Object.freeze({
    model: createEcbHistoricalAdmissionModelV1(), view: initialView, checkpoint: checkpoint(empty),
  });

  function propose(requestKey: unknown, envelopeJson: unknown) {
    if (!validKey(requestKey)) return refusal("INVALID_REQUEST_KEY");
    const envelope = rehydrateEcbHistoricalByteCustodyEnvelopeV1(envelopeJson);
    if (envelope.status !== "envelope" || typeof envelopeJson !== "string") {
      return refusal("INVALID_ENVELOPE");
    }
    // Slice 1 checks all supplied fields; only authoritative freshly prepared
    // candidate handles enter the planner. Never trust caller nextModel/state.
    const candidate = prepareEcbHistoricalAdmissionCandidateV1(envelope.payloadText);
    if (candidate.status !== "candidate") return refusal("INVALID_ENVELOPE");
    const proposal: EcbHistoricalSimulationProposalV1 = Object.freeze({
      ...context, kind: "proposal", baseCommitSequence: head.view.commitSequence, requestKey,
    });
    // Retained handles must not pin historical heads, checkpoint strings or row
    // collections. The private sequence plus this closure's WeakMap identity is
    // sufficient: commits advance monotonically; restoration creates a new map.
    proposals.set(proposal, Object.freeze({
      baseCommitSequence: head.view.commitSequence, requestKey, envelopeJson, envelope, candidate,
    }));
    return proposal;
  }

  function commit(proposal: unknown, faultPoint?: unknown) {
    // WeakMap lookup does not inspect properties or trigger Proxy/getter traps.
    if (typeof proposal !== "object" || proposal === null || !proposals.has(proposal)) {
      return refusal("INVALID_PROPOSAL");
    }
    const data = proposals.get(proposal)!;
    const current = head;
    // The first receipt owns a key in the fixed scope/principal/operation. Key
    // misuse receives audit-only receipts without replacing this mapping.
    const original = current.view.receipts.find(receipt => receipt.requestKey === data.requestKey);
    if (original !== undefined && original.envelopeJson === data.envelopeJson) {
      return committed("replay", original, false);
    }
    if (data.baseCommitSequence !== current.view.commitSequence) {
      return refusal("PRECONDITION_FAILED");
    }
    if (faultPoint !== undefined && (typeof faultPoint !== "string" ||
      !ECB_HISTORICAL_SIMULATION_FAULT_POINTS_V1.some(point => point === faultPoint))) {
      return refusal("INVALID_FAULT_POINT");
    }
    const plan = original === undefined ? planEcbHistoricalAdmissionV1(current.model, data.candidate) : null;
    // With private, freshly validated handles and pending-only models, the
    // planner's INVALID_INPUT here is its new-version capacity refusal. Duplicates
    // and conflicts are classified before that authoritative bound.
    if (plan?.kind === "invalid-request") return refusal("VERSION_LIMIT");
    const nextModel = plan === null ? current.model : plan.nextModel;
    const added = nextModel !== current.model;
    const outcome: EcbHistoricalSimulationOutcomeV1 = original !== undefined ? "idempotency-conflict" :
      added ? "accepted" : plan!.duplicate ? "duplicate" :
        plan!.status as "integrity-conflict" | "stale" | "chronology-conflict" | "event-id-mismatch";
    if (current.view.journal.length >= ECB_HISTORICAL_SIMULATION_MAX_TRANSACTIONS_V1) {
      return refusal("TRANSACTION_LIMIT");
    }
    if (added && current.view.acceptedVersions.length >= ECB_HISTORICAL_SIMULATION_MAX_VERSIONS_V1) {
      return refusal("VERSION_LIMIT");
    }
    const sequence = current.view.commitSequence + 1;
    const acceptedVersionId = added ? current.view.acceptedVersions.length + 1 :
      outcome === "duplicate" ? current.view.acceptedVersions.find(version =>
        version.eventSourceVersionId === data.envelope.eventSourceVersionId)!.acceptedVersionId : null;
    const bytes = added ? Object.freeze([...current.view.bytes, Object.freeze({
      ...context, acceptedVersionId: acceptedVersionId!, envelopeJson: data.envelopeJson, envelope: data.envelope,
    })]) : current.view.bytes;
    if (faultPoint === "after-bytes") return refusal("INJECTED_ABORT");
    const acceptedVersions = added ? Object.freeze([...current.view.acceptedVersions, Object.freeze({
      ...context, acceptedVersionId: acceptedVersionId!, commitSequence: sequence,
      canonicalEventId: data.envelope.canonicalEventId, eventSourceVersionId: data.envelope.eventSourceVersionId,
      knownAt: data.envelope.knownAt, sha256: data.envelope.sha256, byteLength: data.envelope.byteLength,
      status: "admitted-pending-object" as const,
    })]) : current.view.acceptedVersions;
    if (faultPoint === "after-model") return refusal("INJECTED_ABORT");
    const receipt: EcbHistoricalSimulationReceiptV1 = Object.freeze({
      ...context, commitSequence: sequence, modelRevision: nextModel.revision,
      requestKey: data.requestKey, envelopeJson: data.envelopeJson, outcome, acceptedVersionId,
    });
    const receipts = Object.freeze([...current.view.receipts, receipt]);
    if (faultPoint === "after-receipt") return refusal("INJECTED_ABORT");
    const audit = Object.freeze([...current.view.audit, Object.freeze({
      ...context, commitSequence: sequence, requestKey: data.requestKey, outcome,
    })]);
    if (faultPoint === "after-audit") return refusal("INJECTED_ABORT");
    const outbox = added ? Object.freeze([...current.view.outbox, Object.freeze({
      ...context, taskId: acceptedVersionId!, acceptedVersionId: acceptedVersionId!, commitSequence: sequence,
      taskType: "persist-canonical-bytes" as const, status: "queued" as const,
    })]) : current.view.outbox;
    if (faultPoint === "after-outbox") return refusal("INJECTED_ABORT");
    const journal = Object.freeze([...current.view.journal, Object.freeze({
      requestKey: data.requestKey, envelopeJson: data.envelopeJson,
    })]);
    if (faultPoint === "after-journal") return refusal("INJECTED_ABORT");
    // Full-prefix serialization remains O(n * entryBytes) per commit and
    // O(n² * entryBytes) cumulatively, including restore. Bounds cap n at 256
    // and each canonical checkpoint at 32 MiB. No execution-time budget is imposed.
    const wire = checkpoint(journal);
    if (Buffer.byteLength(wire, "utf8") > ECB_HISTORICAL_SIMULATION_MAX_CHECKPOINT_BYTES_V1) {
      return refusal("CHECKPOINT_LIMIT");
    }
    const view: EcbHistoricalSimulationViewV1 = Object.freeze({
      ...context, commitSequence: sequence, modelRevision: nextModel.revision,
      canonicalEventId: acceptedVersions[0]?.canonicalEventId ?? null,
      bytes, acceptedVersions, receipts, audit, outbox, journal,
    });
    const next: Head = Object.freeze({ model: nextModel, view, checkpoint: wire });
    if (faultPoint === "before-swap") return refusal("INJECTED_ABORT");
    head = next;
    return committed("committed", receipt, true);
  }

  return Object.freeze({ ...context, propose, commit,
    inspect: () => head.view, exportCheckpoint: () => head.checkpoint });
}

/**
 * Primitive canonical JSON wire only, decoded strictly by its transport upstream.
 * Exact reconstructed wire equality rejects duplicates, reordered keys, alternate
 * escapes/numbers/whitespace and ignored state. Replay uses the same admission and
 * commit path, checking each prefix; no redundant derived state is trusted.
 * New closure/WeakMap means all pre-restart proposals lose authority. Fabricated
 * self-consistent journals remain synthetic. No checkpoint authenticates history,
 * stores anything durably, or retains runtime identity/freezing through JSON.
 */
export function restoreEcbHistoricalAdmissionTransactionSimulationV1(
  checkpointJson: unknown,
): { readonly kind: "restored"; readonly coordinator: EcbHistoricalAdmissionTransactionSimulationV1 } |
EcbHistoricalSimulationRefusalV1 {
  if (typeof checkpointJson !== "string" ||
    checkpointJson.length > ECB_HISTORICAL_SIMULATION_MAX_CHECKPOINT_BYTES_V1) {
    return refusal("INVALID_CHECKPOINT");
  }
  const bytes = Buffer.from(checkpointJson, "utf8");
  if (bytes.length > ECB_HISTORICAL_SIMULATION_MAX_CHECKPOINT_BYTES_V1 ||
    bytes.toString("utf8") !== checkpointJson) return refusal("INVALID_CHECKPOINT");
  let parsed: unknown;
  try { parsed = JSON.parse(checkpointJson); } catch { return refusal("INVALID_CHECKPOINT"); }
  const fields = ["schemaVersion", ...Object.keys(context), "journal"];
  if (!exactRecord(parsed, fields)) return refusal("INVALID_CHECKPOINT");
  if (parsed.schemaVersion !== ECB_HISTORICAL_SIMULATION_CHECKPOINT_SCHEMA_V1 ||
    Object.entries(context).some(([key, value]) => parsed[key] !== value) ||
    !Array.isArray(parsed.journal) || parsed.journal.length > ECB_HISTORICAL_SIMULATION_MAX_TRANSACTIONS_V1) {
    return refusal("INVALID_CHECKPOINT");
  }
  const coordinator = createEcbHistoricalAdmissionTransactionSimulationV1();
  for (const entry of parsed.journal) {
    if (!exactRecord(entry, ["requestKey", "envelopeJson"])) return refusal("INVALID_CHECKPOINT");
    const proposal = coordinator.propose(entry.requestKey, entry.envelopeJson);
    if (proposal.kind !== "proposal" || coordinator.commit(proposal).kind !== "committed") {
      return refusal("INVALID_CHECKPOINT");
    }
  }
  if (coordinator.exportCheckpoint() !== checkpointJson) return refusal("INVALID_CHECKPOINT");
  return Object.freeze({ kind: "restored", coordinator });
}

function validKey(key: unknown): key is string {
  return typeof key === "string" && key.length >= 1 && key.length <= 64 && /^[A-Za-z0-9._:-]+$/.test(key);
}
// JSON.parse-owned values only: no caller objects, getters, methods or Proxies.
function exactRecord(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    Object.keys(value).length === fields.length && fields.every(field =>
      Object.prototype.hasOwnProperty.call(value, field));
}
function checkpoint(journal: readonly JournalEntry[]): string {
  return JSON.stringify({ schemaVersion: ECB_HISTORICAL_SIMULATION_CHECKPOINT_SCHEMA_V1, ...context, journal });
}
function refusal(reason: EcbHistoricalSimulationRefusalV1["reason"]): EcbHistoricalSimulationRefusalV1 {
  return Object.freeze({ ...context, kind: "refused", reason, auditRecorded: false });
}
function committed(kind: "committed" | "replay", receipt: EcbHistoricalSimulationReceiptV1,
  auditRecorded: boolean): EcbHistoricalSimulationCommitV1 {
  return Object.freeze({ ...context, kind, receipt, auditRecorded });
}
