import {
  ecbMonetaryPolicyCanonicalEventIdV1,
  normalizeEcbMonetaryPolicyEventV1,
  type EcbMonetaryPolicyEventFactV1,
} from "./ecbMonetaryPolicy";
import {
  advanceEcbMonetaryPolicyEventMemoryV1,
  parseEcbMonetaryPolicyEventMemoryV1,
  selectEcbMonetaryPolicyEventAsKnownAtV1,
  type EcbMonetaryPolicyEventMemoryV1,
  type EcbMonetaryPolicyEventSnapshotV1,
} from "./ecbMonetaryPolicyMemory";
import { parseEventInstantV1 } from "./eventClock";
import {
  eventFactFromEcbMonetaryPolicyV1,
  type EventPolicyValueV1,
  type EventSourcedValueV1,
} from "./eventFact";

export interface SelectEcbMonetaryPolicyPriorStateInputV1 {
  readonly memories: readonly EcbMonetaryPolicyEventMemoryV1[];
  /** Retain canonical identity across rescheduling; compare the current meeting date. */
  readonly target: Pick<EcbMonetaryPolicyEventFactV1,
    "canonicalEventId" | "canonicalMeetingDate" | "schedule">;
  /** Inclusive Unix-second source-knowledge boundary, not publication/effective time. */
  readonly knowledgeCutoff: number;
  readonly evaluatedAt: string;
}

interface SelectionContext {
  readonly coverage: "provided-history-only";
  readonly knowledgeCutoff: number;
  readonly evaluatedAt: string;
}

export type EcbMonetaryPolicyPriorStateResultV1 = SelectionContext & (
  | {
      readonly status: "available";
      readonly canonicalEventId: string;
      readonly decisionDate: string;
      readonly knownAt: EcbMonetaryPolicyEventSnapshotV1["knownAt"];
      readonly eventSourceVersionId: EcbMonetaryPolicyEventSnapshotV1["eventSourceVersionId"];
      readonly announcement: EventSourcedValueV1<Extract<EventPolicyValueV1,
        { readonly kind: "ecb-policy-rates" }>>;
    }
  | {
      readonly status: "unavailable";
      readonly reason: "INSUFFICIENT_HISTORY" | "EVENT_DATA_INCOMPLETE"
        | "INVALID_HISTORY" | "AMBIGUOUS_PRIOR_STATE";
    }
);

/**
 * INACTIVE, pure selection of the last known earlier captured announcement.
 * No history discovery, policy delta, publication inference or in-force claim.
 */
export function selectEcbMonetaryPolicyPriorStateAsKnownAtV1(
  input: SelectEcbMonetaryPolicyPriorStateInputV1,
): EcbMonetaryPolicyPriorStateResultV1 {
  const evaluatedAtMs = parseEventInstantV1(input.evaluatedAt, "evaluatedAt");
  if (!Number.isSafeInteger(input.knowledgeCutoff) || input.knowledgeCutoff < 0) {
    throw new TypeError("Invalid knowledgeCutoff: expected nonnegative Unix seconds.");
  }
  if (input.knowledgeCutoff > Math.floor(evaluatedAtMs / 1_000)) {
    throw new RangeError("knowledgeCutoff cannot follow evaluatedAt.");
  }
  if (!Array.isArray(input.memories)) throw new TypeError("Expected captured ECB event memories.");
  const target = readCallerData(input.target) as SelectEcbMonetaryPolicyPriorStateInputV1["target"];
  if (target.canonicalEventId !==
      ecbMonetaryPolicyCanonicalEventIdV1(target.canonicalMeetingDate)) {
    throw new TypeError("Target ECB event identity does not match its canonical date.");
  }
  const normalizedTarget = normalizeEcbMonetaryPolicyEventV1({
    canonicalMeetingDate: target.canonicalMeetingDate,
    schedule: target.schedule,
  });
  // Retain the supplied schedule, so the existing memory parser checks its
  // derived clock, source version and provenance against normalization.
  const targetHistory = advanceEcbMonetaryPolicyEventMemoryV1(null, {
    ...normalizedTarget, schedule: target.schedule,
  }).memory;
  const validatedTarget = parseEcbMonetaryPolicyEventMemoryV1(targetHistory);
  if (validatedTarget === null) throw new TypeError("Inconsistent target ECB schedule facts.");
  const targetDate = validatedTarget.snapshots[0]!.event.schedule.meetingDate;
  const context: SelectionContext = Object.freeze({
    coverage: "provided-history-only",
    knowledgeCutoff: input.knowledgeCutoff,
    evaluatedAt: new Date(evaluatedAtMs).toISOString(),
  });
  const unavailable = (reason: Extract<EcbMonetaryPolicyPriorStateResultV1,
    { status: "unavailable" }>["reason"]): EcbMonetaryPolicyPriorStateResultV1 =>
    Object.freeze({ ...context, status: "unavailable", reason });

  const statesByEvent = new Map<string, string>();
  const ownersByDecisionDate = new Map<string, string>();
  let latest: EcbMonetaryPolicyEventSnapshotV1 | null = null;
  let invalidHistory = false;
  let ambiguous = false;
  for (const supplied of input.memories) {
    const memory = parseEcbMonetaryPolicyEventMemoryV1(readCallerData(supplied));
    if (memory === null) {
      invalidHistory = true;
      continue;
    }
    const snapshot = selectEcbMonetaryPolicyEventAsKnownAtV1(memory, input.knowledgeCutoff);
    if (snapshot === null || snapshot.canonicalEventId === target.canonicalEventId) continue;
    const decision = snapshot.event.decision;
    const date = decision?.decisionDate ?? snapshot.event.schedule.meetingDate;

    // Only identical normalized as-of snapshots are harmless duplicates. Semantic
    // versions alone do not prove equal capture/knowledge/provenance metadata.
    const state = JSON.stringify(snapshot);
    const previousState = statesByEvent.get(snapshot.canonicalEventId);
    if (previousState !== undefined && previousState !== state) ambiguous = true;
    statesByEvent.set(snapshot.canonicalEventId, state);
    // Conflicting branches may disagree about eligibility itself; detect them
    // before discarding a branch whose revised decision date follows the target.
    if (date >= targetDate) continue;
    // A schedule alone is not evidence that a policy announcement was observed.
    if (decision === null) continue;
    const owner = ownersByDecisionDate.get(date);
    if (owner !== undefined && owner !== snapshot.canonicalEventId) ambiguous = true;
    ownersByDecisionDate.set(date, snapshot.canonicalEventId);
    if (latest === null || date > latest.event.decision!.decisionDate) latest = snapshot;
  }
  // Fixed failure precedence prevents input ordering from changing the result.
  if (invalidHistory) return unavailable("INVALID_HISTORY");
  if (ambiguous) return unavailable("AMBIGUOUS_PRIOR_STATE");
  if (latest === null) return unavailable("INSUFFICIENT_HISTORY");

  // Rank observed decisions before checking rate readiness: never fall back to
  // an older complete announcement when the immediate captured prior is incomplete.
  const fact = eventFactFromEcbMonetaryPolicyV1(latest.event, []);
  if (fact.actual.availability !== "available" || fact.actual.data.value.kind !== "ecb-policy-rates") {
    return unavailable("EVENT_DATA_INCOMPLETE");
  }
  const announcement = Object.freeze({
    value: Object.freeze(fact.actual.data.value),
    provenance: Object.freeze({
      ...fact.actual.data.provenance,
      substitution: Object.freeze({ ...fact.actual.data.provenance.substitution }),
    }),
  });
  return Object.freeze({
    ...context,
    status: "available",
    canonicalEventId: latest.canonicalEventId,
    decisionDate: latest.event.decision!.decisionDate,
    knownAt: latest.knownAt,
    eventSourceVersionId: latest.eventSourceVersionId,
    announcement,
  });
}

/**
 * Materialize caller-owned fields outside the shared parser's permissive catch.
 * Accessor/Proxy defects propagate unchanged; ordinary malformed values retain
 * their shape for existing validation. Cycles are copied without recursion loops.
 * No validation rules or exception classification are duplicated here.
 */
function readCallerData(value: unknown, copies = new WeakMap<object, object>()): unknown {
  if (typeof value !== "object" || value === null) return value;
  const existing = copies.get(value);
  if (existing !== undefined) return existing;
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    copies.set(value, copy);
    for (let index = 0; index < value.length; index += 1) {
      copy.push(readCallerData(value[index], copies));
    }
    return copy;
  }
  const copy: Record<PropertyKey, unknown> = Object.create(null);
  copies.set(value, copy);
  for (const key of Reflect.ownKeys(value)) {
    copy[key] = readCallerData(Reflect.get(value, key), copies);
  }
  return copy;
}
