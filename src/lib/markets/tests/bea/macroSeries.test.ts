import assert from "node:assert/strict";
import { after, test } from "node:test";
import { parseBeaEnvelopeV1, type BeaResponseV1 } from "../../providers/bea/client";
import { BEA_MACRO_FAMILIES_V1, getBeaMacroSourceSpecV1, parseBeaMacroSeriesFactsV1,
  buildBeaCanonicalMacroSeriesV1, buildBeaSelectedSeriesSourceVersionIdV1, BeaMacroSeriesValidationError,
} from "../../providers/bea/macroSeries";
import { envelope, gdpRequest, pceRequest, row, canonical } from "./fixtures";

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Live network forbidden"); };
after(() => { globalThis.fetch = originalFetch; });
const code = (expected: string) => (error: unknown) => error instanceof BeaMacroSeriesValidationError && error.code === expected;

for (const family of BEA_MACRO_FAMILIES_V1) {
  const request = family === "real-gdp" ? gdpRequest : pceRequest;
  const facts = (payload = envelope(request)) => parseBeaMacroSeriesFactsV1(family, parseBeaEnvelopeV1(payload, request), request);

  test(`${family} binds official publisher/table/line/code/frequency and published level units`, () => {
    const spec = getBeaMacroSourceSpecV1(family); const series = canonical(family, 123);
    assert.equal(spec.provider, "bea"); assert.equal(spec.dataset, "NIPA"); assert.equal(spec.calculation, "Level");
    assert.equal(spec.originalPublisher, "U.S. Bureau of Economic Analysis (BEA)");
    assert.equal(spec.tableName, family === "real-gdp" ? "T10106" : "T20804");
    assert.equal(spec.lineNumber, family === "core-pce-price-index" ? "25" : "1");
    assert.equal(spec.seriesCode, family === "real-gdp" ? "A191RX" : family === "pce-price-index" ? "DPCERG" : "DPCCRG");
    assert.equal(series.metadata.frequency, family === "real-gdp" ? "quarterly" : "monthly");
    assert.equal(series.metadata.unit, family === "real-gdp" ? "10^6 chained (2017) dollars; seasonally adjusted at annual rates" : "index (2017=100); seasonally adjusted");
    assert.equal(series.metadata.fetchedAt, 123); assert.ok(!Object.hasOwn(series.metadata, "releaseTimestamp"));
    assert.equal(series.metadata.substitution?.status, "none");
  });

  test(`${family} normalizes official periods, comma formatting, chronological order and zero without filling gaps`, () => {
    const payload = envelope(request);
    payload.BEAAPI.Results.Data = family === "real-gdp" ?
      [row(family, "2025Q4", "1,234.50"), row(family, "2025Q1", "0")] :
      [row(family, "2025M12", "1,234.50"), row(family, "2025M1", "0")];
    const result = facts(payload);
    assert.deepEqual(result.observations.map((entry) => [entry.referencePeriod, entry.value]),
      family === "real-gdp" ? [["2025-Q1", 0], ["2025-Q4", 1234.5]] : [["2025-01", 0], ["2025-12", 1234.5]]);
    assert.ok(Object.isFrozen(result.observations));
  });

  test(`${family} rejects malformed/non-finite values and unusable annotated rows`, () => {
    for (const value of ["NaN", "Infinity", "1e3", " 1 ", "12,34", "1,23,456", "1.2.3", "9".repeat(400), 100, undefined]) {
      const payload = envelope(request); payload.BEAAPI.Results.Data = [row(family, undefined, value)];
      // undefined uses the fixture default, so install it explicitly.
      payload.BEAAPI.Results.Data[0]!.DataValue = value;
      assert.throws(() => facts(payload), code("value"));
    }
    for (const value of [null, "", "---", "(NA)"]) {
      const payload = envelope(request); payload.BEAAPI.Results.Data = [row(family, undefined, value)];
      assert.throws(() => facts(payload), code("annotation"));
    }
    const empty = envelope(request); empty.BEAAPI.Results.Data = [];
    assert.throws(() => facts(empty), code("no-observations"));
  });

  test(`${family} rejects periods, source substitutions, metric/calculation/scale mismatches`, () => {
    const selected = row(family);
    for (const [field, value] of Object.entries({ TableName: "T20304", SeriesCode: "market-based-code",
      LineDescription: "Market-based PCE", TimePeriod: family === "real-gdp" ? "2025Q5" : "2025M13",
      METRIC_NAME: "Current Dollars", CL_UNIT: "Percent change, annual rate", UNIT_MULT: "invalid" })) {
      const payload = envelope(request); payload.BEAAPI.Results.Data = [{ ...selected, [field]: value }];
      assert.throws(() => facts(payload), BeaMacroSeriesValidationError);
    }
    for (const period of ["2024M01", "2024Q1", "2025", "2025-01", "2025-Q1", "2025M00", "2025M001",
      family === "real-gdp" ? "2025M01" : "2025Q1"]) {
      const payload = envelope(request); payload.BEAAPI.Results.Data = [row(family, period)];
      assert.throws(() => facts(payload), code("period"));
    }
    const wrongLine = envelope(request); wrongLine.BEAAPI.Results.Data = [{ ...selected, LineNumber: "30" }];
    assert.throws(() => facts(wrongLine), code("source"));
    if (family !== "real-gdp") {
      const scaled = envelope(request); scaled.BEAAPI.Results.Data = [{ ...selected, UNIT_MULT: "6" }];
      assert.throws(() => facts(scaled), code("unit"));
    }
    const other = family === "real-gdp" ? pceRequest : gdpRequest;
    assert.throws(() => parseBeaMacroSeriesFactsV1(family, parseBeaEnvelopeV1(envelope(other), other), other), code("source"));
    const foreign = { ...parseBeaEnvelopeV1(envelope(request), request), sourceUrl: "https://example.invalid/" } as unknown as BeaResponseV1;
    assert.throws(() => parseBeaMacroSeriesFactsV1(family, foreign, request), code("source"));
  });

  test(`${family} collapses identical duplicates, rejects value AND annotation conflicts`, () => {
    const payload = envelope(request); const selected = row(family);
    payload.BEAAPI.Results.Data = [selected, { ...selected }]; assert.equal(facts(payload).observations.length, 1);
    payload.BEAAPI.Results.Data[1]!.DataValue = "2"; assert.throws(() => facts(payload), code("duplicate-period"));
    payload.BEAAPI.Results.Notes.push({ NoteRef: `${request.tableName}.1`, NoteText: "Official annotation" });
    payload.BEAAPI.Results.Data[1] = { ...selected, NoteRef: `${request.tableName},${request.tableName}.1` };
    assert.throws(() => facts(payload), code("duplicate-period"));
  });

  test(`${family} safely preserves linked notes; unresolved or conflicting notes fail closed`, () => {
    const payload = envelope(request); payload.BEAAPI.Results.Data = [row(family)];
    payload.BEAAPI.Results.Notes.push({ NoteRef: `${request.tableName}.4`, NoteText: "Official explanation of scope." });
    payload.BEAAPI.Results.Data[0]!.NoteRef = `${request.tableName}.4, ${request.tableName}`;
    const original = facts(payload);
    assert.ok(original.observations[0]!.officialStatus!.includes("Official explanation of scope."));
    payload.BEAAPI.Results.Notes.reverse(); payload.BEAAPI.Results.Data[0]!.NoteRef = `${request.tableName},${request.tableName}.4`;
    assert.deepEqual(facts(payload), original);
    payload.BEAAPI.Results.Notes.push({ NoteRef: `${request.tableName}.4`, NoteText: "Conflicting official note." });
    assert.throws(() => facts(payload), code("annotation"));
    payload.BEAAPI.Results.Notes = [];
    assert.throws(() => facts(payload), code("annotation"));
  });

  test(`${family} hashes selected normalized content only and records revisions/rebasing`, () => {
    const payload = envelope(request); const original = facts(payload);
    const hash = buildBeaSelectedSeriesSourceVersionIdV1(family, original);
    assert.match(hash, /^bea-selected-series-v1:sha256:[a-f0-9]{64}$/);
    assert.equal(buildBeaCanonicalMacroSeriesV1(family, original, 100).metadata.sourceVersionId,
      buildBeaCanonicalMacroSeriesV1(family, original, 200).metadata.sourceVersionId);
    payload.BEAAPI.Request.RequestParam.reverse(); payload.BEAAPI.Request.RequestParam.find((param) => param.ParameterName === "USERID")!.ParameterValue = "another synthetic echo";
    payload.BEAAPI.Request.RequestParam.find((param) => param.ParameterName === "YEAR")!.ParameterValue = "2026,2025";
    payload.BEAAPI.Results.UTCProductionTime = "changed timing"; payload.BEAAPI.Results.Data.reverse();
    payload.BEAAPI.Results.Notes[0]!.NoteText = payload.BEAAPI.Results.Notes[0]!.NoteText.replace("September 30, 2026", "October 1, 2026");
    payload.BEAAPI.Results.Notes.push({ NoteRef: "irrelevant", NoteText: "Unlinked note" });
    payload.BEAAPI.Results.Data.push({ ...row(family), SeriesCode: "other", LineNumber: "99", DataValue: "garbage" });
    assert.equal(buildBeaSelectedSeriesSourceVersionIdV1(family, facts(payload)), hash);
    const selected = payload.BEAAPI.Results.Data.find((datum) => datum.SeriesCode === getBeaMacroSourceSpecV1(family).seriesCode)!;
    selected.DataValue = "101"; assert.notEqual(buildBeaSelectedSeriesSourceVersionIdV1(family, facts(payload)), hash);
    selected.DataValue = family === "real-gdp" ? "23,456,789" : family === "pce-price-index" ? "125.123" : "124.456";
    selected.NoteRef = `${request.tableName},${request.tableName}.4`;
    payload.BEAAPI.Results.Notes.push({ NoteRef: `${request.tableName}.4`, NoteText: "Meaningful official annotation" });
    const annotatedHash = buildBeaSelectedSeriesSourceVersionIdV1(family, facts(payload)); assert.notEqual(annotatedHash, hash);
    payload.BEAAPI.Results.Notes.at(-1)!.NoteText = "Revised official annotation";
    assert.notEqual(buildBeaSelectedSeriesSourceVersionIdV1(family, facts(payload)), annotatedHash);
    payload.BEAAPI.Results.Notes.find((note) => note.NoteRef === request.tableName)!.NoteText =
      payload.BEAAPI.Results.Notes.find((note) => note.NoteRef === request.tableName)!.NoteText.replaceAll("2017", "2022");
    const rebased = facts(payload); assert.ok(rebased.unit.includes("2022"));
    assert.notEqual(buildBeaSelectedSeriesSourceVersionIdV1(family, rebased), hash);
  });
}

test("three families cannot collide for identical numeric observations", () => {
  assert.equal(new Set(BEA_MACRO_FAMILIES_V1.map((family) => canonical(family, 100, 1).metadata.sourceVersionId)).size, 3);
});
test("GDP preserves published numeric scale; does not rescale or freeze reference year", () => {
  const payload = envelope(gdpRequest); payload.BEAAPI.Results.Data[0]!.UNIT_MULT = "9";
  const facts = parseBeaMacroSeriesFactsV1("real-gdp", parseBeaEnvelopeV1(payload, gdpRequest), gdpRequest);
  assert.equal(facts.observations[0]!.value, 23456789); assert.ok(facts.unit.startsWith("10^9"));
});
test("documented and current metric aliases agree; bad title and unsupported reference-year metadata fail closed", () => {
  const payload = envelope(pceRequest); const selected = payload.BEAAPI.Results.Data[0]!;
  selected.Metric_Name = selected.METRIC_NAME; delete selected.METRIC_NAME;
  assert.equal(parseBeaMacroSeriesFactsV1("pce-price-index", parseBeaEnvelopeV1(payload, pceRequest), pceRequest).observations.length, 1);
  selected.METRIC_NAME = "Current Dollars";
  assert.throws(() => parseBeaMacroSeriesFactsV1("pce-price-index", parseBeaEnvelopeV1(payload, pceRequest), pceRequest), code("unit"));
  delete selected.METRIC_NAME;
  payload.BEAAPI.Results.Notes[0]!.NoteText = "Table title without unit semantics";
  assert.throws(() => parseBeaMacroSeriesFactsV1("pce-price-index", parseBeaEnvelopeV1(payload, pceRequest), pceRequest), code("annotation"));
});

test("selected period ordering and identical duplicates do not change any family's hash", () => {
  for (const family of BEA_MACRO_FAMILIES_V1) {
    const request = family === "real-gdp" ? gdpRequest : pceRequest; const payload = envelope(request);
    payload.BEAAPI.Results.Data = [row(family), row(family, family === "real-gdp" ? "2026Q2" : "2026M06", "123")];
    const hash = () => buildBeaSelectedSeriesSourceVersionIdV1(family, parseBeaMacroSeriesFactsV1(family, parseBeaEnvelopeV1(payload, request), request));
    const original = hash(); payload.BEAAPI.Results.Data.reverse(); payload.BEAAPI.Results.Data.push({ ...payload.BEAAPI.Results.Data[0]! });
    assert.equal(hash(), original);
  }
});
