import { createHash } from "node:crypto";
import {
  CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1,
  type CanonicalStatisticalSeriesMetadataV1,
} from "../../services/canonicalObservationSeries";
import { SnbPolicyValidationError, normalizeSnbPolicyFactV1, type SnbPolicyFactV1 } from "./facts";
import { snbPolicyDocumentUrlV1, isSnbCivilDateV1, SNB_POLICY_REGIME_START_V1 } from "./transport";

const IDENTITY = "snb-policy-evidence-v1";
export const SNB_POLICY_EVIDENCE_SCHEMA_VERSION_V1 = "snb-policy-evidence-v1" as const;

/** An SNB policy rate fact names its instrument and official scalar decision; no storage carrier is public. */
export interface SnbPolicyEvidenceV1 {
  readonly schemaVersion: typeof SNB_POLICY_EVIDENCE_SCHEMA_VERSION_V1;
  readonly fact: SnbPolicyFactV1;
  readonly metadata: CanonicalStatisticalSeriesMetadataV1;
}

export function getSnbPolicySpecV1(decisionDate: string) {
  if (!isSnbCivilDateV1(decisionDate)) throw new SnbPolicyValidationError("date");
  if (decisionDate < SNB_POLICY_REGIME_START_V1) throw new SnbPolicyValidationError("unsupported-regime");
  return Object.freeze({ provider: "snb", source: "SNB official Monetary policy assessment HTML",
    originalPublisher: "Swiss National Bank", sourceUrl: snbPolicyDocumentUrlV1(decisionDate),
    sourceSeriesId: `SNB:policy-rate-decision:${decisionDate}`,
    canonicalSeriesId: `switzerland-snb-policy-decision:${decisionDate}`, productId: "eurchf" as const,
    frequency: "event-date" as const, unit: "percent", instrument: "SNB policy rate",
    semantic: "announced-snb-policy-rate-decision", rateRepresentation: "structured-scalar-decision" });
}

export function buildSnbPolicySourceVersionIdV1(decisionDate: string, factInput: SnbPolicyFactV1): string {
  const fact = normalizeSnbPolicyFactV1(factInput);
  if (fact.decisionDate !== decisionDate) throw new SnbPolicyValidationError("source");
  return `${IDENTITY}:sha256:${createHash("sha256").update(JSON.stringify([
    IDENTITY, getSnbPolicySpecV1(decisionDate), fact,
  ]), "utf8").digest("hex")}`;
}

export function buildSnbPolicyEvidenceV1(factInput: SnbPolicyFactV1, fetchedAt: number): SnbPolicyEvidenceV1 {
  const fact = normalizeSnbPolicyFactV1(factInput);
  if (!Number.isSafeInteger(fetchedAt) || fetchedAt < 0) throw new SnbPolicyValidationError("capture-time");
  const spec = getSnbPolicySpecV1(fact.decisionDate);
  return Object.freeze({ schemaVersion: SNB_POLICY_EVIDENCE_SCHEMA_VERSION_V1, fact,
    metadata: Object.freeze({ provenanceVersion: CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1,
      provider: spec.provider, source: spec.source, originalPublisher: spec.originalPublisher,
      substitution: Object.freeze({ status: "none" as const }), canonicalSeriesId: spec.canonicalSeriesId,
      sourceSeriesId: spec.sourceSeriesId, sourceUrl: spec.sourceUrl,
      sourceVersionId: buildSnbPolicySourceVersionIdV1(fact.decisionDate, fact),
      frequency: spec.frequency, unit: spec.unit, fetchedAt }),
  });
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const sameKeys = (left: object, right: object): boolean => Reflect.ownKeys(left).length === Reflect.ownKeys(right).length &&
  Reflect.ownKeys(right).every((key) => Object.hasOwn(left, key));

/** Reject numeric carriers, extra fields, forged provenance and content identities. */
export function readSnbPolicyFactV1(decisionDate: string, evidence: unknown): SnbPolicyFactV1 {
  getSnbPolicySpecV1(decisionDate);
  if (!record(evidence) || evidence.schemaVersion !== SNB_POLICY_EVIDENCE_SCHEMA_VERSION_V1 ||
      !sameKeys(evidence, { schemaVersion: null, fact: null, metadata: null }) || !record(evidence.metadata)) {
    throw new SnbPolicyValidationError("annotation");
  }
  const fact = normalizeSnbPolicyFactV1(evidence.fact);
  if (fact.decisionDate !== decisionDate) throw new SnbPolicyValidationError("source");
  const expected = buildSnbPolicyEvidenceV1(fact, evidence.metadata.fetchedAt as number).metadata;
  const metadata = evidence.metadata;
  if (!sameKeys(metadata, expected) || !record(metadata.substitution) ||
      !sameKeys(metadata.substitution, { status: null }) || metadata.substitution.status !== "none" ||
      Object.entries(expected).some(([key, value]) => key !== "substitution" && metadata[key] !== value)) {
    throw new SnbPolicyValidationError("source");
  }
  return fact;
}
