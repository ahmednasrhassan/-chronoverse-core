import { createHash } from "node:crypto";
import { CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1, normalizeCanonicalStatisticalSeriesV1,
  type CanonicalStatisticalObservationValueV1, type CanonicalStatisticalSeriesV1,
} from "../../services/canonicalObservationSeries";
import { BEA_API_URL_V1, assertBeaRequestV1, type BeaRequestV1, type BeaResponseV1 } from "./client";

export const BEA_MACRO_FAMILIES_V1 = Object.freeze(["real-gdp", "pce-price-index", "core-pce-price-index"] as const);
export type BeaMacroFamilyV1 = typeof BEA_MACRO_FAMILIES_V1[number];
export const BEA_PCE_FAMILIES_V1 = Object.freeze(["pce-price-index", "core-pce-price-index"] as const);
const common = Object.freeze({ provider: "bea", source: "BEA API", originalPublisher: "U.S. Bureau of Economic Analysis (BEA)",
  sourceUrl: BEA_API_URL_V1, dataset: "NIPA", calculation: "Level", semantic: "official-published-level",
  referenceYear: "from-linked-official-table-note", unitScale: "from-UNIT_MULT" });
const pce = Object.freeze({ ...common, tableName: "T20804", tableTitle:
  "Table 2.8.4. Price Indexes for Personal Consumption Expenditures by Major Type of Product, Monthly",
  frequency: "monthly" as const, apiFrequency: "M", metricName: "Fisher Price Index", unitMult: 0,
  unitSemantic: "price-index-reference-year-equals-100", seasonalAdjustment: "seasonally-adjusted" });

// Official evidence and the user-supplied live API verification are recorded in CONTRACT.md.
export const BEA_MACRO_SOURCE_SPECS_V1 = Object.freeze({
  "real-gdp": Object.freeze({ ...common, tableName: "T10106", tableTitle:
    "Table 1.1.6. Real Gross Domestic Product, Chained Dollars", lineNumber: "1", seriesCode: "A191RX",
    lineDescription: "Gross domestic product", sourceSeriesId: "NIPA:T10106:1:A191RX:Q",
    frequency: "quarterly" as const, apiFrequency: "Q", metricName: "Chained Dollars", unitMult: "from-UNIT_MULT",
    unitSemantic: "chained-reference-year-dollars", seasonalAdjustment: "seasonally-adjusted-at-annual-rates",
    canonicalSeriesId: "us-real-gdp-quarterly-published-level" }),
  "pce-price-index": Object.freeze({ ...pce, lineNumber: "1", seriesCode: "DPCERG",
    lineDescription: "Personal consumption expenditures (PCE)", sourceSeriesId: "NIPA:T20804:1:DPCERG:M",
    canonicalSeriesId: "us-pce-price-index-monthly-published-level" }),
  "core-pce-price-index": Object.freeze({ ...pce, lineNumber: "25", seriesCode: "DPCCRG",
    lineDescription: "PCE excluding food and energy", sourceSeriesId: "NIPA:T20804:25:DPCCRG:M",
    canonicalSeriesId: "us-core-pce-price-index-monthly-published-level" }),
});
const IDENTITY_VERSION = "bea-selected-series-v1";
const ANNOTATION_VERSION = "bea-source-notes-v1";
type Note = readonly [string, string];
interface Annotation {
  readonly tableName: string;
  readonly lineNumber: string;
  readonly seriesCode: string;
  readonly metricName: string;
  readonly calculation: string;
  readonly unitMult: number;
  readonly referenceYear: number;
  readonly notes: readonly Note[];
}
export interface BeaFactsV1 {
  readonly unit: string;
  readonly observations: readonly CanonicalStatisticalObservationValueV1[];
}
export class BeaMacroSeriesValidationError extends Error {
  constructor(readonly code: "family" | "source" | "observation" | "period" | "value" | "unit" |
    "annotation" | "duplicate-period" | "no-observations" | "capture-time") {
    super(`BEA source validation failed: ${code}.`);
    this.name = "BeaMacroSeriesValidationError";
  }
}
export function getBeaMacroSourceSpecV1(family: BeaMacroFamilyV1) {
  if (!Object.hasOwn(BEA_MACRO_SOURCE_SPECS_V1, family)) throw new BeaMacroSeriesValidationError("family");
  return BEA_MACRO_SOURCE_SPECS_V1[family];
}

/** Pure source validation. A missing selected datum is a gap; an unusable annotated row fails closed. */
export function parseBeaMacroSeriesFactsV1(family: BeaMacroFamilyV1, response: BeaResponseV1, request: BeaRequestV1): BeaFactsV1 {
  const spec = getBeaMacroSourceSpecV1(family);
  assertBeaRequestV1(request);
  assertBeaRequestV1(response.request);
  if (response.sourceUrl !== spec.sourceUrl || request.tableName !== spec.tableName || request.frequency !== spec.apiFrequency ||
      response.request.dataset !== request.dataset || response.request.tableName !== request.tableName ||
      response.request.frequency !== request.frequency ||
      [...response.request.years].sort().join(",") !== [...request.years].sort().join(",") ||
      !Array.isArray(response.data) || !Array.isArray(response.notes)) throw new BeaMacroSeriesValidationError("source");
  const noteMap = new Map<string, string>();
  for (const note of response.notes) {
    if (!isRecord(note) || typeof note.NoteRef !== "string" || !note.NoteRef.trim() ||
        typeof note.NoteText !== "string" || !note.NoteText.trim()) throw new BeaMacroSeriesValidationError("annotation");
    const previous = noteMap.get(note.NoteRef);
    if (previous !== undefined && previous !== note.NoteText) throw new BeaMacroSeriesValidationError("annotation");
    noteMap.set(note.NoteRef, note.NoteText);
  }
  const observations: CanonicalStatisticalObservationValueV1[] = [];
  let unit: string | undefined;
  for (const row of response.data) {
    if (!isRecord(row) || row.TableName !== request.tableName || typeof row.LineNumber !== "string" ||
        typeof row.SeriesCode !== "string") throw new BeaMacroSeriesValidationError("source");
    if (row.LineNumber !== spec.lineNumber) {
      if (row.SeriesCode === spec.seriesCode) throw new BeaMacroSeriesValidationError("source");
      continue; // BEA returns the entire table; other lines never become selected observations.
    }
    if (row.SeriesCode !== spec.seriesCode || row.LineDescription !== spec.lineDescription) throw new BeaMacroSeriesValidationError("source");
    const metric = row.METRIC_NAME ?? row.Metric_Name;
    if (metric !== spec.metricName || (row.METRIC_NAME !== undefined && row.Metric_Name !== undefined &&
        row.METRIC_NAME !== row.Metric_Name) || row.CL_UNIT !== spec.calculation) throw new BeaMacroSeriesValidationError("unit");
    const unitMult = parseUnitMult(row.UNIT_MULT);
    if (family !== "real-gdp" && unitMult !== 0) throw new BeaMacroSeriesValidationError("unit");
    const referencePeriod = parsePeriod(row.TimePeriod, spec.frequency, request.years);
    if (typeof row.NoteRef !== "string" || !row.NoteRef.trim()) throw new BeaMacroSeriesValidationError("annotation");
    const refs = row.NoteRef.split(",").map((ref) => ref.trim());
    if (refs.some((ref) => !ref) || !refs.includes(spec.tableName)) throw new BeaMacroSeriesValidationError("annotation");
    const notes: Note[] = [...new Set(refs)].sort().map((ref) => {
      const text = noteMap.get(ref);
      if (text === undefined) throw new BeaMacroSeriesValidationError("annotation");
      // The documented table-note suffix is revision timing, not selected fact content.
      return [ref, ref === spec.tableName ? text.split(" - LastRevised:", 1)[0]! : text];
    });
    const referenceYear = readReferenceYear(family, notes);
    const annotation: Annotation = { tableName: spec.tableName, lineNumber: spec.lineNumber, seriesCode: spec.seriesCode,
      metricName: spec.metricName, calculation: spec.calculation, unitMult, referenceYear, notes };
    const currentUnit = unitFor(family, annotation);
    if (unit !== undefined && unit !== currentUnit) throw new BeaMacroSeriesValidationError("unit");
    unit = currentUnit;
    // No undocumented missing-value markers are converted to facts or silently dropped.
    // Every NIPA row has a linked table annotation, so an unusable value cannot be discarded safely.
    if (row.DataValue === null || row.DataValue === "" || row.DataValue === "---" || row.DataValue === "(NA)") {
      throw new BeaMacroSeriesValidationError("annotation");
    }
    if (typeof row.DataValue !== "string" ||
        !/^[+-]?(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?|\.\d+)$/.test(row.DataValue)) {
      throw new BeaMacroSeriesValidationError("value");
    }
    const value = Number(row.DataValue.replaceAll(",", ""));
    if (!Number.isFinite(value)) throw new BeaMacroSeriesValidationError("value");
    observations.push({ referencePeriod, value, officialStatus: encodeAnnotation(annotation) });
  }
  if (unit === undefined) throw new BeaMacroSeriesValidationError("no-observations");
  return validateBeaFactsV1(family, { unit, observations });
}

function parsePeriod(value: unknown, frequency: "quarterly" | "monthly", years: readonly number[]): string {
  if (typeof value !== "string") throw new BeaMacroSeriesValidationError("period");
  const match = frequency === "quarterly" ? /^(\d{4})Q([1-4])$/.exec(value) : /^(\d{4})M(0?[1-9]|1[0-2])$/.exec(value);
  if (!match || !years.includes(Number(match[1]))) throw new BeaMacroSeriesValidationError("period");
  return frequency === "quarterly" ? `${match[1]}-Q${match[2]}` : `${match[1]}-${match[2]!.padStart(2, "0")}`;
}
function parseUnitMult(value: unknown): number {
  const result = typeof value === "number" ? value : typeof value === "string" && /^(?:0|-?[1-9]\d*)$/.test(value) ? Number(value) : NaN;
  // A bounded exponent is a validation limit, not an inferred unit or conversion.
  if (!Number.isSafeInteger(result) || Math.abs(result) > 18) throw new BeaMacroSeriesValidationError("unit");
  return result;
}
function readReferenceYear(family: BeaMacroFamilyV1, notes: readonly Note[]): number {
  const spec = getBeaMacroSourceSpecV1(family);
  const title = notes.find(([ref]) => ref === spec.tableName)?.[1];
  if (title === undefined || !title.startsWith(`${spec.tableTitle} [`)) throw new BeaMacroSeriesValidationError("annotation");
  const match = family === "real-gdp" ? /\[(?:Millions|Billions) of chained \((\d{4})\) dollars\]/.exec(title)
    : /\[Index numbers, (\d{4})=100(?:; seasonally adjusted)?\]/.exec(title);
  if (!match || Number(match[1]) < 1000) throw new BeaMacroSeriesValidationError("unit");
  return Number(match[1]);
}
function unitFor(family: BeaMacroFamilyV1, annotation: Annotation): string {
  return family === "real-gdp" ? `10^${annotation.unitMult} chained (${annotation.referenceYear}) dollars; seasonally adjusted at annual rates`
    : `index (${annotation.referenceYear}=100); seasonally adjusted`;
}
function encodeAnnotation(value: Annotation): string {
  return JSON.stringify([ANNOTATION_VERSION, value]);
}
function decodeAnnotation(family: BeaMacroFamilyV1, value: string | undefined): Annotation {
  if (value === undefined) throw new BeaMacroSeriesValidationError("annotation");
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new BeaMacroSeriesValidationError("annotation"); }
  if (!Array.isArray(parsed) || parsed.length !== 2 || parsed[0] !== ANNOTATION_VERSION || !isRecord(parsed[1])) {
    throw new BeaMacroSeriesValidationError("annotation");
  }
  const raw = parsed[1]; const spec = getBeaMacroSourceSpecV1(family);
  if (raw.tableName !== spec.tableName || raw.lineNumber !== spec.lineNumber || raw.seriesCode !== spec.seriesCode ||
      raw.metricName !== spec.metricName || raw.calculation !== spec.calculation || !Array.isArray(raw.notes)) {
    throw new BeaMacroSeriesValidationError("annotation");
  }
  const unitMult = parseUnitMult(raw.unitMult);
  if (family !== "real-gdp" && unitMult !== 0) throw new BeaMacroSeriesValidationError("unit");
  const notes: Note[] = raw.notes.map((note: unknown) => {
    if (!Array.isArray(note) || note.length !== 2 || note.some((part) => typeof part !== "string" || !part.trim())) {
      throw new BeaMacroSeriesValidationError("annotation");
    }
    return [note[0], note[1]];
  });
  if (notes.some(([ref], index) => index > 0 && ref <= notes[index - 1]![0])) throw new BeaMacroSeriesValidationError("annotation");
  const referenceYear = readReferenceYear(family, notes);
  if (notes.find(([ref]) => ref === spec.tableName)?.[1].includes(" - LastRevised:")) {
    throw new BeaMacroSeriesValidationError("annotation");
  }
  if (raw.referenceYear !== referenceYear) throw new BeaMacroSeriesValidationError("unit");
  const annotation = { tableName: spec.tableName, lineNumber: spec.lineNumber, seriesCode: spec.seriesCode,
    metricName: spec.metricName, calculation: spec.calculation, unitMult, referenceYear, notes };
  if (encodeAnnotation(annotation) !== value) throw new BeaMacroSeriesValidationError("annotation");
  return annotation;
}
function orderObservations(input: readonly CanonicalStatisticalObservationValueV1[]): readonly CanonicalStatisticalObservationValueV1[] {
  const result: CanonicalStatisticalObservationValueV1[] = [];
  for (const entry of [...input].sort((a, b) => a.referencePeriod.localeCompare(b.referencePeriod))) {
    const previous = result.at(-1);
    if (previous?.referencePeriod === entry.referencePeriod) {
      if (previous.value !== entry.value || previous.officialStatus !== entry.officialStatus) throw new BeaMacroSeriesValidationError("duplicate-period");
      continue;
    }
    result.push(Object.freeze({ ...entry }));
  }
  if (result.length === 0) throw new BeaMacroSeriesValidationError("no-observations");
  return Object.freeze(result);
}

export function validateBeaFactsV1(family: BeaMacroFamilyV1, facts: BeaFactsV1): BeaFactsV1 {
  const spec = getBeaMacroSourceSpecV1(family);
  if (!Array.isArray(facts.observations)) throw new BeaMacroSeriesValidationError("observation");
  for (const entry of facts.observations) {
    if (!isRecord(entry) || typeof entry.referencePeriod !== "string") throw new BeaMacroSeriesValidationError("observation");
    if (typeof entry.officialStatus !== "string") throw new BeaMacroSeriesValidationError("annotation");
    const pattern = spec.frequency === "quarterly" ? /^[1-9]\d{3}-Q[1-4]$/ : /^[1-9]\d{3}-(?:0[1-9]|1[0-2])$/;
    if (!pattern.test(entry.referencePeriod)) throw new BeaMacroSeriesValidationError("period");
    if (!Number.isFinite(entry.value)) throw new BeaMacroSeriesValidationError("value");
    if (unitFor(family, decodeAnnotation(family, entry.officialStatus)) !== facts.unit) throw new BeaMacroSeriesValidationError("unit");
  }
  return Object.freeze({ unit: facts.unit, observations: orderObservations(facts.observations) });
}

/** Chronoverse selected-content hash, never an official BEA revision identifier. */
export function buildBeaSelectedSeriesSourceVersionIdV1(family: BeaMacroFamilyV1, facts: BeaFactsV1): string {
  const normalized = validateBeaFactsV1(family, facts);
  const digest = createHash("sha256").update(JSON.stringify([IDENTITY_VERSION, getBeaMacroSourceSpecV1(family), normalized.unit,
    normalized.observations.map((entry) => [entry.referencePeriod, entry.value, entry.officialStatus])]), "utf8").digest("hex");
  return `${IDENTITY_VERSION}:sha256:${digest}`;
}
export function buildBeaCanonicalMacroSeriesV1(family: BeaMacroFamilyV1, facts: BeaFactsV1, fetchedAt: number): CanonicalStatisticalSeriesV1 {
  if (!Number.isSafeInteger(fetchedAt) || fetchedAt < 0) throw new BeaMacroSeriesValidationError("capture-time");
  const normalized = validateBeaFactsV1(family, facts); const spec = getBeaMacroSourceSpecV1(family);
  return normalizeCanonicalStatisticalSeriesV1({ observations: normalized.observations, metadata: {
    provenanceVersion: CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1, provider: spec.provider, source: spec.source,
    originalPublisher: spec.originalPublisher, substitution: { status: "none" }, canonicalSeriesId: spec.canonicalSeriesId,
    sourceSeriesId: spec.sourceSeriesId, sourceUrl: spec.sourceUrl, frequency: spec.frequency, fetchedAt, unit: normalized.unit,
    sourceVersionId: buildBeaSelectedSeriesSourceVersionIdV1(family, normalized),
  } });
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
