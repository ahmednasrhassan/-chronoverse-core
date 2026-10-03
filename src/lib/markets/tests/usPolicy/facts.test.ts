import assert from "node:assert/strict";
import { after, test } from "node:test";
import { parseFomcStatementV1, attachFomcImplementationV1, UsPolicyValidationError } from "../../providers/federalReserve/fomc";
import { parseEffrFactsV1 } from "../../providers/newYorkFed/effr";
import { buildUsPolicyCanonicalSeriesV1, readUsPolicyFactsV1 } from "../../providers/federalReserve/canonical";
import { statement, implementation, date, maintain, effrRow, effrResponse, effrRequest, canonical, family, captureTime } from "./fixtures";
const originalFetch = globalThis.fetch; globalThis.fetch = async () => { throw new Error("Live network forbidden"); };
after(() => { globalThis.fetch = originalFetch; });
const code = (expected: string) => (error: unknown) => error instanceof UsPolicyValidationError && error.code === expected;

test("FOMC exact maintained bounds, separately verified effective date and explicit EST release", () => {
  const fact = parseFomcStatementV1(statement(), date);
  assert.equal(fact.targetLower, 4.25); assert.equal(fact.targetUpper, 4.5); assert.equal(fact.action, "maintain"); assert.equal(fact.unit, "percent");
  assert.equal(fact.effectiveDate, null); assert.equal(fact.releaseTimestamp, Date.parse("2025-01-29T19:00:00Z") / 1000);
  assert.equal(attachFomcImplementationV1(fact, implementation()).effectiveDate, "2025-01-30");
});
test("FOMC supported increase/decrease wording ignores dissent and unrelated inflation rates", () => {
  const up = parseFomcStatementV1(statement("The Committee seeks inflation of 2 percent. In support of these goals, the Committee decided to raise the target range for the federal funds rate to 5-1/4 to 5-1/2 percent.", "2023-07-26", "For release at 2:00 p.m. EDT", false), "2023-07-26");
  assert.equal(up.targetLower, 5.25); assert.equal(up.targetUpper, 5.5); assert.equal(up.action, "raise");
  assert.equal(up.releaseTimestamp, Date.parse("2023-07-26T18:00:00Z") / 1000);
  const down = parseFomcStatementV1(statement("In support of its goals, the Committee decided to lower the target range for the federal funds rate by 1/4 percentage point to 4-1/4 to 4-1/2 percent. A dissenting member preferred to maintain the target range for the federal funds rate at 4-1/2 to 4-3/4 percent."), date);
  assert.equal(down.action, "lower"); assert.equal(down.targetLower, 4.25); assert.equal(down.targetUpper, 4.5);
});
test("FOMC absent/ambiguous-zone release and missing note do not manufacture timestamps/dates", () => {
  for (const time of [null, "For release at 2:00 p.m. ET", "For release at approximately 2:00 p.m. EST"]) {
    const fact = parseFomcStatementV1(statement(maintain, date, time, false), date);
    assert.equal(fact.releaseTimestamp, null); assert.equal(fact.implementationNoteUrl, null); assert.equal(fact.effectiveDate, null);
    const series = buildUsPolicyCanonicalSeriesV1(family, [fact], captureTime);
    assert.ok(!Object.hasOwn(series.metadata, "releaseTimestamp"));
  }
});
test("FOMC unsafe percentages, malformed ranges and multiple decision candidates fail closed", () => {
  for (const sentence of ["Inflation is 2 percent. IORB is 4.4 percent.", "Maintain the target range at 4.25 to 4.5 percent.",
    maintain.replace("4-1/4 to 4-1/2", "4-1/2 to 4-1/4"), maintain.replace("4-1/4", "NaN"),
    maintain + " " + maintain, maintain + " " + maintain.replace("4-1/4", "invalid")]) {
    assert.throws(() => parseFomcStatementV1(statement(sentence), date), UsPolicyValidationError);
  }
  const nested = statement(); nested.html = nested.html.replace(`<p>${maintain}</p>`, `<blockquote><p>${maintain}</p></blockquote>`);
  assert.throws(() => parseFomcStatementV1(nested, date), code("range"));
});
test("FOMC malformed/source-mismatched structures and implementation conflicts fail closed", () => {
  const fact = parseFomcStatementV1(statement(), date);
  assert.throws(() => attachFomcImplementationV1(fact, implementation("4-1/2 to 4-3/4")), code("conflict"));
  for (const effective of ["February 30, 2025", "January 28, 2025"]) assert.throws(() => attachFomcImplementationV1(fact, implementation(undefined, effective)), code("date"));
  const bad = statement(); bad.html = bad.html.replace('role="main"', 'role="navigation"'); assert.throws(() => parseFomcStatementV1(bad, date), code("document"));
  assert.throws(() => parseFomcStatementV1({ ...statement(), url: "https://example.invalid/" }, date), code("source"));
  const badNote = implementation(); badNote.html = badNote.html.replace("Undertake open market operations", "Conduct repo operations");
  assert.throws(() => attachFomcImplementationV1(fact, badNote), code("range"));
});
test("FOMC official optional HTML tags, comments/raw text, main boundaries and malformed links", () => {
  const original = statement();
  const withDecoys = { ...original, html: original.html.replace("<body>", `<body><!-- <div id="content" role="main">fake</div> -->
    <script>const x = '<div id="content" role="main">fake</div>';</script>
    <aside><div id="content" role="main">fake</div></aside>`) };
  assert.deepEqual(parseFomcStatementV1(withDecoys, date), parseFomcStatementV1(original, date));
  const duplicate = { ...original, html: original.html + '<div id="content" role="main"></div>' };
  assert.throws(() => parseFomcStatementV1(duplicate, date), code("ambiguous"));
  const unclosed = { ...original, html: original.html.replace('</div></body>', '</body>') };
  assert.throws(() => parseFomcStatementV1(unclosed, date), code("document"));
  const hiddenOnly = { ...original, html: `<aside>${original.html}</aside>` };
  assert.throws(() => parseFomcStatementV1(hiddenOnly, date), code("document"));
  const nestedHidden = { ...original, html: `<aside><aside>hidden</aside>${original.html}</aside>` };
  assert.throws(() => parseFomcStatementV1(nestedHidden, date), code("document"));
  const badLink = { ...original, html: original.html.replace(/href="https:[^"]+"/, 'href="https://["') };
  assert.throws(() => parseFomcStatementV1(badLink, date), code("source"));
});
test("EFFR binds verified percentRate response, date, volume units, target range and opaque markers", () => {
  const response = effrResponse(); response.payload.refRates[0]!.footnoteId = 1; response.payload.refRates[0]!.revisionIndicator = "Y";
  const [fact] = parseEffrFactsV1(response, effrRequest);
  assert.deepEqual(fact, { observationDate: "2025-01-29", rate: 4.33, unit: "percent", volumeInBillions: 92,
    volumeUnit: "billions of U.S. dollars", targetLower: 4.25, targetUpper: 4.5, footnoteId: 1, revisionIndicator: "Y" });
  const series = buildUsPolicyCanonicalSeriesV1("effr", [fact!], captureTime);
  assert.ok(!Object.hasOwn(series.metadata, "releaseTimestamp")); assert.deepEqual(readUsPolicyFactsV1("effr", series), [fact]);
});
test("EFFR malformed numerics/dates/required fields and unknown quality fields fail closed", () => {
  for (const [field, value] of Object.entries({ effectiveDate: "2025-02-30", type: "SOFR", percentRate: "4.33", volumeInBillions: -1,
    targetRateTo: 4, footnoteId: 1.5, revisionIndicator: true, guessedQualityFlag: "unknown" })) {
    const response = effrResponse(); response.payload.refRates[0]![field] = value;
    assert.throws(() => parseEffrFactsV1(response, effrRequest), UsPolicyValidationError);
  }
  for (const field of ["effectiveDate", "type", "percentRate", "targetRateFrom"]) {
    const response = effrResponse(); delete response.payload.refRates[0]![field]; assert.throws(() => parseEffrFactsV1(response, effrRequest), UsPolicyValidationError);
  }
  for (const value of [NaN, Infinity, -Infinity, null]) {
    const response = effrResponse(); response.payload.refRates[0]!.percentRate = value; assert.throws(() => parseEffrFactsV1(response, effrRequest), code("value"));
  }
  const badMarker = effrResponse(); badMarker.payload.refRates[0]!.revisionIndicator = null;
  assert.throws(() => parseEffrFactsV1(badMarker, effrRequest), code("annotation"));
});
test("EFFR zero, absent optional fields, dates/gaps, duplicates and conflicting markers", () => {
  const response = effrResponse(); const row = effrRow("2025-01-30", 0);
  for (const field of ["volumeInBillions", "targetRateFrom", "targetRateTo", "revisionIndicator"]) delete row[field];
  response.payload.refRates = [row, effrRow(), { ...row }]; const facts = parseEffrFactsV1(response, effrRequest);
  assert.equal(facts.length, 2); assert.equal(facts[1]!.rate, 0); assert.equal(facts[1]!.volumeInBillions, null); assert.equal(facts[1]!.targetLower, null);
  response.payload.refRates[2]!.revisionIndicator = "Y"; assert.throws(() => parseEffrFactsV1(response, effrRequest), code("duplicate-date"));
  response.payload.refRates = []; assert.throws(() => parseEffrFactsV1(response, effrRequest), code("empty"));
});
test("identity excludes capture time/order, changes with values/annotations and cannot cross families", () => {
  assert.equal(canonical(family).metadata.sourceVersionId, canonical(family, captureTime + 100).metadata.sourceVersionId);
  assert.notEqual(canonical(family).metadata.sourceVersionId, canonical(family, captureTime, 4).metadata.sourceVersionId);
  assert.notEqual(canonical(family).metadata.sourceVersionId, canonical("effr").metadata.sourceVersionId);
  const response = effrResponse(); response.payload.refRates.push(effrRow("2025-01-30"));
  const hash = () => buildUsPolicyCanonicalSeriesV1("effr", parseEffrFactsV1(response, effrRequest), captureTime).metadata.sourceVersionId;
  const first = hash(); response.payload.refRates.reverse(); assert.equal(hash(), first);
  response.payload.refRates[0]!.revisionIndicator = "Y"; assert.notEqual(hash(), first);
});
test("full FOMC semantics bind upper bound, effective date, note and release evidence into identity", () => {
  const fact = attachFomcImplementationV1(parseFomcStatementV1(statement(), date), implementation());
  const hash = (value: typeof fact) => buildUsPolicyCanonicalSeriesV1(family, [value], captureTime).metadata.sourceVersionId;
  for (const revised of [{ ...fact, targetUpper: 4.75 }, { ...fact, effectiveDate: "2025-01-31" },
    { ...fact, effectiveDate: null, implementationNoteUrl: null }, { ...fact, releaseTimestamp: null }]) {
    assert.notEqual(hash(revised), hash(fact));
  }
});
