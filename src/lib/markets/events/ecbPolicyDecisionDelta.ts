import { isDeepStrictEqual } from "node:util";
import {
  normalizeEcbMonetaryPolicyEventV1,
  type EcbMonetaryPolicyEventFactV1,
} from "./ecbMonetaryPolicy";
import {
  buildEcbMonetaryPolicyEventSnapshotV1,
  type EcbMonetaryPolicyEventSnapshotV1,
} from "./ecbMonetaryPolicyMemory";
import type { EcbMonetaryPolicyPriorStateResultV1 } from "./ecbMonetaryPolicyPriorState";
import { parseEventInstantV1 } from "./eventClock";
import {
  eventFactFromEcbMonetaryPolicyV1,
  type EventPolicyValueV1,
  type EventSourcedValueV1,
} from "./eventFact";

type AvailablePrior = Extract<EcbMonetaryPolicyPriorStateResultV1, { status: "available" }>;
type PriorReason = Extract<EcbMonetaryPolicyPriorStateResultV1, { status: "unavailable" }>["reason"];
type Announcement = EventSourcedValueV1<Extract<EventPolicyValueV1, { kind: "ecb-policy-rates" }>>;
type Evidence = Pick<AvailablePrior,
  "canonicalEventId" | "decisionDate" | "knownAt" | "eventSourceVersionId" | "announcement">;
type NumericFailure = "UNSUPPORTED_RATE_PRECISION" | "UNSUPPORTED_RATE_RANGE";

export interface BuildEcbPolicyDecisionDeltaInputV1 {
  readonly current: EcbMonetaryPolicyEventFactV1;
  /** The result of the trusted prior-state selector; no arbitrary previous-rate input. */
  readonly prior: EcbMonetaryPolicyPriorStateResultV1;
  readonly evaluatedAt: string;
}

export interface EcbPolicyRateDeltaV1 {
  /** Canonical percent levels; signed deltas compare announced levels only. */
  readonly previousRate: number;
  readonly currentRate: number;
  readonly deltaPercentagePoints: number;
  readonly deltaBasisPoints: number;
  readonly direction: "INCREASE" | "DECREASE" | "UNCHANGED";
}

interface DeltaContext {
  readonly semantic: "derived-feature";
  readonly feature: "ecb-policy-decision-delta";
  readonly coverage: "provided-history-only";
  readonly evaluatedAt: string;
}

export type EcbPolicyDecisionDeltaResultV1 = DeltaContext & (
  | {
      readonly status: "available";
      readonly knownAt: number;
      readonly current: Evidence;
      /** Complete canonical current evidence for downstream delta reconstruction. */
      readonly currentSnapshot: EcbMonetaryPolicyEventSnapshotV1;
      readonly prior: AvailablePrior;
      readonly rates: {
        readonly depositFacility: EcbPolicyRateDeltaV1;
        readonly mainRefinancingOperations: EcbPolicyRateDeltaV1;
        readonly marginalLendingFacility: EcbPolicyRateDeltaV1;
      };
      readonly aggregate: "ALL_UNCHANGED" | "ALL_INCREASED" | "ALL_DECREASED" | "MIXED";
    }
  | ({ readonly status: "unavailable" } & (
      | { readonly reason: "PRIOR_STATE_UNAVAILABLE"; readonly priorReason: PriorReason }
      | { readonly reason: "CURRENT_POLICY_FACTS_UNAVAILABLE" | "EVENT_IDENTITY_CONFLICT"
          | "KNOWLEDGE_INCONSISTENT" | NumericFailure }
    ))
);

/** INACTIVE, pure arithmetic over captured announcements; no historical reselection. */
export function buildEcbPolicyDecisionDeltaV1(
  input: BuildEcbPolicyDecisionDeltaInputV1,
): EcbPolicyDecisionDeltaResultV1 {
  const evaluatedMs = parseEventInstantV1(input.evaluatedAt, "evaluatedAt");
  const prior = input.prior;
  const priorEvaluatedMs = parseEventInstantV1(prior.evaluatedAt, "prior evaluatedAt");
  if (prior.coverage !== "provided-history-only" ||
      !Number.isSafeInteger(prior.knowledgeCutoff) || prior.knowledgeCutoff < 0) {
    throw new TypeError("Expected a canonical prior-state selection context.");
  }
  const context: DeltaContext = Object.freeze({
    semantic: "derived-feature", feature: "ecb-policy-decision-delta",
    coverage: "provided-history-only", evaluatedAt: new Date(evaluatedMs).toISOString(),
  });
  const unavailable = (reason: "CURRENT_POLICY_FACTS_UNAVAILABLE" | "EVENT_IDENTITY_CONFLICT"
    | "KNOWLEDGE_INCONSISTENT" | NumericFailure): EcbPolicyDecisionDeltaResultV1 =>
    Object.freeze({ ...context, status: "unavailable", reason });
  if (prior.knowledgeCutoff * 1_000 > priorEvaluatedMs || priorEvaluatedMs > evaluatedMs) {
    return unavailable("KNOWLEDGE_INCONSISTENT");
  }
  if (prior.status === "unavailable") {
    if (!["INSUFFICIENT_HISTORY", "EVENT_DATA_INCOMPLETE", "INVALID_HISTORY",
      "AMBIGUOUS_PRIOR_STATE"].includes(prior.reason)) {
      throw new TypeError("Invalid prior-state unavailable reason.");
    }
    return Object.freeze({ ...context, status: "unavailable",
      reason: "PRIOR_STATE_UNAVAILABLE", priorReason: prior.reason });
  }
  if (prior.status !== "available") throw new TypeError("Invalid prior-state discriminator.");

  // Normalize through the official ECB contract, then require agreement with
  // the supplied canonical fact, including derived versions and provenance.
  const currentSnapshot = canonicalSnapshot(input.current);
  const current = currentSnapshot.event;
  const currentKnownAt = currentSnapshot.knownAt;
  if (currentKnownAt * 1_000 > evaluatedMs) return unavailable("KNOWLEDGE_INCONSISTENT");

  // Reconstruct caller-supplied target evidence outside the memory parser's
  // permissive catch, just as for the selected prior. No historical reselection.
  const suppliedTarget = prior.targetSnapshot;
  const targetSnapshot = canonicalSnapshot(suppliedTarget.event);
  if (!isDeepStrictEqual(suppliedTarget, targetSnapshot) || targetSnapshot.event.decision !== null) {
    throw new TypeError("Prior target snapshot must agree with canonical schedule-only construction.");
  }
  if (targetSnapshot.knownAt * 1_000 > priorEvaluatedMs) {
    return unavailable("KNOWLEDGE_INCONSISTENT");
  }
  // Canonical normalization requires decisionDate === schedule.meetingDate.
  // Bind identity AND the semantic schedule version (date, clock, official
  // provenance). Capture metadata is deliberately excluded from those versions:
  // recapturing the same schedule and adding an observed decision are compatible;
  // changing the schedule requires a new prior selection. The identity anchor
  // need not equal the current meeting date, preserving legitimate rescheduling.
  if (targetSnapshot.canonicalEventId !== current.canonicalEventId ||
      targetSnapshot.event.schedule.sourceVersionId !== current.schedule.sourceVersionId) {
    return unavailable("EVENT_IDENTITY_CONFLICT");
  }
  const fact = eventFactFromEcbMonetaryPolicyV1(current, []);
  if (fact.actual.availability !== "available" || fact.actual.data.value.kind !== "ecb-policy-rates") {
    return unavailable("CURRENT_POLICY_FACTS_UNAVAILABLE");
  }
  const currentAnnouncement: Announcement = {
    value: fact.actual.data.value, provenance: fact.actual.data.provenance,
  };

  // Validate only the selected evidence, without searching or choosing history.
  // Rebuilding also copies/freezes evidence without freezing caller-owned data.
  const suppliedSnapshot = prior.selectedSnapshot;
  const priorSnapshot = canonicalSnapshot(suppliedSnapshot.event);
  if (!isDeepStrictEqual(suppliedSnapshot, priorSnapshot)) {
    throw new TypeError("Selected prior snapshot disagrees with canonical construction.");
  }
  const priorFact = eventFactFromEcbMonetaryPolicyV1(priorSnapshot.event, []);
  if (priorFact.actual.availability !== "available" || priorFact.actual.data.value.kind !== "ecb-policy-rates") {
    throw new TypeError("Selected prior snapshot must contain complete ECB policy-rate facts.");
  }
  const priorAnnouncement: Announcement = {
    value: priorFact.actual.data.value, provenance: priorFact.actual.data.provenance,
  };
  if (!isDeepStrictEqual(prior.announcement, priorAnnouncement)) {
    throw new TypeError("Prior announcement disagrees with the selected canonical evidence.");
  }
  if (prior.knownAt !== priorSnapshot.knownAt || priorSnapshot.knownAt > prior.knowledgeCutoff) {
    return unavailable("KNOWLEDGE_INCONSISTENT");
  }
  const priorDecisionDate = priorSnapshot.event.decision!.decisionDate;
  if (prior.canonicalEventId !== priorSnapshot.canonicalEventId ||
      prior.eventSourceVersionId !== priorSnapshot.eventSourceVersionId ||
      prior.decisionDate !== priorDecisionDate ||
      priorSnapshot.canonicalEventId === current.canonicalEventId ||
      priorDecisionDate >= current.decision!.decisionDate) {
    return unavailable("EVENT_IDENTITY_CONFLICT");
  }

  const previous = priorAnnouncement.value.rates;
  const latest = currentAnnouncement.value.rates;
  const deposit = rateDelta(previous.depositFacility, latest.depositFacility);
  const mro = rateDelta(previous.mainRefinancingOperations, latest.mainRefinancingOperations);
  const marginal = rateDelta(previous.marginalLendingFacility, latest.marginalLendingFacility);
  if (typeof deposit === "string") return unavailable(deposit);
  if (typeof mro === "string") return unavailable(mro);
  if (typeof marginal === "string") return unavailable(marginal);
  const directions = [deposit.direction, mro.direction, marginal.direction];
  const aggregate = directions.every((direction) => direction === "UNCHANGED") ? "ALL_UNCHANGED"
    : directions.every((direction) => direction === "INCREASE") ? "ALL_INCREASED"
      : directions.every((direction) => direction === "DECREASE") ? "ALL_DECREASED" : "MIXED";
  return Object.freeze({
    ...context, status: "available",
    knownAt: Math.max(currentKnownAt, priorSnapshot.knownAt, targetSnapshot.knownAt),
    currentSnapshot,
    current: Object.freeze({ canonicalEventId: current.canonicalEventId,
      decisionDate: current.decision!.decisionDate, knownAt: currentKnownAt,
      eventSourceVersionId: current.sourceVersionId, announcement: freezeAnnouncement(currentAnnouncement) }),
    prior: Object.freeze({ ...prior, evaluatedAt: new Date(priorEvaluatedMs).toISOString(),
      selectedSnapshot: priorSnapshot, targetSnapshot,
      announcement: freezeAnnouncement(priorAnnouncement) }),
    rates: Object.freeze({ depositFacility: deposit, mainRefinancingOperations: mro,
      marginalLendingFacility: marginal }),
    aggregate,
  });
}

/**
 * Reconstruct an AVAILABLE caller result through the same evidence, chronology
 * and arithmetic rules as construction. No history selection or permissive catch.
 * Return rebuilt immutable evidence, never freeze or retain caller-owned aliases.
 */
export function reconstructAvailableEcbPolicyDecisionDeltaV1(
  supplied: Extract<EcbPolicyDecisionDeltaResultV1, { status: "available" }>,
): Extract<EcbPolicyDecisionDeltaResultV1, { status: "available" }> {
  const prior = supplied.prior;
  const rebuilt = buildEcbPolicyDecisionDeltaV1({
    current: supplied.currentSnapshot.event,
    // Project the canonical fields: the builder preserves prior context through
    // a spread, so unknown caller fields must not survive as mutable aliases.
    prior: {
      status: prior.status, coverage: prior.coverage,
      knowledgeCutoff: prior.knowledgeCutoff, evaluatedAt: prior.evaluatedAt,
      canonicalEventId: prior.canonicalEventId, decisionDate: prior.decisionDate,
      knownAt: prior.knownAt, eventSourceVersionId: prior.eventSourceVersionId,
      selectedSnapshot: prior.selectedSnapshot, targetSnapshot: prior.targetSnapshot,
      announcement: prior.announcement,
    },
    evaluatedAt: supplied.evaluatedAt,
  });
  if (rebuilt.status !== "available" || !isDeepStrictEqual(supplied, rebuilt)) {
    throw new TypeError("Supplied ECB policy delta disagrees with canonical reconstruction.");
  }
  return rebuilt;
}

function canonicalSnapshot(supplied: EcbMonetaryPolicyEventFactV1): EcbMonetaryPolicyEventSnapshotV1 {
  const normalized = normalizeEcbMonetaryPolicyEventV1({
    canonicalMeetingDate: supplied.canonicalMeetingDate,
    schedule: supplied.schedule,
    decision: supplied.decision,
  });
  if (!isDeepStrictEqual(supplied, normalized)) {
    throw new TypeError("ECB fact disagrees with canonical normalization.");
  }
  return buildEcbMonetaryPolicyEventSnapshotV1(normalized);
}

/** Extraction supports at most two decimal percent places: one hundredth = one bp. */
function hundredths(value: number): number | NumericFailure {
  if (Math.abs(value) > Number.MAX_SAFE_INTEGER / 100) return "UNSUPPORTED_RATE_RANGE";
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (match === null) return "UNSUPPORTED_RATE_PRECISION";
  const scaled = Number(`${match[1]}${match[2]}${(match[3] ?? "").padEnd(2, "0")}`);
  if (!Number.isSafeInteger(scaled) || scaled / 100 !== value) return "UNSUPPORTED_RATE_RANGE";
  return scaled === 0 ? 0 : scaled;
}

function rateDelta(previous: number, current: number): EcbPolicyRateDeltaV1 | NumericFailure {
  const before = hundredths(previous);
  const after = hundredths(current);
  if (typeof before === "string") return before;
  if (typeof after === "string") return after;
  const bp = after - before;
  if (!Number.isSafeInteger(bp) || hundredths(bp / 100) !== bp) return "UNSUPPORTED_RATE_RANGE";
  return Object.freeze({ previousRate: previous === 0 ? 0 : previous,
    currentRate: current === 0 ? 0 : current, deltaPercentagePoints: bp === 0 ? 0 : bp / 100,
    deltaBasisPoints: bp === 0 ? 0 : bp,
    direction: bp > 0 ? "INCREASE" : bp < 0 ? "DECREASE" : "UNCHANGED" });
}

function freezeAnnouncement(data: Announcement): Announcement {
  return Object.freeze({
    value: Object.freeze({ kind: "ecb-policy-rates", rates: Object.freeze({ ...data.value.rates }) }),
    provenance: Object.freeze({ ...data.provenance,
      substitution: Object.freeze({ ...data.provenance.substitution }) }),
  });
}
