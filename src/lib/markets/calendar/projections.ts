import "server-only";

import {
  CALENDAR_PROJECTION_SCHEMA_V1,
  type CalendarEventV1, type CalendarFreeLiteEventV1, type CalendarFreshnessV1,
  type CalendarProjectionV1, type CalendarVipDeepEventV1,
} from "./contracts";
import { selectCalendarEventAsOfV1, type CalendarHistoryInputV1 } from "./history";
import { calendarInstantV1, snapshotCalendarDataV1 } from "./validation";

function base<TTier extends "free-lite" | "vip-deep">(tier: TTier) {
  return { schemaVersion: CALENDAR_PROJECTION_SCHEMA_V1, tier,
    sourceAuthentication: "not-performed", historicalOwnership: "not-certified" } as const;
}

/** Pure policy-age classification, not evidence admission or opportunity eligibility. */
function freshness(event: CalendarEventV1, assessedAt: string): CalendarFreshnessV1 {
  const age = event.freshnessPolicy.maximumAgeMilliseconds;
  const available = event.timing.evidenceAvailability;
  if (available.status !== "recorded") return { status: "unavailable", assessedAt, reason: "availability-time-unavailable" };
  if (age === null) return { status: "unavailable", assessedAt, reason: "cadence-unqualified" };
  const expires = calendarInstantV1(available.availableAt) + age;
  return { status: calendarInstantV1(assessedAt) < expires ? "within-cadence" : "stale",
    assessedAt, expiresAt: new Date(expires).toISOString() };
}

/** Explicit allowlist; never spread a canonical event into a public DTO. */
function lite(event: CalendarEventV1, assessedAt: string): CalendarFreeLiteEventV1 {
  return { eventId: event.eventId, title: event.title, family: event.family, state: event.state,
    eventTime: event.eventTime, publisher: event.provenance.publisher, sourceUrl: event.provenance.sourceUrl,
    products: event.relevance.map(item => item.productId), freshness: freshness(event, assessedAt) };
}

function project<TTier extends "free-lite" | "vip-deep">(
  tier: TTier, input: CalendarHistoryInputV1, assessedAt: string,
): CalendarProjectionV1<TTier> {
  const unavailable = Object.freeze({ ...base(tier), availability: "unavailable", reason: "calendar-unavailable" } as const);
  try {
    const delivery = calendarInstantV1(assessedAt);
    const selection = selectCalendarEventAsOfV1(input);
    if (selection.status !== "selected" || delivery < calendarInstantV1(selection.evaluatedAt)) return unavailable;
    const assessed = new Date(delivery).toISOString();
    const event = selection.event;
    const publicEvent = lite(event, assessed);
    let projected: CalendarFreeLiteEventV1 | CalendarVipDeepEventV1 = publicEvent;
    if (tier === "vip-deep") {
      const persistence = event.timing.persistence;
      if (persistence.status !== "acknowledged") return unavailable;
      projected = { ...publicEvent, versionId: event.versionId, revision: event.revision,
        publication: event.publication, referencePeriod: event.referencePeriod, effectiveDate: event.effectiveDate,
        relevance: event.relevance, provenance: event.provenance,
        timing: { acquisition: event.timing.acquisition, evidenceAvailability: event.timing.evidenceAvailability,
          persistence: { status: "acknowledged", acknowledgedAt: persistence.acknowledgedAt } },
        knowledgeCutoff: selection.knowledgeCutoff, evaluatedAt: selection.evaluatedAt };
    }
    return snapshotCalendarDataV1({ ...base(tier), availability: "available", event: projected }) as CalendarProjectionV1<TTier>;
  } catch { return unavailable; }
}

/** Contract DTO only. Available facts may still carry stale/unavailable freshness. */
export function projectCalendarFreeLiteV1(input: CalendarHistoryInputV1, assessedAt: string): CalendarProjectionV1<"free-lite"> {
  return project("free-lite", input, assessedAt);
}

/**
 * Server-only DTO mapper, NOT an authorization boundary. Future delivery MUST
 * authorize through the existing VIP guard before loading history or calling it.
 * No production caller or entitlement changes are introduced in Phase 2A.
 */
export function projectCalendarVipDeepV1(input: CalendarHistoryInputV1, assessedAt: string): CalendarProjectionV1<"vip-deep"> {
  return project("vip-deep", input, assessedAt);
}

