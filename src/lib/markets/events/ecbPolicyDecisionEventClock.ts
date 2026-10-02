import { isDeepStrictEqual } from "node:util";
import { normalizeEcbMonetaryPolicyEventV1 } from "./ecbMonetaryPolicy";
import {
  buildEcbMonetaryPolicyEventSnapshotV1,
  type EcbMonetaryPolicyEventSnapshotV1,
} from "./ecbMonetaryPolicyMemory";
import {
  deriveEventClockV1,
  parseEventInstantV1,
  type EventPhaseV1,
  type EventScheduleMilestonesV1,
  type EventReleaseMilestonesV1,
} from "./eventClock";

export const ECB_POLICY_DECISION_EVENT_CLOCK_SCHEMA_VERSION_V1 =
  "ecb-policy-decision-event-clock-v1" as const;

interface EcbPolicyDecisionEventClockBaseV1 {
  readonly schemaVersion: typeof ECB_POLICY_DECISION_EVENT_CLOCK_SCHEMA_VERSION_V1;
  readonly semantic: "derived-feature";
  readonly feature: "ecb-policy-decision-event-clock";
  readonly evaluatedAt: string;
}

export type EcbPolicyDecisionEventClockResultV1 = EcbPolicyDecisionEventClockBaseV1 & (
  | {
      readonly status: "available";
      readonly canonicalEventId: string;
      readonly eventSourceVersionId: string;
      /** Unix seconds when the complete supplied canonical state was captured. */
      readonly knownAt: number;
      readonly scheduledAt: string;
      /** Verified publication instant only; null leaves release-relative timing unavailable. */
      readonly actualReleasedAt: string | null;
      /** Elapsed event time only: no market reaction or lifecycle confirmation. */
      readonly phase: EventPhaseV1;
      readonly milestones: {
        readonly schedule: EventScheduleMilestonesV1;
        readonly release: EventReleaseMilestonesV1 | null;
      };
    }
  | {
      readonly status: "unavailable";
      readonly reason: "EVENT_DATA_INCOMPLETE" | "KNOWLEDGE_INCONSISTENT";
    }
);

/**
 * Assess a canonical snapshot selected as known at evaluatedAt, or null if absent.
 * Future complete states are rejected, never sliced into invented earlier evidence.
 * Use the existing as-of memory selector upstream when older snapshots are needed.
 * No timestamp other than validated actualReleasedAt can start release-relative time.
 */
export function buildEcbPolicyDecisionEventClockV1(input: {
  readonly snapshot: EcbMonetaryPolicyEventSnapshotV1 | null;
  readonly evaluatedAt: string;
}): EcbPolicyDecisionEventClockResultV1 {
  if (typeof input.evaluatedAt !== "string") throw new TypeError("Invalid evaluatedAt.");
  const evaluatedMs = parseEventInstantV1(input.evaluatedAt, "evaluatedAt");
  const base = {
    schemaVersion: ECB_POLICY_DECISION_EVENT_CLOCK_SCHEMA_VERSION_V1,
    semantic: "derived-feature" as const,
    feature: "ecb-policy-decision-event-clock" as const,
    evaluatedAt: new Date(evaluatedMs).toISOString(),
  };
  const supplied = input.snapshot;
  if (supplied === null) {
    return Object.freeze({ ...base, status: "unavailable", reason: "EVENT_DATA_INCOMPLETE" });
  }
  // Rebuild identity, source versions, schedule, release and capture chronology.
  // Compare the entire supplied state before trusting its derived metadata.
  const event = normalizeEcbMonetaryPolicyEventV1({
    canonicalMeetingDate: supplied.event.canonicalMeetingDate,
    schedule: supplied.event.schedule,
    decision: supplied.event.decision,
  });
  const snapshot = buildEcbMonetaryPolicyEventSnapshotV1(event);
  if (!isDeepStrictEqual(supplied, snapshot)) {
    throw new TypeError("ECB clock snapshot disagrees with canonical reconstruction.");
  }
  if (snapshot.knownAt * 1_000 > evaluatedMs) {
    return Object.freeze({ ...base, status: "unavailable", reason: "KNOWLEDGE_INCONSISTENT" });
  }
  const actualReleasedAt = event.decision?.actualReleasedAt ?? null;
  const clock = deriveEventClockV1({
    scheduledAt: event.schedule.scheduledAt, actualReleasedAt, evaluatedAt: base.evaluatedAt,
  });
  return Object.freeze({
    ...base, status: "available", canonicalEventId: snapshot.canonicalEventId,
    eventSourceVersionId: snapshot.eventSourceVersionId, knownAt: snapshot.knownAt,
    scheduledAt: clock.schedule.scheduledAt, actualReleasedAt, phase: clock.phase,
    milestones: Object.freeze({ schedule: clock.schedule, release: clock.release }),
  });
}
