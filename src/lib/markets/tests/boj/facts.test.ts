import assert from "node:assert/strict";
import { after, test } from "node:test";
import { parseBojPolicyDocumentV1, normalizeBojPolicyFactV1, BojPolicyValidationError, BOJ_POLICY_INSTRUMENT_V1 } from "../../providers/boj/facts";
import { buildBojPolicyEvidenceV1, readBojPolicyFactV1 } from "../../providers/boj/canonical";
import type { CanonicalStatisticalSeriesInputV1 } from "../../services/canonicalObservationSeries";
import { bojPolicyDocumentUrlV1 } from "../../providers/boj/transport";
import { document, date, captureTime, guideline } from "./fixtures";
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Live network forbidden"); };
after(() => { globalThis.fetch = originalFetch; });
const code = (expected: string) => (error: unknown) => error instanceof BojPolicyValidationError && error.code === expected;
const parse = (html: string) => parseBojPolicyDocumentV1({ ...document(), html }, date);

test("supported scalar guideline is bound to the official instrument, not unrelated rates", () => {
  for (const kind of ["statement", "guideline-change"] as const) {
    const fact = parseBojPolicyDocumentV1(document({ kind }), date);
    assert.equal(fact.instrument, BOJ_POLICY_INSTRUMENT_V1);
    assert.equal(fact.productId, "eurjpy");
    assert.deepEqual(fact.target, { shape: "scalar", value: 0.5, qualification: "around" });
    assert.equal(fact.unit, "percent");
    const evidence = buildBojPolicyEvidenceV1(fact, captureTime);
    assert.deepEqual(readBojPolicyFactV1(date, evidence).target, fact.target);
    assert.equal(Object.hasOwn(evidence, "observations"), false);
    assert.equal(fact.releaseTimestamp, null);
    assert.equal(fact.effectiveDate, "2025-01-27");
  }
});
test("March transition validates modern framework wording, range and distinct effective date", () => {
  const doc = document({ date: "2024-03-19", kind: "framework-transition", release: null });
  const fact = parseBojPolicyDocumentV1(doc, "2024-03-19");
  assert.deepEqual(fact.target, { shape: "range", lower: 0, upper: 0.1, qualification: "around" });
  assert.equal(fact.effectiveDate, "2024-03-21");
  const series = buildBojPolicyEvidenceV1(fact, captureTime);
  assert.equal(Object.hasOwn(series, "observations"), false);
  assert.equal(Object.hasOwn(series.fact.target, "value"), false);
  assert.deepEqual(readBojPolicyFactV1("2024-03-19", series), fact);
  assert.equal(series.metadata.fetchedAt, captureTime);
  assert.throws(() => parseBojPolicyDocumentV1({ ...doc, html: doc.html.replace("have fulfilled their roles", "remain the framework") }, "2024-03-19"), code("unsupported-historical-regime"));
  assert.throws(() => parseBojPolicyDocumentV1(document({ date: "2024-03-19" }), "2024-03-19"), code("unsupported-historical-regime"));
});
test("ordinary supported structure also preserves a bounded range", () => {
  assert.deepEqual(parseBojPolicyDocumentV1(document({ target: "0.5 to 0.75" }), date).target,
    { shape: "range", lower: 0.5, upper: 0.75, qualification: "around" });
});
test("pre-V1 historical documents fail closed even if a modern sentence is injected", () => {
  for (const oldDate of ["2024-01-23", "2024-03-18", "2016-01-29"]) {
    assert.throws(() => parseBojPolicyDocumentV1(document({ date: oldDate }), oldDate), code("unsupported-historical-regime"));
  }
});
test("YCC, reserve balances, discount/loan rates and observed rates cannot substitute", () => {
  for (const instrument of ["Policy-Rate Balances", "10-year JGB yield", "Basic Discount Rate", "Basic Loan Rate", "observed overnight call rate"]) {
    assert.throws(() => parse(document().html.replace(guideline(), guideline().replace("uncollateralized overnight call rate", instrument))), code("unsupported-instrument"));
  }
});
test("invalid target values, inverted/equal ranges and ambiguous wording fail", () => {
  for (const target of ["-0.1", "101", "0.5 to 0.1", "0.5 to 0.5"]) {
    assert.throws(() => parseBojPolicyDocumentV1(document({ target }), date), code("target"));
  }
  for (const target of ["0.5 or 0.75", "NaN", "0.5%", "about 0.5"]) {
    assert.throws(() => parseBojPolicyDocumentV1(document({ target }), date), code("unsupported-instrument"));
  }
});
test("changed structure, duplicate guideline, hidden content and broken footnotes fail closed", () => {
  const base = document().html;
  for (const html of [base.replace('id="contents"', 'id="article"'), base.replace("<!-- [END] CONTENT_1 -->", ""),
    base.replace("<h1>", "<h2>"), base.replace("</main>", ""), base.replace("</main>", "<main id=\"contents\"></main></main>"),
    base.replace(`<p>${guideline()}`, `<p>${guideline()}</p><p>${guideline()}`),
    base.replace("<!-- [START] CONTENT_2 -->", '<!-- [START] CONTENT_2 --><script>fake</script>'),
    base.replace('id="fn01"', 'id="fn99"')]) {
    assert.throws(() => parse(html), BojPolicyValidationError);
  }
});
test("document title/date/PDF identity and exact official URL are required", () => {
  assert.throws(() => parse(document().html.replace("January 24, 2025", "January 25, 2025")), code("date"));
  assert.throws(() => parse(document().html.replace("mpr_2025/k250124a.pdf", "mpr_2025/k250123a.pdf")), code("source"));
  assert.throws(() => parseBojPolicyDocumentV1({ ...document(), url: "https://example.com/decision" }, date), code("source"));
  assert.throws(() => parse(document().html.replace("<h1>Change in the Guideline for Money Market Operations", "<h1>Summary of Opinions")), code("document"));
  assert.throws(() => parseBojPolicyDocumentV1({ ...document(), url: bojPolicyDocumentUrlV1("2025-01-25") }, date), code("source"));
});
test("missing/unzoned/approximate/other-release timing remains null", () => {
  for (const release of [null, "Change in the Guideline for Money Market Operations -- Friday, January 24 at 12:23",
    "Change in the Guideline for Money Market Operations -- Friday, January 24 at around 12:23 JST",
    "Summary of Opinions -- Friday, January 24 at 12:23 JST"]) {
    assert.equal(parseBojPolicyDocumentV1(document({ release }), date).releaseTimestamp, null);
  }
});
test("explicit JST release evidence parses; meeting hours/updated metadata never substitute", () => {
  for (const zone of ["JST", "(Japan Standard Time)"]) {
    const fact = parseBojPolicyDocumentV1(document({ release: `Change in the Guideline for Money Market Operations -- Friday, January 24 at 12:23 ${zone}` }), date);
    assert.equal(fact.releaseTimestamp, Date.parse("2025-01-24T12:23:00+09:00") / 1000);
    assert.notEqual(fact.releaseTimestamp, captureTime);
    assert.equal(buildBojPolicyEvidenceV1(fact, captureTime).metadata.releaseTimestamp, fact.releaseTimestamp);
    assert.throws(() => buildBojPolicyEvidenceV1(fact, fact.releaseTimestamp! - 1), code("date"));
  }
  assert.throws(() => parseBojPolicyDocumentV1(document({ release: "Change in the Guideline for Money Market Operations -- Thursday, January 24 at 12:23 JST" }), date), code("date"));
});
test("effective date requires guideline-linked explicit evidence, not other facility timing", () => {
  assert.equal(parseBojPolicyDocumentV1(document({ effective: null }), date).effectiveDate, null);
  const unrelated = document().html.replace("The new guideline for money market operations", "The new basic loan rate");
  assert.equal(parse(unrelated).effectiveDate, null);
  assert.throws(() => parseBojPolicyDocumentV1(document({ effective: "tomorrow" }), date), code("date"));
  assert.throws(() => parseBojPolicyDocumentV1(document({ effective: "January 23, 2025" }), date), code("date"));
});
test("closed fact model rejects conflicting shapes, instrument/product changes and invalid dates", () => {
  const fact = parseBojPolicyDocumentV1(document(), date);
  for (const target of [{ shape: "scalar", value: 0.5, lower: 0, upper: 1, qualification: "around" },
    { shape: "range", value: 0.5, lower: 0, upper: 1, qualification: "around" },
    { shape: "range", lower: 1, upper: 0, qualification: "around" }, { shape: "scalar", value: Infinity, qualification: "around" }]) {
    assert.throws(() => normalizeBojPolicyFactV1({ ...fact, target }), code("target"));
  }
  assert.throws(() => normalizeBojPolicyFactV1({ ...fact, productId: "eurusd" }), code("unsupported-instrument"));
  assert.throws(() => normalizeBojPolicyFactV1({ ...fact, instrument: "basic-loan-rate" }), code("unsupported-instrument"));
  assert.throws(() => normalizeBojPolicyFactV1({ ...fact, extra: true }), code("annotation"));
  assert.throws(() => normalizeBojPolicyFactV1({ ...fact, effectiveDate: "2025-02-30" }), code("date"));
});
test("source identity is deterministic; capture time alone and unrelated source text do not change it", () => {
  const fact = parseBojPolicyDocumentV1(document(), date);
  const original = buildBojPolicyEvidenceV1(fact, captureTime);
  assert.equal(buildBojPolicyEvidenceV1(fact, captureTime + 1).metadata.sourceVersionId, original.metadata.sourceVersionId);
  assert.equal(buildBojPolicyEvidenceV1(parse(document().html.replace("Basic loan rate 0.75", "Basic loan rate 0.85")), captureTime).metadata.sourceVersionId, original.metadata.sourceVersionId);
  assert.deepEqual(buildBojPolicyEvidenceV1(fact, captureTime), original);
});
test("material scalar/range/bounds/effective/release/source identity changes produce new versions", () => {
  const fact = parseBojPolicyDocumentV1(document(), date);
  const original = buildBojPolicyEvidenceV1(fact, captureTime).metadata.sourceVersionId;
  const variants = [
    { ...fact, target: { shape: "scalar" as const, value: 0.6, qualification: "around" as const } },
    { ...fact, target: { shape: "range" as const, lower: 0.5, upper: 0.75, qualification: "around" as const } },
    { ...fact, target: { shape: "range" as const, lower: 0.4, upper: 0.75, qualification: "around" as const } },
    { ...fact, target: { shape: "range" as const, lower: 0.5, upper: 0.8, qualification: "around" as const } },
    { ...fact, effectiveDate: "2025-01-28" },
    { ...fact, releaseTimestamp: Date.parse("2025-01-24T12:23:00+09:00") / 1000 },
    { ...fact, documentKind: "statement" as const },
    parseBojPolicyDocumentV1(document({ date: "2025-01-25", effective: null }), "2025-01-25"),
  ];
  const versions = variants.map((variant) => buildBojPolicyEvidenceV1(variant, captureTime).metadata.sourceVersionId);
  assert.equal(new Set([original, ...versions]).size, variants.length + 1);
});

test("a second guideline elsewhere or a hidden selected policy paragraph cannot become canonical", () => {
  const html = document().html;
  assert.throws(() => parse(html.replace("<!-- [END] CONTENT_2 -->", '<p>' + guideline("0.75") + '</p><!-- [END] CONTENT_2 -->')), code("ambiguous"));
  assert.throws(() => parse(html.replace('<p>' + guideline(), '<p hidden="hidden">' + guideline())), code("document"));
  assert.throws(() => parse(html.replace('<p>' + guideline(), '<p style="display: none">' + guideline())), code("document"));
});
test("duplicated timing/footnote evidence and oversized direct parser input fail closed", () => {
  const base = document().html;
  assert.throws(() => parse(base.replace('<dt>Release dates and times:</dt>', '<dt>Release dates and times:</dt><dd>Change in the Guideline for Money Market Operations -- Friday, January 24 at 12:23 JST</dd>')), code("ambiguous"));
  assert.throws(() => parse(base.replace('<!-- [END] CONTENT_2 -->', '<ol><li id="fn01">Duplicate footnote</li></ol><!-- [END] CONTENT_2 -->')), BojPolicyValidationError);
  assert.throws(() => parse(base + ' '.repeat(2 * 1024 * 1024)), code("document"));
});


test("range evidence cannot supply a numeric observation or scalar alias, including a fabricated midpoint", () => {
  for (const target of ["0 to 0.1", "0.5 to 0.75"]) {
    const evidence = buildBojPolicyEvidenceV1(parseBojPolicyDocumentV1(document({ target }), date), captureTime);
    assert.deepEqual(Object.keys(evidence).sort(), ["fact", "metadata", "schemaVersion"]);
    assert.deepEqual(Object.keys(evidence.fact.target).sort(), ["lower", "qualification", "shape", "upper"]);
    if (evidence.fact.target.shape !== "range") assert.fail("Range required");
    // @ts-expect-error Structured BoJ evidence must not satisfy the numeric series API.
    const numericSeries: CanonicalStatisticalSeriesInputV1 = evidence;
    assert.equal(Object.hasOwn(numericSeries, "observations"), false);
    // @ts-expect-error Range targets have no scalar value field.
    assert.equal(evidence.fact.target.value, undefined);
    const { lower, upper } = evidence.fact.target;
    for (const value of [lower, upper, (lower + upper) / 2]) {
      assert.throws(() => readBojPolicyFactV1(date, { ...evidence, observations: [{ referencePeriod: date, value }] }), code("annotation"));
      assert.throws(() => readBojPolicyFactV1(date, { ...evidence, fact: { ...evidence.fact, target: { ...evidence.fact.target, value } } }), code("target"));
    }
    assert.equal(Object.isFrozen(evidence.fact.target), true);
  }
});


test("scalar targets including zero stay exact and distinct from a zero-based range", () => {
  for (const target of ["0", "0.1", "0.5", "0.75"]) {
    const evidence = buildBojPolicyEvidenceV1(parseBojPolicyDocumentV1(document({ target }), date), captureTime);
    assert.deepEqual(readBojPolicyFactV1(date, evidence).target, { shape: "scalar", value: Number(target), qualification: "around" });
  }
  const scalar = buildBojPolicyEvidenceV1(parseBojPolicyDocumentV1(document({ target: "0" }), date), captureTime);
  const range = buildBojPolicyEvidenceV1(parseBojPolicyDocumentV1(document({ target: "0 to 0.1" }), date), captureTime);
  assert.notEqual(scalar.metadata.sourceVersionId, range.metadata.sourceVersionId);
  assert.equal(buildBojPolicyEvidenceV1(range.fact, captureTime + 1).metadata.sourceVersionId, range.metadata.sourceVersionId);
});
