import { isDeepStrictEqual } from "node:util";
import {
  buildBilateralPolicyEventReadinessV1, type BuildBilateralPolicyEventReadinessInputV1,
  type BilateralPolicyEventReadinessV1,
} from "./bilateralPolicyEventReadiness";
import { selectEcbMonetaryPolicyPriorStateAsKnownAtV1,
  type EcbMonetaryPolicyPriorStateResultV1 } from "./ecbMonetaryPolicyPriorState";
import type { EcbMonetaryPolicyEventMemoryV1, EcbMonetaryPolicyEventSnapshotV1 } from "./ecbMonetaryPolicyMemory";
import type { EcbPolicyRateFactsV1 } from "./ecbMonetaryPolicy";
import type { EventSourceReferenceV1 } from "./eventFact";
import { parseEventInstantV1 } from "./eventClock";
import { buildCanonicalStatisticalSeriesSnapshotV1,
  type CanonicalStatisticalSeriesSnapshotV1 } from "../services/canonicalStatisticalSeriesMemory";
import type { CanonicalStatisticalSeriesMetadataV1 } from "../services/canonicalObservationSeries";
import { buildUsPolicySourceVersionIdV1, readUsPolicyFactsV1 } from "../providers/federalReserve/canonical";
import type { FomcFactV1 } from "../providers/federalReserve/fomc";
import { buildBojPolicyEvidenceV1, readBojPolicyFactV1 } from "../providers/boj/canonical";
import type { BojPolicyFactV1 } from "../providers/boj/facts";
import { buildBoeBankRateEvidenceV1, readBoeBankRateFactV1 } from "../providers/boe/canonical";
import type { BoeBankRateFactV1 } from "../providers/boe/facts";
import { buildSnbPolicyEvidenceV1, readSnbPolicyFactV1 } from "../providers/snb/canonical";
import type { SnbPolicyFactV1 } from "../providers/snb/facts";
import type { BojPolicyEvidenceSnapshotV1 } from "../persistence/bojPolicyVintageRedis";
import type { BoeBankRateEvidenceSnapshotV1 } from "../persistence/boeBankRateVintageRedis";
import type { SnbPolicyEvidenceSnapshotV1 } from "../persistence/snbPolicyVintageRedis";

export const POLICY_EVENT_PRIOR_SELECTION_SCHEMA_VERSION_V1 = "policy-event-prior-selection-v1" as const;

type DatedHistory<S, K extends string> = Readonly<Record<K, string>> & {
  /** Supplied revisions; order is irrelevant, capture time selects the as-of state. */
  readonly snapshots: readonly S[];
};
export type PolicyEventPriorHistoryV1 =
  | { readonly institution: "ECB"; readonly memories: readonly EcbMonetaryPolicyEventMemoryV1[] }
  | { readonly institution: "FOMC"; readonly histories: readonly DatedHistory<CanonicalStatisticalSeriesSnapshotV1, "decisionDate">[] }
  | { readonly institution: "BoJ"; readonly histories: readonly DatedHistory<BojPolicyEvidenceSnapshotV1, "decisionDate">[] }
  | { readonly institution: "BoE"; readonly histories: readonly DatedHistory<BoeBankRateEvidenceSnapshotV1, "publicationDate">[] }
  | { readonly institution: "SNB"; readonly histories: readonly DatedHistory<SnbPolicyEvidenceSnapshotV1, "decisionDate">[] };

export interface SelectPolicyEventPriorInputV1 {
  readonly readinessInput: BuildBilateralPolicyEventReadinessInputV1;
  /** Inclusive Unix seconds, independent of target capture/release/effectiveness. */
  readonly knowledgeCutoff: number;
  readonly history: PolicyEventPriorHistoryV1;
}
type Institution = PolicyEventPriorHistoryV1["institution"];
type RightInstitution = Exclude<Institution, "ECB">;
type SeriesReference = { readonly kind: "policy-series"; readonly canonicalSeriesId: string; readonly sourceVersionId: string };
type EventReference = { readonly kind: "ecb-event"; readonly canonicalEventId: string; readonly eventSourceVersionId: string };
interface PriorBase {
  readonly status: "available";
  readonly selectionDate: string;
  readonly sourceVersionId: string;
  readonly knownAt: number;
}
type SeriesPrior<I extends RightInstitution, S, F> = PriorBase & {
  readonly institution: I;
  readonly selectionDateKind: I extends "BoE" ? "publication-date" : "decision-date";
  readonly canonicalReference: SeriesReference;
  readonly snapshot: S;
  readonly policySetting: F;
  readonly provenance: CanonicalStatisticalSeriesMetadataV1;
};
type RightPrior =
  | SeriesPrior<"FOMC", CanonicalStatisticalSeriesSnapshotV1, FomcFactV1>
  | SeriesPrior<"BoJ", BojPolicyEvidenceSnapshotV1, BojPolicyFactV1>
  | SeriesPrior<"BoE", BoeBankRateEvidenceSnapshotV1, BoeBankRateFactV1>
  | SeriesPrior<"SNB", SnbPolicyEvidenceSnapshotV1, SnbPolicyFactV1>;
type EcbPrior = PriorBase & {
  readonly institution: "ECB";
  readonly selectionDateKind: "decision-date";
  readonly canonicalReference: EventReference;
  readonly snapshot: EcbMonetaryPolicyEventSnapshotV1;
  readonly policySetting: EcbPolicyRateFactsV1;
  readonly provenance: EventSourceReferenceV1;
  /** Existing selector's schedule-only target binding, retained unchanged. */
  readonly targetBinding: EcbMonetaryPolicyEventSnapshotV1;
};
type PriorReason = Extract<EcbMonetaryPolicyPriorStateResultV1, { status: "unavailable" }>["reason"];
type UnavailablePrior = { readonly status: "unavailable"; readonly reason: PriorReason }
  | { readonly status: "unavailable"; readonly reason: "TARGET_CONTEXT_UNAVAILABLE";
      readonly targetReason: Extract<BilateralPolicyEventReadinessV1["policyState"]["left"],
        { availability: "unavailable" }>["reason"]; readonly upstreamReason: string | null };
type Target = {
  readonly institution: "ECB"; readonly selectionDateKind: "meeting-date";
  readonly selectionDate: string; readonly canonicalReference: EventReference; readonly knownAt: number;
} | {
  readonly institution: RightInstitution; readonly selectionDateKind: "decision-date" | "publication-date";
  readonly selectionDate: string; readonly canonicalReference: SeriesReference; readonly knownAt: number;
};
export interface PolicyEventPriorSelectionV1 {
  readonly schemaVersion: typeof POLICY_EVENT_PRIOR_SELECTION_SCHEMA_VERSION_V1;
  readonly semantic: "derived-feature";
  readonly feature: "policy-event-prior-selection";
  readonly productId: BilateralPolicyEventReadinessV1["productId"];
  readonly focusSide: "left" | "right";
  readonly institution: Institution;
  readonly evaluatedAt: string;
  readonly knowledgeCutoff: number;
  readonly coverage: "provided-history-only";
  readonly selectionBasis: "last-earlier-supplied-announcement";
  readonly target: Target | null;
  /** Latest knowledge required by retained target and available prior evidence only. */
  readonly evidenceKnownAt: number | null;
  readonly prior: EcbPrior | RightPrior | UnavailablePrior;
}

/** INACTIVE evidence selection only; no global predecessor, currentness or policy arithmetic. */
export function selectPolicyEventPriorAsKnownAtV1(input: SelectPolicyEventPriorInputV1): PolicyEventPriorSelectionV1 {
  assertKeys(input, ["readinessInput", "knowledgeCutoff", "history"]);
  // Rebuild before using any target facts. Raw target snapshots are never read below.
  const readiness = buildBilateralPolicyEventReadinessV1(input.readinessInput);
  const evaluatedMs = parseEventInstantV1(readiness.evaluatedAt, "evaluatedAt");
  const cutoff = input.knowledgeCutoff;
  if (!Number.isSafeInteger(cutoff) || cutoff < 0) throw new TypeError("Invalid knowledgeCutoff.");
  if (cutoff > Math.floor(evaluatedMs / 1_000)) throw new RangeError("knowledgeCutoff cannot follow evaluatedAt.");
  const side = readiness.focus.side;
  const institution: Institution = side === "left" ? "ECB"
    : ({ eurusd: "FOMC", eurjpy: "BoJ", eurgbp: "BoE", eurchf: "SNB" } as const)[readiness.productId];
  const history = input.history;
  assertKeys(history, institution === "ECB" ? ["institution", "memories"] : ["institution", "histories"]);
  if (history.institution !== institution) throw new TypeError("History must match the focused institution.");
  if (!Array.isArray(history.institution === "ECB" ? history.memories : history.histories)) {
    throw new TypeError("Expected supplied policy histories.");
  }
  const focused = side === "left" ? readiness.policyState.left : readiness.policyState.right;
  const context = { schemaVersion: POLICY_EVENT_PRIOR_SELECTION_SCHEMA_VERSION_V1,
    semantic: "derived-feature" as const, feature: "policy-event-prior-selection" as const,
    productId: readiness.productId, focusSide: side, institution, evaluatedAt: readiness.evaluatedAt,
    knowledgeCutoff: cutoff, coverage: "provided-history-only" as const,
    selectionBasis: "last-earlier-supplied-announcement" as const };
  if (focused.availability === "unavailable") {
    // No semantic target: do not select, rank or expose candidate history.
    return freezeCopy({ ...context, target: null, evidenceKnownAt: null,
      prior: { status: "unavailable", reason: "TARGET_CONTEXT_UNAVAILABLE",
        targetReason: focused.reason, upstreamReason: focused.upstreamReason } });
  }
  let target: Target;
  let prior: PolicyEventPriorSelectionV1["prior"];
  if (history.institution === "ECB") {
    const left = readiness.policyState.left;
    if (left.availability === "unavailable") throw new TypeError("Expected admitted ECB target.");
    const snapshot = left.data.snapshot;
    target = { institution: "ECB", selectionDateKind: "meeting-date",
      selectionDate: snapshot.event.schedule.meetingDate, knownAt: snapshot.knownAt,
      canonicalReference: { kind: "ecb-event", canonicalEventId: snapshot.canonicalEventId,
        eventSourceVersionId: snapshot.eventSourceVersionId } };
    const selected = selectEcbMonetaryPolicyPriorStateAsKnownAtV1({ memories: history.memories,
      target: snapshot.event, knowledgeCutoff: cutoff, evaluatedAt: readiness.evaluatedAt });
    prior = selected.status === "unavailable" ? missing(selected.reason) : {
      status: "available", institution: "ECB", selectionDateKind: "decision-date",
      selectionDate: selected.decisionDate, knownAt: selected.knownAt, sourceVersionId: selected.eventSourceVersionId,
      canonicalReference: { kind: "ecb-event", canonicalEventId: selected.canonicalEventId,
        eventSourceVersionId: selected.eventSourceVersionId }, snapshot: selected.selectedSnapshot,
      policySetting: selected.announcement.value.rates, provenance: selected.announcement.provenance,
      targetBinding: selected.targetSnapshot,
    };
  } else {
    const right = readiness.policyState.right;
    if (right.availability !== "available") throw new TypeError("Expected complete canonical counterparty target.");
    const fact = right.data.policySetting.data;
    target = { institution: history.institution, selectionDateKind: history.institution === "BoE" ? "publication-date" : "decision-date",
      selectionDate: "meetingEndDate" in fact ? fact.publicationDate : fact.decisionDate,
      knownAt: right.data.knownAt, canonicalReference: seriesReference(right.data.snapshot) };
    const sourceUrl = "statementUrl" in fact ? fact.statementUrl : fact.sourceUrl;
    prior = selectRight(history, target, sourceUrl, cutoff);
  }
  return freezeCopy({ ...context, target, prior,
    evidenceKnownAt: prior.status === "available" ? Math.max(target.knownAt, prior.knownAt) : target.knownAt });
}

function selectRight(history: Exclude<PolicyEventPriorHistoryV1, { institution: "ECB" }>,
  target: Extract<Target, { institution: RightInstitution }>, targetUrl: string, cutoff: number): RightPrior | UnavailablePrior {
  const states = new Map<string, RightPrior>();
  const documents = new Map<string, string>([[targetUrl, target.selectionDate]]);
  let latest: RightPrior | null = null;
  let ambiguous = false;
  for (const entry of history.histories) {
    const dateKey = history.institution === "BoE" ? "publicationDate" : "decisionDate";
    assertKeys(entry, [dateKey, "snapshots"]);
    const date = "publicationDate" in entry ? entry.publicationDate : entry.decisionDate;
    if (typeof date !== "string") throw new TypeError("Expected announcement civil date.");
    parseEventInstantV1(`${date}T00:00:00Z`, dateKey); // Validation only, never an event instant.
    if (!Array.isArray(entry.snapshots) || entry.snapshots.length === 0) throw new TypeError("Expected nonempty revisions.");
    const captures = new Map<number, RightPrior>();
    let selected: RightPrior | null = null;
    for (const supplied of entry.snapshots) {
      const revision = reconstructRight(history.institution, date, supplied);
      if (revision.knownAt > cutoff) continue;
      const sameCapture = captures.get(revision.knownAt);
      if (sameCapture !== undefined && !isDeepStrictEqual(sameCapture, revision)) ambiguous = true;
      captures.set(revision.knownAt, revision);
      if (selected === null || revision.knownAt > selected.knownAt) selected = revision;
    }
    if (selected === null) continue;
    // Check as-of branches before eligibility; BoE date conflicts can cross the target boundary.
    const id = selected.canonicalReference.canonicalSeriesId;
    const previous = states.get(id);
    if (previous !== undefined && !isDeepStrictEqual(previous, selected)) ambiguous = true;
    states.set(id, selected);
    const url = selected.provenance.sourceUrl;
    const documentDate = documents.get(url);
    if (documentDate !== undefined && documentDate !== selected.selectionDate) ambiguous = true;
    documents.set(url, selected.selectionDate);
    if (id === target.canonicalReference.canonicalSeriesId || selected.selectionDate >= target.selectionDate) continue;
    if (latest === null || selected.selectionDate > latest.selectionDate) latest = selected;
  }
  if (ambiguous) return missing("AMBIGUOUS_PRIOR_STATE");
  return latest ?? missing("INSUFFICIENT_HISTORY");
}

type RightSnapshot = RightPrior["snapshot"];
/** Reuse source readers/builders; supplied snapshot envelopes must exactly match reconstruction. */
function reconstructRight(institution: RightInstitution, date: string, supplied: RightSnapshot): RightPrior {
  if (typeof supplied !== "object" || supplied === null) throw new TypeError("Expected canonical policy snapshot.");
  if (institution === "FOMC" && supplied.schemaVersion === "canonical-statistical-series-snapshot-v1") {
    const snapshot = buildCanonicalStatisticalSeriesSnapshotV1(supplied.series);
    assertCanonical(supplied, snapshot);
    const family = `fomc:${date}` as const;
    const facts = readUsPolicyFactsV1(family, snapshot.series);
    if (snapshot.sourceVersionId !== buildUsPolicySourceVersionIdV1(family, snapshot.series)) throw new TypeError("FOMC content identity mismatch.");
    const fact = facts[0];
    if (facts.length !== 1 || fact === undefined || !("decisionDate" in fact)) throw new TypeError("Expected complete FOMC facts.");
    return { ...seriesPrior(snapshot, fact, snapshot.series.metadata, fact.decisionDate),
      institution: "FOMC", selectionDateKind: "decision-date" };
  }
  if (institution === "BoJ" && supplied.schemaVersion === "boj-policy-evidence-snapshot-v1") {
    const fact = readBojPolicyFactV1(date, supplied.evidence);
    const evidence = buildBojPolicyEvidenceV1(fact, supplied.evidence.metadata.fetchedAt);
    const snapshot = { schemaVersion: "boj-policy-evidence-snapshot-v1" as const, evidence,
      canonicalSeriesId: evidence.metadata.canonicalSeriesId, sourceVersionId: evidence.metadata.sourceVersionId, knownAt: evidence.metadata.fetchedAt };
    assertCanonical(supplied, snapshot);
    return { ...seriesPrior(snapshot, fact, evidence.metadata, fact.decisionDate), institution: "BoJ", selectionDateKind: "decision-date" };
  }
  if (institution === "BoE" && supplied.schemaVersion === "boe-bank-rate-evidence-snapshot-v1") {
    const fact = readBoeBankRateFactV1(date, supplied.evidence);
    const evidence = buildBoeBankRateEvidenceV1(fact, supplied.evidence.metadata.fetchedAt);
    const snapshot = { schemaVersion: "boe-bank-rate-evidence-snapshot-v1" as const, evidence,
      canonicalSeriesId: evidence.metadata.canonicalSeriesId, sourceVersionId: evidence.metadata.sourceVersionId, knownAt: evidence.metadata.fetchedAt };
    assertCanonical(supplied, snapshot);
    return { ...seriesPrior(snapshot, fact, evidence.metadata, fact.publicationDate), institution: "BoE", selectionDateKind: "publication-date" };
  }
  if (institution === "SNB" && supplied.schemaVersion === "snb-policy-evidence-snapshot-v1") {
    const fact = readSnbPolicyFactV1(date, supplied.evidence);
    const evidence = buildSnbPolicyEvidenceV1(fact, supplied.evidence.metadata.fetchedAt);
    const snapshot = { schemaVersion: "snb-policy-evidence-snapshot-v1" as const, evidence,
      canonicalSeriesId: evidence.metadata.canonicalSeriesId, sourceVersionId: evidence.metadata.sourceVersionId, knownAt: evidence.metadata.fetchedAt };
    assertCanonical(supplied, snapshot);
    return { ...seriesPrior(snapshot, fact, evidence.metadata, fact.decisionDate), institution: "SNB", selectionDateKind: "decision-date" };
  }
  throw new TypeError("Snapshot must match its declared policy institution.");
}

function seriesReference(snapshot: RightSnapshot): SeriesReference {
  return { kind: "policy-series", canonicalSeriesId: snapshot.canonicalSeriesId, sourceVersionId: snapshot.sourceVersionId };
}
function seriesPrior<S extends RightSnapshot, F>(snapshot: S, fact: F, provenance: CanonicalStatisticalSeriesMetadataV1, date: string) {
  return { status: "available" as const, selectionDate: date, knownAt: snapshot.knownAt,
    sourceVersionId: snapshot.sourceVersionId, canonicalReference: seriesReference(snapshot), snapshot, policySetting: fact, provenance };
}
function missing(reason: PriorReason): UnavailablePrior { return { status: "unavailable", reason }; }
function assertKeys(value: unknown, keys: readonly string[]): void {
  if (typeof value !== "object" || value === null || Array.isArray(value) ||
      Reflect.ownKeys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new TypeError("Expected closed policy prior-selection fields.");
  }
}
function assertCanonical(supplied: unknown, rebuilt: unknown): void {
  // Deep equality alone ignores hidden fields. Canonical snapshots contain plain data.
  function sameFields(left: unknown, right: unknown): boolean {
    if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) return true;
    const keys = Reflect.ownKeys(left);
    return keys.length === Reflect.ownKeys(right).length && keys.every((key) =>
      Object.hasOwn(right, key) && sameFields(Reflect.get(left, key), Reflect.get(right, key)));
  }
  if (!isDeepStrictEqual(supplied, rebuilt) || !sameFields(supplied, rebuilt)) throw new TypeError("Policy history disagrees with canonical reconstruction.");
}
function freezeCopy<T>(value: T): T {
  const copy = structuredClone(value);
  function freeze(nested: unknown): void {
    if (typeof nested !== "object" || nested === null) return;
    for (const child of Object.values(nested)) freeze(child);
    Object.freeze(nested);
  }
  freeze(copy);
  return copy;
}
