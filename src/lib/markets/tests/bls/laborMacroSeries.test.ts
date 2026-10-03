import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { BLS_TIMESERIES_API_URL_V1, BlsTransportError } from "../../providers/bls/client";
import { BLS_LABOR_FAMILIES_V1, BLS_CPI_ALL_ITEMS_NSA_SOURCE_SPEC_V1,
  getBlsMacroSourceSpecV1, parseBlsMacroSeriesFactsV1, buildBlsCanonicalMacroSeriesV1,
  buildBlsSelectedSeriesSourceVersionIdV1, BlsMacroSeriesValidationError, isBlsOfficialStatusV1,
  type BlsLaborFamilyV1, type BlsMacroFamilyV1,
} from "../../providers/bls/macroSeries";
import { laborDatum, laborRequest, laborResponse } from "./laborFixtures";

const expected = [
  ["total-nonfarm-payroll-employment", "CES0000000001", "us-total-nonfarm-payroll-employment-sa-level",
    "thousands of employees", "establishment", "published-employment-level"],
  ["unemployment-rate", "LNS14000000", "us-civilian-unemployment-rate-sa-level",
    "percent", "household", "published-rate-level"],
  ["average-hourly-earnings-total-private", "CES0500000003", "us-average-hourly-earnings-all-employees-total-private-sa-level",
    "dollars per hour", "establishment", "published-earnings-level"],
] as const;
function parse(family: BlsLaborFamilyV1, data: ReturnType<typeof laborDatum>[]) {
  const response = laborResponse();
  response.payload.Results.series.find((entry) => entry.seriesID === getBlsMacroSourceSpecV1(family).sourceSeriesId)!.data = data;
  return parseBlsMacroSeriesFactsV1(family, response, laborRequest);
}
const hasCode = (code: BlsMacroSeriesValidationError["code"]) => (error: unknown) =>
  error instanceof BlsMacroSeriesValidationError && error.code === code;

for (const [family, id, canonicalId, unit, survey, semantic] of expected) {
  test(`${family} locks source identity, SA level, unit, frequency and survey`, () => {
    const spec = getBlsMacroSourceSpecV1(family);
    assert.equal(spec.sourceSeriesId, id); assert.equal(spec.canonicalSeriesId, canonicalId);
    assert.equal(spec.unit, unit); assert.equal(spec.frequency, "monthly");
    assert.equal(spec.seasonalAdjustment, "seasonally-adjusted"); assert.equal(spec.semantic, semantic);
    assert.ok("survey" in spec); assert.equal(spec.survey, survey);
    assert.equal(spec.program, survey === "household" ? "Current Population Survey (CPS)" : "Current Employment Statistics (CES)");
    if (family === "unemployment-rate") {
      assert.equal(spec.population, "Civilian noninstitutional population, 16 years and over");
    } else {
      assert.ok("industry" in spec); assert.equal(spec.industry, family === "total-nonfarm-payroll-employment" ? "Total nonfarm" : "Total private");
      assert.equal(spec.population, "All employees");
    }
    assert.equal(spec.sourceUrl, BLS_TIMESERIES_API_URL_V1); assert.equal(spec.provider, "bls");
    assert.equal(spec.source, "BLS Public Data API v2");
    assert.equal(spec.originalPublisher, "U.S. Bureau of Labor Statistics (BLS)");
    assert.ok(Object.isFrozen(spec));
    const series = buildBlsCanonicalMacroSeriesV1(family, parse(family, [laborDatum()]), 100);
    assert.equal(series.metadata.unit, unit); assert.equal(series.metadata.sourceSeriesId, id);
    assert.equal(series.metadata.canonicalSeriesId, canonicalId);
    assert.equal(series.metadata.releaseTimestamp, undefined);
    const substituted = laborResponse();
    substituted.payload.Results.series.find((entry) => entry.seriesID === id)!.seriesID = id.replace("CES", "CEU").replace("LNS", "LNU");
    assert.throws(() => parseBlsMacroSeriesFactsV1(family, substituted, laborRequest),
      (error) => error instanceof BlsTransportError && error.code === "schema");
  });

  test(`${family} normalizes M01-M12 chronologically, excludes M13, preserves zero and gaps`, () => {
    const months = Array.from({ length: 12 }, (_, index) => laborDatum(`M${String(index + 1).padStart(2, "0")}`, String(index)));
    const facts = parse(family, [...months].reverse().concat(laborDatum("M13", "999")));
    assert.deepEqual(facts.map((entry) => entry.referencePeriod), months.map((entry) => `2026-${entry.period.slice(1)}`));
    assert.deepEqual(facts.map((entry) => entry.value), Array.from({ length: 12 }, (_, index) => index));
    assert.equal(facts[0]!.value, 0);
    const gaps = parse(family, [laborDatum("M01", ""), laborDatum("M02", "-"), laborDatum("M03", null),
      laborDatum("M04", "."), laborDatum("M05", "0"), laborDatum("M12", "1")]);
    assert.deepEqual(gaps.map((entry) => entry.referencePeriod), ["2026-05", "2026-12"]);
    assert.deepEqual(gaps.map((entry) => entry.value), [0, 1]);
    assert.ok(Object.isFrozen(facts)); assert.ok(Object.isFrozen(facts[0]));
  });

  test(`${family} fails closed for malformed values, periods, structures and all-unusable facts`, () => {
    for (const value of ["NaN", "Infinity", "1e309", "0x10", "1,000", " ", "1e2", 1, undefined,
      "9".repeat(400)]) {
      assert.throws(() => parse(family, [{ ...laborDatum(), value }]), hasCode("value"));
    }
    for (const period of ["M00", "M14", "M1", "Q01"]) {
      assert.throws(() => parse(family, [laborDatum(period)]), hasCode("period"));
    }
    assert.throws(() => parse(family, [{ ...laborDatum(), year: "2027" }]), hasCode("period"));
    assert.throws(() => parse(family, [{ ...laborDatum(), year: "202" }]), hasCode("observation"));
    for (const data of [[], [laborDatum("M13")], [laborDatum("M01", "-")]]) {
      assert.throws(() => parse(family, data), hasCode("no-observations"));
    }
    const malformed = laborDatum(); Object.assign(malformed, { footnotes: null });
    assert.throws(() => parse(family, [malformed]), hasCode("observation"));
    assert.equal(parse(family, [laborDatum(), laborDatum()]).length, 1, "identical duplicates collapse as in CPI");
    assert.throws(() => parse(family, [laborDatum(), laborDatum("M01", "2")]), hasCode("duplicate-period"));
  });

  test(`${family} preserves versioned official annotations and rejects unrepresentable annotated gaps`, () => {
    const notes = [{ code: "P", text: " Preliminary. " }, { text: "Revised population controls", code: "12" }];
    const facts = parse(family, [laborDatum("M01", "1", notes)]);
    assert.ok(isBlsOfficialStatusV1(facts[0]!.officialStatus));
    assert.deepEqual(JSON.parse(facts[0]!.officialStatus!), ["bls-footnotes-v1",
      [["12", "Revised population controls"], ["P", " Preliminary. "]]]);
    assert.equal(parse(family, [laborDatum("M01", "1", [...notes].reverse())])[0]!.officialStatus, facts[0]!.officialStatus);
    assert.throws(() => parse(family, [laborDatum("M01", "-", [{ code: "9", text: "Data unavailable" }])]), hasCode("annotation"));
    assert.throws(() => parse(family, [laborDatum(), laborDatum("M01", "1", notes)]), hasCode("duplicate-period"));
    for (const footnotes of [[{ code: 1 }], [{ text: null }], [{ unexpected: "x" }]]) {
      assert.throws(() => parse(family, [laborDatum("M01", "1", footnotes)]), hasCode("annotation"));
    }
    assert.equal(isBlsOfficialStatusV1("forged"), false);
    assert.equal(isBlsOfficialStatusV1('["bls-footnotes-v1",[[null,null]]]'), false);
  });

  test(`${family} identity excludes capture/transport ordering and changes for value or annotation revision`, () => {
    const response = laborResponse();
    response.payload.Results.series.forEach((entry) => entry.data.push(laborDatum("M02", "9")));
    const facts = parseBlsMacroSeriesFactsV1(family, response, laborRequest);
    const first = buildBlsCanonicalMacroSeriesV1(family, facts, 100);
    response.payload.Results.series.reverse(); response.payload.responseTime = 999;
    response.payload.Results.series.forEach((entry) => entry.data.reverse());
    const later = buildBlsCanonicalMacroSeriesV1(family, parseBlsMacroSeriesFactsV1(family, response, laborRequest), 999);
    assert.equal(first.metadata.sourceVersionId, later.metadata.sourceVersionId);
    assert.equal(buildBlsCanonicalMacroSeriesV1(family,
      parseBlsMacroSeriesFactsV1(family, response, { ...laborRequest, startYear: 2026 }), 999).metadata.sourceVersionId,
    first.metadata.sourceVersionId, "request range is excluded when selected content is identical");
    assert.match(first.metadata.sourceVersionId, /^bls-selected-series-v1:sha256:[a-f0-9]{64}$/);
    assert.equal(buildBlsSelectedSeriesSourceVersionIdV1(family, [...facts].reverse()), first.metadata.sourceVersionId);
    assert.notEqual(buildBlsSelectedSeriesSourceVersionIdV1(family, facts.map((entry, index) => index === 0 ? { ...entry, value: 2 } : entry)), first.metadata.sourceVersionId);
    const annotated = parse(family, [laborDatum("M01", "1", [{ code: "P", text: "Preliminary" }])]);
    const changed = parse(family, [laborDatum("M01", "1", [{ code: "P", text: "Changed" }])]);
    assert.notEqual(buildBlsSelectedSeriesSourceVersionIdV1(family, annotated), buildBlsSelectedSeriesSourceVersionIdV1(family, changed));
    assert.notEqual(buildBlsSelectedSeriesSourceVersionIdV1(family, annotated), buildBlsSelectedSeriesSourceVersionIdV1(family,
      parse(family, [laborDatum("M01", "1", [{ code: "R", text: "Preliminary" }])])));
    assert.notEqual(buildBlsSelectedSeriesSourceVersionIdV1(family, annotated), buildBlsSelectedSeriesSourceVersionIdV1(family, parse(family, [laborDatum()])));
  });
}

test("family identities cannot collapse; CPI specification and preexisting identity inputs remain exact", () => {
  assert.deepEqual(BLS_LABOR_FAMILIES_V1, expected.map((entry) => entry[0]));
  const facts = [{ referencePeriod: "2026-01", value: 1 }];
  const families: BlsMacroFamilyV1[] = ["cpi-all-items-nsa", ...BLS_LABOR_FAMILIES_V1];
  assert.equal(new Set(families.map((family) => buildBlsSelectedSeriesSourceVersionIdV1(family, facts))).size, 4);
  const originalCpiSpec = {
    provider: "bls", source: "BLS Public Data API v2", originalPublisher: "U.S. Bureau of Labor Statistics (BLS)",
    sourceSeriesId: "CUUR0000SA0", sourceUrl: "https://api.bls.gov/publicAPI/v2/timeseries/data/",
    canonicalSeriesId: "us-cpi-u-city-average-all-items-nsa-index",
    program: "Consumer Price Index for All Urban Consumers (CPI-U)", area: "U.S. city average", item: "All items",
    seasonalAdjustment: "not-seasonally-adjusted", periodicity: "regular/monthly", basePeriod: "1982-84=100",
    frequency: "monthly", unit: "index (1982-84=100)", semantic: "published-index-level",
  };
  assert.equal(JSON.stringify(BLS_CPI_ALL_ITEMS_NSA_SOURCE_SPEC_V1), JSON.stringify(originalCpiSpec));
  const digest = createHash("sha256").update(JSON.stringify(["bls-selected-series-v1", originalCpiSpec, [["2026-01", 1, null]]])).digest("hex");
  assert.equal(buildBlsSelectedSeriesSourceVersionIdV1("cpi-all-items-nsa", facts), `bls-selected-series-v1:sha256:${digest}`);
  assert.throws(() => getBlsMacroSourceSpecV1("other" as BlsMacroFamilyV1), hasCode("family"));
  assert.throws(() => parseBlsMacroSeriesFactsV1("cpi-all-items-nsa", laborResponse(), laborRequest), hasCode("source"));
  assert.throws(() => parseBlsMacroSeriesFactsV1("unemployment-rate", laborResponse(),
    { seriesId: "CUUR0000SA0", startYear: 2025, endYear: 2026 }), hasCode("source"));
});
