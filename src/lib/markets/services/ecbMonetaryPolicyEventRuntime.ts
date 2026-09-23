import "server-only";

import {
  ECB_GOVERNING_COUNCIL_CALENDAR_URL,
  normalizeEcbMonetaryPolicyEventV1,
  type EcbMonetaryPolicyDecisionFactV1,
  type EcbMonetaryPolicyEventFactV1,
} from "../events/ecbMonetaryPolicy";
import {
  buildEcbMonetaryPolicyEventIntelligenceV1,
  type EcbMonetaryPolicyEventIntelligenceV1,
} from "../events/ecbMonetaryPolicyIntelligence";
import {
  selectEcbMonetaryPolicyEventAsKnownAtV1,
  type EcbMonetaryPolicyEventMemoryV1,
} from "../events/ecbMonetaryPolicyMemory";
import {
  EcbMonetaryPolicyActiveEventPersistenceError,
  ECB_MONETARY_POLICY_ACTIVE_EVENT_SCHEMA_VERSION_V1,
  readEcbMonetaryPolicyActiveEventRedisV1,
  writeEcbMonetaryPolicyActiveEventRedisV1,
  type EcbMonetaryPolicyActiveEventRedisAdapterV1,
  type EcbMonetaryPolicyActiveEventV1,
} from "../persistence/ecbMonetaryPolicyActiveEventRedis";
import {
  EcbMonetaryPolicyEventMemoryPersistenceError,
  advanceEcbMonetaryPolicyEventMemoryRedisV1,
  readEcbMonetaryPolicyEventMemoryV1,
  type EcbMonetaryPolicyEventMemoryRedisAdapterV1,
} from "../persistence/ecbMonetaryPolicyEventMemoryRedis";
import { getEcbMonetaryPolicyScheduleSourceV1 } from
  "../providers/ecb/monetaryPolicy/cache";
import type { EcbMonetaryPolicySourceResultV1 } from
  "../providers/ecb/monetaryPolicy/client";
import {
  normalizeEcbScheduleCandidateV1,
  type EcbMonetaryPolicyScheduleCandidateV1,
} from "../providers/ecb/monetaryPolicy/parser";

export type EcbMonetaryPolicyEventRuntimeSelectionStateV1 =
  | "current-window"
  | "next-scheduled";

export type EcbMonetaryPolicyEventRuntimeResultV1 =
  | {
      readonly status: "available";
      readonly canonicalEventId: string;
      readonly canonicalMeetingDate: string;
      readonly currentMeetingDate: string;
      readonly selectedSnapshotKnownAt: number;
      readonly intelligence: EcbMonetaryPolicyEventIntelligenceV1;
      readonly source: {
        readonly sourceUrl: string;
        readonly fetchedAt: number;
      };
      readonly selectionState:
        EcbMonetaryPolicyEventRuntimeSelectionStateV1;
    }
  | {
      readonly status: "source-unavailable";
      readonly sourceUrl: string;
      readonly reason: string;
    }
  | {
      readonly status: "source-malformed";
      readonly sourceUrl: string;
      readonly reason: string;
    }
  | {
      readonly status: "no-relevant-event";
      readonly sourceUrl: string;
      readonly fetchedAt: number;
    }
  | {
      readonly status: "reconciliation-required";
      readonly reason:
        | "active-date-missing"
        | "new-earlier-event"
        | "schedule-normalization"
        | "decision-date-mismatch";
      readonly canonicalEventId?: string;
      readonly currentMeetingDate?: string;
      readonly conflictingMeetingDate?: string;
    }
  | {
      readonly status: "persistence-unavailable";
      readonly owner: "active-event" | "event-memory";
      readonly reason: string;
    }
  | {
      readonly status: "stored-state-invalid";
      readonly owner: "active-event" | "event-memory";
    }
  | {
      readonly status: "insufficient-as-known-state";
      readonly canonicalEventId: string;
      readonly evaluatedAt: string;
    };

export interface EcbMonetaryPolicyEventRuntimeV1 {
  readonly evaluate: (input: {
    readonly evaluatedAt: string;
  }) => Promise<EcbMonetaryPolicyEventRuntimeResultV1>;
}

export interface EcbMonetaryPolicyEventRuntimeDependenciesV1 {
  readonly getSchedule: () => Promise<EcbMonetaryPolicySourceResultV1<
    readonly EcbMonetaryPolicyScheduleCandidateV1[]
  >>;
  readonly activeEvent: EcbMonetaryPolicyActiveEventRedisAdapterV1;
  readonly eventMemory: EcbMonetaryPolicyEventMemoryRedisAdapterV1;
}

interface NormalizedCandidate {
  readonly candidate: EcbMonetaryPolicyScheduleCandidateV1;
  readonly scheduledAt: string;
  readonly scheduledAtMs: number;
}

const HOUR_MS = 60 * 60 * 1_000;

export function createEcbMonetaryPolicyEventRuntimeV1(
  dependencies: EcbMonetaryPolicyEventRuntimeDependenciesV1,
): EcbMonetaryPolicyEventRuntimeV1 {
  return Object.freeze({
    evaluate: (input: { readonly evaluatedAt: string }) =>
      evaluateRuntime(input.evaluatedAt, dependencies),
  });
}

export async function getEcbMonetaryPolicyEventRuntimeV1(
  input: { readonly evaluatedAt?: string } = {},
): Promise<EcbMonetaryPolicyEventRuntimeResultV1> {
  const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();
  return evaluateRuntime(evaluatedAt, {
    getSchedule: getEcbMonetaryPolicyScheduleSourceV1,
    activeEvent: Object.freeze({
      read: readEcbMonetaryPolicyActiveEventRedisV1,
      write: writeEcbMonetaryPolicyActiveEventRedisV1,
    }),
    eventMemory: Object.freeze({
      read: readEcbMonetaryPolicyEventMemoryV1,
      advance: advanceEcbMonetaryPolicyEventMemoryRedisV1,
    }),
  });
}

async function evaluateRuntime(
  evaluatedAtInput: string,
  dependencies: EcbMonetaryPolicyEventRuntimeDependenciesV1,
): Promise<EcbMonetaryPolicyEventRuntimeResultV1> {
  const evaluatedAtMs = parseAbsoluteInstant(evaluatedAtInput);
  const evaluatedAt = new Date(evaluatedAtMs).toISOString();
  const asOf = Math.floor(evaluatedAtMs / 1_000);

  let source: EcbMonetaryPolicySourceResultV1<
    readonly EcbMonetaryPolicyScheduleCandidateV1[]
  >;
  try {
    source = await dependencies.getSchedule();
  } catch {
    return Object.freeze({
      status: "source-unavailable",
      sourceUrl: ECB_GOVERNING_COUNCIL_CALENDAR_URL,
      reason: "request-failed",
    });
  }
  if (source.status === "source-unavailable") {
    return Object.freeze({
      status: source.status,
      sourceUrl: source.sourceUrl,
      reason: source.reason,
    });
  }
  if (source.status === "source-malformed") {
    return Object.freeze({
      status: source.status,
      sourceUrl: source.sourceUrl,
      reason: source.reason,
    });
  }
  if (source.sourceUrl !== ECB_GOVERNING_COUNCIL_CALENDAR_URL) {
    return Object.freeze({
      status: "source-malformed",
      sourceUrl: ECB_GOVERNING_COUNCIL_CALENDAR_URL,
      reason: "ECB schedule source provenance is invalid.",
    });
  }

  const normalized = normalizeCandidates(source.data, source.fetchedAt);
  if (normalized.status === "source-malformed") {
    return Object.freeze({
      status: "source-malformed",
      sourceUrl: source.sourceUrl,
      reason: normalized.reason,
    });
  }

  const activeRead = await dependencies.activeEvent.read();
  if (activeRead.status === "redis-failure") {
    return persistenceUnavailable("active-event", "redis-failure");
  }
  if (activeRead.status === "stored-pointer-invalid") {
    return Object.freeze({
      status: "stored-state-invalid",
      owner: "active-event",
    });
  }

  const relevant = normalized.candidates.filter(
    (entry) => entry.scheduledAtMs >= evaluatedAtMs - HOUR_MS,
  );
  let active: EcbMonetaryPolicyActiveEventV1;
  let selected: NormalizedCandidate;

  if (activeRead.status === "absent") {
    const first = relevant[0];
    if (first === undefined) return noRelevant(source);
    selected = first;
    const scheduleEvent = normalizeSchedule(first.candidate, source.fetchedAt, {
      status: "initial",
    });
    if (scheduleEvent.status === "reconciliation-required") {
      return reconciliation("schedule-normalization");
    }
    active = pointerFromEvent(scheduleEvent.event);
    const writeFailure = await writeActivePointer(
      dependencies.activeEvent,
      null,
      active,
    );
    if (writeFailure !== null) return writeFailure;
  } else {
    active = activeRead.pointer;
    const activeScheduledAtMs = Date.parse(active.scheduledAt);
    if (evaluatedAtMs <= activeScheduledAtMs + HOUR_MS) {
      const current = normalized.candidates.find(
        (entry) => entry.candidate.meetingDate === active.currentMeetingDate,
      );
      if (current === undefined) {
        return reconciliation(
          "active-date-missing",
          active,
        );
      }
      if (evaluatedAtMs < activeScheduledAtMs) {
        const earlier = relevant.find(
          (entry) =>
            entry.scheduledAtMs < activeScheduledAtMs &&
            entry.candidate.meetingDate !== active.currentMeetingDate,
        );
        if (earlier !== undefined) {
          return reconciliation("new-earlier-event", active, earlier.candidate.meetingDate);
        }
      }
      selected = current;
    } else {
      const next = relevant[0];
      if (next === undefined) return noRelevant(source);
      selected = next;
      const scheduleEvent = normalizeSchedule(next.candidate, source.fetchedAt, {
        status: "initial",
      });
      if (scheduleEvent.status === "reconciliation-required") {
        return reconciliation("schedule-normalization");
      }
      const replacement = pointerFromEvent(scheduleEvent.event);
      const writeFailure = await writeActivePointer(
        dependencies.activeEvent,
        active,
        replacement,
      );
      if (writeFailure !== null) return writeFailure;
      active = replacement;
    }
  }

  const scheduleNormalization = normalizeSchedule(
    selected.candidate,
    source.fetchedAt,
    {
      status: "preserve",
      canonicalMeetingDate: active.canonicalMeetingDate,
    },
  );
  if (scheduleNormalization.status === "reconciliation-required") {
    return reconciliation("schedule-normalization", active);
  }

  const memoryRead = await dependencies.eventMemory.read(active.canonicalEventId);
  if (memoryRead.status === "redis-failure") {
    return persistenceUnavailable("event-memory", "redis-failure");
  }
  if (memoryRead.status === "stored-memory-invalid") {
    return Object.freeze({
      status: "stored-state-invalid",
      owner: "event-memory",
    });
  }

  const currentMemory = memoryRead.status === "available"
    ? memoryRead.memory
    : null;
  const latestDecision = currentMemory?.snapshots[
    currentMemory.snapshots.length - 1
  ]?.event.decision ?? null;
  let mergedEvent: EcbMonetaryPolicyEventFactV1;
  try {
    mergedEvent = mergeDecision(scheduleNormalization.event, latestDecision);
  } catch {
    return reconciliation("decision-date-mismatch", active);
  }

  let memory: EcbMonetaryPolicyEventMemoryV1;
  try {
    const advance = await dependencies.eventMemory.advance(
      active.canonicalEventId,
      mergedEvent,
    );
    if (advance.status === "conflict") {
      return persistenceUnavailable("event-memory", "event-memory-conflict");
    }
    if (advance.status === "event-id-mismatch") {
      return Object.freeze({
        status: "stored-state-invalid",
        owner: "event-memory",
      });
    }
    memory = advance.memory;
  } catch (error) {
    return mapMemoryPersistenceFailure(error);
  }

  const snapshot = selectEcbMonetaryPolicyEventAsKnownAtV1(memory, asOf);
  if (snapshot === null) {
    return Object.freeze({
      status: "insufficient-as-known-state",
      canonicalEventId: active.canonicalEventId,
      evaluatedAt,
    });
  }
  const intelligence = buildEcbMonetaryPolicyEventIntelligenceV1({
    snapshot,
    evaluatedAt,
  });

  return Object.freeze({
    status: "available",
    canonicalEventId: active.canonicalEventId,
    canonicalMeetingDate: active.canonicalMeetingDate,
    currentMeetingDate: active.currentMeetingDate,
    selectedSnapshotKnownAt: snapshot.knownAt,
    intelligence,
    source: Object.freeze({
      sourceUrl: source.sourceUrl,
      fetchedAt: source.fetchedAt,
    }),
    selectionState: evaluatedAtMs < selected.scheduledAtMs
      ? "next-scheduled"
      : "current-window",
  });
}

function normalizeCandidates(
  candidates: readonly EcbMonetaryPolicyScheduleCandidateV1[],
  fetchedAt: number,
):
  | { readonly status: "available"; readonly candidates: readonly NormalizedCandidate[] }
  | { readonly status: "source-malformed"; readonly reason: string } {
  if (!Number.isSafeInteger(fetchedAt) || fetchedAt < 0 || !Array.isArray(candidates)) {
    return Object.freeze({
      status: "source-malformed",
      reason: "ECB schedule source metadata is invalid.",
    });
  }
  try {
    const normalized = candidates.map((candidate) => {
      if (
        candidate.sourceInstitution !== "ECB" ||
        candidate.sourceUrl !== ECB_GOVERNING_COUNCIL_CALENDAR_URL
      ) {
        throw new TypeError("Invalid ECB schedule candidate provenance.");
      }
      const event = normalizeEcbScheduleCandidateV1(
        candidate,
        fetchedAt,
        { status: "initial" },
      );
      if (event.status !== "available") {
        throw new TypeError("Unexpected ECB schedule reconciliation state.");
      }
      const scheduledAtMs = Date.parse(event.event.schedule.scheduledAt);
      return Object.freeze({
        candidate,
        scheduledAt: event.event.schedule.scheduledAt,
        scheduledAtMs,
      });
    }).sort((left, right) =>
      left.scheduledAtMs - right.scheduledAtMs ||
      left.candidate.meetingDate.localeCompare(right.candidate.meetingDate));
    return Object.freeze({
      status: "available",
      candidates: Object.freeze(normalized),
    });
  } catch {
    return Object.freeze({
      status: "source-malformed",
      reason: "ECB schedule source contains an invalid candidate.",
    });
  }
}

function normalizeSchedule(
  candidate: EcbMonetaryPolicyScheduleCandidateV1,
  fetchedAt: number,
  identity: Parameters<typeof normalizeEcbScheduleCandidateV1>[2],
) {
  return normalizeEcbScheduleCandidateV1(candidate, fetchedAt, identity);
}

function pointerFromEvent(
  event: EcbMonetaryPolicyEventFactV1,
): EcbMonetaryPolicyActiveEventV1 {
  return Object.freeze({
    schemaVersion: ECB_MONETARY_POLICY_ACTIVE_EVENT_SCHEMA_VERSION_V1,
    canonicalEventId: event.canonicalEventId,
    canonicalMeetingDate: event.canonicalMeetingDate,
    currentMeetingDate: event.schedule.meetingDate,
    scheduledAt: event.schedule.scheduledAt,
  });
}

function mergeDecision(
  scheduleEvent: EcbMonetaryPolicyEventFactV1,
  decision: EcbMonetaryPolicyDecisionFactV1 | null,
): EcbMonetaryPolicyEventFactV1 {
  return normalizeEcbMonetaryPolicyEventV1({
    canonicalMeetingDate: scheduleEvent.canonicalMeetingDate,
    schedule: {
      meetingDate: scheduleEvent.schedule.meetingDate,
      scheduledLocalTime: scheduleEvent.schedule.scheduledLocalTime,
      fetchedAt: scheduleEvent.schedule.fetchedAt,
    },
    decision: decision === null
      ? null
      : {
          decisionDate: decision.decisionDate,
          documentUrl: decision.documentUrl,
          contentDigest: decision.contentDigest,
          fetchedAt: decision.fetchedAt,
          firstObservedAt: decision.firstObservedAt,
          actualReleasedAt: decision.actualReleasedAt,
          rates: decision.rates === null
            ? null
            : {
                depositFacility: decision.rates.depositFacility,
                mainRefinancingOperations:
                  decision.rates.mainRefinancingOperations,
                marginalLendingFacility:
                  decision.rates.marginalLendingFacility,
                effectiveDate: decision.rates.effectiveDate,
              },
        },
  });
}

async function writeActivePointer(
  persistence: EcbMonetaryPolicyActiveEventRedisAdapterV1,
  expected: EcbMonetaryPolicyActiveEventV1 | null,
  replacement: EcbMonetaryPolicyActiveEventV1,
): Promise<Exclude<EcbMonetaryPolicyEventRuntimeResultV1,
  { readonly status: "available" }> | null> {
  try {
    await persistence.write(expected, replacement);
    return null;
  } catch (error) {
    if (error instanceof EcbMonetaryPolicyActiveEventPersistenceError) {
      if (error.code === "stored-pointer-invalid") {
        return Object.freeze({
          status: "stored-state-invalid",
          owner: "active-event",
        });
      }
      return persistenceUnavailable("active-event", error.code);
    }
    return persistenceUnavailable("active-event", "unexpected-error");
  }
}

function mapMemoryPersistenceFailure(
  error: unknown,
): Exclude<EcbMonetaryPolicyEventRuntimeResultV1,
  { readonly status: "available" }> {
  if (error instanceof EcbMonetaryPolicyEventMemoryPersistenceError) {
    if (error.code === "stored-memory-invalid") {
      return Object.freeze({
        status: "stored-state-invalid",
        owner: "event-memory",
      });
    }
    return persistenceUnavailable("event-memory", error.code);
  }
  return persistenceUnavailable("event-memory", "unexpected-error");
}

function persistenceUnavailable(
  owner: "active-event" | "event-memory",
  reason: string,
): Extract<EcbMonetaryPolicyEventRuntimeResultV1,
  { readonly status: "persistence-unavailable" }> {
  return Object.freeze({ status: "persistence-unavailable", owner, reason });
}

function reconciliation(
  reason: Extract<EcbMonetaryPolicyEventRuntimeResultV1,
    { readonly status: "reconciliation-required" }>["reason"],
  active?: EcbMonetaryPolicyActiveEventV1,
  conflictingMeetingDate?: string,
): Extract<EcbMonetaryPolicyEventRuntimeResultV1,
  { readonly status: "reconciliation-required" }> {
  return Object.freeze({
    status: "reconciliation-required",
    reason,
    ...(active === undefined ? {} : {
      canonicalEventId: active.canonicalEventId,
      currentMeetingDate: active.currentMeetingDate,
    }),
    ...(conflictingMeetingDate === undefined ? {} : { conflictingMeetingDate }),
  });
}

function noRelevant(
  source: Extract<EcbMonetaryPolicySourceResultV1<
    readonly EcbMonetaryPolicyScheduleCandidateV1[]
  >, { readonly status: "available" }>,
): Extract<EcbMonetaryPolicyEventRuntimeResultV1,
  { readonly status: "no-relevant-event" }> {
  return Object.freeze({
    status: "no-relevant-event",
    sourceUrl: source.sourceUrl,
    fetchedAt: source.fetchedAt,
  });
}

function parseAbsoluteInstant(value: string): number {
  const match = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (match === null) throw new TypeError("Invalid evaluatedAt.");
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new TypeError("Invalid evaluatedAt.");
  const date = new Date(`${match[1]}T00:00:00.000Z`);
  if (date.toISOString().slice(0, 10) !== match[1]) {
    throw new TypeError("Invalid evaluatedAt.");
  }
  return parsed;
}
