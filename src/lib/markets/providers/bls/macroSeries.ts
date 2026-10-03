import { createHash } from "node:crypto";
import {
  CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1, normalizeCanonicalStatisticalSeriesV1,
  type CanonicalStatisticalObservationValueV1, type CanonicalStatisticalSeriesV1,
} from "../../services/canonicalObservationSeries";
import {
  assertBlsResponseEnvelopeV1, assertBlsTimeseriesRequestV1,
  assertBlsLaborTimeseriesRequestV1, BLS_LABOR_SERIES_IDS_V1,
  BLS_CPI_ALL_ITEMS_NSA_SERIES_ID_V1, BLS_TIMESERIES_API_URL_V1,
  type BlsTimeseriesRequestV1, type BlsTimeseriesResponseV1, type BlsLaborTimeseriesRequestV1,
} from "./client";

export const BLS_LABOR_FAMILIES_V1 = Object.freeze([
  "total-nonfarm-payroll-employment", "unemployment-rate", "average-hourly-earnings-total-private",
] as const);
export type BlsLaborFamilyV1 = typeof BLS_LABOR_FAMILIES_V1[number];
export type BlsMacroFamilyV1 = "cpi-all-items-nsa" | BlsLaborFamilyV1;
export const BLS_CPI_ALL_ITEMS_NSA_SOURCE_SPEC_V1 = Object.freeze({
  provider: "bls", source: "BLS Public Data API v2",
  originalPublisher: "U.S. Bureau of Labor Statistics (BLS)",
  sourceSeriesId: BLS_CPI_ALL_ITEMS_NSA_SERIES_ID_V1,
  sourceUrl: BLS_TIMESERIES_API_URL_V1,
  canonicalSeriesId: "us-cpi-u-city-average-all-items-nsa-index",
  program: "Consumer Price Index for All Urban Consumers (CPI-U)",
  area: "U.S. city average", item: "All items", seasonalAdjustment: "not-seasonally-adjusted",
  periodicity: "regular/monthly", basePeriod: "1982-84=100", frequency: "monthly" as const,
  unit: "index (1982-84=100)", semantic: "published-index-level",
});
// Semantics verified against the official series pages (not API-supplied catalog metadata):
// https://data.bls.gov/timeseries/CES0000000001
// https://data.bls.gov/timeseries/LNS14000000
// https://data.bls.gov/timeseries/CES0500000003
// Earnings dollar units: https://www.bls.gov/news.release/empsit.t19.htm
const laborSource = Object.freeze({
  provider: "bls", source: "BLS Public Data API v2",
  originalPublisher: "U.S. Bureau of Labor Statistics (BLS)", sourceUrl: BLS_TIMESERIES_API_URL_V1,
  seasonalAdjustment: "seasonally-adjusted", frequency: "monthly" as const,
});
export const BLS_TOTAL_NONFARM_PAYROLL_EMPLOYMENT_SOURCE_SPEC_V1 = Object.freeze({
  ...laborSource, sourceSeriesId: BLS_LABOR_SERIES_IDS_V1[0],
  canonicalSeriesId: "us-total-nonfarm-payroll-employment-sa-level",
  program: "Current Employment Statistics (CES)", survey: "establishment",
  industry: "Total nonfarm", population: "All employees",
  unit: "thousands of employees", semantic: "published-employment-level",
});
export const BLS_UNEMPLOYMENT_RATE_SOURCE_SPEC_V1 = Object.freeze({
  ...laborSource, sourceSeriesId: BLS_LABOR_SERIES_IDS_V1[1],
  canonicalSeriesId: "us-civilian-unemployment-rate-sa-level",
  program: "Current Population Survey (CPS)", survey: "household",
  population: "Civilian noninstitutional population, 16 years and over",
  unit: "percent", semantic: "published-rate-level",
});
export const BLS_AVERAGE_HOURLY_EARNINGS_TOTAL_PRIVATE_SOURCE_SPEC_V1 = Object.freeze({
  ...laborSource, sourceSeriesId: BLS_LABOR_SERIES_IDS_V1[2],
  canonicalSeriesId: "us-average-hourly-earnings-all-employees-total-private-sa-level",
  program: "Current Employment Statistics (CES)", survey: "establishment",
  industry: "Total private", population: "All employees",
  unit: "dollars per hour", semantic: "published-earnings-level",
});
const sourceSpecs = Object.freeze({
  "cpi-all-items-nsa": BLS_CPI_ALL_ITEMS_NSA_SOURCE_SPEC_V1,
  "total-nonfarm-payroll-employment": BLS_TOTAL_NONFARM_PAYROLL_EMPLOYMENT_SOURCE_SPEC_V1,
  "unemployment-rate": BLS_UNEMPLOYMENT_RATE_SOURCE_SPEC_V1,
  "average-hourly-earnings-total-private": BLS_AVERAGE_HOURLY_EARNINGS_TOTAL_PRIVATE_SOURCE_SPEC_V1,
});
const IDENTITY_VERSION = "bls-selected-series-v1";
const ANNOTATION_VERSION = "bls-footnotes-v1";

export class BlsMacroSeriesValidationError extends Error {
  constructor(readonly code:
    | "family" | "source" | "observation" | "period" | "value" | "annotation"
    | "duplicate-period" | "no-observations" | "capture-time",
  ) {
    super(`BLS source validation failed: ${code}.`);
    this.name = "BlsMacroSeriesValidationError";
  }
}

export function assertBlsMacroFamilyV1(family: BlsMacroFamilyV1): void {
  if (!Object.hasOwn(sourceSpecs, family)) throw new BlsMacroSeriesValidationError("family");
}

export function getBlsMacroSourceSpecV1(family: BlsMacroFamilyV1) {
  assertBlsMacroFamilyV1(family);
  return sourceSpecs[family];
}

/** Pure parsing; M13 annual averages are explicitly excluded, never mapped to a month. */
export function parseBlsMacroSeriesFactsV1(
  family: BlsMacroFamilyV1,
  response: BlsTimeseriesResponseV1,
  request: BlsTimeseriesRequestV1 | BlsLaborTimeseriesRequestV1,
): readonly CanonicalStatisticalObservationValueV1[] {
  assertBlsMacroFamilyV1(family);
  const spec = getBlsMacroSourceSpecV1(family);
  const requestedIds = "seriesIds" in request ? request.seriesIds : undefined;
  if ("seriesIds" in request) {
    assertBlsLaborTimeseriesRequestV1(request);
    if (family === "cpi-all-items-nsa") throw new BlsMacroSeriesValidationError("source");
  } else {
    assertBlsTimeseriesRequestV1(request);
    if (request.seriesId !== spec.sourceSeriesId) throw new BlsMacroSeriesValidationError("source");
  }
  if (response.sourceUrl !== BLS_TIMESERIES_API_URL_V1) throw new BlsMacroSeriesValidationError("source");
  assertBlsResponseEnvelopeV1(response.payload, requestedIds);
  const payload = response.payload as { Results: { series: { seriesID: string; data: unknown[] }[] } };
  const selected = payload.Results.series.find((series) => series.seriesID === spec.sourceSeriesId);
  if (selected === undefined) throw new BlsMacroSeriesValidationError("source");
  const observations: CanonicalStatisticalObservationValueV1[] = [];
  for (const raw of selected.data) {
    if (!isRecord(raw) || typeof raw.year !== "string" || !/^\d{4}$/.test(raw.year) ||
        typeof raw.period !== "string" || typeof raw.periodName !== "string" ||
        !Array.isArray(raw.footnotes)) throw new BlsMacroSeriesValidationError("observation");
    const year = Number(raw.year);
    if (year < request.startYear || year > request.endYear) throw new BlsMacroSeriesValidationError("period");
    if (raw.period === "M13") continue;
    if (!/^M(?:0[1-9]|1[0-2])$/.test(raw.period)) throw new BlsMacroSeriesValidationError("period");
    const officialStatus = encodeFootnotes(raw.footnotes);
    // Explicit unavailable markers are gaps. Everything else must be a decimal level.
    if (raw.value === null || raw.value === "" || raw.value === "-" || raw.value === ".") {
      // Do not drop a meaningful official annotation that the numeric contract cannot store.
      if (officialStatus !== undefined) throw new BlsMacroSeriesValidationError("annotation");
      continue;
    }
    if (typeof raw.value !== "string" || !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw.value)) {
      throw new BlsMacroSeriesValidationError("value");
    }
    const value = Number(raw.value);
    if (!Number.isFinite(value)) throw new BlsMacroSeriesValidationError("value");
    observations.push({ referencePeriod: `${raw.year}-${raw.period.slice(1)}`, value,
      ...(officialStatus === undefined ? {} : { officialStatus }) });
  }
  const ordered = observations.sort((left, right) => left.referencePeriod.localeCompare(right.referencePeriod));
  const unique: CanonicalStatisticalObservationValueV1[] = [];
  for (const observation of ordered) {
    const previous = unique.at(-1);
    if (previous?.referencePeriod === observation.referencePeriod) {
      if (previous.value !== observation.value || previous.officialStatus !== observation.officialStatus) {
        throw new BlsMacroSeriesValidationError("duplicate-period");
      }
      continue;
    }
    unique.push(Object.freeze(observation));
  }
  if (unique.length === 0) throw new BlsMacroSeriesValidationError("no-observations");
  return Object.freeze(unique);
}

/** Chronoverse content identity, NOT a claimed BLS publisher revision ID. */
export function buildBlsSelectedSeriesSourceVersionIdV1(
  family: BlsMacroFamilyV1,
  observations: readonly CanonicalStatisticalObservationValueV1[],
): string {
  assertBlsMacroFamilyV1(family);
  const ordered = [...observations].sort((left, right) => left.referencePeriod.localeCompare(right.referencePeriod));
  const digest = createHash("sha256").update(JSON.stringify([
    IDENTITY_VERSION, getBlsMacroSourceSpecV1(family),
    ordered.map((entry) => [entry.referencePeriod, entry.value, entry.officialStatus ?? null]),
  ]), "utf8").digest("hex");
  return `${IDENTITY_VERSION}:sha256:${digest}`;
}

export function buildBlsCanonicalMacroSeriesV1(
  family: BlsMacroFamilyV1,
  observations: readonly CanonicalStatisticalObservationValueV1[],
  fetchedAt: number,
): CanonicalStatisticalSeriesV1 {
  assertBlsMacroFamilyV1(family);
  if (!Number.isSafeInteger(fetchedAt) || fetchedAt < 0) throw new BlsMacroSeriesValidationError("capture-time");
  const spec = getBlsMacroSourceSpecV1(family);
  const metadata = {
    provenanceVersion: CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1,
    provider: spec.provider, source: spec.source, originalPublisher: spec.originalPublisher,
    substitution: { status: "none" as const }, canonicalSeriesId: spec.canonicalSeriesId,
    sourceSeriesId: spec.sourceSeriesId, sourceUrl: spec.sourceUrl,
    sourceVersionId: "pending", frequency: spec.frequency, fetchedAt, unit: spec.unit,
  };
  const normalized = normalizeCanonicalStatisticalSeriesV1({ observations, metadata });
  if (normalized.observations.length === 0) throw new BlsMacroSeriesValidationError("no-observations");
  return normalizeCanonicalStatisticalSeriesV1({ observations: normalized.observations,
    metadata: { ...metadata, sourceVersionId: buildBlsSelectedSeriesSourceVersionIdV1(family, normalized.observations) } });
}

/** Official code/text are opaque. Order is not meaningful; duplicates/content are retained. */
function encodeFootnotes(value: readonly unknown[]): string | undefined {
  const footnotes: Array<readonly [string | null, string | null]> = [];
  for (const entry of value) {
    if (!isRecord(entry) || Object.keys(entry).some((key) => key !== "code" && key !== "text") ||
        (entry.code !== undefined && typeof entry.code !== "string") ||
        (entry.text !== undefined && typeof entry.text !== "string")) {
      throw new BlsMacroSeriesValidationError("annotation");
    }
    if (Object.keys(entry).length === 0) continue; // Documented empty footnote object.
    footnotes.push([entry.code as string | undefined ?? null, entry.text as string | undefined ?? null]);
  }
  if (footnotes.length === 0) return undefined;
  footnotes.sort((left, right) => {
    const a = JSON.stringify(left), b = JSON.stringify(right);
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return JSON.stringify([ANNOTATION_VERSION, footnotes]);
}

export function isBlsOfficialStatusV1(value: string | undefined): boolean {
  if (value === undefined) return true;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length !== 2 || parsed[0] !== ANNOTATION_VERSION ||
        !Array.isArray(parsed[1]) || parsed[1].length === 0) return false;
    const raw = parsed[1].map((entry: unknown) => {
      if (!Array.isArray(entry) || entry.length !== 2 ||
          entry.some((part) => part !== null && typeof part !== "string") ||
          entry.every((part) => part === null)) throw new BlsMacroSeriesValidationError("annotation");
      return { ...(entry[0] === null ? {} : { code: entry[0] }),
        ...(entry[1] === null ? {} : { text: entry[1] }) };
    });
    return encodeFootnotes(raw) === value;
  } catch { return false; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
