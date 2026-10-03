import assert from "node:assert/strict";
import { BLS_TIMESERIES_API_URL_V1 } from "../../providers/bls/client";
import { parseBlsMacroSeriesFactsV1, buildBlsCanonicalMacroSeriesV1,
  buildBlsSelectedSeriesSourceVersionIdV1, BlsMacroSeriesValidationError,
  BLS_CPI_ALL_ITEMS_NSA_SOURCE_SPEC_V1, isBlsOfficialStatusV1,
} from "../../providers/bls/macroSeries";

const request = { seriesId: "CUUR0000SA0" as const, startYear: 2025, endYear: 2026 };
const datum = (period = "M01", value: unknown = "310.250", footnotes: unknown[] = [{}]) =>
  ({ year: "2026", period, periodName: "January", value, footnotes });
const response = (data: unknown[] = [datum()], seriesID = "CUUR0000SA0") => ({
  sourceUrl: BLS_TIMESERIES_API_URL_V1,
  payload: { status: "REQUEST_SUCCEEDED", message: [], Results: { series: [{ seriesID, data }] } },
});
const parse = (data: unknown[]) => parseBlsMacroSeriesFactsV1("cpi-all-items-nsa", response(data), request);
const rejects = (fn: () => unknown, code: string) =>
  assert.throws(fn, (error) => error instanceof BlsMacroSeriesValidationError && error.code === code);

const facts = parse([datum("M12", "315"), datum("M01"), datum("M13", "999")]);
assert.deepEqual(facts.map((item) => item.referencePeriod), ["2026-01", "2026-12"]);
assert.deepEqual(facts.map((item) => item.value), [310.25, 315]);
const series = buildBlsCanonicalMacroSeriesV1("cpi-all-items-nsa", facts, 100);
assert.equal(series.metadata.sourceSeriesId, "CUUR0000SA0");
assert.equal(series.metadata.unit, "index (1982-84=100)");
assert.equal(series.metadata.originalPublisher, "U.S. Bureau of Labor Statistics (BLS)");
assert.equal(series.metadata.releaseTimestamp, undefined);
assert.equal(BLS_CPI_ALL_ITEMS_NSA_SOURCE_SPEC_V1.seasonalAdjustment, "not-seasonally-adjusted");
assert.equal(BLS_CPI_ALL_ITEMS_NSA_SOURCE_SPEC_V1.semantic, "published-index-level");
assert.equal(buildBlsCanonicalMacroSeriesV1("cpi-all-items-nsa", facts, 200).metadata.sourceVersionId, series.metadata.sourceVersionId);
assert.equal(buildBlsSelectedSeriesSourceVersionIdV1("cpi-all-items-nsa", [...facts].reverse()), series.metadata.sourceVersionId);
rejects(() => parseBlsMacroSeriesFactsV1("cpi-all-items-nsa", response([datum()], "CUSR0000SA0"), request), "source");
rejects(() => parseBlsMacroSeriesFactsV1("core" as "cpi-all-items-nsa", response(), request), "family");
rejects(() => parseBlsMacroSeriesFactsV1("cpi-all-items-nsa", { ...response(), sourceUrl: "https://example.com/" as typeof BLS_TIMESERIES_API_URL_V1 }, request), "source");
for (const period of ["M00", "M14", "M1", "Q01"]) rejects(() => parse([datum(period)]), "period");
rejects(() => parse([{ ...datum(), year: "2027" }]), "period");
for (const value of ["NaN", "Infinity", "1e309", "0x10", "  ", "1,000", 123, undefined]) {
  rejects(() => parse([{ ...datum(), value }]), "value");
}
const gaps = parse([datum("M01", ""), datum("M02", null), datum("M03", "-"),
  datum("M04", "."), datum("M05", "0"), datum("M06", "-1")]);
assert.deepEqual(gaps.map((item) => item.referencePeriod), ["2026-05", "2026-06"]);
assert.deepEqual(gaps.map((item) => item.value), [0, -1], "finite values not manufactured from missing markers");
for (const data of [[], [datum("M01", "")], [datum("M13", "1")]]) rejects(() => parse(data), "no-observations");
rejects(() => parse([datum("M01", "-", [{ code: "P", text: "Missing annotated fact" }])]), "annotation");
assert.equal(parse([datum(), datum()]).length, 1);
rejects(() => parse([datum(), datum("M01", "311")]), "duplicate-period");
const notes = [{ code: "P", text: " Official text " }, { text: "Other", code: "R" }];
const annotated = parse([datum("M01", "310.25", notes)]);
assert.deepEqual(JSON.parse(annotated[0]!.officialStatus!), ["bls-footnotes-v1",
  [["P", " Official text "], ["R", "Other"]]]);
assert.ok(isBlsOfficialStatusV1(annotated[0]!.officialStatus));
assert.equal(parse([datum("M01", "310.25", [...notes].reverse())])[0]!.officialStatus, annotated[0]!.officialStatus);
assert.notEqual(buildBlsSelectedSeriesSourceVersionIdV1("cpi-all-items-nsa", annotated), series.metadata.sourceVersionId);
assert.notEqual(buildBlsSelectedSeriesSourceVersionIdV1("cpi-all-items-nsa", parse([datum("M01", "311", notes)])),
  buildBlsSelectedSeriesSourceVersionIdV1("cpi-all-items-nsa", annotated));
assert.notEqual(buildBlsSelectedSeriesSourceVersionIdV1("cpi-all-items-nsa", parse([datum("M01", "310.25", [{ code: "P", text: "Changed" }])])),
  buildBlsSelectedSeriesSourceVersionIdV1("cpi-all-items-nsa", annotated));
rejects(() => parse([datum(), datum("M01", "310.25", notes)]), "duplicate-period");
for (const notes of [[{ code: 1 }], [{ text: null }], [{ unknown: "x" }]]) {
  rejects(() => parse([datum("M01", "1", notes)]), "annotation");
}
assert.equal(isBlsOfficialStatusV1("forged"), false);
assert.equal(isBlsOfficialStatusV1('["bls-footnotes-v1",[[null,null]]]'), false);
assert.ok(isBlsOfficialStatusV1(parse([datum("M01", "1", [{ code: "", text: "" }])])[0]!.officialStatus));
console.log("PASS: BLS monthly NSA index facts and captured-content identity V1");
