import { createHash } from "node:crypto";
import {
  CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1,
  type CanonicalStatisticalSeriesMetadataV1,
} from "../../services/canonicalObservationSeries";
import { BoeBankRateValidationError, normalizeBoeBankRateFactV1, type BoeBankRateFactV1 } from "./facts";
import { boeBankRateDocumentUrlV1, isBoeCivilDateV1 } from "./transport";

const IDENTITY = "boe-bank-rate-evidence-v1";
export const BOE_BANK_RATE_EVIDENCE_SCHEMA_VERSION_V1 = "boe-bank-rate-evidence-v1" as const;

/** A Bank Rate fact names its instrument and official scalar decision; no storage carrier is public. */
export interface BoeBankRateEvidenceV1 {
  readonly schemaVersion: typeof BOE_BANK_RATE_EVIDENCE_SCHEMA_VERSION_V1;
  readonly fact: BoeBankRateFactV1;
  readonly metadata: CanonicalStatisticalSeriesMetadataV1;
}

export function getBoeBankRateSpecV1(publicationDate: string) {
  if (!isBoeCivilDateV1(publicationDate)) throw new BoeBankRateValidationError("date");
  return Object.freeze({ provider: "boe", source: "BoE official MPC Monetary Policy Summary and Minutes HTML",
    originalPublisher: "Bank of England", sourceUrl: boeBankRateDocumentUrlV1(publicationDate),
    sourceSeriesId: `BOE:Bank-Rate-decision:${publicationDate}`,
    canonicalSeriesId: `uk-boe-bank-rate-decision:${publicationDate}`, productId: "eurgbp" as const,
    frequency: "event-date" as const, unit: "percent", instrument: "Bank Rate",
    semantic: "announced-mpc-bank-rate-decision", rateRepresentation: "structured-scalar-decision" });
}

export function buildBoeBankRateSourceVersionIdV1(publicationDate: string, factInput: BoeBankRateFactV1): string {
  const fact = normalizeBoeBankRateFactV1(factInput);
  if (fact.publicationDate !== publicationDate) throw new BoeBankRateValidationError("source");
  return `${IDENTITY}:sha256:${createHash("sha256").update(JSON.stringify([
    IDENTITY, getBoeBankRateSpecV1(publicationDate), fact,
  ]), "utf8").digest("hex")}`;
}

export function buildBoeBankRateEvidenceV1(factInput: BoeBankRateFactV1, fetchedAt: number): BoeBankRateEvidenceV1 {
  const fact = normalizeBoeBankRateFactV1(factInput);
  if (!Number.isSafeInteger(fetchedAt) || fetchedAt < 0) throw new BoeBankRateValidationError("capture-time");
  if (fact.releaseTimestamp !== null && fact.releaseTimestamp > fetchedAt) throw new BoeBankRateValidationError("date");
  const spec = getBoeBankRateSpecV1(fact.publicationDate);
  return Object.freeze({ schemaVersion: BOE_BANK_RATE_EVIDENCE_SCHEMA_VERSION_V1, fact,
    metadata: Object.freeze({ provenanceVersion: CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1,
      provider: spec.provider, source: spec.source, originalPublisher: spec.originalPublisher,
      substitution: Object.freeze({ status: "none" as const }), canonicalSeriesId: spec.canonicalSeriesId,
      sourceSeriesId: spec.sourceSeriesId, sourceUrl: spec.sourceUrl,
      sourceVersionId: buildBoeBankRateSourceVersionIdV1(fact.publicationDate, fact),
      frequency: spec.frequency, unit: spec.unit, fetchedAt,
      ...(fact.releaseTimestamp === null ? {} : { releaseTimestamp: fact.releaseTimestamp }) }),
  });
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const sameKeys = (left: object, right: object): boolean => Reflect.ownKeys(left).length === Reflect.ownKeys(right).length &&
  Reflect.ownKeys(right).every((key) => Object.hasOwn(left, key));

/** Reject numeric carriers, extra fields, forged provenance and content identities. */
export function readBoeBankRateFactV1(publicationDate: string, evidence: unknown): BoeBankRateFactV1 {
  getBoeBankRateSpecV1(publicationDate);
  if (!record(evidence) || evidence.schemaVersion !== BOE_BANK_RATE_EVIDENCE_SCHEMA_VERSION_V1 ||
      !sameKeys(evidence, { schemaVersion: null, fact: null, metadata: null }) || !record(evidence.metadata)) {
    throw new BoeBankRateValidationError("annotation");
  }
  const fact = normalizeBoeBankRateFactV1(evidence.fact);
  if (fact.publicationDate !== publicationDate) throw new BoeBankRateValidationError("source");
  const expected = buildBoeBankRateEvidenceV1(fact, evidence.metadata.fetchedAt as number).metadata;
  const metadata = evidence.metadata;
  if (!sameKeys(metadata, expected) || !record(metadata.substitution) ||
      !sameKeys(metadata.substitution, { status: null }) || metadata.substitution.status !== "none" ||
      Object.entries(expected).some(([key, value]) => key !== "substitution" && metadata[key] !== value)) {
    throw new BoeBankRateValidationError("source");
  }
  return fact;
}
