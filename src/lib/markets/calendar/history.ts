import "server-only";

import {
  CALENDAR_SELECTION_SCHEMA_V1,
  type CalendarEventV1, type CalendarSelectionV1, type CalendarUnavailableReasonV1,
} from "./contracts";
import { calendarInstantV1, calendarRecordV1, readCalendarEventV1, snapshotCalendarDataV1 } from "./validation";

export interface CalendarHistoryInputV1 {
  readonly versions: readonly unknown[];
  readonly knowledgeCutoff: string;
  readonly evaluatedAt: string;
}

const selectionScope = Object.freeze({ schemaVersion: CALENDAR_SELECTION_SCHEMA_V1,
  scope: "provided-history-only", sourceAuthentication: "not-performed", historicalOwnership: "not-certified" } as const);

function unavailable(reason: CalendarUnavailableReasonV1): CalendarSelectionV1 {
  return Object.freeze({ ...selectionScope, status: "unavailable", reason });
}

function validTransition(previous: CalendarEventV1, next: CalendarEventV1): boolean {
  const change = next.revision.change;
  if (previous.state === "cancelled") {
    return next.state === "scheduled" ? change === "reinstatement"
      : next.state === "cancelled" && change === "source-correction";
  }
  if (next.state === "cancelled") return previous.state === "scheduled" && change === "cancellation";
  if (next.state === "published") return change === "publication-update" || change === "source-correction";
  return previous.state === "scheduled" && (change === "schedule-revision" || change === "source-correction");
}

/**
 * Deterministic model over a caller-supplied complete version chain, not a
 * historical resolver. No current calendar, active pointer, store or clock.
 * An acknowledgement field describes persistence; this function verifies no
 * storage receipt, publisher or historical ownership. Invalid/missing timing
 * anywhere fails closed rather than silently falling back to an older version.
 */
export function selectCalendarEventAsOfV1(input: CalendarHistoryInputV1): CalendarSelectionV1 {
  try {
    const data = calendarRecordV1(snapshotCalendarDataV1(input), ["versions", "knowledgeCutoff", "evaluatedAt"]);
    const cutoff = calendarInstantV1(data.knowledgeCutoff);
    const evaluation = calendarInstantV1(data.evaluatedAt);
    if (cutoff > evaluation || !Array.isArray(data.versions) || data.versions.length > 128) return unavailable("invalid-input");
    if (data.versions.length === 0) return unavailable("no-captured-history");
    const versions = data.versions.map(readCalendarEventV1).sort((a, b) => a.revision.sequence - b.revision.sequence);
    const first = versions[0];
    if (first.revision.sequence !== 1) return unavailable("incomplete-history");
    let selected: CalendarEventV1 | null = null;
    let previous: CalendarEventV1 | null = null;
    let previousKnownAt = -1;
    const identities = new Set<string>();
    for (const event of versions) {
      if (event.eventId !== first.eventId || event.family !== first.family ||
          event.provenance.publisher !== first.provenance.publisher || identities.has(event.versionId)) {
        return unavailable("conflicting-history");
      }
      identities.add(event.versionId);
      if (previous !== null) {
        if (event.revision.sequence > previous.revision.sequence + 1) return unavailable("incomplete-history");
        if (event.revision.sequence !== previous.revision.sequence + 1 ||
            event.revision.supersedesVersionId !== previous.versionId || !validTransition(previous, event)) {
          return unavailable("conflicting-history");
        }
      }
      const { acquisition, evidenceAvailability, persistence } = event.timing;
      if (acquisition.status !== "recorded") return unavailable("acquisition-time-unavailable");
      if (evidenceAvailability.status !== "recorded") return unavailable("availability-time-unavailable");
      if (persistence.status !== "acknowledged") return unavailable("persistence-acknowledgement-unavailable");
      // Validation enforces completion <= availability <= acknowledgement.
      const knownAt = calendarInstantV1(persistence.acknowledgedAt);
      if (knownAt <= previousKnownAt) return unavailable("conflicting-history");
      if (knownAt <= cutoff) selected = event;
      previousKnownAt = knownAt;
      previous = event;
    }
    return selected === null ? unavailable("not-known-as-of") : Object.freeze({ ...selectionScope,
      status: "selected", event: selected, knowledgeCutoff: new Date(cutoff).toISOString(),
      evaluatedAt: new Date(evaluation).toISOString() });
  } catch { return unavailable("invalid-input"); }
}
