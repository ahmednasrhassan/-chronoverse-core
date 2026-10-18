import "server-only";

import { calendarRecordV1, snapshotCalendarDataV1 } from "./validation";
import {
  inspectR2ApprovalAuthorityJournalV1, readR2ApprovalAuthorityCheckpointV1,
  type R2ApprovalCheckpointV1,
} from "./r2QualificationApproval";
import type { R2ApprovalAuthorityWriteV1 } from "./r2QualificationApprovalAuthority";

const scope = "offline-approval-authority-store-validation-only" as const;
type Checkpoint = R2ApprovalCheckpointV1;
type Reason = "invalid-input" | "missing-state" | "corrupt-state" | "stale-writer" | "invalid-transition";
interface Description {
  readonly scope: typeof scope;
  readonly executionAllowed: false;
}
interface Refusal extends Description {
  readonly status: "refused";
  readonly reason: Reason;
}
export type R2ApprovalAuthorityJournalValidationV1 = Refusal | (Description & R2ApprovalAuthorityWriteV1 & {
  readonly status: "validated";
  readonly store: "journal";
});
export type R2ApprovalAuthorityWitnessValidationV1 = Refusal | (Description & {
  readonly status: "validated";
  readonly store: "witness";
  readonly expected: Checkpoint;
  readonly checkpoint: Checkpoint;
});
function refuse(reason: Reason): Refusal {
  return Object.freeze({ scope, executionAllowed: false, status: "refused", reason });
}
function record(value: unknown, keys: readonly string[]) {
  return calendarRecordV1(snapshotCalendarDataV1(value), keys);
}
function identity(value: unknown) {
  const data = record(value, ["authorityId", "generation"]);
  if (![data.authorityId, data.generation].every(item => typeof item === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/.test(item))) {
    throw new TypeError();
  }
  return { authorityId: data.authorityId as string, generation: data.generation as string };
}
function same(a: Checkpoint, b: Checkpoint): boolean {
  return a.schemaVersion === b.schemaVersion && a.authorityId === b.authorityId && a.generation === b.generation &&
    a.sequence === b.sequence && a.headSha256 === b.headSha256;
}

/** Pure predicate over supplied state, NOT a commit, authentication, clock sample or
 * execution capability. The caller supplies the pinned trusted authority identity.
 * A future store MUST validate against retained state inside its atomic transaction,
 * or include ALL expected fields in the actual conditional write. Earlier validation
 * never permits an unconditional write; a zero-row update is never an applied CAS.
 * Missing/corrupt state cannot initialize an authority. No I/O or state is retained. */
export function validateR2ApprovalAuthorityJournalCASV1(
  identityInput: unknown, retained: unknown, request: unknown,
): R2ApprovalAuthorityJournalValidationV1 {
  let reason: Reason = "invalid-input";
  try {
    const { authorityId, generation } = identity(identityInput);
    if (retained === null || retained === undefined) return refuse("missing-state");
    reason = "corrupt-state";
    const current = inspectR2ApprovalAuthorityJournalV1(retained, authorityId, generation);
    reason = "invalid-transition";
    const data = record(request, ["expected", "checkpoint", "snapshot"]);
    const expected = readR2ApprovalAuthorityCheckpointV1(data.expected, authorityId, generation);
    if (!same(current.checkpoint, expected)) return refuse("stale-writer");
    const nextCheckpoint = readR2ApprovalAuthorityCheckpointV1(data.checkpoint, authorityId, generation);
    const next = inspectR2ApprovalAuthorityJournalV1(data.snapshot, authorityId, generation);
    if (!same(next.checkpoint, nextCheckpoint) || next.checkpoint.sequence !== current.checkpoint.sequence + 1 ||
        JSON.stringify(next.snapshot.events.slice(0, -1)) !== JSON.stringify(current.snapshot.events)) {
      return refuse("invalid-transition");
    }
    // Replay rebuilds canonical event objects, so JSON equality here compares the
    // complete validated prefix regardless of caller property insertion order.
    return Object.freeze({ scope, executionAllowed: false, status: "validated", store: "journal",
      expected, checkpoint: next.checkpoint, snapshot: next.snapshot });
  } catch { return refuse(reason); }
}

/** Validates only full-checkpoint CAS and one-step advancement. The witness sees
 * no journal/event and cannot authenticate an unseen event or establish independent
 * retention. A valid digest is shape validation, not proof of an authorized head.
 * The same atomic-integration and no-commit limitations as journal validation apply. */
export function validateR2ApprovalAuthorityWitnessCASV1(
  identityInput: unknown, retained: unknown, request: unknown,
): R2ApprovalAuthorityWitnessValidationV1 {
  let reason: Reason = "invalid-input";
  try {
    const { authorityId, generation } = identity(identityInput);
    if (retained === null || retained === undefined) return refuse("missing-state");
    reason = "corrupt-state";
    const current = readR2ApprovalAuthorityCheckpointV1(retained, authorityId, generation);
    reason = "invalid-transition";
    const data = record(request, ["expected", "checkpoint"]);
    const expected = readR2ApprovalAuthorityCheckpointV1(data.expected, authorityId, generation);
    if (!same(current, expected)) return refuse("stale-writer");
    const next = readR2ApprovalAuthorityCheckpointV1(data.checkpoint, authorityId, generation);
    if (next.sequence !== current.sequence + 1) return refuse("invalid-transition");
    return Object.freeze({ scope, executionAllowed: false, status: "validated", store: "witness", expected, checkpoint: next });
  } catch { return refuse(reason); }
}
