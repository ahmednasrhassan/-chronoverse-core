import type { EcbPolicyRateFactsV1 } from "./ecbMonetaryPolicy";
import {
  ECB_MONETARY_POLICY_EVENT_SNAPSHOT_SCHEMA_VERSION_V1,
  type EcbMonetaryPolicyEventSnapshotV1,
} from
  "./ecbMonetaryPolicyMemory";

export const ECB_MONETARY_POLICY_EVENT_INTELLIGENCE_SCHEMA_VERSION_V1 =
  "ecb-monetary-policy-event-intelligence-v1" as const;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export type EcbMonetaryPolicyEventPhaseV1 =
  | "pre-event"
  | "t-24h"
  | "t-1h"
  | "t-15m"
  | "release-time-unverified"
  | "release"
  | "post-5m"
  | "post-15m"
  | "post-30m"
  | "post-1h";

export interface EcbMonetaryPolicyScheduleMilestonesV1 {
  readonly t24hAt: string;
  readonly t1hAt: string;
  readonly t15mAt: string;
  readonly scheduledAt: string;
}

export interface EcbMonetaryPolicyReleaseMilestonesV1 {
  readonly releaseAt: string;
  readonly post5mAt: string;
  readonly post15mAt: string;
  readonly post30mAt: string;
  readonly post1hAt: string;
}

export type EcbMonetaryPolicyDecisionEvidenceV1 =
  | { readonly status: "not-observed" }
  | {
      readonly status: "observed";
      readonly decisionDate: string;
      readonly documentUrl: string;
      readonly contentDigest: string;
      readonly sourceVersionId: string;
      readonly firstObservedAt: number;
    };

export type EcbMonetaryPolicyReleaseTimingV1 =
  | { readonly status: "unverified" }
  | {
      readonly status: "verified";
      readonly actualReleasedAt: string;
    };

export type EcbMonetaryPolicyRateFactsReadinessV1 =
  | { readonly availability: "unavailable" }
  | {
      readonly availability: "available";
      readonly data: EcbPolicyRateFactsV1;
    };

export interface EcbMonetaryPolicyEventIntelligenceV1 {
  readonly schemaVersion:
    typeof ECB_MONETARY_POLICY_EVENT_INTELLIGENCE_SCHEMA_VERSION_V1;
  readonly canonicalEventId: string;
  readonly eventSourceVersionId: string;
  readonly snapshotKnownAt: number;
  readonly evaluatedAt: string;
  readonly phase: EcbMonetaryPolicyEventPhaseV1;
  readonly milestones: {
    readonly schedule: EcbMonetaryPolicyScheduleMilestonesV1;
    readonly release: EcbMonetaryPolicyReleaseMilestonesV1 | null;
  };
  readonly decisionEvidence: EcbMonetaryPolicyDecisionEvidenceV1;
  readonly releaseTiming: EcbMonetaryPolicyReleaseTimingV1;
  readonly rateFacts: EcbMonetaryPolicyRateFactsReadinessV1;
  readonly readiness: {
    readonly schedule: "available";
    readonly decisionEvidence: "observed" | "not-observed";
    readonly verifiedReleaseTime: "verified" | "unverified";
    readonly rateFacts: "available" | "unavailable";
    readonly sessionReview: "not-computed";
  };
  readonly sessionReview: {
    readonly status: "not-computed";
    readonly reason: "No canonical session-review timestamp or policy is defined.";
  };
}

export interface BuildEcbMonetaryPolicyEventIntelligenceInputV1 {
  readonly snapshot: EcbMonetaryPolicyEventSnapshotV1;
  readonly evaluatedAt: string;
}

/**
 * Build time/evidence state only from a snapshot already selected as known.
 * A snapshot from the future is rejected rather than leaking later evidence.
 */
export function buildEcbMonetaryPolicyEventIntelligenceV1(
  input: BuildEcbMonetaryPolicyEventIntelligenceInputV1,
): EcbMonetaryPolicyEventIntelligenceV1 {
  const evaluatedAtMs = parseAbsoluteInstant(input.evaluatedAt, "evaluatedAt");
  if (
    input.snapshot.schemaVersion !==
      ECB_MONETARY_POLICY_EVENT_SNAPSHOT_SCHEMA_VERSION_V1 ||
    !Number.isSafeInteger(input.snapshot.knownAt) ||
    input.snapshot.knownAt < 0
  ) {
    throw new TypeError("Invalid ECB monetary-policy event snapshot.");
  }
  if (Math.floor(evaluatedAtMs / 1_000) < input.snapshot.knownAt) {
    throw new RangeError(
      "evaluatedAt cannot precede the snapshot knowledge boundary.",
    );
  }

  const event = input.snapshot.event;
  if (
    input.snapshot.canonicalEventId !== event.canonicalEventId ||
    input.snapshot.eventSourceVersionId !== event.sourceVersionId
  ) {
    throw new TypeError("Snapshot identity does not match its ECB event fact.");
  }
  const expectedKnownAt = Math.max(
    event.schedule.fetchedAt,
    event.decision?.fetchedAt ?? event.schedule.fetchedAt,
  );
  if (input.snapshot.knownAt !== expectedKnownAt) {
    throw new TypeError("Snapshot knownAt does not match event capture metadata.");
  }

  const scheduledAtMs = parseAbsoluteInstant(
    event.schedule.scheduledAt,
    "scheduledAt",
  );
  const scheduleMilestones = Object.freeze({
    t24hAt: iso(scheduledAtMs - 24 * HOUR_MS),
    t1hAt: iso(scheduledAtMs - HOUR_MS),
    t15mAt: iso(scheduledAtMs - 15 * MINUTE_MS),
    scheduledAt: iso(scheduledAtMs),
  });

  const decisionEvidence: EcbMonetaryPolicyDecisionEvidenceV1 =
    event.decision === null
      ? Object.freeze({ status: "not-observed" })
      : Object.freeze({
          status: "observed",
          decisionDate: event.decision.decisionDate,
          documentUrl: event.decision.documentUrl,
          contentDigest: event.decision.contentDigest,
          sourceVersionId: event.decision.sourceVersionId,
          firstObservedAt: event.decision.firstObservedAt,
        });

  const actualReleasedAt = event.decision?.actualReleasedAt ?? null;
  let releaseAtMs: number | null = null;
  let releaseTiming: EcbMonetaryPolicyReleaseTimingV1 = Object.freeze({
    status: "unverified",
  });
  let releaseMilestones: EcbMonetaryPolicyReleaseMilestonesV1 | null = null;

  if (actualReleasedAt !== null) {
    releaseAtMs = parseAbsoluteInstant(actualReleasedAt, "actualReleasedAt");
    if (releaseAtMs > input.snapshot.knownAt * 1_000) {
      throw new TypeError(
        "Verified actualReleasedAt cannot follow the snapshot knowledge boundary.",
      );
    }
    releaseTiming = Object.freeze({
      status: "verified",
      actualReleasedAt: iso(releaseAtMs),
    });
    releaseMilestones = Object.freeze({
      releaseAt: iso(releaseAtMs),
      post5mAt: iso(releaseAtMs + 5 * MINUTE_MS),
      post15mAt: iso(releaseAtMs + 15 * MINUTE_MS),
      post30mAt: iso(releaseAtMs + 30 * MINUTE_MS),
      post1hAt: iso(releaseAtMs + HOUR_MS),
    });
  }

  const rates = event.decision?.rates ?? null;
  const rateFacts: EcbMonetaryPolicyRateFactsReadinessV1 = rates === null
    ? Object.freeze({ availability: "unavailable" })
    : Object.freeze({
        availability: "available",
        data: Object.freeze({ ...rates }),
      });
  const phase = releaseAtMs === null
    ? phaseWithoutVerifiedRelease(evaluatedAtMs, scheduledAtMs)
    : phaseWithVerifiedRelease(evaluatedAtMs, releaseAtMs);
  const readiness = Object.freeze({
    schedule: "available" as const,
    decisionEvidence: decisionEvidence.status,
    verifiedReleaseTime: releaseTiming.status,
    rateFacts: rateFacts.availability,
    sessionReview: "not-computed" as const,
  });

  return Object.freeze({
    schemaVersion: ECB_MONETARY_POLICY_EVENT_INTELLIGENCE_SCHEMA_VERSION_V1,
    canonicalEventId: event.canonicalEventId,
    eventSourceVersionId: event.sourceVersionId,
    snapshotKnownAt: input.snapshot.knownAt,
    evaluatedAt: iso(evaluatedAtMs),
    phase,
    milestones: Object.freeze({
      schedule: scheduleMilestones,
      release: releaseMilestones,
    }),
    decisionEvidence,
    releaseTiming,
    rateFacts,
    readiness,
    sessionReview: Object.freeze({
      status: "not-computed",
      reason: "No canonical session-review timestamp or policy is defined.",
    }),
  });
}

function phaseWithoutVerifiedRelease(
  evaluatedAtMs: number,
  scheduledAtMs: number,
): EcbMonetaryPolicyEventPhaseV1 {
  if (evaluatedAtMs >= scheduledAtMs) return "release-time-unverified";
  if (evaluatedAtMs >= scheduledAtMs - 15 * MINUTE_MS) return "t-15m";
  if (evaluatedAtMs >= scheduledAtMs - HOUR_MS) return "t-1h";
  if (evaluatedAtMs >= scheduledAtMs - 24 * HOUR_MS) return "t-24h";
  return "pre-event";
}

function phaseWithVerifiedRelease(
  evaluatedAtMs: number,
  releaseAtMs: number,
): EcbMonetaryPolicyEventPhaseV1 {
  if (evaluatedAtMs >= releaseAtMs + HOUR_MS) return "post-1h";
  if (evaluatedAtMs >= releaseAtMs + 30 * MINUTE_MS) return "post-30m";
  if (evaluatedAtMs >= releaseAtMs + 15 * MINUTE_MS) return "post-15m";
  if (evaluatedAtMs >= releaseAtMs + 5 * MINUTE_MS) return "post-5m";
  if (evaluatedAtMs >= releaseAtMs) return "release";

  throw new RangeError(
    "evaluatedAt cannot precede the verified release in a release-aware snapshot.",
  );
}

function parseAbsoluteInstant(value: string, label: string): number {
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

function iso(value: number): string {
  return new Date(value).toISOString();
}
