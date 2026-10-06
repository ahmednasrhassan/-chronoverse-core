import { isDeepStrictEqual } from "node:util";
import type { BuildBilateralPolicyStateInputV1, InputUnavailableReason, SuppliedEvidence } from "./bilateralPolicyState";
import { parseEventInstantV1 } from "./eventClock";
import { ecbMonetaryPolicyCanonicalEventIdV1, type EcbPolicyRateFactsV1 } from "./ecbMonetaryPolicy";
import { reconstructEcbMonetaryPolicyEventSnapshotV1 } from "./ecbPolicyDecisionEventClock";
import type { EcbMonetaryPolicyEventSnapshotV1 } from "./ecbMonetaryPolicyMemory";
import { buildCanonicalStatisticalSeriesSnapshotV1, type CanonicalStatisticalSeriesSnapshotV1 } from "../services/canonicalStatisticalSeriesMemory";
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

export const POLICY_EVENT_DECISION_EVIDENCE_SCHEMA_VERSION_V1 = "policy-event-decision-evidence-v1" as const;
type Product = BuildBilateralPolicyStateInputV1["productId"];
type Provider = "ecb" | "federal-reserve" | "boj" | "boe" | "snb";
interface InputBase { readonly evaluatedAt: string }
export type BuildPolicyEventDecisionEvidenceInputV1 = InputBase & (
  | { readonly productId: Product; readonly provider: "ecb"; readonly expectedEcbCanonicalEventId: string;
      readonly evidence: SuppliedEvidence<EcbMonetaryPolicyEventSnapshotV1> }
  | { readonly productId: "eurusd"; readonly provider: "federal-reserve"; readonly decisionDate: string;
      readonly evidence: SuppliedEvidence<CanonicalStatisticalSeriesSnapshotV1> }
  | { readonly productId: "eurjpy"; readonly provider: "boj"; readonly decisionDate: string;
      readonly evidence: SuppliedEvidence<BojPolicyEvidenceSnapshotV1> }
  | { readonly productId: "eurgbp"; readonly provider: "boe"; readonly publicationDate: string;
      readonly evidence: SuppliedEvidence<BoeBankRateEvidenceSnapshotV1> }
  | { readonly productId: "eurchf"; readonly provider: "snb"; readonly decisionDate: string;
      readonly evidence: SuppliedEvidence<SnbPolicyEvidenceSnapshotV1> }
);

type Rejection = { readonly availability: "unavailable";
  readonly reason: InputUnavailableReason | "KNOWLEDGE_INCONSISTENT"; readonly upstreamReason: string | null };
type Branch<T> = { readonly availability: "available"; readonly data: T } | Rejection;
type MissingAction = { readonly availability: "unavailable"; readonly reason: "SOURCE_ACTION_NOT_REPRESENTED" };
type MissingSetting = { readonly availability: "unavailable"; readonly reason: "POLICY_SETTING_UNAVAILABLE" };
type SnapshotMap = {
  ecb: EcbMonetaryPolicyEventSnapshotV1; "federal-reserve": CanonicalStatisticalSeriesSnapshotV1;
  boj: BojPolicyEvidenceSnapshotV1; boe: BoeBankRateEvidenceSnapshotV1; snb: SnbPolicyEvidenceSnapshotV1;
};
type FactMap = { ecb: EcbMonetaryPolicyEventSnapshotV1["event"]; "federal-reserve": FomcFactV1;
  boj: BojPolicyFactV1; boe: BoeBankRateFactV1; snb: SnbPolicyFactV1 };
type SettingMap = {
  ecb: EcbPolicyRateFactsV1;
  "federal-reserve": Pick<FomcFactV1, "targetLower" | "targetUpper" | "unit">;
  boj: Pick<BojPolicyFactV1, "target" | "unit">;
  boe: { readonly bankRate: number; readonly unit: "percent" };
  snb: { readonly policyRate: number; readonly unit: "percent" };
};
type ActionMap = { ecb: never; boj: never; "federal-reserve": FomcFactV1["action"];
  boe: BoeBankRateFactV1["decision"]["action"]; snb: SnbPolicyFactV1["decision"]["action"] };
type TimingMap = {
  ecb: { readonly scheduledAt: string; readonly decisionDate: string | null;
    readonly actualReleasedAt: string | null; readonly effectiveDate: string | null };
  "federal-reserve": Pick<FomcFactV1, "decisionDate" | "releaseTimestamp" | "effectiveDate">;
  boj: Pick<BojPolicyFactV1, "decisionDate" | "releaseTimestamp" | "effectiveDate">;
  boe: Pick<BoeBankRateFactV1, "meetingEndDate" | "publicationDate" | "releaseTimestamp" | "effectiveDate">;
  snb: Pick<SnbPolicyFactV1, "decisionDate" | "publicationDate" | "releaseTimestamp" | "effectiveDate">;
};
type EventReference<P extends Provider> = P extends "ecb"
  ? { readonly kind: "ecb-event"; readonly canonicalEventId: string; readonly eventSourceVersionId: string }
  : { readonly kind: "policy-series"; readonly canonicalSeriesId: string; readonly sourceVersionId: string };
type RequestedEvent<P extends Provider> = { readonly semantic: "request-metadata" } & (P extends "ecb"
  ? { readonly kind: "ecb-event"; readonly canonicalEventId: string }
  : { readonly kind: P extends "boe" ? "publication-date" : "decision-date"; readonly date: string });
type BoundProduct<P extends Provider> = Extract<BuildPolicyEventDecisionEvidenceInputV1, { provider: P }>["productId"];

/** Each available branch is bounded source evidence, without predecessor or publication-time inference. */
export type PolicyEventDecisionEvidenceV1 = { [P in Provider]: {
  readonly schemaVersion: typeof POLICY_EVENT_DECISION_EVIDENCE_SCHEMA_VERSION_V1;
  readonly semantic: "derived-feature"; readonly feature: "policy-event-decision-evidence";
  readonly coverage: "provided-evidence-only";
  readonly productId: BoundProduct<P>; readonly provider: P; readonly evaluatedAt: string;
  readonly requestedEvent: RequestedEvent<P>;
  readonly event: Branch<{ readonly canonicalReference: EventReference<P>; readonly knownAt: number;
    readonly timing: TimingMap[P] }>;
  readonly announcedSetting: Branch<SettingMap[P]> | MissingSetting;
  readonly sourceAction: P extends "ecb" | "boj" ? MissingAction | Rejection : Branch<ActionMap[P]>;
  readonly officialPredecessor: { readonly availability: "unavailable"; readonly reason: "OFFICIAL_PREDECESSOR_NOT_ESTABLISHED" };
  readonly evidenceKnownAt: number | null;
  /** Complete admitted snapshot, including instrument, source facts and provenance. */
  readonly auditEvidence: Branch<SnapshotMap[P]>;
} }[Provider];

type Admitted = { [P in Provider]: { provider: P; snapshot: SnapshotMap[P]; fact: FactMap[P] } }[Provider];
const COUNTERPARTY = { eurusd: "federal-reserve", eurjpy: "boj", eurgbp: "boe", eurchf: "snb" } as const;
const IDENTITY_KEY = { ecb: "expectedEcbCanonicalEventId", "federal-reserve": "decisionDate",
  boj: "decisionDate", boe: "publicationDate", snb: "decisionDate" } as const;
const INPUT_REASONS = { PRIMARY_SOURCE_UNAVAILABLE: true, RUNTIME_INACTIVE: true, NO_CAPTURED_EVIDENCE: true,
  NOT_KNOWN_AS_OF: true, CAPTURE_COVERAGE_UNKNOWN: true, STORED_STATE_INVALID: true, PERSISTENCE_UNAVAILABLE: true,
  UNSUPPORTED_SOURCE_CONTRACT: true, STALE_EVIDENCE: true, IDENTITY_CONFLICT: true } satisfies Record<InputUnavailableReason, true>;

/** INACTIVE single-event source view. No histories, action inference or numeric rate comparison. */
export function buildPolicyEventDecisionEvidenceV1(input: BuildPolicyEventDecisionEvidenceInputV1): PolicyEventDecisionEvidenceV1 {
  // Validate original objects before any projection can erase hidden/symbol fields.
  assertRecord(input);
  const provider = input.provider;
  if (typeof provider !== "string" || !Object.hasOwn(IDENTITY_KEY, provider)) throw new TypeError("Unsupported policy evidence provider.");
  const identityKey = IDENTITY_KEY[provider];
  assertKeys(input, ["productId", "provider", "evaluatedAt", identityKey, "evidence"]);
  const productId = input.productId;
  if (typeof productId !== "string" || !Object.hasOwn(COUNTERPARTY, productId) ||
      (provider !== "ecb" && provider !== COUNTERPARTY[productId])) throw new TypeError("Policy evidence product/provider mismatch.");
  const evaluatedAt = input.evaluatedAt;
  if (typeof evaluatedAt !== "string") throw new TypeError("Expected explicit evaluatedAt.");
  const evaluatedMs = parseEventInstantV1(evaluatedAt, "evaluatedAt");
  if (evaluatedMs < 0) throw new RangeError("evaluatedAt must be nonnegative.");
  const identity = Reflect.get(input, identityKey) as unknown;
  if (typeof identity !== "string") throw new TypeError("Expected policy event identity.");
  if (provider === "ecb") {
    const prefix = "ECB:ecb-monetary-policy-decision:";
    if (!identity.startsWith(prefix) || ecbMonetaryPolicyCanonicalEventIdV1(identity.slice(prefix.length)) !== identity) {
      throw new TypeError("Invalid expected ECB event identity.");
    }
  } else parseEventInstantV1(`${identity}T00:00:00Z`, identityKey);
  const evidence = input.evidence;
  assertRecord(evidence);
  const status = evidence.status;
  assertKeys(evidence, status === "supplied" ? ["status", "snapshot"] : ["status", "reason", "upstreamReason"]);
  const base = { schemaVersion: POLICY_EVENT_DECISION_EVIDENCE_SCHEMA_VERSION_V1,
    semantic: "derived-feature" as const, feature: "policy-event-decision-evidence" as const,
    coverage: "provided-evidence-only" as const, productId, provider, evaluatedAt: new Date(evaluatedMs).toISOString(),
    requestedEvent: provider === "ecb" ? { semantic: "request-metadata" as const, kind: "ecb-event" as const, canonicalEventId: identity }
      : { semantic: "request-metadata" as const, kind: provider === "boe" ? "publication-date" as const : "decision-date" as const, date: identity },
    officialPredecessor: { availability: "unavailable" as const, reason: "OFFICIAL_PREDECESSOR_NOT_ESTABLISHED" as const } };
  let rejected: Rejection | null = null;
  let admitted: Admitted | null = null;
  if (status === "unavailable") {
    const { reason, upstreamReason } = evidence;
    if (typeof reason !== "string" || !Object.hasOwn(INPUT_REASONS, reason) ||
        (upstreamReason !== null && typeof upstreamReason !== "string")) throw new TypeError("Invalid unavailable policy evidence.");
    rejected = { availability: "unavailable", reason, upstreamReason };
  } else if (status === "supplied") {
    admitted = rebuild(provider, identity, evidence.snapshot);
    if (admitted.snapshot.knownAt > Math.floor(evaluatedMs / 1_000)) {
      rejected = { availability: "unavailable", reason: "KNOWLEDGE_INCONSISTENT", upstreamReason: null };
    }
  } else throw new TypeError("Invalid policy evidence discriminator.");
  if (rejected !== null) return freezeCopy({ ...base, event: rejected, announcedSetting: rejected,
    sourceAction: rejected, auditEvidence: rejected, evidenceKnownAt: null } as PolicyEventDecisionEvidenceV1);
  if (admitted === null) throw new TypeError("Expected admitted canonical evidence.");
  const branches = describe(admitted);
  return freezeCopy({ ...base, ...branches, evidenceKnownAt: admitted.snapshot.knownAt } as PolicyEventDecisionEvidenceV1);
}

function rebuild(provider: Provider, identity: string, supplied: unknown): Admitted {
  assertRecord(supplied);
  switch (provider) {
    case "ecb": {
      const snapshot = reconstructEcbMonetaryPolicyEventSnapshotV1(supplied as unknown as EcbMonetaryPolicyEventSnapshotV1);
      assertCanonical(supplied, snapshot);
      if (snapshot.canonicalEventId !== identity) throw new TypeError("ECB event identity mismatch.");
      return { provider, snapshot, fact: snapshot.event };
    }
    case "federal-reserve": {
      const source = supplied as unknown as CanonicalStatisticalSeriesSnapshotV1;
      const snapshot = buildCanonicalStatisticalSeriesSnapshotV1(source.series);
      assertCanonical(supplied, snapshot);
      const family = `fomc:${identity}` as const;
      const facts = readUsPolicyFactsV1(family, snapshot.series);
      const fact = facts[0];
      if (facts.length !== 1 || fact === undefined || !("decisionDate" in fact) ||
          snapshot.sourceVersionId !== buildUsPolicySourceVersionIdV1(family, snapshot.series)) throw new TypeError("Expected matching FOMC evidence.");
      return { provider, snapshot, fact };
    }
    case "boj": {
      const source = supplied as unknown as BojPolicyEvidenceSnapshotV1;
      const fact = readBojPolicyFactV1(identity, source.evidence);
      const evidence = buildBojPolicyEvidenceV1(fact, source.evidence.metadata.fetchedAt);
      const snapshot: BojPolicyEvidenceSnapshotV1 = { schemaVersion: "boj-policy-evidence-snapshot-v1", evidence,
        canonicalSeriesId: evidence.metadata.canonicalSeriesId, sourceVersionId: evidence.metadata.sourceVersionId, knownAt: evidence.metadata.fetchedAt };
      assertCanonical(supplied, snapshot);
      return { provider, snapshot, fact };
    }
    case "boe": {
      const source = supplied as unknown as BoeBankRateEvidenceSnapshotV1;
      const fact = readBoeBankRateFactV1(identity, source.evidence);
      const evidence = buildBoeBankRateEvidenceV1(fact, source.evidence.metadata.fetchedAt);
      const snapshot: BoeBankRateEvidenceSnapshotV1 = { schemaVersion: "boe-bank-rate-evidence-snapshot-v1", evidence,
        canonicalSeriesId: evidence.metadata.canonicalSeriesId, sourceVersionId: evidence.metadata.sourceVersionId, knownAt: evidence.metadata.fetchedAt };
      assertCanonical(supplied, snapshot);
      return { provider, snapshot, fact };
    }
    case "snb": {
      const source = supplied as unknown as SnbPolicyEvidenceSnapshotV1;
      const fact = readSnbPolicyFactV1(identity, source.evidence);
      const evidence = buildSnbPolicyEvidenceV1(fact, source.evidence.metadata.fetchedAt);
      const snapshot: SnbPolicyEvidenceSnapshotV1 = { schemaVersion: "snb-policy-evidence-snapshot-v1", evidence,
        canonicalSeriesId: evidence.metadata.canonicalSeriesId, sourceVersionId: evidence.metadata.sourceVersionId, knownAt: evidence.metadata.fetchedAt };
      assertCanonical(supplied, snapshot);
      return { provider, snapshot, fact };
    }
  }
}

function describe(child: Admitted) {
  const snapshot = child.snapshot;
  const knownAt = snapshot.knownAt;
  const auditEvidence = available(snapshot);
  const missingAction: MissingAction = { availability: "unavailable", reason: "SOURCE_ACTION_NOT_REPRESENTED" };
  if (child.provider === "ecb") {
    const fact = child.fact;
    const decision = fact.decision;
    return { auditEvidence,
      event: available({ canonicalReference: { kind: "ecb-event", canonicalEventId: fact.canonicalEventId,
        eventSourceVersionId: fact.sourceVersionId }, knownAt,
        timing: { scheduledAt: fact.schedule.scheduledAt, decisionDate: decision?.decisionDate ?? null,
          actualReleasedAt: decision?.actualReleasedAt ?? null, effectiveDate: decision?.rates?.effectiveDate ?? null } }),
      announcedSetting: decision?.rates == null ? { availability: "unavailable", reason: "POLICY_SETTING_UNAVAILABLE" } : available(decision.rates),
      sourceAction: missingAction };
  }
  const fact = child.fact;
  const canonicalReference = { kind: "policy-series", canonicalSeriesId: child.snapshot.canonicalSeriesId,
    sourceVersionId: child.snapshot.sourceVersionId };
  const timing = "meetingEndDate" in fact
    ? { meetingEndDate: fact.meetingEndDate, publicationDate: fact.publicationDate, releaseTimestamp: fact.releaseTimestamp, effectiveDate: fact.effectiveDate }
    : { decisionDate: fact.decisionDate, ...("publicationDate" in fact ? { publicationDate: fact.publicationDate } : {}),
      releaseTimestamp: fact.releaseTimestamp, effectiveDate: fact.effectiveDate };
  const event = available({ canonicalReference, knownAt, timing });
  switch (child.provider) {
    case "federal-reserve": return { auditEvidence, event,
      announcedSetting: available({ targetLower: child.fact.targetLower, targetUpper: child.fact.targetUpper, unit: child.fact.unit }),
      sourceAction: available(child.fact.action) };
    case "boj": return { auditEvidence, event, announcedSetting: available({ target: child.fact.target, unit: child.fact.unit }), sourceAction: missingAction };
    case "boe": return { auditEvidence, event, announcedSetting: available({ bankRate: child.fact.decision.rate, unit: child.fact.unit }), sourceAction: available(child.fact.decision.action) };
    case "snb": return { auditEvidence, event, announcedSetting: available({ policyRate: child.fact.decision.rate, unit: child.fact.unit }), sourceAction: available(child.fact.decision.action) };
  }
}

function available<T>(data: T) { return { availability: "available" as const, data }; }
function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("Expected policy evidence object.");
}
function assertKeys(value: unknown, keys: readonly string[]): void {
  assertRecord(value);
  if (Reflect.ownKeys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) throw new TypeError("Expected closed policy event evidence input.");
}
function assertCanonical(supplied: unknown, rebuilt: unknown): void {
  function sameFields(left: unknown, right: unknown): boolean {
    if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) return true;
    const keys = Reflect.ownKeys(left);
    return keys.length === Reflect.ownKeys(right).length && keys.every((key) =>
      Object.hasOwn(right, key) && sameFields(Reflect.get(left, key), Reflect.get(right, key)));
  }
  if (!isDeepStrictEqual(supplied, rebuilt) || !sameFields(supplied, rebuilt)) throw new TypeError("Policy evidence snapshot disagrees with canonical reconstruction.");
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
