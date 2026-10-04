import assert from "node:assert/strict";
import { after, test } from "node:test";
import { parseBoeBankRateDocumentV1, normalizeBoeBankRateFactV1, boeLondonReleaseTimestampV1, BoeBankRateValidationError } from "../../providers/boe/facts";
import { buildBoeBankRateEvidenceV1, readBoeBankRateFactV1 } from "../../providers/boe/canonical";
import { boeBankRateDocumentUrlV1, BOE_BANK_RATE_MAX_RESPONSE_BYTES_V1 } from "../../providers/boe/transport";
import type { CanonicalStatisticalSeriesInputV1 } from "../../services/canonicalObservationSeries";
import { document, releaseNotice, date, captureTime } from "./fixtures";
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Live network forbidden"); };
after(() => { globalThis.fetch = originalFetch; });
const code = (expected: string) => (error: unknown) => error instanceof BoeBankRateValidationError && error.code === expected;
const parse = (html: string) => parseBoeBankRateDocumentV1({ ...document(), html }, date);

for (const [action, publication, meeting, expectedRate, change] of [
  ["maintain", "2026-09-17", "2026-09-16", 3.75, null],
  ["reduce", date, "2025-05-07", 4.25, 0.25],
  ["increase", "2023-08-03", "2023-08-02", 5.25, 0.25],
] as const) test(`verified ${action} layout retains the exact resulting Bank Rate and separate dates`, () => {
  const fact = parseBoeBankRateDocumentV1(document({ action }), publication);
  assert.deepEqual(fact.decision, { action, rate: expectedRate, changePercentagePoints: change });
  assert.equal(fact.institution, "Bank of England");
  assert.equal(fact.committee, "Monetary Policy Committee");
  assert.equal(fact.productId, "eurgbp");
  assert.equal(fact.instrument, "Bank Rate");
  assert.equal(fact.meetingEndDate, meeting);
  assert.equal(fact.publicationDate, publication);
  assert.equal(fact.unit, "percent");
});

test("minority rates in the summary and minutes never become the official rate", () => {
  for (const minority of ["Two members preferred to reduce Bank Rate by 3 percentage points, to 0.5%. Two members preferred to maintain Bank Rate at 99%.",
    "Four members voted to increase Bank Rate by 1 percentage points, to 20%."]) {
    assert.equal(parseBoeBankRateDocumentV1(document({ minority }), date).decision.rate, 4.25);
  }
  const html = document().html;
  assert.throws(() => parse(html.replace('the MPC voted by a majority of 5&ndash;4', 'two members preferred')), code("unsupported-wording"));
  assert.throws(() => parse(html.replace('5&ndash;4', '4&ndash;5')), code("unsupported-wording"));
  assert.throws(() => parse(html.replace('5&ndash;4', '5&ndash;3')), code("unsupported-wording"));
});

test("unrelated percentages, historical rates and forecasts do not select or revise the decision", () => {
  const fact = parseBoeBankRateDocumentV1(document(), date);
  const changed = parse(document().html.replace('SONIA 9%', 'SONIA 100%').replace('old Bank Rate 9%', 'old Bank Rate 0%').replace('market-implied rate 3.5%', 'market-implied rate 4.25%'));
  assert.deepEqual(changed, fact);
  assert.equal(buildBoeBankRateEvidenceV1(changed, captureTime).metadata.sourceVersionId, buildBoeBankRateEvidenceV1(fact, captureTime).metadata.sourceVersionId);
});

test("SONIA, ISONIA, gilt, OIS and mortgage rates cannot substitute for Bank Rate", () => {
  for (const instrument of ["SONIA", "ISONIA", "gilt yield", "OIS rate", "mortgage rate"]) {
    assert.throws(() => parse(document().html.replace('reduce Bank Rate by 0.25', `reduce ${instrument} by 0.25`)), code("unsupported-instrument"));
  }
});

test("publisher, exact canonical source and dated document identity are required", () => {
  assert.throws(() => parseBoeBankRateDocumentV1({ ...document(), url: "https://example.com/decision" }, date), code("source"));
  assert.throws(() => parse(document().html.replaceAll(' | Bank of England', ' | Other publisher')), code("source"));
  assert.throws(() => parse(document().html.replace('rel="canonical"', 'rel="alternate"')), code("source"));
  assert.throws(() => parse(document().html.replace('href="' + document().url, 'href="https://example.com/decision')), code("source"));
  assert.throws(() => parseBoeBankRateDocumentV1(document(), "2025-05-09"), code("date"));
  assert.throws(() => parseBoeBankRateDocumentV1({ ...document(), url: boeBankRateDocumentUrlV1("2025-06-19") }, date), code("source"));
});

test("meeting date, publication date, summary month, minutes and linked PDF must agree", () => {
  const html = document().html;
  for (const broken of [html.replace('Published on 8 May 2025', 'Published on 9 May 2025'),
    html.replace('Minutes of the Monetary Policy Committee meeting ending on 7 May 2025', 'Minutes of the Monetary Policy Committee meeting ending on 6 May 2025')]) assert.throws(() => parse(broken), code("date"));
  assert.throws(() => parseBoeBankRateDocumentV1(document({ meeting: "2025-05-09" }), date), code("date"));
  assert.throws(() => parse(html.replace('Monetary Policy Summary, May 2025', 'Monetary Policy Summary, June 2025')), code("unsupported-structure"));
  assert.throws(() => parse(html.replace('monetary-policy-summary-and-minutes-may-2025.pdf', 'monetary-policy-summary-and-minutes-june-2025.pdf')), code("unsupported-structure"));
});

test("changed layout, malformed HTML and hidden selected evidence fail closed", () => {
  const html = document().html;
  for (const broken of [html.replace('id="main-content"', 'id="article"'), html.replace('role="main"', 'role="region"'),
    html.replace('id="output"', 'id="new-output"'), html.replace('id="content"', 'id="article-content"'),
    html.replace('<h2>Monetary Policy Summary', '<h3>Monetary Policy Summary'), html.replace('</main>', ''),
    html.replace('</main>', '<main id="main-content" role="main"></main></main>'),
    html.replace('<p>At its meeting', '<p hidden="hidden">At its meeting'),
    html.replace('<p>At its meeting', '<p hidden>At its meeting'),
    html.replace('<section class="page-section">', '<section class="page-section" hidden>'),
    html.replace('<p>25: The Chair', '<p hidden>25: The Chair'),
    html.replace('<p>At its meeting', '<p style="display:none">At its meeting'),
    html.replace('The immediate policy decision</h3>', 'Policy discussion</h3>')]) assert.throws(() => parse(broken), BoeBankRateValidationError);
});

test("ambiguous committee candidates and conflicting official restatements fail", () => {
  assert.throws(() => parseBoeBankRateDocumentV1(document({ extra: '<p>The MPC decided to maintain Bank Rate at 99%.</p>' }), date), code("ambiguous"));
  assert.throws(() => parseBoeBankRateDocumentV1(document({ extra: '<p>At this meeting, the Committee voted to cut Bank Rate by 0.25%.</p>' }), date), code("unsupported-wording"));
  const decision = 'At its meeting ending on 7 May 2025, the MPC voted by a majority of 5–4 to maintain Bank Rate at 99%.';
  assert.throws(() => parseBoeBankRateDocumentV1(document({ extra: `<p>${decision}</p>` }), date), code("ambiguous"));
  assert.throws(() => parseBoeBankRateDocumentV1(document({ extra: '<p>At this meeting, the Committee voted to reduce Bank Rate to 4.5%, reflecting conditions.</p>' }), date), code("ambiguous"));
  assert.equal(parseBoeBankRateDocumentV1(document({ extra: '<p>At this meeting, the Committee voted to reduce Bank Rate to 4.25%, reflecting conditions.</p>' }), date).decision.rate, 4.25);
});

test("minutes proposition is committee-specific and must corroborate action/rate/change", () => {
  for (const proposition of ['Bank Rate should be reduced by 0.25 percentage points, to 4%.',
    'Bank Rate should be increased by 0.25 percentage points, to 4.25%.',
    'Bank Rate should be reduced by 0.5 percentage points, to 4.25%.']) {
    assert.throws(() => parseBoeBankRateDocumentV1(document({ proposition }), date), code("ambiguous"));
  }
  const html = document().html;
  assert.throws(() => parse(html.replace('Bank Rate should be reduced', 'SONIA should be reduced')), code("unsupported-structure"));
  assert.throws(() => parse(html.replace('<li>Bank Rate should', '<li>Bank Rate should be reduced by 0.25 percentage points, to 4.25%.</li><li>Bank Rate should')), code("ambiguous"));
});

test("unsupported decision wording and invalid scalar/change values are rejected", () => {
  for (const value of ["101", "1000"]) assert.throws(() => parseBoeBankRateDocumentV1(document({ rate: value }), date), code("rate"));
  for (const value of ["-0.1", "NaN", "Infinity", "4 to 4.25"]) assert.throws(() => parseBoeBankRateDocumentV1(document({ rate: value }), date), BoeBankRateValidationError);
  for (const change of ["0", "101"]) assert.throws(() => parseBoeBankRateDocumentV1(document({ change }), date), code("rate"));
  assert.throws(() => parse(document().html.replace('reduce Bank Rate by 0.25 percentage points, to 4.25%', 'reduce Bank Rate by 0.25 percentage points')), code("unsupported-wording"));
});

test("the resulting scalar is read directly, without creating a previous-rate fact", () => {
  const fact = parseBoeBankRateDocumentV1(document({ rate: "0", change: "0.25" }), date);
  assert.equal(fact.decision.rate, 0);
  assert.equal(Object.hasOwn(fact, "previousRate"), false);
  assert.equal(Object.hasOwn(fact.decision, "previousRate"), false);
});

test("missing time, generic noon convention and page metadata never create release time", () => {
  const doc = document({ extra: '<p>MPC decisions and minutes are normally published at 12 noon on announcement day, usually Thursday.</p>' });
  const fact = parseBoeBankRateDocumentV1(doc, date);
  assert.equal(fact.releaseTimestamp, null);
  assert.equal(fact.releaseEvidence, null);
  assert.equal(Object.hasOwn(buildBoeBankRateEvidenceV1(fact, captureTime).metadata, "releaseTimestamp"), false);
});

test("verified event-specific timing notice establishes 12:02 BST, not normal noon", () => {
  const fact = parseBoeBankRateDocumentV1(document(), date, releaseNotice());
  assert.equal(fact.releaseTimestamp, Date.parse("2025-05-08T12:02:00+01:00") / 1000);
  assert.notEqual(fact.releaseTimestamp, Date.parse("2025-05-08T12:00:00+01:00") / 1000);
  assert.equal(fact.releaseEvidence?.timezone, "BST");
  assert.equal(fact.releaseEvidence?.publicationDate, "2025-05-06");
  assert.equal(buildBoeBankRateEvidenceV1(fact, captureTime).metadata.releaseTimestamp, fact.releaseTimestamp);
  assert.throws(() => buildBoeBankRateEvidenceV1(fact, fact.releaseTimestamp! - 1), code("date"));
});

test("timing evidence cannot be borrowed from another event/source or an unzoned time", () => {
  assert.throws(() => parseBoeBankRateDocumentV1(document(), date, { ...releaseNotice(), url: "https://example.com/notice" }), code("source"));
  assert.throws(() => parseBoeBankRateDocumentV1(document({ action: "maintain" }), "2026-09-17", releaseNotice()), code("source"));
  assert.throws(() => parseBoeBankRateDocumentV1(document(), date, releaseNotice({ zone: "GMT" })), code("date"));
  assert.throws(() => parseBoeBankRateDocumentV1(document(), date, releaseNotice({ zone: "London" })), code("unsupported-wording"));
  assert.throws(() => parseBoeBankRateDocumentV1(document(), date, releaseNotice({ time: "12.60pm" })), code("date"));
  assert.throws(() => parseBoeBankRateDocumentV1(document(), date, releaseNotice({ date: "2025-05-09" })), code("date"));
  const notice = releaseNotice();
  assert.throws(() => parseBoeBankRateDocumentV1(document(), date, { ...notice, html: notice.html.replace('(BST) on Thursday 8 May', 'on Thursday 8 May') }), code("unsupported-wording"));
});

test("explicit GMT/BST conversion validates London rules including DST transitions", () => {
  assert.equal(boeLondonReleaseTimestampV1("2025-01-09", "12:00", "GMT"), Date.parse("2025-01-09T12:00:00Z") / 1000);
  assert.equal(boeLondonReleaseTimestampV1("2025-05-08", "12:02", "BST"), Date.parse("2025-05-08T11:02:00Z") / 1000);
  assert.throws(() => boeLondonReleaseTimestampV1("2025-01-09", "12:00", "BST"), code("date"));
  assert.throws(() => boeLondonReleaseTimestampV1("2025-07-10", "12:00", "GMT"), code("date"));
  for (const zone of ["GMT", "BST"] as const) assert.throws(() => boeLondonReleaseTimestampV1("2026-03-29", "01:30", zone), code("date"));
  assert.equal(boeLondonReleaseTimestampV1("2026-10-25", "01:30", "GMT") - boeLondonReleaseTimestampV1("2026-10-25", "01:30", "BST"), 3600);
});

test("summer and winter labels must match London's actual offset at the resulting instant", () => {
  assert.equal(boeLondonReleaseTimestampV1("2025-05-08", "12:02", "BST"), Date.parse("2025-05-08T11:02:00Z") / 1000);
  assert.throws(() => boeLondonReleaseTimestampV1("2025-05-08", "12:02", "GMT"), code("date"));
  // Helper-only winter evidence; this does not add a supported winter timing notice.
  assert.equal(boeLondonReleaseTimestampV1("2025-01-09", "12:00", "GMT"), Date.parse("2025-01-09T12:00:00Z") / 1000);
  assert.throws(() => boeLondonReleaseTimestampV1("2025-01-09", "12:00", "BST"), code("date"));
});

test("DST boundary labels are checked at the exact instant, including the gap and repeated hour", () => {
  for (const [date, localTime, zone, utc] of [
    ["2026-03-29", "00:59", "GMT", "2026-03-29T00:59:00Z"],
    ["2026-03-29", "02:00", "BST", "2026-03-29T01:00:00Z"],
    ["2026-10-25", "00:59", "BST", "2026-10-24T23:59:00Z"],
    ["2026-10-25", "02:00", "GMT", "2026-10-25T02:00:00Z"],
  ] as const) {
    assert.equal(boeLondonReleaseTimestampV1(date, localTime, zone), Date.parse(utc) / 1000);
    assert.throws(() => boeLondonReleaseTimestampV1(date, localTime, zone === "GMT" ? "BST" : "GMT"), code("date"));
  }
  for (const time of ["01:00", "01:30", "01:59"]) {
    for (const zone of ["GMT", "BST"] as const) assert.throws(() => boeLondonReleaseTimestampV1("2026-03-29", time, zone), code("date"));
  }
  // Both occurrences are valid; the explicit label selects the corresponding UTC instant.
  assert.equal(boeLondonReleaseTimestampV1("2026-10-25", "01:59", "BST"), Date.parse("2026-10-25T00:59:00Z") / 1000);
  assert.equal(boeLondonReleaseTimestampV1("2026-10-25", "01:00", "GMT"), Date.parse("2026-10-25T01:00:00Z") / 1000);
});

test("May notice and missing-evidence identities stay unchanged; invalid labels cannot receive an identity", () => {
  const missing = parseBoeBankRateDocumentV1(document(), date);
  const released = parseBoeBankRateDocumentV1(document(), date, releaseNotice());
  assert.equal(missing.releaseTimestamp, null);
  assert.equal(missing.releaseEvidence, null);
  assert.equal(released.releaseTimestamp, 1746702120);
  assert.equal(released.releaseEvidence?.localTime, "12:02");
  assert.equal(released.releaseEvidence?.timezone, "BST");
  // Captured from the actual implementation before this scoped hardening pass.
  for (const [fact, identity] of [
    [missing, "boe-bank-rate-evidence-v1:sha256:d14d51ed51ba332a0c2f1cb88a52b5fd17ea2e668ed278832b6029c6baf5f039"],
    [released, "boe-bank-rate-evidence-v1:sha256:db5c65777c000472c4136d9387d4ff11db251440250d5392e61d10423a97d799"],
  ] as const) {
    assert.equal(buildBoeBankRateEvidenceV1(fact, captureTime).metadata.sourceVersionId, identity);
    assert.equal(buildBoeBankRateEvidenceV1(fact, captureTime + 1).metadata.sourceVersionId, identity);
  }
  const invalid = { ...released, releaseTimestamp: Date.parse("2025-05-08T12:02:00Z") / 1000,
    releaseEvidence: { ...released.releaseEvidence!, timezone: "GMT" as const } };
  assert.throws(() => normalizeBoeBankRateFactV1(invalid), code("date"));
  assert.throws(() => buildBoeBankRateEvidenceV1(invalid, captureTime), code("date"));
  assert.throws(() => readBoeBankRateFactV1(date, { ...buildBoeBankRateEvidenceV1(released, captureTime), fact: invalid }), code("date"));
});

test("effective date remains unavailable without a verified instrument-specific contract", () => {
  assert.equal(parseBoeBankRateDocumentV1(document(), date).effectiveDate, null);
  assert.equal(parseBoeBankRateDocumentV1(document({ extra: '<p>Gilt sales are effective from 9 May 2025.</p>' }), date).effectiveDate, null);
  const fact = parseBoeBankRateDocumentV1(document(), date);
  assert.throws(() => normalizeBoeBankRateFactV1({ ...fact, effectiveDate: fact.publicationDate }), code("date"));
});

test("closed fact model rejects range shapes, aliases, unrelated instruments and invented timing", () => {
  const fact = parseBoeBankRateDocumentV1(document(), date);
  for (const decision of [{ ...fact.decision, lower: 4, upper: 4.25 }, { ...fact.decision, rate: Infinity },
    { ...fact.decision, action: "hold" }, { ...fact.decision, action: { toString: () => "reduce" } }, { ...fact.decision, action: "maintain", changePercentagePoints: 0 }]) assert.throws(() => normalizeBoeBankRateFactV1({ ...fact, decision }), code("rate"));
  assert.throws(() => normalizeBoeBankRateFactV1({ ...fact, instrument: "SONIA" }), code("unsupported-instrument"));
  assert.throws(() => normalizeBoeBankRateFactV1({ ...fact, productId: "eurjpy" }), code("unsupported-instrument"));
  assert.throws(() => normalizeBoeBankRateFactV1({ ...fact, releaseTimestamp: captureTime }), code("date"));
  assert.throws(() => normalizeBoeBankRateFactV1({ ...fact, extra: true }), code("annotation"));
});

test("structured evidence exposes the exact Bank Rate fact and cannot satisfy a numeric series API", () => {
  const fact = parseBoeBankRateDocumentV1(document(), date);
  const evidence = buildBoeBankRateEvidenceV1(fact, captureTime);
  assert.deepEqual(readBoeBankRateFactV1(date, evidence), fact);
  assert.equal(evidence.fact.decision.rate, 4.25);
  assert.equal(evidence.metadata.fetchedAt, captureTime);
  assert.equal(Object.hasOwn(evidence, "observations"), false);
  // @ts-expect-error BoE evidence deliberately cannot satisfy the numeric statistical series API.
  const numeric: CanonicalStatisticalSeriesInputV1 = evidence;
  assert.equal(Object.hasOwn(numeric, "observations"), false);
  assert.equal(Object.isFrozen(evidence.fact.decision), true);
  assert.throws(() => readBoeBankRateFactV1(date, { ...evidence, observations: [{ value: 1 }] }), code("annotation"));
});

test("identity is deterministic, capture-independent and changes for material decision/timing facts", () => {
  const fact = parseBoeBankRateDocumentV1(document(), date);
  const original = buildBoeBankRateEvidenceV1(fact, captureTime);
  assert.deepEqual(buildBoeBankRateEvidenceV1(fact, captureTime), original);
  assert.equal(buildBoeBankRateEvidenceV1(fact, captureTime + 1).metadata.sourceVersionId, original.metadata.sourceVersionId);
  const variants = [
    { ...fact, decision: { ...fact.decision, rate: 4.5 } },
    { ...fact, decision: { action: "increase" as const, rate: 4.25, changePercentagePoints: 0.25 } },
    { ...fact, decision: { ...fact.decision, changePercentagePoints: 0.5 } },
    { ...fact, meetingEndDate: "2025-05-06" },
    parseBoeBankRateDocumentV1(document(), date, releaseNotice()),
    parseBoeBankRateDocumentV1(document(), date, releaseNotice({ time: "12.03pm" })),
    parseBoeBankRateDocumentV1(document(), date, releaseNotice({ date: "2025-05-07" })),
  ];
  const ids = variants.map((variant) => buildBoeBankRateEvidenceV1(normalizeBoeBankRateFactV1(variant), captureTime).metadata.sourceVersionId);
  assert.equal(new Set([original.metadata.sourceVersionId, ...ids]).size, variants.length + 1);
});

test("oversized direct parser input and excessive nested structure fail closed", () => {
  assert.throws(() => parse(document().html + ' '.repeat(BOE_BANK_RATE_MAX_RESPONSE_BYTES_V1)), code("document"));
  const html = document().html.replace('Inflation 2%;', '<span>'.repeat(70) + 'Inflation 2%;' + '</span>'.repeat(70));
  assert.throws(() => parse(html), code("document"));
});
