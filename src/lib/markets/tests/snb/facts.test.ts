import assert from "node:assert/strict";
import { after, test } from "node:test";
import { parseSnbPolicyDocumentV1, normalizeSnbPolicyFactV1, SnbPolicyValidationError } from "../../providers/snb/facts";
import { buildSnbPolicyEvidenceV1, buildSnbPolicySourceVersionIdV1, readSnbPolicyFactV1 } from "../../providers/snb/canonical";
import { snbPolicyDocumentUrlV1, SNB_POLICY_MAX_RESPONSE_BYTES_V1 } from "../../providers/snb/transport";
import { document, date, captureTime, canonical } from "./fixtures";
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Live network forbidden"); };
after(() => { globalThis.fetch = originalFetch; });
const code = (expected: string) => (error: unknown) => error instanceof SnbPolicyValidationError && error.code === expected;
const parse = (doc = document(), decisionDate = date) => parseSnbPolicyDocumentV1(doc, decisionDate);
const changed = (from: string, to: string) => ({ ...document(), html: document().html.replace(from, to) });

test("verified current HTML unchanged action preserves the scalar zero exactly", () => {
  const fact = parse(document({ action: "unchanged" }), "2026-09-24");
  assert.deepEqual(fact.decision, { action: "unchanged", rate: 0, changePercentagePoints: null });
  assert.equal(fact.instrument, "SNB policy rate");
  assert.equal(fact.institution, "Swiss National Bank");
  assert.equal(fact.decisionBody, "Governing Board");
  assert.equal(fact.productId, "eurchf");
});
test("verified June cut retains explicit change and resulting scalar independently", () => {
  const fact = parse();
  assert.deepEqual(fact.decision, { action: "reduce", rate: 0, changePercentagePoints: 0.25 });
  assert.equal(Object.hasOwn(fact.decision, "previousRate"), false);
});
test("official PDF-verified increase grammar works in synthetic current HTML layout", () => {
  const fact = parse(document({ action: "increase" }), "2026-09-24");
  assert.deepEqual(fact.decision, { action: "increase", rate: 1.75, changePercentagePoints: 0.25 });
});
test("negative modern policy scalars retain their sign and decimal value", () => {
  for (const value of ["-0.75", "−0.75", "–0.75"]) {
    assert.equal(parse(document({ rate: value })).decision.rate, -0.75);
  }
  assert.equal(parse(document({ rate: "0.125" })).decision.rate, 0.125);
});
test("headline and operative action/rate must agree", () => {
  assert.throws(() => parse(changed("lowers SNB policy rate to 0%", "lowers SNB policy rate to 0.5%")), code("rate"));
  assert.throws(() => parse(changed("lowers SNB policy rate to 0%", "leaves SNB policy rate unchanged at 0%")), code("rate"));
});
test("unsupported rate shapes, units, non-finite and out-of-bound scalars fail closed", () => {
  for (const value of ["0 to 0.1", "NaN", "Infinity", "1e-2", "0,25", "0.1234567"]) assert.throws(() => parse(document({ rate: value })), code("unsupported-wording"));
  for (const value of ["101", "-101"]) assert.throws(() => parse(document({ rate: value })), code("rate"));
  assert.throws(() => parse(changed("percentage points to 0%", "basis points to 0%")), code("unsupported-wording"));
});
test("explicit change must be positive and unchanged decisions cannot invent a change", () => {
  assert.throws(() => parse(document({ change: "0" })), code("rate"));
  assert.throws(() => parse(document({ change: "-0.25" })), code("unsupported-wording"));
  const fact = parse();
  for (const d of [{ ...fact.decision, changePercentagePoints: -0.25 }, { ...fact.decision, changePercentagePoints: null },
    { action: "unchanged", rate: 0, changePercentagePoints: 0.25 }]) assert.throws(() => normalizeSnbPolicyFactV1({ ...fact, decision: d }), code("rate"));
});
test("duplicate or contradictory operative decisions including same-paragraph tails are ambiguous", () => {
  for (const extra of [
    "<p>The Swiss National Bank is lowering the SNB policy rate by 0.5 percentage points to -0.25%.</p>",
    "<p>The Swiss National Bank is lowering the SNB policy rate by 0.25 percentage points to 0%.</p>",
    "<p>The SNB decided to leave the SNB policy rate at 9%.</p>",
  ]) assert.throws(() => parse(document({ extra })), code("ambiguous"));
  assert.throws(() => parse(changed("percentage points to 0%.", "percentage points to 0%. The SNB is raising the SNB policy rate by 1 percentage points to 1%.")), code("ambiguous"));
});
test("contradictory forecast assumption cannot silently coexist with the decision", () => {
  assert.throws(() => parse(changed("the SNB policy rate is 0% over", "the SNB policy rate is 1% over")), code("ambiguous"));
  for (const claim of ["The SNB policy rate is 9%.", "SNB policy rate: 9%.", "SNB policy rate 9%.", "The SNB policy rate stands at 9%."]) {
    assert.throws(() => parse(document({ extra: `<p>${claim}</p>` })), code("ambiguous"));
  }
});
test("unrelated percentages and intervention language do not enter the fact or identity", () => {
  const before = canonical();
  const fact = parse(document({ extra: "<p>Inflation 99%; GDP 88%; SARON 77%; deposits 66%; repo 55%; Libor range 44% to 33%; exchange rate 22%. Willingness to intervene has increased.</p>" }));
  assert.equal(fact.decision.rate, 0);
  assert.equal(buildSnbPolicySourceVersionIdV1(date, fact), before.metadata.sourceVersionId);
  assert.doesNotMatch(JSON.stringify(fact), /SARON|Libor|discount|intervention|confidence|recommendation|direction/);
});
for (const [name, instrument] of [["SARON", "SARON"], ["sight-deposit remuneration", "interest on sight deposits"],
  ["sight-deposit thresholds", "sight deposits threshold"], ["sight-deposit discounts", "sight deposits discount"],
  ["Libor target ranges", "three-month CHF Libor target range"], ["inflation", "inflation"], ["repo", "repo rate"]]) {
  test(`${name} cannot replace the explicit SNB policy instrument`, () => {
    const doc = document();
    assert.throws(() => parse({ ...doc, html: doc.html.replaceAll("SNB policy rate", instrument!) }), code("unsupported-instrument"));
  });
}
test("first unrelated percentage is never used when the operative policy sentence is absent", () => {
  assert.throws(() => parse(document({ lead: "Inflation is 2%; SARON is 1%; sight deposits pay 0%." })), code("unsupported-instrument"));
});
test("pre-regime source requests and structured evidence fail with an explicit unsupported regime", () => {
  assert.throws(() => parse({ url: "https://www.snb.ch/en/publications/communication/press-releases/2019/pre_20190321", html: "Libor target range -1.25% to -0.25%" }, "2019-03-21"), code("unsupported-regime"));
  assert.throws(() => normalizeSnbPolicyFactV1({ ...parse(), decisionDate: "2019-06-12", publicationDate: "2019-06-12" }), code("unsupported-regime"));
});
test("boundary date is eligible but PDF-only historical layout is not fabricated as HTML evidence", () => {
  assert.match(snbPolicyDocumentUrlV1("2019-06-13"), /press-releases\/2019\/pre_20190613$/);
  const url = snbPolicyDocumentUrlV1("2023-06-22");
  const title = "Monetary policy assessment of 22 June 2023";
  assert.throws(() => parse({ url, html: `<html><head><title>${title}</title><link rel="canonical" href="${url}"></head><body><main id="a11y-main"><h1>${title}</h1><div class="cms-stage__date">22 June 2023</div><h3>Download file now</h3><a href="/official.pdf">${title}</a></main></body></html>` }, "2023-06-22"), code("unsupported-structure"));
});
test("wrong source, canonical path, source suffix and publisher title are rejected", () => {
  assert.throws(() => parse({ ...document(), url: "https://evil.test/decision" }), code("source"));
  assert.throws(() => parse(changed(`href="${document().url}"`, 'href="https://evil.test/decision"')), code("source"));
  assert.throws(() => parse({ ...document(), url: document().url.replace("_2", "") }), code("source"));
  assert.throws(() => parse(changed("<title>Monetary policy assessment", "<title>Other publisher assessment")), code("source"));
  assert.throws(() => parse(changed("<link rel=\"canonical\"", "<link rel=\"alternate\"")), code("source"));
});
test("malformed/duplicate/missing structures and excess bytes are rejected", () => {
  for (const [from, to, expected] of [["</body></html></div>", "</html></div>", "document"],
    ['id="a11y-main"', 'id="changed"', "unsupported-structure"],
    ['class="cms-richtext h-bg-white"', 'class="changed"', "unsupported-structure"],
    ["<h1 class=\"h-typo-t1\">", "<h1>Duplicate</h1><h1 class=\"h-typo-t1\">", "ambiguous"]]) {
    assert.throws(() => parse(changed(from!, to!)), code(expected!));
  }
  assert.throws(() => parse({ ...document(), html: "x".repeat(SNB_POLICY_MAX_RESPONSE_BYTES_V1 + 1) }), code("document"));
});
test("SVG and encoded inflation iframe contents cannot supply or contaminate policy evidence", () => {
  const doc = document();
  const tables = `<svg><text>The SNB decided to set the SNB policy rate to 99%.</text></svg><iframe srcdoc="${"&lt;p&gt;Inflation 99%&lt;/p&gt;".repeat(400)}"></iframe>`;
  assert.equal(parse({ ...doc, html: doc.html.replace('<div class="cms-box">', tables + '<div class="cms-box">') }).decision.rate, 0);
  assert.throws(() => parse({ ...doc, html: doc.html.replace('<div class="cms-box">', '<svg><text>bad</svg><div class="cms-box">') }), code("document"));
});
test("unknown decision wording cannot be silently normalized", () => {
  assert.throws(() => parse(changed("is lowering", "has lowered")), code("unsupported-wording"));
  assert.throws(() => parse(changed("lowers SNB policy rate", "cuts SNB policy rate")), code("unsupported-wording"));
});
test("hidden operative evidence or hidden ancestors fail; hidden unrelated copies are never selected", () => {
  for (const attribute of ["hidden", 'aria-hidden="true"', 'style="display:none"', 'style="visibility:hidden"', 'class="d-none"']) {
    assert.throws(() => parse(changed("<p>The Swiss National Bank", `<p ${attribute}>The Swiss National Bank`)), code("unsupported-structure"));
    assert.throws(() => parse(changed('class="cms-richtext h-bg-white"', `class="cms-richtext h-bg-white" ${attribute === 'class="d-none"' ? "hidden" : attribute}`)), code("unsupported-structure"));
  }
  assert.equal(parse(document({ extra: '<p hidden>The SNB decided to set the SNB policy rate to 99%.</p>' })).decision.rate, 0);
  assert.throws(() => parse(changed("is lowering the SNB policy rate", 'is lowering <span hidden>the SNB policy rate</span>')), code("unsupported-wording"));
  assert.throws(() => parse(changed("<body>", "<body hidden>")), code("unsupported-structure"));
  assert.throws(() => parse(changed("<html>", "<html hidden>")), code("unsupported-structure"));
  assert.throws(() => parse(changed('class="a-text"', 'class="a-text h-sr-only"')), code("unsupported-structure"));
  const doc = document();
  assert.throws(() => parse({ ...doc, html: doc.html.replace('<main id="a11y-main">', '<div hidden><main id="a11y-main">').replace('</main>', '</main></div>') }), code("unsupported-structure"));
});
test("comment, script, template, noscript and navigation copies cannot manufacture visible evidence", () => {
  const doc = document();
  const main = doc.html.match(/<main\b[\s\S]*?<\/main>/)![0];
  for (const wrapper of [(s: string) => `<!--${s}-->`, (s: string) => `<script>${s}</script>`,
    (s: string) => `<template>${s}</template>`, (s: string) => `<noscript>${s}</noscript>`, (s: string) => `<nav>${s}</nav>`]) {
    assert.throws(() => parse({ ...doc, html: doc.html.replace(main, wrapper(main)) }), code("unsupported-structure"));
    assert.equal(parse({ ...doc, html: doc.html.replace(main, wrapper(main) + main) }).decision.rate, 0);
  }
  assert.throws(() => parse({ ...doc, html: doc.html.replace(main, '<!--' + main) }), code("document"));
});
test("assessment, publication and effective dates remain separate exact source facts", () => {
  const fact = parse();
  assert.equal(fact.decisionDate, date);
  assert.equal(fact.publicationDate, date);
  assert.equal(fact.effectiveDate, "2025-06-20");
  assert.equal(fact.documentId, "pre_20250619_2");
  assert.equal(fact.documentTitle, "Monetary policy assessment of 19 June 2025");
  assert.throws(() => parse(changed("<span class=\"h-typo-tiny\">19 June 2025", "<span class=\"h-typo-tiny\">20 June 2025")), code("date"));
  assert.throws(() => parse(changed("<h1 class=\"h-typo-t1\">Monetary policy assessment of 19 June 2025", "<h1 class=\"h-typo-t1\">Monetary policy assessment of 18 June 2025")), code("date"));
  assert.throws(() => parse(document(), "2025-02-30"), code("date"));
});
test("explicit tomorrow wording requires its named civil date and fails closed on ambiguity", () => {
  for (const effective of ["19 June 2025", "21 June 2025", "31 June 2025"]) assert.throws(() => parse(document({ effective })), code("date"));
  assert.throws(() => parse(document({ extra: "<p>The new policy rate applies from tomorrow, 20 June 2025.</p>" })), code("ambiguous"));
  assert.throws(() => parse(changed("applies from tomorrow, 20 June 2025", "takes effect next week")), code("unsupported-wording"));
});
test("absent effective date and absent exact release proof stay null despite clock conventions", () => {
  const fact = parse(document({ effective: null }));
  assert.equal(fact.effectiveDate, null);
  assert.equal(fact.releaseTimestamp, null);
  assert.equal(parse(document({ action: "unchanged" }), "2026-09-24").effectiveDate, null);
  const evidence = buildSnbPolicyEvidenceV1(fact, captureTime);
  assert.equal(Object.hasOwn(evidence.metadata, "releaseTimestamp"), false);
  assert.throws(() => normalizeSnbPolicyFactV1({ ...fact, releaseTimestamp: captureTime }), code("date"));
});
test("Governing Board reference and same-document PDF identity must match", () => {
  assert.throws(() => parse(changed("introductory remarks by the Governing Board", "remarks by another board")), code("unsupported-structure"));
  assert.throws(() => parse(changed("ref_20250619_mslanmargpe", "ref_20260319_mslanmargpe")), code("source"));
  assert.throws(() => parse(changed("publications1_en", "publications0_en")), code("unsupported-structure"));
});
test("same normalized material fact and capture-time changes retain deterministic identity", () => {
  const first = canonical(), later = canonical(captureTime + 100);
  assert.equal(first.metadata.sourceVersionId, later.metadata.sourceVersionId);
  assert.match(first.metadata.sourceVersionId!, /^snb-policy-evidence-v1:sha256:[a-f0-9]{64}$/);
  assert.equal(buildSnbPolicySourceVersionIdV1(date, JSON.parse(JSON.stringify(first.fact))), first.metadata.sourceVersionId);
  assert.equal(Object.isFrozen(first.fact.decision), true);
});
test("rate, action, explicit change and effective-date revisions change material identity", () => {
  const fact = parse();
  const base = buildSnbPolicySourceVersionIdV1(date, fact);
  for (const revision of [{ ...fact, decision: { ...fact.decision, rate: 0.125 } },
    { ...fact, decision: { action: "increase" as const, rate: 0, changePercentagePoints: 0.25 } },
    { ...fact, decision: { ...fact.decision, changePercentagePoints: 0.5 } },
    { ...fact, effectiveDate: null }]) assert.notEqual(buildSnbPolicySourceVersionIdV1(date, normalizeSnbPolicyFactV1(revision)), base);
});
test("closed public evidence rejects forged provenance, content, scalar carriers and extra fields", () => {
  for (const field of ["provider", "source", "originalPublisher", "sourceUrl", "sourceSeriesId", "canonicalSeriesId", "sourceVersionId", "unit", "frequency", "substitution"]) {
    const evidence = JSON.parse(JSON.stringify(canonical()));
    evidence.metadata[field] = "forged";
    assert.throws(() => readSnbPolicyFactV1(date, evidence), code("source"));
  }
  for (const field of ["observations", "value", "rate", "extra"]) assert.throws(() => readSnbPolicyFactV1(date, { ...canonical(), [field]: 1 }), code("annotation"));
  const evidence = canonical();
  assert.equal(Object.hasOwn(evidence, "observations"), false);
  assert.equal(readSnbPolicyFactV1(date, evidence).decision.rate, 0);
  assert.throws(() => normalizeSnbPolicyFactV1({ ...evidence.fact, intervention: "buy" }), code("annotation"));
  assert.throws(() => normalizeSnbPolicyFactV1({ ...evidence.fact, instrument: "SARON" }), code("unsupported-instrument"));
});
test("invalid capture clock and mismatched event evidence are rejected", () => {
  for (const time of [-1, 0.5, NaN, Infinity]) assert.throws(() => buildSnbPolicyEvidenceV1(parse(), time), code("capture-time"));
  assert.throws(() => readSnbPolicyFactV1("2025-06-20", canonical()), code("source"));
});
test("browser source parsing is prohibited", () => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  try { assert.throws(() => parse(), /server-only/); }
  finally { Reflect.deleteProperty(globalThis, "window"); }
});
