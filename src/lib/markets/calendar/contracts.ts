import type { CanonicalProductIdV1 } from "../services/canonicalProductResultOwnership";

export const CALENDAR_EVENT_SCHEMA_V1 = "canonical-calendar-event-v1" as const;
export const CALENDAR_SELECTION_SCHEMA_V1 = "canonical-calendar-selection-v1" as const;
export const CALENDAR_PROJECTION_SCHEMA_V1 = "canonical-calendar-projection-v1" as const;

/** The launch universe is owned by the existing canonical product contract. */
export type CalendarProductIdV1 = CanonicalProductIdV1;
export const CALENDAR_PRODUCTS_V1 = Object.freeze([
  "eurusd", "eurjpy", "eurgbp", "eurchf", "estr",
] as const satisfies readonly CalendarProductIdV1[]);

/** Strings representing civil dates never represent midnight publication instants. */
export type CalendarTimeV1 =
  | { readonly kind: "exact"; readonly at: string; readonly timeZone: string;
      /** Source civil clock, checked against the absolute instant and IANA zone. */
      readonly localDateTime: string }
  | { readonly kind: "date-only"; readonly date: string; readonly timeZone: string | null }
  | { readonly kind: "window"; readonly startsAt: string; readonly endsAt: string;
      readonly timeZone: string }
  | { readonly kind: "unknown"; readonly expectedDate: string | null;
      readonly timeZone: string | null;
      readonly reason: "not-announced" | "announcement-time-unspecified" };

export type CalendarPublisherV1 =
  | "ecb" | "boj" | "federal-reserve" | "new-york-fed" | "boe" | "snb"
  | "eurostat" | "bls" | "bea";

/** Declarative primary-source binding. Shape validation is NOT authentication. */
export interface CalendarProvenanceV1 {
  readonly authority: "primary-publisher";
  readonly publisher: CalendarPublisherV1;
  /** Public source URL only; credentials, query strings and fragments are forbidden. */
  readonly sourceUrl: string;
  readonly sourceVersionId: string;
  readonly parserVersion: string;
}

export type CalendarPublicationV1 =
  | { readonly status: "recorded";
      readonly time: Exclude<CalendarTimeV1, { readonly kind: "unknown" }>;
      readonly provenance: CalendarProvenanceV1 }
  | { readonly status: "unavailable";
      readonly reason: "not-published" | "publication-time-unverified" };

export interface CalendarCaptureTimingV1 {
  readonly acquisition:
    | { readonly status: "recorded"; readonly completedAt: string }
    | { readonly status: "unavailable"; readonly reason: "acquisition-time-unavailable" };
  readonly evidenceAvailability:
    | { readonly status: "recorded"; readonly availableAt: string }
    | { readonly status: "unavailable"; readonly reason: "availability-time-unavailable" };
  readonly persistence:
    | { readonly status: "acknowledged"; readonly acknowledgedAt: string; readonly recordId: string }
    | { readonly status: "not-persisted" }
    | { readonly status: "unavailable"; readonly reason: "acknowledgement-unavailable" };
}

export type CalendarRevisionChangeV1 =
  | "initial" | "schedule-revision" | "publication-update" | "source-correction"
  | "cancellation" | "reinstatement";

export interface CalendarEventV1 {
  readonly schemaVersion: typeof CALENDAR_EVENT_SCHEMA_V1;
  readonly semantic: "source-fact-description";
  /** Stable across revisions and cancellation; not reconstructed from a moving date. */
  readonly eventId: string;
  readonly versionId: string;
  readonly title: string;
  readonly family: "policy-decision" | "statistical-release" | "benchmark-publication"
    | "policy-minutes" | "policy-report";
  readonly state: "scheduled" | "published" | "cancelled";
  readonly eventTime: CalendarTimeV1;
  readonly publication: CalendarPublicationV1;
  /** Economic labels, never evidence availability or publication timestamps. */
  readonly referencePeriod: string | null;
  readonly effectiveDate: string | null;
  readonly provenance: CalendarProvenanceV1;
  readonly timing: CalendarCaptureTimingV1;
  readonly revision: {
    readonly sequence: number;
    readonly supersedesVersionId: string | null;
    readonly change: CalendarRevisionChangeV1;
  };
  readonly relevance: readonly {
    readonly productId: CalendarProductIdV1;
    readonly relationship: "direct-policy" | "counterparty-policy" | "macro-context" | "benchmark-publication";
  }[];
  /** Caller-declared policy only; null means cadence is unqualified. No hidden clock. */
  readonly freshnessPolicy: { readonly maximumAgeMilliseconds: number | null };
}

export type CalendarUnavailableReasonV1 =
  | "invalid-input" | "no-captured-history" | "incomplete-history" | "conflicting-history"
  | "not-known-as-of" | "acquisition-time-unavailable" | "availability-time-unavailable"
  | "persistence-acknowledgement-unavailable";

/** Offline selection only. Neither a receipt nor historical event ownership. */
export type CalendarSelectionV1 = {
  readonly schemaVersion: typeof CALENDAR_SELECTION_SCHEMA_V1;
  readonly scope: "provided-history-only";
  readonly sourceAuthentication: "not-performed";
  readonly historicalOwnership: "not-certified";
} & (
  | { readonly status: "selected"; readonly event: CalendarEventV1;
      readonly knowledgeCutoff: string; readonly evaluatedAt: string }
  | { readonly status: "unavailable"; readonly reason: CalendarUnavailableReasonV1 }
);

export type CalendarFreshnessV1 =
  | { readonly status: "within-cadence" | "stale"; readonly assessedAt: string; readonly expiresAt: string }
  | { readonly status: "unavailable"; readonly assessedAt: string;
      readonly reason: "cadence-unqualified" | "availability-time-unavailable" };

export interface CalendarFreeLiteEventV1 {
  readonly eventId: string;
  readonly title: string;
  readonly family: CalendarEventV1["family"];
  readonly state: CalendarEventV1["state"];
  readonly eventTime: CalendarTimeV1;
  readonly publisher: CalendarPublisherV1;
  readonly sourceUrl: string;
  readonly products: readonly CalendarProductIdV1[];
  readonly freshness: CalendarFreshnessV1;
}

export interface CalendarVipDeepEventV1 extends CalendarFreeLiteEventV1 {
  readonly versionId: string;
  readonly revision: CalendarEventV1["revision"];
  readonly publication: CalendarPublicationV1;
  readonly referencePeriod: string | null;
  readonly effectiveDate: string | null;
  readonly relevance: CalendarEventV1["relevance"];
  readonly provenance: CalendarProvenanceV1;
  /** Deliberately omits internal persistence record IDs. */
  readonly timing: Omit<CalendarCaptureTimingV1, "persistence"> & {
    readonly persistence: { readonly status: "acknowledged"; readonly acknowledgedAt: string };
  };
  readonly knowledgeCutoff: string;
  readonly evaluatedAt: string;
}

export type CalendarProjectionV1<TTier extends "free-lite" | "vip-deep"> = {
  readonly schemaVersion: typeof CALENDAR_PROJECTION_SCHEMA_V1;
  readonly tier: TTier;
  readonly sourceAuthentication: "not-performed";
  readonly historicalOwnership: "not-certified";
} & (
  | { readonly availability: "available";
      readonly event: TTier extends "free-lite" ? CalendarFreeLiteEventV1 : CalendarVipDeepEventV1 }
  | { readonly availability: "unavailable"; readonly reason: "calendar-unavailable" }
);
