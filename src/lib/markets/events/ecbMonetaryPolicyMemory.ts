import type {
  EcbMonetaryPolicyEventFactV1,
  EcbPolicyRateFactsV1,
} from "./ecbMonetaryPolicy";

export const ECB_MONETARY_POLICY_EVENT_SNAPSHOT_SCHEMA_VERSION_V1 =
  "ecb-monetary-policy-event-snapshot-v1" as const;
export const ECB_MONETARY_POLICY_EVENT_MEMORY_SCHEMA_VERSION_V1 =
  "ecb-monetary-policy-event-memory-v1" as const;

export interface EcbMonetaryPolicyEventSnapshotV1 {
  readonly schemaVersion:
    typeof ECB_MONETARY_POLICY_EVENT_SNAPSHOT_SCHEMA_VERSION_V1;
  readonly canonicalEventId: string;
  /** Unix seconds at which Chronoverse possessed this complete fact state. */
  readonly knownAt: number;
  readonly eventSourceVersionId: string;
  readonly event: EcbMonetaryPolicyEventFactV1;
}

export interface EcbMonetaryPolicyEventMemoryV1 {
  readonly schemaVersion:
    typeof ECB_MONETARY_POLICY_EVENT_MEMORY_SCHEMA_VERSION_V1;
  readonly canonicalEventId: string;
  readonly snapshots: readonly EcbMonetaryPolicyEventSnapshotV1[];
}

export type AdvanceEcbMonetaryPolicyEventMemoryResultV1 =
  | {
      readonly status: "initialized";
      readonly memory: EcbMonetaryPolicyEventMemoryV1;
      readonly snapshot: EcbMonetaryPolicyEventSnapshotV1;
    }
  | {
      readonly status: "unchanged";
      readonly memory: EcbMonetaryPolicyEventMemoryV1;
      readonly latest: EcbMonetaryPolicyEventSnapshotV1;
    }
  | {
      readonly status: "advanced";
      readonly memory: EcbMonetaryPolicyEventMemoryV1;
      readonly previous: EcbMonetaryPolicyEventSnapshotV1;
      readonly snapshot: EcbMonetaryPolicyEventSnapshotV1;
    }
  | {
      readonly status: "stale";
      readonly memory: EcbMonetaryPolicyEventMemoryV1;
      readonly latest: EcbMonetaryPolicyEventSnapshotV1;
      readonly candidate: EcbMonetaryPolicyEventSnapshotV1;
    }
  | {
      readonly status: "conflict";
      readonly memory: EcbMonetaryPolicyEventMemoryV1;
      readonly latest: EcbMonetaryPolicyEventSnapshotV1;
      readonly candidate: EcbMonetaryPolicyEventSnapshotV1;
    }
  | {
      readonly status: "event-id-mismatch";
      readonly memory: EcbMonetaryPolicyEventMemoryV1;
      readonly expectedCanonicalEventId: string;
      readonly candidateCanonicalEventId: string;
    };

/**
 * Capture chronology is deliberately separate from semantic source identity.
 * actualReleasedAt, scheduledAt, and firstObservedAt never determine knownAt.
 */
export function buildEcbMonetaryPolicyEventSnapshotV1(
  event: EcbMonetaryPolicyEventFactV1,
): EcbMonetaryPolicyEventSnapshotV1 {
  assertNonEmpty(event.canonicalEventId, "canonicalEventId");
  assertNonEmpty(event.sourceVersionId, "event sourceVersionId");
  const scheduleFetchedAt = assertCaptureTime(
    event.schedule.fetchedAt,
    "schedule fetchedAt",
  );
  assertAbsoluteInstant(event.schedule.scheduledAt, "scheduledAt");

  let knownAt = scheduleFetchedAt;
  if (event.decision !== null) {
    const decisionFetchedAt = assertCaptureTime(
      event.decision.fetchedAt,
      "decision fetchedAt",
    );
    const firstObservedAt = assertCaptureTime(
      event.decision.firstObservedAt,
      "decision firstObservedAt",
    );
    if (firstObservedAt > decisionFetchedAt) {
      throw new TypeError("Decision firstObservedAt cannot follow fetchedAt.");
    }
    knownAt = Math.max(scheduleFetchedAt, decisionFetchedAt);

    if (event.decision.actualReleasedAt !== null) {
      const releaseTime = assertAbsoluteInstant(
        event.decision.actualReleasedAt,
        "actualReleasedAt",
      );
      if (releaseTime > knownAt * 1_000) {
        throw new TypeError(
          "Verified actualReleasedAt cannot follow the snapshot knowledge boundary.",
        );
      }
    }
  }

  const immutableEvent = freezeEvent(event);

  return Object.freeze({
    schemaVersion: ECB_MONETARY_POLICY_EVENT_SNAPSHOT_SCHEMA_VERSION_V1,
    canonicalEventId: immutableEvent.canonicalEventId,
    knownAt,
    eventSourceVersionId: immutableEvent.sourceVersionId,
    event: immutableEvent,
  });
}

export function advanceEcbMonetaryPolicyEventMemoryV1(
  memory: EcbMonetaryPolicyEventMemoryV1 | null,
  event: EcbMonetaryPolicyEventFactV1,
): AdvanceEcbMonetaryPolicyEventMemoryResultV1 {
  const candidate = buildEcbMonetaryPolicyEventSnapshotV1(event);

  if (memory === null) {
    const initialized = freezeMemory(candidate.canonicalEventId, [candidate]);
    return Object.freeze({
      status: "initialized",
      memory: initialized,
      snapshot: candidate,
    });
  }

  assertMemory(memory);
  if (candidate.canonicalEventId !== memory.canonicalEventId) {
    return Object.freeze({
      status: "event-id-mismatch",
      memory,
      expectedCanonicalEventId: memory.canonicalEventId,
      candidateCanonicalEventId: candidate.canonicalEventId,
    });
  }

  const latest = memory.snapshots[memory.snapshots.length - 1]!;
  if (candidate.knownAt < latest.knownAt) {
    return Object.freeze({
      status: "stale",
      memory,
      latest,
      candidate,
    });
  }

  if (candidate.knownAt === latest.knownAt) {
    return candidate.eventSourceVersionId === latest.eventSourceVersionId
      ? Object.freeze({ status: "unchanged", memory, latest })
      : Object.freeze({ status: "conflict", memory, latest, candidate });
  }

  if (candidate.eventSourceVersionId === latest.eventSourceVersionId) {
    return Object.freeze({ status: "unchanged", memory, latest });
  }

  const advanced = freezeMemory(memory.canonicalEventId, [
    ...memory.snapshots,
    candidate,
  ]);
  return Object.freeze({
    status: "advanced",
    memory: advanced,
    previous: latest,
    snapshot: candidate,
  });
}

/** Return only knowledge that existed at or before the explicit Unix-second boundary. */
export function selectEcbMonetaryPolicyEventAsKnownAtV1(
  memory: EcbMonetaryPolicyEventMemoryV1,
  asOf: number,
): EcbMonetaryPolicyEventSnapshotV1 | null {
  assertMemory(memory);
  assertCaptureTime(asOf, "asOf");

  for (let index = memory.snapshots.length - 1; index >= 0; index -= 1) {
    const snapshot = memory.snapshots[index]!;
    if (snapshot.knownAt <= asOf) {
      return snapshot;
    }
  }

  return null;
}

function freezeMemory(
  canonicalEventId: string,
  snapshots: readonly EcbMonetaryPolicyEventSnapshotV1[],
): EcbMonetaryPolicyEventMemoryV1 {
  return Object.freeze({
    schemaVersion: ECB_MONETARY_POLICY_EVENT_MEMORY_SCHEMA_VERSION_V1,
    canonicalEventId,
    snapshots: Object.freeze([...snapshots]),
  });
}

function freezeEvent(
  event: EcbMonetaryPolicyEventFactV1,
): EcbMonetaryPolicyEventFactV1 {
  const schedule = Object.freeze({ ...event.schedule });
  const decision = event.decision === null
    ? null
    : Object.freeze({
        ...event.decision,
        rates: event.decision.rates === null
          ? null
          : freezeRates(event.decision.rates),
      });

  return Object.freeze({
    ...event,
    schedule,
    decision,
  });
}

function freezeRates(rates: EcbPolicyRateFactsV1): EcbPolicyRateFactsV1 {
  return Object.freeze({ ...rates });
}

function assertMemory(memory: EcbMonetaryPolicyEventMemoryV1): void {
  if (
    memory.schemaVersion !== ECB_MONETARY_POLICY_EVENT_MEMORY_SCHEMA_VERSION_V1 ||
    memory.snapshots.length === 0 ||
    memory.snapshots.some((snapshot, index) =>
      snapshot.schemaVersion !==
        ECB_MONETARY_POLICY_EVENT_SNAPSHOT_SCHEMA_VERSION_V1 ||
      snapshot.canonicalEventId !== memory.canonicalEventId ||
      snapshot.event.canonicalEventId !== snapshot.canonicalEventId ||
      snapshot.event.sourceVersionId !== snapshot.eventSourceVersionId ||
      !Number.isSafeInteger(snapshot.knownAt) ||
      snapshot.knownAt < 0 ||
      snapshot.eventSourceVersionId.trim().length === 0 ||
      (index > 0 && snapshot.knownAt <= memory.snapshots[index - 1]!.knownAt)
    )
  ) {
    throw new TypeError("Invalid ECB monetary-policy event memory.");
  }
}

function assertCaptureTime(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`Invalid ${label}.`);
  }
  return value;
}

function assertAbsoluteInstant(value: string, label: string): number {
  const match = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (match === null) {
    throw new TypeError(`Invalid ${label}.`);
  }
  assertCivilDate(match[1]!, label);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new TypeError(`Invalid ${label}.`);
  }
  return parsed;
}

function assertCivilDate(value: string, label: string): void {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  if (date.toISOString().slice(0, 10) !== value) {
    throw new TypeError(`Invalid ${label}.`);
  }
}

function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new TypeError(`Invalid ${label}.`);
  }
}
