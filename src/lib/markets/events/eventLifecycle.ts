import type { EngineDataSection } from "../engine/contracts";
import type { EngineMarketDataFreshnessV3 } from "../engine/marketDataFreshness";
import type { CanonicalProductIdV1 } from "../services/canonicalProductResultOwnership";
import { defineEventFactV1, type EventFactV1, type EventSourceReferenceV1 } from "./eventFact";
import { deriveEventClockV1, parseEventInstantV1, type EventPhaseV1 } from "./eventClock";

export type EventLifecycleStateV1 =
  | "WAIT" | "WATCH" | "INITIAL_REACTION" | "CONFIRMING" | "CONFIRMED"
  | "CONTRADICTED" | "INVALIDATED" | "REENTRY_WATCH";

/** Assessment of an explicit hypothesis; never a source fact or trade instruction. */
export interface EventLifecycleEvidenceV1 {
  readonly semantic: "engine-assessment";
  readonly canonicalEventId: string;
  readonly productId: CanonicalProductIdV1;
  readonly assessmentId: string;
  readonly assessment: "supporting" | "confirmation" | "contradiction" | "invalidation" | "reentry-watch";
  readonly basis: "official-release" | "market-reaction";
  readonly evidenceReferences: readonly Pick<EventSourceReferenceV1, "sourceUrl" | "sourceVersionId">[];
  readonly observedAt: string;
  /** Unix seconds at which this assessment was known. */
  readonly knownAt: number;
  readonly freshness: EngineMarketDataFreshnessV3;
}

export interface EventLifecycleSnapshotV1 {
  readonly canonicalEventId: string;
  readonly productId: CanonicalProductIdV1;
  readonly assessmentId: string;
  readonly evaluatedAt: string;
  readonly state: EventLifecycleStateV1;
}

export interface EventLifecycleResultV1 extends EventLifecycleSnapshotV1 {
  readonly semantic: "engine-assessment";
  readonly clock: ReturnType<typeof deriveEventClockV1>;
  readonly checkpoint: EngineDataSection<EventPhaseV1>;
  readonly marketReaction: {
    readonly availability: "unavailable";
    readonly reason: "MARKET_FEED_UNAVAILABLE";
  };
  readonly eventData: EngineDataSection<EventFactV1>;
  readonly acceptedEvidence: readonly EventLifecycleEvidenceV1[];
}

/** No thresholds or recommendations: supplied assessments own their evidence judgments. */
export function evaluateEventLifecycleV1(input: {
  readonly event: EventFactV1;
  readonly productId: CanonicalProductIdV1;
  readonly assessmentId: string;
  readonly evaluatedAt: string;
  readonly previous: EventLifecycleSnapshotV1 | null;
  readonly evidence: readonly EventLifecycleEvidenceV1[];
}): EventLifecycleResultV1 {
  const event = defineEventFactV1(input.event);
  const evaluated = parseEventInstantV1(input.evaluatedAt, "evaluatedAt");
  if (!event.affectedProducts.includes(input.productId) || !input.assessmentId.trim()) {
    throw new TypeError("Lifecycle must target an affected product and explicit assessment.");
  }
  const release = event.release.availability === "available" || event.release.availability === "partial"
    ? event.release.data : null;
  const sources = [event.schedule.provenance, release?.provenance];
  for (const section of [event.actual, event.previous]) {
    if (section.availability === "available" || section.availability === "partial") sources.push(section.data.provenance);
  }
  if ("status" in event.revision && event.revision.status === "revised") {
    sources.push(event.revision.revisedPrevious.provenance);
  }
  if (sources.some((source) => source !== undefined && source.fetchedAt * 1_000 > evaluated)) {
    throw new RangeError("evaluatedAt cannot precede event source knowledge.");
  }
  const clock = deriveEventClockV1({
    scheduledAt: event.schedule.scheduledAt,
    actualReleasedAt: release?.actualReleasedAt ?? null,
    evaluatedAt: input.evaluatedAt,
  });
  const previous = input.previous;
  if (previous !== null && (previous.canonicalEventId !== event.canonicalEventId ||
      previous.productId !== input.productId || previous.assessmentId !== input.assessmentId ||
      parseEventInstantV1(previous.evaluatedAt, "previous evaluatedAt") > evaluated)) {
    throw new TypeError("Previous lifecycle identity/time does not match this assessment.");
  }
  const acceptedEvidence = input.evidence.filter((evidence) => {
    const observed = parseEventInstantV1(evidence.observedAt, "evidence observedAt");
    if (!Number.isSafeInteger(evidence.knownAt) || evidence.knownAt < 0 || observed > evidence.knownAt * 1_000) {
      throw new TypeError("Invalid evidence knowledge boundary.");
    }
    return evidence.semantic === "engine-assessment" &&
      evidence.canonicalEventId === event.canonicalEventId && evidence.productId === input.productId &&
      evidence.assessmentId === input.assessmentId && evidence.freshness === "within-cadence" &&
      evidence.knownAt * 1_000 <= evaluated &&
      // No licensed/direct intraday observation contract is proven by this repository.
      evidence.basis === "official-release" && release !== null &&
      // fetchedAt is the canonical boundary for possessing this captured source state.
      release.provenance.fetchedAt <= evidence.knownAt &&
      evidence.evidenceReferences.length > 0 && evidence.evidenceReferences.every((ref) =>
        sources.some((source) => source?.sourceVersionId === ref.sourceVersionId &&
          source.sourceUrl === ref.sourceUrl && source.fetchedAt <= evidence.knownAt)) &&
      // Positive assessment progress requires complete official facts, not just document observation.
      ((evidence.assessment === "invalidation" || evidence.assessment === "contradiction") ||
        (event.actual.availability === "available" && event.release.availability === "available" &&
          event.actual.data.provenance.fetchedAt <= evidence.knownAt)) &&
      observed >= (release.actualReleasedAt === null
        ? (release.firstObservedAt ?? release.provenance.fetchedAt) * 1_000
        : parseEventInstantV1(release.actualReleasedAt, "actualReleasedAt"));
  });
  const has = (assessment: EventLifecycleEvidenceV1["assessment"]): boolean =>
    acceptedEvidence.some((evidence) => evidence.assessment === assessment);
  let state: EventLifecycleStateV1 = previous?.state ?? "WAIT";
  if (release !== null) {
    // Conservative precedence, independent of input ordering.
    if (has("invalidation")) state = "INVALIDATED";
    else if (state === "INVALIDATED") {
      if (has("reentry-watch") && !has("contradiction")) state = "REENTRY_WATCH";
    } else if (has("contradiction")) state = "CONTRADICTED";
    else if (state === "CONTRADICTED") {
      if (has("reentry-watch")) state = "REENTRY_WATCH";
    } else if (has("confirmation")) state = "CONFIRMED";
    else if (has("supporting") && state !== "CONFIRMED") state = "CONFIRMING";
    // This names release reassessment readiness, not an observed FX price reaction.
    else if (state === "WAIT" || state === "WATCH") state = "INITIAL_REACTION";
  } else if (state === "WAIT" && clock.phase !== "pre-event") state = "WATCH";
  const postRelease = clock.phase === "release" || clock.phase.startsWith("post-");
  return Object.freeze<EventLifecycleResultV1>({
    semantic: "engine-assessment", canonicalEventId: event.canonicalEventId,
    productId: input.productId, assessmentId: input.assessmentId,
    evaluatedAt: clock.evaluatedAt, state, clock,
    checkpoint: postRelease
      ? { availability: "unavailable", reason: "MARKET_FEED_UNAVAILABLE" }
      : clock.phase === "release-time-unverified"
        ? { availability: "unavailable", reason: "EVENT_DATA_INCOMPLETE" }
        : { availability: "available", data: clock.phase },
    marketReaction: { availability: "unavailable", reason: "MARKET_FEED_UNAVAILABLE" },
    eventData: event.actual.availability === "available" && event.release.availability === "available"
      ? { availability: "available", data: event }
      : { availability: "partial", data: event, missing: ["EVENT_DATA_INCOMPLETE"] },
    acceptedEvidence: Object.freeze(acceptedEvidence),
  });
}
