import {
  ECB_DECISION_TIMEZONE,
  ECB_DECISION_TIMEZONE_WORDING,
  ECB_GOVERNING_COUNCIL_CALENDAR_URL,
  ECB_MONETARY_POLICY_EVENT_FAMILY,
  ECB_SOURCE_INSTITUTION,
  ecbMonetaryPolicyCanonicalEventIdV1,
  ecbScheduledInstantV1,
  normalizeEcbMonetaryPolicyEventV1,
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

/** Parse persisted history without trusting its structure or derived chronology. */
export function parseEcbMonetaryPolicyEventMemoryV1(
  value: unknown,
): EcbMonetaryPolicyEventMemoryV1 | null {
  try {
    if (!isRecord(value)) return null;
    if (
      value.schemaVersion !==
        ECB_MONETARY_POLICY_EVENT_MEMORY_SCHEMA_VERSION_V1 ||
      !isNonEmptyString(value.canonicalEventId) ||
      !Array.isArray(value.snapshots) ||
      value.snapshots.length === 0
    ) {
      return null;
    }

    const snapshots: EcbMonetaryPolicyEventSnapshotV1[] = [];
    let previousKnownAt = -1;

    for (const candidate of value.snapshots) {
      const snapshot = parseSnapshot(candidate, value.canonicalEventId);
      if (snapshot === null || snapshot.knownAt <= previousKnownAt) {
        return null;
      }
      snapshots.push(snapshot);
      previousKnownAt = snapshot.knownAt;
    }

    return freezeMemory(value.canonicalEventId, snapshots);
  } catch {
    return null;
  }
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

function parseSnapshot(
  value: unknown,
  canonicalEventId: string,
): EcbMonetaryPolicyEventSnapshotV1 | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !==
      ECB_MONETARY_POLICY_EVENT_SNAPSHOT_SCHEMA_VERSION_V1 ||
    value.canonicalEventId !== canonicalEventId ||
    !Number.isSafeInteger(value.knownAt) ||
    (value.knownAt as number) < 0 ||
    !isNonEmptyString(value.eventSourceVersionId)
  ) {
    return null;
  }

  const event = parseEvent(value.event);
  if (
    event === null ||
    event.canonicalEventId !== canonicalEventId ||
    event.sourceVersionId !== value.eventSourceVersionId
  ) {
    return null;
  }

  const snapshot = buildEcbMonetaryPolicyEventSnapshotV1(event);
  return snapshot.knownAt === value.knownAt ? snapshot : null;
}

function parseEvent(value: unknown): EcbMonetaryPolicyEventFactV1 | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== "ecb-monetary-policy-event-v1" ||
    !isNonEmptyString(value.canonicalEventId) ||
    typeof value.canonicalMeetingDate !== "string" ||
    value.eventFamily !== ECB_MONETARY_POLICY_EVENT_FAMILY ||
    value.sourceInstitution !== ECB_SOURCE_INSTITUTION ||
    (value.availability !== "partial" && value.availability !== "available") ||
    !isNonEmptyString(value.sourceVersionId) ||
    !isRecord(value.schedule)
  ) {
    return null;
  }

  const schedule = value.schedule;
  if (
    typeof schedule.meetingDate !== "string" ||
    typeof schedule.scheduledAt !== "string" ||
    typeof schedule.scheduledLocalTime !== "string" ||
    schedule.scheduledTimezone !== ECB_DECISION_TIMEZONE ||
    schedule.sourceTimezoneWording !== ECB_DECISION_TIMEZONE_WORDING ||
    schedule.sourceUrl !== ECB_GOVERNING_COUNCIL_CALENDAR_URL ||
    !Number.isSafeInteger(schedule.fetchedAt) ||
    (schedule.fetchedAt as number) < 0 ||
    !isNonEmptyString(schedule.sourceVersionId)
  ) {
    return null;
  }

  let decisionInput: Parameters<
    typeof normalizeEcbMonetaryPolicyEventV1
  >[0]["decision"] = null;
  let decisionSourceVersionId: string | null = null;

  if (value.decision !== null) {
    const decision = value.decision;
    if (
      !isRecord(decision) ||
      typeof decision.decisionDate !== "string" ||
      decision.sourceInstitution !== ECB_SOURCE_INSTITUTION ||
      typeof decision.documentUrl !== "string" ||
      typeof decision.contentDigest !== "string" ||
      !Number.isSafeInteger(decision.fetchedAt) ||
      (decision.fetchedAt as number) < 0 ||
      !Number.isSafeInteger(decision.firstObservedAt) ||
      (decision.firstObservedAt as number) < 0 ||
      (decision.firstObservedAt as number) > (decision.fetchedAt as number) ||
      (decision.actualReleasedAt !== null &&
        typeof decision.actualReleasedAt !== "string") ||
      !isNonEmptyString(decision.sourceVersionId)
    ) {
      return null;
    }

    const rates = parseRates(decision.rates);
    if (decision.rates !== null && rates === null) return null;

    decisionInput = {
      decisionDate: decision.decisionDate,
      documentUrl: decision.documentUrl,
      contentDigest: decision.contentDigest,
      fetchedAt: decision.fetchedAt as number,
      firstObservedAt: decision.firstObservedAt as number,
      actualReleasedAt: decision.actualReleasedAt as string | null,
      rates,
    };
    decisionSourceVersionId = decision.sourceVersionId;
  }

  const normalized = normalizeEcbMonetaryPolicyEventV1({
    canonicalMeetingDate: value.canonicalMeetingDate,
    schedule: {
      meetingDate: schedule.meetingDate,
      scheduledLocalTime: schedule.scheduledLocalTime,
      fetchedAt: schedule.fetchedAt as number,
    },
    decision: decisionInput,
  });

  if (
    value.canonicalEventId !==
      ecbMonetaryPolicyCanonicalEventIdV1(value.canonicalMeetingDate) ||
    normalized.canonicalEventId !== value.canonicalEventId ||
    ecbScheduledInstantV1(
      schedule.meetingDate,
      schedule.scheduledLocalTime,
    ) !== schedule.scheduledAt ||
    normalized.schedule.scheduledAt !== schedule.scheduledAt ||
    normalized.schedule.sourceVersionId !== schedule.sourceVersionId ||
    normalized.availability !== value.availability ||
    !sameNormalizedDecision(normalized.decision, value.decision) ||
    normalized.decision?.sourceVersionId !==
      (decisionSourceVersionId ?? undefined) ||
    normalized.sourceVersionId !== value.sourceVersionId
  ) {
    return null;
  }

  return normalized;
}

function parseRates(value: unknown): EcbPolicyRateFactsV1 | null {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    typeof value.depositFacility !== "number" ||
    !Number.isFinite(value.depositFacility) ||
    typeof value.mainRefinancingOperations !== "number" ||
    !Number.isFinite(value.mainRefinancingOperations) ||
    typeof value.marginalLendingFacility !== "number" ||
    !Number.isFinite(value.marginalLendingFacility) ||
    value.unit !== "percent" ||
    (value.effectiveDate !== null && typeof value.effectiveDate !== "string")
  ) {
    return null;
  }

  return {
    depositFacility: value.depositFacility,
    mainRefinancingOperations: value.mainRefinancingOperations,
    marginalLendingFacility: value.marginalLendingFacility,
    unit: "percent",
    effectiveDate: value.effectiveDate as string | null,
  };
}

function sameNormalizedDecision(
  normalized: EcbMonetaryPolicyEventFactV1["decision"],
  raw: unknown,
): boolean {
  if (normalized === null || raw === null) return normalized === raw;
  if (!isRecord(raw)) return false;

  const rawRates = raw.rates;
  const sameRates = normalized.rates === null || rawRates === null
    ? normalized.rates === rawRates
    : isRecord(rawRates) &&
      normalized.rates.depositFacility === rawRates.depositFacility &&
      normalized.rates.mainRefinancingOperations ===
        rawRates.mainRefinancingOperations &&
      normalized.rates.marginalLendingFacility ===
        rawRates.marginalLendingFacility &&
      normalized.rates.unit === rawRates.unit &&
      normalized.rates.effectiveDate === rawRates.effectiveDate;

  return normalized.decisionDate === raw.decisionDate &&
    normalized.sourceInstitution === raw.sourceInstitution &&
    normalized.documentUrl === raw.documentUrl &&
    normalized.contentDigest === raw.contentDigest &&
    normalized.fetchedAt === raw.fetchedAt &&
    normalized.firstObservedAt === raw.firstObservedAt &&
    normalized.actualReleasedAt === raw.actualReleasedAt &&
    sameRates;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function assertMemory(memory: EcbMonetaryPolicyEventMemoryV1): void {
  if (parseEcbMonetaryPolicyEventMemoryV1(memory) === null) {
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
