import { createHash } from "node:crypto";
import { CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1, normalizeCanonicalStatisticalSeriesV1,
  type CanonicalStatisticalSeriesInputV1, type CanonicalStatisticalSeriesV1,
} from "../../services/canonicalObservationSeries";
import { fomcDocumentUrlV1, isCivilDateV1, EFFR_API_URL_V1 } from "./transport";
import { UsPolicyValidationError, type FomcFactV1 } from "./fomc";
import type { EffrFactV1 } from "../newYorkFed/effr";

export type UsPolicyFamilyV1 = "effr" | `fomc:${string}`;
const IDENTITY = "us-policy-evidence-v1";
const ANNOTATION = "us-policy-source-fact-v1";
export function getUsPolicySpecV1(family: UsPolicyFamilyV1) {
  if (family === "effr") return Object.freeze({ provider: "new-york-fed", source: "New York Fed Markets Data API",
    originalPublisher: "Federal Reserve Bank of New York", sourceUrl: EFFR_API_URL_V1, sourceSeriesId: "EFFR",
    canonicalSeriesId: "us-effective-federal-funds-rate-published-level", frequency: "daily" as const, unit: "percent",
    semantic: "published-volume-weighted-median-overnight-federal-funds-rate", volumeUnit: "billions of U.S. dollars" });
  if (typeof family !== "string" || !family.startsWith("fomc:") || !isCivilDateV1(family.slice(5))) throw new UsPolicyValidationError("source");
  const date = family.slice(5);
  return Object.freeze({ provider: "federal-reserve", source: "FOMC official publications",
    originalPublisher: "Board of Governors of the Federal Reserve System / FOMC", sourceUrl: fomcDocumentUrlV1(date),
    sourceSeriesId: `FOMC:target-range:${date}`, canonicalSeriesId: `us-fomc-policy-decision:${date}`,
    frequency: "event-date" as const, unit: "percent", semantic: "official-target-range-policy-decision", volumeUnit: null });
}
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function normalizeFact(family: UsPolicyFamilyV1, value: unknown): FomcFactV1 | EffrFactV1 {
  if (!record(value) || value.unit !== "percent" || Object.keys(value).length !== 9) throw new UsPolicyValidationError("annotation");
  if (family !== "effr") {
    const date = family.slice(5); getUsPolicySpecV1(family);
    if (value.decisionDate !== date || value.statementUrl !== fomcDocumentUrlV1(date) ||
        (value.implementationNoteUrl !== null && value.implementationNoteUrl !== fomcDocumentUrlV1(date, true))) throw new UsPolicyValidationError("source");
    if (!finite(value.targetLower) || !finite(value.targetUpper) || value.targetLower < 0 || value.targetUpper > 100 ||
        value.targetLower >= value.targetUpper) throw new UsPolicyValidationError("range");
    if (typeof value.action !== "string" || !["maintain", "raise", "lower"].includes(value.action)) throw new UsPolicyValidationError("annotation");
    if (value.effectiveDate !== null && (!isCivilDateV1(value.effectiveDate) || value.effectiveDate < date || value.implementationNoteUrl === null)) {
      throw new UsPolicyValidationError("date");
    }
    if (value.releaseTimestamp !== null && (!Number.isSafeInteger(value.releaseTimestamp) || Number(value.releaseTimestamp) < 0)) throw new UsPolicyValidationError("date");
    return Object.freeze({ decisionDate: date, targetLower: value.targetLower, targetUpper: value.targetUpper, unit: "percent",
      action: value.action as FomcFactV1["action"], statementUrl: value.statementUrl as string, implementationNoteUrl: value.implementationNoteUrl as string | null,
      effectiveDate: value.effectiveDate as string | null, releaseTimestamp: value.releaseTimestamp as number | null });
  }
  if (!isCivilDateV1(value.observationDate) || value.observationDate < "2016-03-01") throw new UsPolicyValidationError("date");
  if (!finite(value.rate) || value.volumeUnit !== "billions of U.S. dollars" ||
      (value.volumeInBillions !== null && (!finite(value.volumeInBillions) || value.volumeInBillions < 0))) throw new UsPolicyValidationError("value");
  if ((value.targetLower === null) !== (value.targetUpper === null) ||
      (value.targetLower !== null && (!finite(value.targetLower) || !finite(value.targetUpper) || value.targetLower > value.targetUpper))) throw new UsPolicyValidationError("range");
  if (value.footnoteId !== null && (!Number.isSafeInteger(value.footnoteId) || Number(value.footnoteId) < 0)) throw new UsPolicyValidationError("annotation");
  if (value.revisionIndicator !== null && (typeof value.revisionIndicator !== "string" || value.revisionIndicator.length > 256)) throw new UsPolicyValidationError("annotation");
  return Object.freeze({ observationDate: value.observationDate, rate: value.rate, unit: "percent", volumeInBillions: value.volumeInBillions as number | null,
    volumeUnit: "billions of U.S. dollars", targetLower: value.targetLower as number | null, targetUpper: value.targetUpper as number | null,
    footnoteId: value.footnoteId as number | null, revisionIndicator: value.revisionIndicator as string | null });
}
function status(fact: FomcFactV1 | EffrFactV1): string { return JSON.stringify([ANNOTATION, fact]); }
/** Source normalization has no capture clock or persistence side effects. */
export function normalizeUsPolicySourceFactsV1(family: UsPolicyFamilyV1, input: readonly (FomcFactV1 | EffrFactV1)[]): readonly (FomcFactV1 | EffrFactV1)[] {
  getUsPolicySpecV1(family);
  if (!Array.isArray(input) || input.length === 0 || (family !== "effr" && input.length !== 1)) throw new UsPolicyValidationError("empty");
  const facts = Array.from(input).map((value) => normalizeFact(family, value));
  const date = (fact: FomcFactV1 | EffrFactV1) => "decisionDate" in fact ? fact.decisionDate : fact.observationDate;
  facts.sort((a, b) => date(a).localeCompare(date(b))); const unique: (FomcFactV1 | EffrFactV1)[] = [];
  for (const fact of facts) {
    const previous = unique.at(-1);
    if (previous !== undefined && date(previous) === date(fact)) {
      if (JSON.stringify(previous) !== JSON.stringify(fact)) throw new UsPolicyValidationError("duplicate-date"); continue;
    }
    unique.push(fact);
  }
  return Object.freeze(unique);
}
export function readUsPolicyFactsV1(family: UsPolicyFamilyV1, series: CanonicalStatisticalSeriesInputV1): readonly (FomcFactV1 | EffrFactV1)[] {
  const spec = getUsPolicySpecV1(family); const metadata = series.metadata;
  if (metadata.provenanceVersion !== CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1 || metadata.provider !== spec.provider ||
      metadata.source !== spec.source || metadata.originalPublisher !== spec.originalPublisher || metadata.sourceUrl !== spec.sourceUrl ||
      metadata.sourceSeriesId !== spec.sourceSeriesId || metadata.canonicalSeriesId !== spec.canonicalSeriesId ||
      metadata.frequency !== spec.frequency || metadata.unit !== spec.unit || metadata.substitution?.status !== "none" ||
      Object.keys(metadata.substitution).length !== 1 || !Number.isSafeInteger(metadata.fetchedAt) || metadata.fetchedAt < 0 ||
      !Array.isArray(series.observations) || series.observations.length === 0 || (family !== "effr" && series.observations.length !== 1)) throw new UsPolicyValidationError("source");
  const facts = series.observations.map((entry) => {
    if (typeof entry.officialStatus !== "string") throw new UsPolicyValidationError("annotation");
    let parsed: unknown;
    try { parsed = JSON.parse(entry.officialStatus); } catch { throw new UsPolicyValidationError("annotation"); }
    if (!Array.isArray(parsed) || parsed.length !== 2 || parsed[0] !== ANNOTATION) throw new UsPolicyValidationError("annotation");
    const fact = normalizeFact(family, parsed[1]);
    const date = "decisionDate" in fact ? fact.decisionDate : fact.observationDate;
    const value = "targetLower" in fact && "decisionDate" in fact ? fact.targetLower : (fact as EffrFactV1).rate;
    if (date !== entry.referencePeriod || value !== entry.value || status(fact) !== entry.officialStatus) throw new UsPolicyValidationError("annotation");
    return fact;
  });
  const release = family === "effr" ? null : (facts[0] as FomcFactV1).releaseTimestamp;
  if (release === null ? Object.hasOwn(metadata, "releaseTimestamp") : metadata.releaseTimestamp !== release) throw new UsPolicyValidationError("date");
  return Object.freeze(facts);
}
export function buildUsPolicySourceVersionIdV1(family: UsPolicyFamilyV1, series: CanonicalStatisticalSeriesInputV1): string {
  readUsPolicyFactsV1(family, series);
  const normalized = normalizeCanonicalStatisticalSeriesV1(series);
  return `${IDENTITY}:sha256:${createHash("sha256").update(JSON.stringify([IDENTITY, getUsPolicySpecV1(family),
    normalized.observations.map((entry) => [entry.referencePeriod, entry.value, entry.officialStatus])]), "utf8").digest("hex")}`;
}
export function buildUsPolicyCanonicalSeriesV1(family: UsPolicyFamilyV1, input: readonly (FomcFactV1 | EffrFactV1)[], fetchedAt: number): CanonicalStatisticalSeriesV1 {
  if (!Number.isSafeInteger(fetchedAt) || fetchedAt < 0) throw new UsPolicyValidationError("capture-time");
  const spec = getUsPolicySpecV1(family); const facts = normalizeUsPolicySourceFactsV1(family, input);
  const releaseTimestamp = family === "effr" ? null : (facts[0] as FomcFactV1 | undefined)?.releaseTimestamp;
  const series = { observations: facts.map((fact) => ({ referencePeriod: "decisionDate" in fact ? fact.decisionDate : fact.observationDate,
    value: "decisionDate" in fact ? fact.targetLower : fact.rate, officialStatus: status(fact) })), metadata: {
    provenanceVersion: CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1, provider: spec.provider, source: spec.source, originalPublisher: spec.originalPublisher,
    substitution: { status: "none" as const }, canonicalSeriesId: spec.canonicalSeriesId, sourceSeriesId: spec.sourceSeriesId, sourceUrl: spec.sourceUrl,
    sourceVersionId: "pending", frequency: spec.frequency, unit: spec.unit, fetchedAt,
    ...(releaseTimestamp === null || releaseTimestamp === undefined ? {} : { releaseTimestamp }),
  } };
  readUsPolicyFactsV1(family, series);
  return normalizeCanonicalStatisticalSeriesV1({ ...series, metadata: { ...series.metadata, sourceVersionId: buildUsPolicySourceVersionIdV1(family, series) } });
}
