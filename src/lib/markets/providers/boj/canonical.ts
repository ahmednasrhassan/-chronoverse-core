import { createHash } from "node:crypto";
import {
  CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1,
  type CanonicalStatisticalSeriesMetadataV1,
} from "../../services/canonicalObservationSeries";
import { BojPolicyValidationError, normalizeBojPolicyFactV1, BOJ_POLICY_INSTRUMENT_V1,
  BOJ_POLICY_REGIME_START_V1, type BojPolicyFactV1 } from "./facts";
import { bojPolicyDocumentUrlV1, isBojCivilDateV1 } from "./transport";

const IDENTITY = "boj-policy-evidence-v2";
export const BOJ_POLICY_EVIDENCE_SCHEMA_VERSION_V1 = "boj-policy-evidence-v1" as const;

/** A policy fact is a scalar/range union, never a generic numeric observation. */
export interface BojPolicyEvidenceV1 {
  readonly schemaVersion: typeof BOJ_POLICY_EVIDENCE_SCHEMA_VERSION_V1;
  readonly fact: BojPolicyFactV1;
  readonly metadata: CanonicalStatisticalSeriesMetadataV1;
}

export function getBojPolicySpecV1(decisionDate: string) {
  if (!isBojCivilDateV1(decisionDate)) throw new BojPolicyValidationError("date");
  if (decisionDate < BOJ_POLICY_REGIME_START_V1) throw new BojPolicyValidationError("unsupported-historical-regime");
  return Object.freeze({ provider: "boj", source: "BoJ official monetary-policy decision HTML",
    originalPublisher: "Bank of Japan", sourceUrl: bojPolicyDocumentUrlV1(decisionDate),
    sourceSeriesId: `BOJ:overnight-call-rate-guideline:${decisionDate}`,
    canonicalSeriesId: `japan-boj-policy-decision:${decisionDate}`, productId: "eurjpy" as const,
    frequency: "event-date" as const, unit: "percent", instrument: BOJ_POLICY_INSTRUMENT_V1,
    semantic: "announced-overnight-call-rate-guideline", targetRepresentation: "structured-scalar-or-range" });
}

export function buildBojPolicySourceVersionIdV1(decisionDate: string, factInput: BojPolicyFactV1): string {
  const fact = normalizeBojPolicyFactV1(factInput);
  if (fact.decisionDate !== decisionDate) throw new BojPolicyValidationError("source");
  return `${IDENTITY}:sha256:${createHash("sha256").update(JSON.stringify([
    IDENTITY, getBojPolicySpecV1(decisionDate), fact,
  ]), "utf8").digest("hex")}`;
}

export function buildBojPolicyEvidenceV1(factInput: BojPolicyFactV1, fetchedAt: number): BojPolicyEvidenceV1 {
  const fact = normalizeBojPolicyFactV1(factInput);
  if (!Number.isSafeInteger(fetchedAt) || fetchedAt < 0) throw new BojPolicyValidationError("capture-time");
  if (fact.releaseTimestamp !== null && fact.releaseTimestamp > fetchedAt) throw new BojPolicyValidationError("date");
  const spec = getBojPolicySpecV1(fact.decisionDate);
  return Object.freeze({ schemaVersion: BOJ_POLICY_EVIDENCE_SCHEMA_VERSION_V1, fact,
    metadata: Object.freeze({ provenanceVersion: CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1,
      provider: spec.provider, source: spec.source, originalPublisher: spec.originalPublisher,
      substitution: Object.freeze({ status: "none" as const }), canonicalSeriesId: spec.canonicalSeriesId,
      sourceSeriesId: spec.sourceSeriesId, sourceUrl: spec.sourceUrl,
      sourceVersionId: buildBojPolicySourceVersionIdV1(fact.decisionDate, fact),
      frequency: spec.frequency, unit: spec.unit, fetchedAt,
      ...(fact.releaseTimestamp === null ? {} : { releaseTimestamp: fact.releaseTimestamp }) }),
  });
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const sameKeys = (left: object, right: object): boolean => Reflect.ownKeys(left).length === Reflect.ownKeys(right).length &&
  Reflect.ownKeys(right).every((key) => Object.hasOwn(left, key));

/** Reject numeric carriers, extra fields, forged provenance and content identities. */
export function readBojPolicyFactV1(decisionDate: string, evidence: unknown): BojPolicyFactV1 {
  getBojPolicySpecV1(decisionDate);
  if (!record(evidence) || evidence.schemaVersion !== BOJ_POLICY_EVIDENCE_SCHEMA_VERSION_V1 ||
      !sameKeys(evidence, { schemaVersion: null, fact: null, metadata: null }) || !record(evidence.metadata)) {
    throw new BojPolicyValidationError("annotation");
  }
  const fact = normalizeBojPolicyFactV1(evidence.fact);
  if (fact.decisionDate !== decisionDate) throw new BojPolicyValidationError("source");
  const expected = buildBojPolicyEvidenceV1(fact, evidence.metadata.fetchedAt as number).metadata;
  const metadata = evidence.metadata;
  if (!sameKeys(metadata, expected) || !record(metadata.substitution) ||
      !sameKeys(metadata.substitution, { status: null }) || metadata.substitution.status !== "none" ||
      Object.entries(expected).some(([key, value]) => key !== "substitution" && metadata[key] !== value)) {
    throw new BojPolicyValidationError("source");
  }
  return fact;
}
