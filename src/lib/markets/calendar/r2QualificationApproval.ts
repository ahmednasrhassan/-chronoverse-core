import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { calendarRecordV1, snapshotCalendarDataV1 } from "./validation";
import { prepareR2CaptureArchiveQualificationV1, type R2QualificationManifestV1 } from "./r2CaptureArchiveQualification";

export const R2_APPROVAL_DRAFT_V1 = "calendar-r2-approval-draft-v1" as const;
export const R2_APPROVAL_RECORD_V1 = "calendar-r2-approval-record-v1" as const;
export const R2_APPROVAL_DECISION_V1 = "calendar-r2-authenticated-decision-v1" as const;
export const R2_APPROVAL_LEDGER_V1 = "calendar-r2-offline-approval-ledger-v1" as const;
const namespace = "chronoverse:calendar:r2-qualification-approval:v1";
const eventVersion = "calendar-r2-approval-audit-v1";
const checkpointVersion = "calendar-r2-approval-checkpoint-v1";
const scope = "offline-approval-model-only" as const;
export const R2_APPROVAL_BOUNDS_V1 = Object.freeze({ records: 8, events: 128, bytes: 262144,
  clockUncertaintyMs: 1000, requestTimeoutMs: 1000, validityMs: 120000 });
type Reason = "invalid-input" | "unauthorized" | "duplicate" | "invalid-state" | "consumed" | "clock"
  | "outside-window" | "budget" | "capacity" | "audit-invalid" | "checkpoint" | "authority-uncertain"
  | "storage-unavailable" | "acknowledgement-unknown" | "invalid-session";
export class R2QualificationApprovalErrorV1 extends Error {
  readonly code: Reason;
  constructor(code: Reason) { super("Offline qualification approval unavailable."); this.code = code; this.name = "R2QualificationApprovalErrorV1"; }
}
function fail(code: Reason): never { throw new R2QualificationApprovalErrorV1(code); }
const reasons: readonly Reason[] = ["invalid-input", "unauthorized", "duplicate", "invalid-state", "consumed", "clock",
  "outside-window", "budget", "capacity", "audit-invalid", "checkpoint", "authority-uncertain", "storage-unavailable", "acknowledgement-unknown", "invalid-session"];
function sanitized(error: unknown, fallback: Reason): R2QualificationApprovalErrorV1 {
  return new R2QualificationApprovalErrorV1(error instanceof R2QualificationApprovalErrorV1 && reasons.includes(error.code) ? error.code : fallback);
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object") {
    const data = value as Record<string, unknown>;
    return "{" + Object.keys(data).sort().map(key => JSON.stringify(key) + ":" + canonical(data[key])).join(",") + "}";
  }
  return JSON.stringify(value) ?? fail("invalid-input");
}
function hash(kind: string, value: unknown): string {
  return createHash("sha256").update(canonical([namespace, kind, value]), "utf8").digest("hex");
}
function frozen<T>(value: T): T { return snapshotCalendarDataV1(value) as T; }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  try { return calendarRecordV1(snapshotCalendarDataV1(value), keys); } catch { return fail("invalid-input"); }
}
function id(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/.test(value)) fail("invalid-input");
  return value;
}
function digest(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) fail("invalid-input");
  return value;
}
function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || Object.is(value, -0) || value < 0 || value > 253402300799999) fail("invalid-input");
  return value;
}
export interface R2ApprovalDraftV1 {
  readonly schemaVersion: typeof R2_APPROVAL_DRAFT_V1;
  readonly approvalId: string;
  readonly manifest: R2QualificationManifestV1;
  readonly notBefore: number;
  readonly expiresAt: number;
  readonly targetPolicyVersion: string;
  readonly requestSha256: string;
}
// Performance cache only: exact complete canonical input, never ledger authority.
// Eviction only causes revalidation, never approval admission or replay permission.
const validatedManifests = new Map<string, R2QualificationManifestV1>();
function manifest(value: unknown): R2QualificationManifestV1 {
  const data = object(value, ["schemaVersion", "plan", "fixtureVersion", "fixtures", "missingObjectKey", "cases", "manifestSha256"]);
  const raw = canonical(data);
  const cached = validatedManifests.get(raw);
  if (cached) return cached;
  const rebuilt = prepareR2CaptureArchiveQualificationV1(data.plan);
  if (canonical(rebuilt) !== raw) fail("invalid-input");
  if (validatedManifests.size >= 16) validatedManifests.delete(validatedManifests.keys().next().value!);
  validatedManifests.set(raw, rebuilt); return rebuilt;
}
/** Pure draft. Operator names, booleans, tokens and external evidence are not inputs. */
export function prepareR2QualificationApprovalV1(value: unknown): R2ApprovalDraftV1 {
  const data = object(value, ["schemaVersion", "approvalId", "manifest", "notBefore", "expiresAt", "targetPolicyVersion"]);
  if (data.schemaVersion !== R2_APPROVAL_DRAFT_V1) fail("invalid-input");
  const notBefore = integer(data.notBefore); const expiresAt = integer(data.expiresAt);
  if (expiresAt <= notBefore || expiresAt - notBefore > R2_APPROVAL_BOUNDS_V1.validityMs) fail("invalid-input");
  const body = { schemaVersion: R2_APPROVAL_DRAFT_V1, approvalId: id(data.approvalId), manifest: manifest(data.manifest),
    notBefore, expiresAt, targetPolicyVersion: id(data.targetPolicyVersion) };
  return frozen({ ...body, requestSha256: hash("draft", body) });
}
function draft(value: unknown): R2ApprovalDraftV1 {
  const data = object(value, ["schemaVersion", "approvalId", "manifest", "notBefore", "expiresAt", "targetPolicyVersion", "requestSha256"]);
  const rebuilt = prepareR2QualificationApprovalV1({ schemaVersion: data.schemaVersion, approvalId: data.approvalId,
    manifest: data.manifest, notBefore: data.notBefore, expiresAt: data.expiresAt, targetPolicyVersion: data.targetPolicyVersion });
  if (canonical(data) !== canonical(rebuilt)) fail("invalid-input");
  return rebuilt;
}
interface Authorization {
  readonly schemaVersion: typeof R2_APPROVAL_DECISION_V1;
  readonly decision: "authorized";
  readonly purpose: "issue" | "revoke" | "reconcile";
  readonly requestSha256: string;
  readonly operatorSubjectSha256: string;
  readonly authorizationEvidenceSha256: string;
}
export interface R2ApprovalAuthorizationRequestV1 {
  readonly purpose: Authorization["purpose"];
  readonly requestSha256: string;
}
export interface R2ApprovalRecordV1 {
  readonly schemaVersion: typeof R2_APPROVAL_RECORD_V1;
  readonly approvalIdentity: string;
  readonly draft: R2ApprovalDraftV1;
  readonly authorization: Authorization;
  readonly approvalSha256: string;
}
function authorization(value: unknown, purpose: Authorization["purpose"], requestSha256: string): Authorization {
  try {
    const data = object(value, ["schemaVersion", "decision", "purpose", "requestSha256", "operatorSubjectSha256", "authorizationEvidenceSha256"]);
    if (data.schemaVersion !== R2_APPROVAL_DECISION_V1 || data.decision !== "authorized" || data.purpose !== purpose || data.requestSha256 !== requestSha256) fail("unauthorized");
    return frozen({ schemaVersion: R2_APPROVAL_DECISION_V1, decision: "authorized", purpose, requestSha256,
      operatorSubjectSha256: digest(data.operatorSubjectSha256), authorizationEvidenceSha256: digest(data.authorizationEvidenceSha256) });
  } catch { return fail("unauthorized"); }
}
function approved(input: R2ApprovalDraftV1, decision: Authorization): R2ApprovalRecordV1 {
  const body = { schemaVersion: R2_APPROVAL_RECORD_V1, approvalIdentity: hash("identity", input.approvalId), draft: input, authorization: decision };
  return frozen({ ...body, approvalSha256: hash("approval-record", body) });
}
interface ClockSample { readonly generation: string; readonly earliestMs: number; readonly latestMs: number }
function clock(value: unknown, generation: string): ClockSample {
  const data = object(value, ["generation", "earliestMs", "latestMs"]);
  if (data.generation !== generation) fail("authority-uncertain");
  const earliestMs = integer(data.earliestMs); const latestMs = integer(data.latestMs);
  if (earliestMs > latestMs || latestMs - earliestMs > R2_APPROVAL_BOUNDS_V1.clockUncertaintyMs) fail("clock");
  return frozen({ generation, earliestMs, latestMs });
}
type Method = "put" | "get";
interface Reference { readonly approvalIdentity: string; readonly approvalSha256: string }
function reference(value: unknown): Reference {
  const data = object(value, ["approvalIdentity", "approvalSha256"]);
  return frozen({ approvalIdentity: digest(data.approvalIdentity), approvalSha256: digest(data.approvalSha256) });
}
type Command =
  | { readonly action: "issue"; readonly draft: R2ApprovalDraftV1 }
  | (Reference & { readonly action: "claim"; readonly claimId: string })
  | (Reference & { readonly action: "reserve"; readonly claimId: string; readonly reservationId: string; readonly method: Method; readonly objectKey: string })
  | (Reference & { readonly action: "settle"; readonly claimId: string; readonly reservationId: string; readonly outcome: "observed" | "unknown" })
  | (Reference & { readonly action: "stop" | "complete"; readonly claimId: string })
  | (Reference & { readonly action: "revoke" | "expire" })
  | (Reference & { readonly action: "reconcile"; readonly resolutionSha256: string });
function command(value: unknown): Command {
  const passive = snapshotCalendarDataV1(value);
  if (passive === null || typeof passive !== "object" || Array.isArray(passive)) fail("invalid-input");
  const data = passive as Record<string, unknown>;
  if (data.action === "issue") { object(data, ["action", "draft"]); return frozen({ action: "issue", draft: draft(data.draft) }); }
  const reference = { approvalIdentity: digest(data.approvalIdentity), approvalSha256: digest(data.approvalSha256) };
  const base = ["action", "approvalIdentity", "approvalSha256"];
  switch (data.action) {
    case "claim": object(data, [...base, "claimId"]); return frozen({ ...reference, action: "claim", claimId: id(data.claimId) });
    case "reserve": {
      object(data, [...base, "claimId", "reservationId", "method", "objectKey"]);
      if ((data.method !== "put" && data.method !== "get") || typeof data.objectKey !== "string" || !/^calendar\/captures\/v1\/[a-f0-9]{64}\.json$/.test(data.objectKey)) fail("invalid-input");
      return frozen({ ...reference, action: "reserve", claimId: id(data.claimId), reservationId: id(data.reservationId), method: data.method, objectKey: data.objectKey });
    }
    case "settle": {
      object(data, [...base, "claimId", "reservationId", "outcome"]);
      if (data.outcome !== "observed" && data.outcome !== "unknown") fail("invalid-input");
      return frozen({ ...reference, action: "settle", claimId: id(data.claimId), reservationId: id(data.reservationId), outcome: data.outcome });
    }
    case "stop": case "complete": object(data, [...base, "claimId"]); return frozen({ ...reference, action: data.action, claimId: id(data.claimId) });
    case "revoke": case "expire": object(data, base); return frozen({ ...reference, action: data.action });
    case "reconcile": object(data, [...base, "resolutionSha256"]); return frozen({ ...reference, action: "reconcile", resolutionSha256: digest(data.resolutionSha256) });
    default: return fail("invalid-input");
  }
}
export type R2ApprovalStateV1 = "issued" | "claimed" | "running" | "revoked" | "expired" | "stopped-unknown" | "completed" | "reconciled";
interface Reservation { readonly reservationId: string; readonly method: Method; readonly objectKey: string; readonly outcome: "pending" | "observed" | "unknown" }
export interface R2ApprovalViewV1 {
  readonly approval: R2ApprovalRecordV1;
  readonly state: R2ApprovalStateV1;
  readonly consumed: boolean;
  readonly claimId: string | null;
  readonly claimedEarliestMs: number | null;
  readonly reservations: readonly Reservation[];
}
interface AuditEvent {
  readonly schemaVersion: string; readonly sequence: number; readonly previousSha256: string;
  readonly clock: ClockSample; readonly command: Command; readonly authorization: Authorization | null; readonly eventSha256: string;
}
interface Snapshot {
  readonly schemaVersion: typeof R2_APPROVAL_LEDGER_V1; readonly authorityId: string; readonly generation: string; readonly events: readonly AuditEvent[];
}
export interface R2ApprovalCheckpointV1 {
  readonly schemaVersion: string; readonly authorityId: string; readonly generation: string; readonly sequence: number; readonly headSha256: string;
}
export interface R2ApprovalWitnessV1 {
  /** Trusted separately retained model checkpoint, never obtained from recovery input. */
  readonly read: () => unknown;
  readonly compareAndSet: (expected: R2ApprovalCheckpointV1, next: R2ApprovalCheckpointV1) => boolean;
}
function checkpoint(authorityId: string, generation: string, events: readonly AuditEvent[]): R2ApprovalCheckpointV1 {
  return frozen({ schemaVersion: checkpointVersion, authorityId, generation, sequence: events.length,
    headSha256: events.at(-1)?.eventSha256 ?? hash("genesis", [authorityId, generation]) });
}
function readCheckpoint(witness: Pick<R2ApprovalWitnessV1, "read">, expected: R2ApprovalCheckpointV1): void {
  try { if (canonical(snapshotCalendarDataV1(witness.read())) !== canonical(expected)) fail("checkpoint"); }
  catch { fail("checkpoint"); }
}
/** Separate volatile witness closure for simulations, NOT independent durable storage. */
export function createOfflineR2ApprovalWitnessV1(authorityId: string, generation: string): R2ApprovalWitnessV1 {
  let current = checkpoint(id(authorityId), id(generation), []);
  return Object.freeze({ read: () => current, compareAndSet: (expected: R2ApprovalCheckpointV1, next: R2ApprovalCheckpointV1) => {
    const candidate = object(next, ["schemaVersion", "authorityId", "generation", "sequence", "headSha256"]);
    if (canonical(expected) !== canonical(current) || candidate.schemaVersion !== checkpointVersion || candidate.authorityId !== current.authorityId ||
        candidate.generation !== current.generation || candidate.sequence !== current.sequence + 1) return false;
    digest(candidate.headSha256); current = frozen(next); return true;
  } });
}
function window(input: R2ApprovalDraftV1, at: ClockSample, claimed?: number): void {
  const end = claimed === undefined ? input.expiresAt : Math.min(input.expiresAt, claimed + input.manifest.plan.limits.durationMs);
  if (at.earliestMs < input.notBefore || at.latestMs >= end) fail("outside-window");
}
function runIdentity(input: R2ApprovalDraftV1): string { return hash("target-run", [input.manifest.plan.target, input.manifest.plan.runId]); }
function apply(views: readonly R2ApprovalViewV1[], cmd: Command, at: ClockSample, auth: Authorization | null): readonly R2ApprovalViewV1[] {
  const purpose = cmd.action === "issue" || cmd.action === "revoke" || cmd.action === "reconcile" ? cmd.action : null;
  if (purpose) {
    if (!auth) fail("unauthorized");
    authorization(auth, purpose, hash("command", cmd));
  } else if (auth !== null) fail("unauthorized");
  if (cmd.action === "issue") {
    if (at.latestMs >= cmd.draft.expiresAt) fail("outside-window");
    if (views.length >= R2_APPROVAL_BOUNDS_V1.records) fail("capacity");
    const record = approved(cmd.draft, auth!);
    if (views.some(view => view.approval.approvalIdentity === record.approvalIdentity || runIdentity(view.approval.draft) === runIdentity(cmd.draft))) fail("duplicate");
    return frozen<readonly R2ApprovalViewV1[]>([...views, { approval: record, state: "issued", consumed: false, claimId: null, claimedEarliestMs: null, reservations: [] }]);
  }
  const found = views.find(view => view.approval.approvalIdentity === cmd.approvalIdentity);
  if (!found || found.approval.approvalSha256 !== cmd.approvalSha256) fail("invalid-state");
  const input = found.approval.draft;
  let replacement: R2ApprovalViewV1;
  if (cmd.action === "claim") {
    if (found.consumed) fail("consumed");
    if (found.state !== "issued" || views.some(view => view.claimId === cmd.claimId)) fail("invalid-state");
    window(input, at);
    replacement = { ...found, state: "claimed", consumed: true, claimId: cmd.claimId, claimedEarliestMs: at.earliestMs };
  } else if (cmd.action === "revoke") {
    if (found.state === "completed" || found.state === "reconciled" || found.state === "revoked") fail("invalid-state");
    replacement = { ...found, state: "revoked" };
  } else if (cmd.action === "expire") {
    if (at.earliestMs < input.expiresAt || found.state === "completed" || found.state === "reconciled" || found.state === "expired") fail("outside-window");
    replacement = { ...found, state: "expired" };
  } else if (cmd.action === "reconcile") {
    if (!found.consumed || !["stopped-unknown", "revoked", "expired"].includes(found.state)) fail("invalid-state");
    replacement = { ...found, state: "reconciled" }; // Pending remote outcomes are NOT erased.
  } else {
    if (!("claimId" in cmd) || !found.consumed || found.claimId !== cmd.claimId || found.claimedEarliestMs === null) fail("invalid-state");
    if (cmd.action === "reserve") {
      if (found.state !== "claimed" && found.state !== "running") fail("invalid-state");
      window(input, at, found.claimedEarliestMs);
      const allowed = new Set(input.manifest.fixtures.map(item => item.objectKey));
      if (cmd.method === "get") allowed.add(input.manifest.missingObjectKey);
      if (!allowed.has(cmd.objectKey) || found.reservations.some(item => item.reservationId === cmd.reservationId)) fail("invalid-input");
      const limit = cmd.method === "put" ? input.manifest.plan.limits.puts : input.manifest.plan.limits.gets;
      if (found.reservations.filter(item => item.method === cmd.method).length >= limit ||
          found.reservations.filter(item => item.outcome === "pending").length >= input.manifest.plan.limits.concurrency) fail("budget");
      replacement = { ...found, state: "running", reservations: [...found.reservations,
        { reservationId: cmd.reservationId, method: cmd.method, objectKey: cmd.objectKey, outcome: "pending" }] };
    } else if (cmd.action === "settle") {
      if (found.state === "completed" || found.state === "reconciled") fail("invalid-state");
      if (!found.reservations.some(item => item.reservationId === cmd.reservationId && item.outcome === "pending")) fail("invalid-state");
      replacement = { ...found, reservations: found.reservations.map(item => item.reservationId === cmd.reservationId ? { ...item, outcome: cmd.outcome } : item) };
    } else if (cmd.action === "stop") {
      if (found.state === "completed" || found.state === "reconciled") fail("invalid-state");
      replacement = { ...found, state: "stopped-unknown" };
    } else {
      if (found.state !== "claimed" && found.state !== "running") fail("invalid-state");
      window(input, at, found.claimedEarliestMs);
      if (found.reservations.some(item => item.outcome !== "observed")) fail("invalid-state");
      replacement = { ...found, state: "completed" };
    }
  }
  return frozen(views.map(view => view === found ? replacement : view));
}
function replay(value: unknown, authorityId: string, generation: string): { snapshot: Snapshot; views: readonly R2ApprovalViewV1[] } {
  try {
    const data = object(value, ["schemaVersion", "authorityId", "generation", "events"]);
    if (data.schemaVersion !== R2_APPROVAL_LEDGER_V1 || data.authorityId !== authorityId || data.generation !== generation ||
        !Array.isArray(data.events) || data.events.length > R2_APPROVAL_BOUNDS_V1.events || Buffer.byteLength(canonical(data), "utf8") > R2_APPROVAL_BOUNDS_V1.bytes) fail("audit-invalid");
    const events: AuditEvent[] = [];
    let views: readonly R2ApprovalViewV1[] = [];
    for (const raw of data.events) {
      const event = object(raw, ["schemaVersion", "sequence", "previousSha256", "clock", "command", "authorization", "eventSha256"]);
      const at = clock(event.clock, generation); const previous = events.at(-1);
      if (previous && (at.earliestMs < previous.clock.earliestMs || at.latestMs < previous.clock.latestMs)) fail("clock");
      const cmd = command(event.command);
      const purpose = cmd.action === "issue" || cmd.action === "revoke" || cmd.action === "reconcile" ? cmd.action : null;
      const auth = purpose ? authorization(event.authorization, purpose, hash("command", cmd)) : null;
      if (!purpose && event.authorization !== null) fail("audit-invalid");
      const body = { schemaVersion: eventVersion, sequence: events.length + 1,
        previousSha256: checkpoint(authorityId, generation, events).headSha256, clock: at, command: cmd, authorization: auth };
      const rebuilt = frozen({ ...body, eventSha256: hash("audit-event", body) });
      if (canonical(event) !== canonical(rebuilt)) fail("audit-invalid");
      views = apply(views, cmd, at, auth); events.push(rebuilt);
    }
    return { snapshot: frozen({ schemaVersion: R2_APPROVAL_LEDGER_V1, authorityId, generation, events }), views };
  } catch { return fail("audit-invalid"); }
}
/** Recovery always needs a trusted checkpoint OUTSIDE the supplied snapshot. */
export function validateR2ApprovalRecoveryV1(value: unknown, authorityId: string, generation: string,
  witness: Pick<R2ApprovalWitnessV1, "read">): readonly R2ApprovalViewV1[] {
  const recovered = replay(value, id(authorityId), id(generation));
  readCheckpoint(witness, checkpoint(authorityId, generation, recovered.snapshot.events)); return recovered.views;
}
export interface R2ApprovalModelTransportV1 {
  readonly read: () => Promise<unknown>;
  readonly transact: (command: unknown, signal: AbortSignal) => Promise<unknown>;
}
export interface R2ApprovalModelDependenciesV1 {
  readonly authorityId: string; readonly generation: string;
  readonly clock: () => unknown;
  /** Trusted synchronous authenticated decision capability; no caller proof field. */
  readonly authorize: (request: R2ApprovalAuthorizationRequestV1) => unknown;
  readonly witness: R2ApprovalWitnessV1;
  readonly recoveredSnapshot?: unknown;
  readonly fault?: () => "none" | "before-commit" | "after-state" | "after-commit";
}
/** Copy-on-write simulated authority. No provider, client, persistence or network. */
export function createOfflineR2ApprovalLedgerV1(dependencies: R2ApprovalModelDependenciesV1): R2ApprovalModelTransportV1 {
  const authorityId = id(dependencies.authorityId); const generation = id(dependencies.generation);
  const witness = Object.freeze({ read: dependencies.witness.read.bind(dependencies.witness), compareAndSet: dependencies.witness.compareAndSet.bind(dependencies.witness) });
  const sample = dependencies.clock; const authorize = dependencies.authorize; const fault = dependencies.fault;
  let state = replay(dependencies.recoveredSnapshot === undefined ? { schemaVersion: R2_APPROVAL_LEDGER_V1, authorityId, generation, events: [] } : dependencies.recoveredSnapshot, authorityId, generation).snapshot;
  readCheckpoint(witness, checkpoint(authorityId, generation, state.events));
  let uncertain = false; let busy = false;
  let observedClock = state.events.at(-1)?.clock;
  function currentClock(): ClockSample {
    try {
      const next = clock(sample(), generation);
      if (observedClock && (next.earliestMs < observedClock.earliestMs || next.latestMs < observedClock.latestMs)) fail("clock");
      observedClock = next; return next;
    } catch (error) { throw sanitized(error, "clock"); }
  }
  currentClock();
  function verified() {
    if (uncertain || busy) fail("authority-uncertain");
    const recovered = replay(state, authorityId, generation);
    const at = currentClock(); const last = state.events.at(-1);
    if (last && (at.earliestMs < last.clock.earliestMs || at.latestMs < last.clock.latestMs)) fail("clock");
    readCheckpoint(witness, checkpoint(authorityId, generation, state.events)); return recovered;
  }
  return Object.freeze({
    read: async () => verified().snapshot,
    transact: async (input: unknown, signal: AbortSignal) => {
      let ownsLock = false;
      try {
        const current = verified();
        if (!(signal instanceof AbortSignal) || signal.aborted) fail("acknowledgement-unknown");
        busy = true; ownsLock = true;
        if (state.events.length >= R2_APPROVAL_BOUNDS_V1.events) fail("capacity");
        const cmd = command(input); const at = currentClock(); const last = state.events.at(-1);
        if (last && (at.earliestMs < last.clock.earliestMs || at.latestMs < last.clock.latestMs)) fail("clock");
        const purpose = cmd.action === "issue" || cmd.action === "revoke" || cmd.action === "reconcile" ? cmd.action : null;
        const auth = purpose ? authorization(authorize(frozen({ purpose, requestSha256: hash("command", cmd) })), purpose, hash("command", cmd)) : null;
        apply(current.views, cmd, at, auth);
        const before = checkpoint(authorityId, generation, state.events);
        const body = { schemaVersion: eventVersion, sequence: before.sequence + 1, previousSha256: before.headSha256, clock: at, command: cmd, authorization: auth };
        const event = frozen({ ...body, eventSha256: hash("audit-event", body) });
        const next = replay({ ...state, events: [...state.events, event] }, authorityId, generation).snapshot;
        const nextCheckpoint = checkpoint(authorityId, generation, next.events);
        const injected = fault?.() ?? "none";
        if (injected === "before-commit" || signal.aborted) fail("acknowledgement-unknown");
        // Retain the next head before exposing the consumed state. A gap freezes
        // the authority; old snapshots cannot silently restore an unused approval.
        try {
          if (!witness.compareAndSet(before, nextCheckpoint)) fail("checkpoint");
        } catch { uncertain = true; fail("acknowledgement-unknown"); }
        state = next; // Consumption, run identity and audit are one modeled write.
        if (injected === "after-state") { uncertain = true; fail("acknowledgement-unknown"); }
        if (injected === "after-commit") fail("acknowledgement-unknown");
        return frozen({ scope, status: "applied", commandSha256: hash("command", cmd), checkpoint: nextCheckpoint });
      } catch (error) {
        throw sanitized(error, "storage-unavailable");
      } finally { if (ownsLock) busy = false; }
    },
  });
}
export interface R2OfflineApprovalSessionV1 { readonly scope: "offline-approval-session-only" }
export interface R2ApprovalCoordinatorDependenciesV1 {
  readonly authorityId: string; readonly generation: string;
  readonly transport: R2ApprovalModelTransportV1;
  readonly witness: Pick<R2ApprovalWitnessV1, "read">;
  readonly armDeadline?: (callback: () => void, milliseconds: number) => () => void;
}
/** Handles are instance-local simulation capabilities, NEVER execution permission. */
export function createOfflineR2ApprovalCoordinatorV1(dependencies: R2ApprovalCoordinatorDependenciesV1) {
  const authorityId = id(dependencies.authorityId); const generation = id(dependencies.generation);
  const read = dependencies.transport.read.bind(dependencies.transport); const transact = dependencies.transport.transact.bind(dependencies.transport);
  const witness = Object.freeze({ read: dependencies.witness.read.bind(dependencies.witness) });
  const arm = dependencies.armDeadline ?? ((callback: () => void, ms: number) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); });
  const sessions = new WeakMap<object, Reference & { claimId: string }>();
  async function bounded<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController(); let disarm = () => {};
    let reject!: (error: Error) => void;
    const deadline = new Promise<never>((_, rejected) => { reject = rejected; }); void deadline.catch(() => {});
    try {
      disarm = arm(() => { controller.abort(); reject(new R2QualificationApprovalErrorV1("acknowledgement-unknown")); }, R2_APPROVAL_BOUNDS_V1.requestTimeoutMs);
      if (controller.signal.aborted) fail("acknowledgement-unknown");
      return await Promise.race([Promise.resolve().then(() => { if (controller.signal.aborted) fail("acknowledgement-unknown"); return operation(controller.signal); }), deadline]);
    } catch (error) {
      throw sanitized(error, "acknowledgement-unknown");
    } finally { controller.abort(); try { disarm(); } catch { /* No authorization from cleanup. */ } }
  }
  async function view(): Promise<readonly R2ApprovalViewV1[]> {
    return bounded(async () => validateR2ApprovalRecoveryV1(await read(), authorityId, generation, witness));
  }
  async function mutate(input: Command): Promise<readonly R2ApprovalViewV1[]> {
    const cmd = command(input);
    const response = await bounded(signal => transact(cmd, signal));
    const ack = object(response, ["scope", "status", "commandSha256", "checkpoint"]);
    if (ack.scope !== scope || ack.status !== "applied" || ack.commandSha256 !== hash("command", cmd)) fail("acknowledgement-unknown");
    // A fresh write acknowledgement is necessary. Read recovery alone NEVER creates a session.
    const checked = object(ack.checkpoint, ["schemaVersion", "authorityId", "generation", "sequence", "headSha256"]);
    if (checked.schemaVersion !== checkpointVersion || checked.authorityId !== authorityId || checked.generation !== generation || integer(checked.sequence) === 0) fail("acknowledgement-unknown");
    readCheckpoint(witness, { schemaVersion: checkpointVersion, authorityId, generation,
      sequence: integer(checked.sequence), headSha256: digest(checked.headSha256) });
    return view();
  }
  async function sessionMutation(session: R2OfflineApprovalSessionV1,
    build: (reference: Reference & { claimId: string }) => Command, terminal = false) {
    const reference = sessions.get(session);
    if (!reference) fail("invalid-session");
    try {
      const result = await mutate(build(reference)); if (terminal) sessions.delete(session); return result;
    } catch (error) { sessions.delete(session); throw error; }
  }
  return Object.freeze({ scope, executionAllowed: false as const, read: view,
    issue: async (value: unknown): Promise<R2ApprovalRecordV1> => {
      const input = draft(value); const views = await mutate({ action: "issue", draft: input });
      return views.find(item => item.approval.draft.approvalId === input.approvalId)?.approval ?? fail("audit-invalid");
    },
    claim: async (referenceInput: unknown): Promise<
      { readonly status: "claimed"; readonly executionAllowed: false; readonly session: R2OfflineApprovalSessionV1 }
      | { readonly status: "unavailable"; readonly executionAllowed: false; readonly reason: Reason }> => {
      try {
        const value = object(referenceInput, ["approvalIdentity", "approvalSha256"]);
        const reference = frozen({ approvalIdentity: digest(value.approvalIdentity), approvalSha256: digest(value.approvalSha256), claimId: randomUUID() });
        const views = await mutate({ ...reference, action: "claim" });
        const found = views.find(item => item.approval.approvalIdentity === reference.approvalIdentity);
        if (!found?.consumed || found.claimId !== reference.claimId || found.state !== "claimed") fail("acknowledgement-unknown");
        const session = Object.freeze({ scope: "offline-approval-session-only" as const }); sessions.set(session, reference);
        return Object.freeze({ status: "claimed", executionAllowed: false, session });
      } catch (error) {
        return Object.freeze({ status: "unavailable", executionAllowed: false,
          reason: sanitized(error, "acknowledgement-unknown").code });
      }
    },
    reserve: (session: R2OfflineApprovalSessionV1, reservationId: string, method: Method, objectKey: string) =>
      sessionMutation(session, reference => ({ ...reference, action: "reserve", reservationId, method, objectKey })),
    settle: (session: R2OfflineApprovalSessionV1, reservationId: string, outcome: "observed" | "unknown") =>
      sessionMutation(session, reference => ({ ...reference, action: "settle", reservationId, outcome })),
    stop: (session: R2OfflineApprovalSessionV1) => sessionMutation(session, reference => ({ ...reference, action: "stop" }), true),
    complete: (session: R2OfflineApprovalSessionV1) => sessionMutation(session, reference => ({ ...reference, action: "complete" }), true),
    revoke: (value: unknown) => mutate({ ...reference(value), action: "revoke" }),
    expire: (value: unknown) => mutate({ ...reference(value), action: "expire" }),
    reconcile: (value: unknown, resolutionSha256: string) => mutate({ ...reference(value), action: "reconcile", resolutionSha256 }),
  });
}
