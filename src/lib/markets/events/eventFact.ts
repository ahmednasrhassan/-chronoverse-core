import type { EngineDataSection, EngineNotApplicableSection } from "../engine/contracts";
import type { CanonicalProductIdV1 } from "../services/canonicalProductResultOwnership";
import type {
  CanonicalStatisticalObservationValueV1,
  CanonicalStatisticalSeriesMetadataV1,
  CanonicalSourceSubstitutionV1,
} from "../services/canonicalObservationSeries";
import type { EcbMonetaryPolicyEventFactV1, EcbPolicyRateFactsV1 } from "./ecbMonetaryPolicy";
import { parseEventInstantV1 } from "./eventClock";

/** Shared provenance vocabulary without statistical-series-only fields. */
export type EventSourceReferenceV1 = Readonly<Pick<CanonicalStatisticalSeriesMetadataV1,
  "provider" | "source" | "sourceUrl" | "sourceVersionId" | "fetchedAt"
> & {
  readonly originalPublisher: string;
  readonly substitution: Extract<CanonicalSourceSubstitutionV1, { readonly status: "none" }>;
}>;

export interface EventSourcedValueV1<T> {
  readonly value: T;
  readonly provenance: EventSourceReferenceV1;
}

export type EventStatisticalValueV1 = CanonicalStatisticalObservationValueV1 & {
  readonly unit: string;
};

export type EventPolicyValueV1 =
  | { readonly kind: "ecb-policy-rates"; readonly rates: EcbPolicyRateFactsV1 }
  | { readonly kind: "policy-statement"; readonly decision: string };

export type EventRevisionV1<T> =
  | { readonly status: "unknown" }
  | { readonly status: "none" }
  | { readonly status: "revised"; readonly revisedPrevious: EventSourcedValueV1<T> }
  | EngineNotApplicableSection;

interface EventFactBaseV1 {
  readonly semantic: "source-fact";
  /** Adapter-supplied stable identity retained across schedule/source revisions. */
  readonly canonicalEventId: string;
  readonly eventFamily: string;
  readonly economicRegion: string;
  readonly affectedProducts: readonly CanonicalProductIdV1[];
  readonly schedule: {
    /** Offset-bearing ISO instant. Source timezone is descriptive, not a parsing hint. */
    readonly scheduledAt: string;
    readonly scheduledTimezone: string;
    readonly provenance: EventSourceReferenceV1;
  };
  readonly release: EngineDataSection<{
    readonly actualReleasedAt: string | null;
    /** Unix seconds; acquisition/observation never stands in for publication. */
    readonly firstObservedAt: number | null;
    readonly provenance: EventSourceReferenceV1;
  }>;
  /** No legitimate consensus contract exists in the repository. */
  readonly consensus: { readonly availability: "unavailable"; readonly reason: "CONSENSUS_SOURCE_UNAVAILABLE" };
}

interface EventValuesV1<T> {
  readonly actual: EngineDataSection<EventSourcedValueV1<T>>;
  readonly previous: EngineDataSection<EventSourcedValueV1<T>> | EngineNotApplicableSection;
  readonly revision: EventRevisionV1<T>;
}

export type EventFactV1 = EventFactBaseV1 & (
  | ({ readonly kind: "statistical-release" } & EventValuesV1<EventStatisticalValueV1>)
  | ({ readonly kind: "policy-decision" } & EventValuesV1<EventPolicyValueV1>)
);

/** Contract validation only. Official adapters must establish publisher/URL authority. */
export function defineEventFactV1<T extends EventFactV1>(event: T): T {
  if (event.semantic !== "source-fact") throw new TypeError("Event must be a source fact.");
  for (const value of [event.canonicalEventId, event.eventFamily, event.economicRegion]) {
    assertIdentifier(value);
  }
  // Exhaustive against the existing five-product contract; no economic mapping is inferred.
  const products = { eurusd: true, eurjpy: true, eurgbp: true, eurchf: true, estr: true } satisfies Record<CanonicalProductIdV1, true>;
  if (event.affectedProducts.some((product) => !Object.hasOwn(products, product))) {
    throw new TypeError("Affected products must belong to the locked five-product universe.");
  }
  parseEventInstantV1(event.schedule.scheduledAt, "scheduledAt");
  assertIdentifier(event.schedule.scheduledTimezone);
  try { new Intl.DateTimeFormat("en", { timeZone: event.schedule.scheduledTimezone }); }
  catch { throw new TypeError("Invalid scheduledTimezone."); }
  assertSource(event.schedule.provenance);
  assertSectionAvailability(event.release);
  if (event.release.availability === "available" || event.release.availability === "partial") {
    const release = event.release.data;
    assertSource(release.provenance);
    if (release.firstObservedAt !== null && (!Number.isSafeInteger(release.firstObservedAt) ||
        release.firstObservedAt < 0 || release.firstObservedAt > release.provenance.fetchedAt)) {
      throw new TypeError("Invalid release firstObservedAt.");
    }
    if (release.actualReleasedAt !== null &&
        parseEventInstantV1(release.actualReleasedAt, "actualReleasedAt") > release.provenance.fetchedAt * 1_000) {
      throw new TypeError("Publication cannot follow source capture.");
    }
  }
  if (event.consensus.availability !== "unavailable" || event.consensus.reason !== "CONSENSUS_SOURCE_UNAVAILABLE") {
    throw new TypeError("Consensus has no supported source contract.");
  }
  if (event.kind === "statistical-release") assertValues(event, assertStatisticalValue);
  else if (event.kind === "policy-decision") assertValues(event, assertPolicyValue);
  else throw new TypeError("Unsupported event kind.");
  if (event.actual.availability !== "unavailable" && event.release.availability === "unavailable") {
    throw new TypeError("Actual values require official release evidence.");
  }
  return Object.freeze<T>({ ...event, affectedProducts: Object.freeze([...event.affectedProducts]) });
}

/** Existing ECB identity, capture times and source versions remain canonical. */
export function eventFactFromEcbMonetaryPolicyV1(
  event: EcbMonetaryPolicyEventFactV1,
  affectedProducts: readonly CanonicalProductIdV1[],
): Extract<EventFactV1, { readonly kind: "policy-decision" }> {
  const source = (url: string, version: string, fetchedAt: number): EventSourceReferenceV1 => ({
    provider: "ecb", source: event.sourceInstitution, originalPublisher: event.sourceInstitution,
    substitution: { status: "none" }, sourceUrl: url, sourceVersionId: version, fetchedAt,
  });
  const decision = event.decision;
  const decisionSource = decision === null ? null
    : source(decision.documentUrl, decision.sourceVersionId, decision.fetchedAt);
  return defineEventFactV1({
    semantic: "source-fact", kind: "policy-decision", canonicalEventId: event.canonicalEventId,
    eventFamily: event.eventFamily, economicRegion: "euro-area", affectedProducts,
    schedule: {
      scheduledAt: event.schedule.scheduledAt, scheduledTimezone: event.schedule.scheduledTimezone,
      provenance: source(event.schedule.sourceUrl, event.schedule.sourceVersionId, event.schedule.fetchedAt),
    },
    release: decision === null || decisionSource === null
      ? { availability: "unavailable", reason: "PRIMARY_SOURCE_UNAVAILABLE" }
      : { availability: "available", data: {
          actualReleasedAt: decision.actualReleasedAt, firstObservedAt: decision.firstObservedAt,
          provenance: decisionSource,
        } },
    actual: decision?.rates == null || decisionSource === null
      ? { availability: "unavailable", reason: "EVENT_DATA_INCOMPLETE" }
      : { availability: "available", data: {
          value: { kind: "ecb-policy-rates", rates: decision.rates }, provenance: decisionSource,
        } },
    previous: { availability: "unavailable", reason: "INSUFFICIENT_HISTORY" },
    revision: { status: "unknown" },
    consensus: { availability: "unavailable", reason: "CONSENSUS_SOURCE_UNAVAILABLE" },
  });
}

function assertValues<T>(event: EventValuesV1<T>, validate: (value: T) => void): void {
  assertSectionAvailability(event.actual);
  assertSectionAvailability(event.previous, true);
  assertRevisionDiscriminator(event.revision);
  for (const section of [event.actual, event.previous]) {
    if (section.availability === "available" || section.availability === "partial") {
      assertSource(section.data.provenance);
      validate(section.data.value);
    }
  }
  if ("status" in event.revision && event.revision.status === "revised") {
    assertSource(event.revision.revisedPrevious.provenance);
    validate(event.revision.revisedPrevious.value);
  }
}

function assertStatisticalValue(value: EventStatisticalValueV1): void {
  if (!Number.isFinite(value.value)) throw new TypeError("Statistical value must be finite.");
  assertIdentifier(value.referencePeriod);
  assertIdentifier(value.unit);
}

function assertPolicyValue(value: EventPolicyValueV1): void {
  if (value.kind === "policy-statement") assertIdentifier(value.decision);
  else if (value.kind === "ecb-policy-rates") {
    if (value.rates.unit !== "percent" || ![
      value.rates.depositFacility, value.rates.mainRefinancingOperations, value.rates.marginalLendingFacility,
    ].every(Number.isFinite)) throw new TypeError("Invalid policy rates.");
    const effectiveDate = value.rates.effectiveDate;
    if (effectiveDate !== null) {
      if (typeof effectiveDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
        throw new TypeError("Invalid policy effectiveDate.");
      }
      parseEventInstantV1(`${effectiveDate}T00:00:00Z`, "policy effectiveDate");
    }
  } else throw new TypeError("Unsupported policy value.");
}

function assertSectionAvailability(section: unknown, allowNotApplicable = false): void {
  if (typeof section !== "object" || section === null || !("availability" in section)) {
    throw new TypeError("Invalid event section availability.");
  }
  switch (section.availability) {
    case "available":
    case "unavailable":
      return;
    case "partial":
      if (!("missing" in section) || !Array.isArray(section.missing) ||
          !section.missing.every((item: unknown) => typeof item === "string")) {
        throw new TypeError("Partial event section requires missing fields.");
      }
      return;
    case "not-applicable":
      if (allowNotApplicable) return;
  }
  throw new TypeError("Unsupported event section availability.");
}

function assertRevisionDiscriminator(revision: unknown): void {
  if (typeof revision !== "object" || revision === null) {
    throw new TypeError("Invalid event revision discriminator.");
  }
  if ("availability" in revision) {
    if (revision.availability === "not-applicable" && !("status" in revision)) return;
  } else if ("status" in revision &&
      ["unknown", "none", "revised"].some((status) => status === revision.status)) {
    return;
  }
  throw new TypeError("Unsupported event revision discriminator.");
}

function assertSource(source: EventSourceReferenceV1): void {
  for (const value of [source.provider, source.source, source.originalPublisher, source.sourceVersionId]) {
    assertIdentifier(value);
  }
  const url = new URL(source.sourceUrl);
  if (url.protocol !== "https:" || url.username || url.password || source.substitution.status !== "none" ||
      !Number.isSafeInteger(source.fetchedAt) || source.fetchedAt < 0) {
    throw new TypeError("Invalid primary event source reference.");
  }
}

function assertIdentifier(value: string): void {
  if (typeof value !== "string" || !value.trim()) throw new TypeError("Invalid event identifier/value.");
}
