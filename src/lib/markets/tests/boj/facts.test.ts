import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { XMLParser } from "fast-xml-parser";
import { buildBojPolicyDecisionActionEvidenceV1, prepareBojPolicyDecisionActionEvidenceV1 } from "../../providers/boj/policyDecisionActionEvidence";
import { createBojPolicyDecisionCaptureAuthorityV1, readBojPolicyDecisionCaptureAsKnownAtV1,
  type BojPolicyDecisionCaptureReceiptV1 } from "../../services/bojPolicyDecisionCaptureAuthority";

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

// Complete, unchanged official HTML inspected over certificate-validated HTTPS on 2026-10-08.
// Offline bytes qualify source layouts; these literals alone convey no acquisition trust or historical possession.
// June: https://www.boj.or.jp/en/mopo/mpmdeci/state_2024/k240614a.htm
// April: https://www.boj.or.jp/en/mopo/mpmdeci/state_2024/k240426a.htm
const officialJuneHtml = [
  "<!DOCTYPE html><html lang=\"en\">\r\n",
  "<head prefix=\"og: http://ogp.me/ns# fb: http://ogp.me/ns/fb# article: http://ogp.me/ns/article#\">\r\n",
  "<meta http-equiv=\"Content-Type\" content=\"text/html; charset=UTF-8\"><meta name=\"author\" content=\"\">\r\n",
  "<meta name=\"description\" content=\"\">\r\n",
  "<meta name=\"keywords\" content=\"\">\r\n",
  "<title>Statement on Monetary Policy  : 日本銀行 Bank of Japan</title>\r\n",
  "<link rel=\"stylesheet\" type=\"text/css\" href=\"/common2/css/wysiwyg.css\">\r\n",
  "<link rel=\"stylesheet\" type=\"text/css\" href=\"/common2/css/style.css\">\r\n",
  "\r\n",
  "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1.0\">\r\n",
  "<meta name=\"format-detection\" content=\"telephone=no\">\r\n",
  "<meta property=\"og:title\" content=\"Statement on Monetary Policy  : 日本銀行 Bank of Japan\">\r\n",
  "<meta property=\"og:type\" content=\"article\">\r\n",
  "<meta property=\"og:url\" content=\"https://www.boj.or.jp/en/mopo/mpmdeci/state_2024/k240614a.htm\">\r\n",
  "<meta property=\"og:image\" content=\"https://www.boj.or.jp/common2/img/common/og_img.jpg\">\r\n",
  "<meta property=\"og:site_name\" content=\"Bank of Japan\">\r\n",
  "<meta property=\"og:description\" content=\"\">\r\n",
  "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\r\n",
  "<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\r\n",
  "<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@100;300;400;500;700;900&display=swap\">\r\n",
  "<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@600&display=swap\"></head>\r\n",
  "<body class=\"cate-mopo en\">\r\n",
  "\r\n",
  "\r\n",
  "\r\n",
  "<div class=\"block_skip\"><a href=\"#contents\">Skip to main content</a></div>\r\n",
  "<div class=\"clear_fix\">\r\n",
  "<header id=\"header_area\" class=\"lonav on\" role=\"banner\">\r\n",
  "  <button id=\"menuBtn\" aria-expanded=\"false\" aria-controls=\"left_col\">\r\n",
  "    <img class=\"open\" src=\"/common2/img/common/menu.png\" alt=\"Open the menu\">\r\n",
  "    <img class=\"close\" src=\"/common2/img/common/close.png\" alt=\"Close the menu\">\r\n",
  "  </button>\r\n",
  "  <div id=\"left_col\">\r\n",
  "    <!-- ▼▼　ヘッダー　▼▼-->\r\n",
  "    <div id=\"header\">\r\n",
  "  <p class=\"logo gen-disp_pc\"><a href=\"/en/\"><img src=\"/common2/img/common/logo.jpg\" alt=\"日本銀行 Bank of Japan\"></a></p>\r\n",
  "  <ul class=\"lang\">\r\n",
  "    <li lang=\"ja\"><a href=\"/\">日本語</a></li>\r\n",
  "    <li aria-current=\"page\"><em>English</em></li>\r\n",
  "  </ul>\r\n",
  "</div>\r\n",
  "    <!-- ▲▲　ヘッダー　▲▲-->\r\n",
  "    <!-- ▼▼　ナビゲーション　▼▼ -->\r\n",
  "    <nav id=\"glnav\" aria-label=\"Main menu\">\r\n",
  "      <ul class=\"glnav_ul\">\r\n",
  "      <li>\n",
  "<a class=\"glnav1st glnav-link glnav_home\" href=\"/en/\">Home</a>\n",
  "</li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav1st\" aria-expanded=\"false\" aria-controls=\"glnav2\">About the Bank</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav2\" class=\"glnav1st_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/about/index.htm\">About the Bank</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav2-1\">Outline of the Bank</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav2-1\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/outline/index.htm\">Outline of the Bank</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/outline/history/index.htm\">History</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/outline/history/pre_gov/index.htm\">List of Governors</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/outline/location/index.htm\">Location (Guide Map to Head Office) / Visiting the Bank</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/outline/location/map.htm\">Head Office, Branches, and Overseas Offices</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/outline/imes_archive/index.htm\">Archives</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav2-1\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav2-2\">Organization of the Bank</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav2-2\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/organization/index.htm\">Organization of the Bank</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/organization/policyboard/index.htm\">Policy Board</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/organization/tanto.htm\">Responsibilities of the Governor, Deputy Governors, and Executive Directors</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/organization/chart/index.htm\">Organization of Head office, Branches and Offices</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav2-2\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/about/boj_law/index.htm\">Laws and Rules</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/about/account/index.htm\">The Bank's Accounts</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav2-3\">Activities</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav2-3\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/activities/index.htm\">Activities</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/activities/principle.htm\">The Bank's Organizational Core Principles</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/activities/strategy/index.htm\">Medium-Term Strategic Plan</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/activities/act/index.htm\">Annual Review</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav2-3\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/about/bcp/index.htm\">Business Continuity Planning</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/about/press/index.htm\">Speeches and Statements</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav2-4\">Research Papers, Reports, Speeches and Statements Related to the Bank</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav2-4\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li class=\"glnav-nolink\">Research Papers, Reports, Speeches and Statements Related to the Bank</li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/r_menu_ron/index.htm\">Research Papers</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/r_menu_koen/index.htm\">Speeches</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/r_menu_dan/index.htm\">Statements</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav2-4\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/about/release_2026/index.htm\">Other Releases</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/about/pr_events/index.htm\">Tours and Museums</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/about/education/index.htm\">Guides to the Bank</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav2-5\">Services</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav2-5\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/services/index.htm\">Services</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/services/bn/index.htm\">Exchange of Damaged Cash</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/services/kengaku.htm\">Tours of the Bank's Head Office</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav2-5\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/about/climate/index.htm\">Climate Change</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/about/link/index.htm\">Links</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav1st_close\" aria-expanded=\"false\" aria-controls=\"glnav2\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li class=\"current\">\n",
  "<button class=\"glnav-btn glnav1st\" aria-expanded=\"false\" aria-controls=\"glnav3\">Monetary Policy</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav3\" class=\"glnav1st_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/mopo/index.htm\">Monetary Policy</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav3-1\">Outline of Monetary Policy</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav3-1\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/outline/index.htm\">Outline of Monetary Policy</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/outline/target.htm\">Price Stability Target of 2 Percent</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/outline/bpreview/index.htm\">Review of Monetary Policy from a Broad Perspective</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav3-1\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav3-2\">Monetary Policy Meetings</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav3-2\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/mpmsche_minu/index.htm\">Monetary Policy Meetings</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/mpmsche_minu/opinion_2026/index.htm\">Summary of Opinions</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/mpmsche_minu/minu_2026/index.htm\">Minutes</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/mpmsche_minu/m_ref/index.htm\">Others</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav3-2\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/mopo/mpmdeci/index.htm\">Monetary Policy Releases</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav3-3\">Monetary Policy Measures</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav3-3\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/measures/index.htm\">Monetary Policy Measures</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/measures/mkt_ope/index.htm\">Market Operations</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/measures/term_cond/index.htm\">Principal Terms and Conditions</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav3-3\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/mopo/outlook/index.htm\">Outlook for Economic Activity and Prices</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/mopo/diet/index.htm\">Reports to the Diet</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav3-4\">Research Papers, Reports, Speeches and Statements Related to Monetary Policy</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav3-4\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li class=\"glnav-nolink\">Research Papers, Reports, Speeches and Statements Related to Monetary Policy</li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/r_menu_ron/index.htm\">Research Papers</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/r_menu_koen/index.htm\">Speeches</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/r_menu_dan/index.htm\">Statements</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav3-4\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><button class=\"glnav-btn_close glnav1st_close\" aria-expanded=\"false\" aria-controls=\"glnav3\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav1st\" aria-expanded=\"false\" aria-controls=\"glnav4\">Financial System</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav4\" class=\"glnav1st_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/finsys/index.htm\">Financial System</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/finsys/outline/index.htm\">Overview: The Bank's Initiatives for Financial Stability</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/finsys/exam_monit/index.htm\">On-Site Examinations and Off-Site Monitoring</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/finsys/fsr/index.htm\">Financial System Report</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/finsys/fs_policy/index.htm\">Policy Actions for Financial Stability</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/finsys/cofsa/index.htm\">Coordination with the Financial Services Agency</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/finsys/c_aft/index.htm\">Seminars for Financial Institutions</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav4-1\">Other Releases Related to Financial System</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav4-1\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/finsys/release/index.htm\">Other Releases Related to Financial System</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/finsys/r_menu_ron/index.htm\">Research Papers</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/finsys/r_menu_koen/index.htm\">Speeches</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/finsys/r_menu_dan/index.htm\">Statements</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav4-1\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><button class=\"glnav-btn_close glnav1st_close\" aria-expanded=\"false\" aria-controls=\"glnav4\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav1st\" aria-expanded=\"false\" aria-controls=\"glnav5\">Payments and Markets</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav5\" class=\"glnav1st_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/paym/index.htm\">Payments and Markets</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav5-1\">Outline of Payment and Settlement Systems</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav5-1\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/outline/index.htm\">Outline of Payment and Settlement Systems</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/outline/pay_boj/index.htm\">Payment and Settlement Systems and the Bank</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/outline/pay_os/index.htm\">Oversight</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/outline/pay_forum/index.htm\">Forums</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/outline/pay_ps/index.htm\">Payment and Settlement Systems Operated by the Private Sector</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav5-1\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/paym/bojnet/index.htm\">Operation of BOJ-NET</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/paym/jgb_bes/index.htm\">JGB Book-Entry System</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/paym/fintech/index.htm\">FinTech Center</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/paym/digital/index.htm\">Central Bank Digital Currency</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav5-2\">Money Market</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav5-2\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/market/index.htm\">Money Market</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/market/jpy_cmte/index.htm\">Cross-Industry Committee on Japanese Yen Interest Rate Benchmarks</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/market/i_forum/index.htm\">Cross-Industry Forum on Interest Rate Benchmarks</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/market/sg/index.htm\">Study Group of Market Participants</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/market/r_forum/index.htm\">Repo Market Forum</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav5-2\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/paym/bond/index.htm\">Bond Market</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/paym/credit/index.htm\">Credit Market</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/paym/forum/index.htm\">Forums and Conferences</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav5-3\">Research Papers, Reports, Speeches and Statements Related to Payment and Markets</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav5-3\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li class=\"glnav-nolink\">Research Papers, Reports, Speeches and Statements Related to Payment and Markets</li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/research/brp/psr/index.htm\">Payment and Settlement Systems Report</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/research/brp/mor/index.htm\">Market Operations in Each Fiscal Year</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/m-climate/index.htm\">Market Functioning Survey concerning Climate Change</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/r_menu_ron/index.htm\">Research Papers</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/r_menu_koen/index.htm\">Speeches</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/r_menu_dan/index.htm\">Statements</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav5-3\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/paym/release/index.htm\">Other Releases Related to Payment and Markets</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav1st_close\" aria-expanded=\"false\" aria-controls=\"glnav5\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav1st\" aria-expanded=\"false\" aria-controls=\"glnav6\">Banknotes, The Bank's Treasury Funds and JGS Services</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav6\" class=\"glnav1st_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/note_tfjgs/index.htm\">Banknotes, The Bank's Treasury Funds and JGS Services</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav6-1\">General Information of Banknotes and Coins</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav6-1\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/note_tfjgs/note/index.htm\">General Information of Banknotes and Coins</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/note_tfjgs/note/n_note/index.htm\">A New Series of Banknotes and a New 500 Yen Coin</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/note_tfjgs/note/valid/index.htm\">Banknotes and Coins in Use</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/note_tfjgs/note/security/index.htm\">Security Features of Bank of Japan Notes</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/note_tfjgs/note/outline/index.htm\">Outline of Banknotes and Coins</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/note_tfjgs/note/related/index.htm\">Related Releases</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/note_tfjgs/note/n_other/index.htm\">Publications and Other Information</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/services/bn/index.htm\">Exchange of Damaged Cash</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav6-1\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/note_tfjgs/kokko/index.htm\">Treasury Funds Services</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/note_tfjgs/jgs/index.htm\">JGS Services</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/note_tfjgs/trans/index.htm\">The Bank's Transactions with the Government</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav6-2\">Research Papers, Reports, Speeches and Statements Related to Banknotes, Treasury Funds and JGS Services</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav6-2\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li class=\"glnav-nolink\">Research Papers, Reports, Speeches and Statements Related to Banknotes, Treasury Funds and JGS Services</li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/note_tfjgs/r_menu_ron/index.htm\">Research Papers</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/note_tfjgs/r_menu_koen/index.htm\">Speeches</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/note_tfjgs/r_menu_dan/index.htm\">Statements</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav6-2\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><button class=\"glnav-btn_close glnav1st_close\" aria-expanded=\"false\" aria-controls=\"glnav6\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav1st\" aria-expanded=\"false\" aria-controls=\"glnav7\">International Finance</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav7\" class=\"glnav1st_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/intl_finance/index.htm\">International Finance</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/intl_finance/outline/index.htm\">Outline of International Finance</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/intl_finance/meeting/index.htm\">International Meetings</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/intl_finance/ex_assets/index.htm\">Foreign Currency Assets</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/intl_finance/cooperate/index.htm\">Cooperation with Other Central Banks</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/intl_finance/cemcoa/index.htm\">Financial Cooperation in Asia</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav7-1\">Research Papers, Reports, Speeches and Statements Related to International Finance</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav7-1\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li class=\"glnav-nolink\">Research Papers, Reports, Speeches and Statements Related to International Finance</li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/intl_finance/r_menu_ron/index.htm\">Research Papers</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/intl_finance/r_menu_koen/index.htm\">Speeches</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/intl_finance/r_menu_dan/index.htm\">Statements</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav7-1\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/intl_finance/release/index.htm\">Other Releases Related to International Finance</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav1st_close\" aria-expanded=\"false\" aria-controls=\"glnav7\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav1st\" aria-expanded=\"false\" aria-controls=\"glnav8\">Research and Studies</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav8\" class=\"glnav1st_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/index.htm\">Research and Studies</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/outline/index.htm\">Outline of Research and Studies</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/rs_all_2026/index.htm\">List of Reports & Research Papers</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav8-1\">BOJ Reports & Research Papers</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav8-1\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/research/brp/index.htm\">BOJ Reports & Research Papers</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/research/brp/fsr/index.htm\">Financial System Report</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/research/brp/mor/index.htm\">Market Operations in Each Fiscal Year</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/research/brp/psr/index.htm\">Payment and Settlement Systems Report</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/research/brp/rer/index.htm\">Regional Economic Report</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/research/brp/ron_2026/index.htm\">Research Papers</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav8-1\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/wps_rev/index.htm\">Working Paper Series, Review Series, and Research Laboratory Series</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/research_data/index.htm\">Research Data</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/imes/index.htm\">Research Papers Released by IMES</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/other_release/index.htm\">Study Group Reports</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/o_survey/index.htm\">Opinion Survey</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/conf/index.htm\">Conferences</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/bigdata/index.htm\">Alternative Data Analysis</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/past_release/index.htm\">Discontinued Research Releases</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav1st_close\" aria-expanded=\"false\" aria-controls=\"glnav8\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav1st\" aria-expanded=\"false\" aria-controls=\"glnav9\">Statistics</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav9\" class=\"glnav1st_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/index.htm\">Statistics</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav9-1\">Outline of Statistics and Statistical Release Schedule</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav9-1\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/statistics/outline/index.htm\">Outline of Statistics and Statistical Release Schedule</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/statistics/outline/notice_2026/index.htm\">Notices of Changes and Corrections</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/statistics/outline/exp/index.htm\">Explanations of Statistics</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/statistics/outline/general_notice/index.htm\">Notices of Changes and Revisions</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/statistics/outline/note/index.htm\">Notes</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav9-1\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/boj/index.htm\">Bank of Japan Statistics</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/money/index.htm\">Currency</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/market/index.htm\">Financial Markets</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/asli_fi/index.htm\">Financial Institutions Accounts</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/dl/index.htm\">Deposits and Loans Market</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/sj/index.htm\">Flow of Funds</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/bis/index.htm\">Related to BIS/FSB</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/set/index.htm\">Payment and Settlement</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/tk/index.htm\">TANKAN</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/pi/index.htm\">Prices</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/public/index.htm\">Public Finance</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/br/index.htm\">Balance of Payments Related Statistics</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/stop/index.htm\">Discontinued Statistics / Revised Base Statistics</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"https://www.imes.boj.or.jp/en/historical/hstat/hstat.html\">Historical Statistics on the Web Site of IMES</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"https://www.stat-search.boj.or.jp/index_en.html\">BOJ Time-Series Data Search</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav1st_close\" aria-expanded=\"false\" aria-controls=\"glnav9\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "\r\n",
  "      </ul>\r\n",
  "    </nav>\r\n",
  "    <!-- ▲▲　ナビゲーション　▲▲ -->\r\n",
  "    <!-- ▼▼　SNS　▼▼-->\r\n",
  "    <aside role=\"complementary\" id=\"sns\">\r\n",
  "    <ul>\r\n",
  "      <li><a class=\"img\" href=\"https://twitter.com/Bank_of_Japan_e\"><img src=\"/common2/img/common/sns_x.gif\" alt=\"x\"></a></li>\r\n",
  "      <li><a class=\"img\" href=\"https://www.facebook.com/BankofJapan.en\"><img src=\"/common2/img/common/sns_facebook.gif\" alt=\"facebook\"></a></li>\r\n",
  "      <li><a class=\"img\" href=\"https://www.youtube.com/user/BOJchannel/\"><img src=\"/common2/img/common/sns_youtube.gif\" alt=\"youtube\"></a></li>\r\n",
  "    </ul>\r\n",
  "  <p class=\"lnk1\"><a href=\"/en/snspolicy.htm\">Social Networking Site Management Policy</a></p>\r\n",
  "</aside>\r\n",
  "    <!-- ▲▲　SNS　▲▲-->\r\n",
  "  </div>\r\n",
  "</header>\r\n",
  "  <div id=\"right_col\">\r\n",
  "    <div id=\"overlay\" class=\"off glnav-disp_non\"></div>\r\n",
  "    <!-- ▼▼　メインビジュアル　▼▼-->\r\n",
  "    <aside role=\"complementary\" id=\"main_v\">\r\n",
  "      <div class=\"logo gen-disp_sp\"><a href=\"/en/\"><img src=\"/common2/img/common/logo_s.jpg\" alt=\"日本銀行 Bank of Japan\"></a></div>\r\n",
  "      <!-- ▼▼　ヘッダ部タイトル　▼▼-->\r\n",
  "      <p class=\"main_v-title\">Monetary Policy</p>\r\n",
  "      <!-- ▲▲　ヘッダ部タイトル　▲▲-->\r\n",
  "      <div class=\"main_v-text_area\">\r\n",
  "        <!-- ▼▼　検索フォーム　▼▼-->\r\n",
  "        <form class=\"search_form\" role=\"search\">\r\n",
  "        <div class=\"searchbox\">\r\n",
  "          <input id=\"qs_sslang\" value=\"1\" type=\"hidden\">\r\n",
  "          <div class=\"autocomplete\">\r\n",
  "            <input id=\"qs_keyword\" name=\"search\" type=\"text\" title=\"search\" autocomplete=\"off\" list=\"suggest0-list\" role=\"combobox\" aria-owns=\"suggest0-list\" aria-autocomplete=\"list\" aria-expanded=\"false\">\r\n",
  "            <datalist id=\"suggest0-list\"></datalist>\r\n",
  "          </div><input onclick=\"QSSimpleSearchOnSubmit();return false\" type=\"image\" src=\"/common2/img/common/search.gif\" alt=\"Search\">\r\n",
  "          <div id=\"suggest0-result\" aria-live=\"polite\" role=\"status\" class=\"visually-hidden\"></div>\r\n",
  "        </div>\r\n",
  "      </form>\r\n",
  "        <!-- ▲▲　検索フォーム　▲▲-->\r\n",
  "        <!-- ▼▼　パンくずリスト　▼▼-->\r\n",
  "        <nav id=\"topic_path\" role=\"navigation\" aria-label=\"current position\">\r\n",
  "          <ul><li><a href=\"/en/index.htm\">Home</a>&gt;</li><li><a href=\"/en/mopo/index.htm\">Monetary Policy</a>&gt;</li><li><a href=\"/en/mopo/mpmdeci/index.htm\">Monetary Policy Releases</a>&gt;</li><li><a href=\"/en/mopo/mpmdeci/state_2024/index.htm\">Statements on Monetary Policy 2024</a>&gt;</li><li aria-current=\"page\"><em>Statement on Monetary Policy</em></li></ul>\r\n",
  "        </nav>\r\n",
  "        <!-- ▲▲　パンくずリスト　▲▲-->\r\n",
  "      </div>\r\n",
  "    </aside>\r\n",
  "    <!-- ▲▲　メインビジュアル　▲▲-->\r\n",
  "    <main id=\"contents\">\r\n",
  "      <h1>\n",
  "Statement on Monetary Policy\n",
  "</h1>\r\n",
  "      <!-- ▼▼　日本語・英語切り替え　▼▼-->\r\n",
  "      \r\n",
  "      <!-- ▲▲　日本語・英語切り替え　▲▲-->\r\n",
  "      <!-- ▼▼　コンテンツ　▼▼-->\r\n",
  "      <div class=\"outline mod_outer\">\r\n",
  "      <!-- [START] CONTENT_1 --><p>June 14, 2024<br>\n",
  "Bank of Japan</p>\n",
  "<ul class=\"link-list01\">\n",
  "    <li><a href=\"/en/mopo/mpmdeci/mpr_2024/k240614a.pdf\">PDF Version [PDF 442KB]</a></li>\n",
  "</ul><!-- [END] CONTENT_1 --><!-- [START] CONTENT_2 --><ol>\n",
  "    <li>At the Monetary Policy Meeting (MPM) held today, the Policy Board of the Bank of Japan decided, by a unanimous vote, to set the following guideline for money market operations for the intermeeting period:\n",
  "        <div class=\"ml2em\">\n",
  "            <p>The Bank will encourage the uncollateralized overnight call rate to remain at around 0 to 0.1 percent.</p>\n",
  "        </div>\n",
  "        <p>Regarding purchases of Japanese government bonds (JGBs), CP, and corporate bonds for the intermeeting period, the Bank will conduct the purchases in accordance with the decisions made at the March 2024 MPM. The Bank decided, by an 8-1 majority vote, that it would reduce its purchase amount of JGBs thereafter to ensure that long-term interest rates would be formed more freely in financial markets. <sup><a href=\"#note01\" id=\"nt01\" class=\"red\">[Note]</a></sup> It will collect views from market participants and, at the next MPM, will decide on a detailed plan for the reduction of its purchase amount during the next one to two years or so.</p>\n",
  "    </li>\n",
  "    <li>Japan's economy has recovered moderately, although some weakness has been seen in part. Overseas economies have grown moderately on the whole. Exports have been more or less flat. Industrial production has been more or less flat as a trend, but it has continued to be pushed down recently by a suspension of production and shipment at some automakers. With corporate profits improving, business fixed investment has been on a moderate increasing trend. The employment and income situation has improved moderately. Private consumption has been resilient, although the impact of price rises has remained and automobile sales have continued to be pushed down by the suspension of shipment at some automakers. Housing investment has been relatively weak. Public investment has been more or less flat. Financial conditions have been accommodative. On the price front, the year-on-year rate of increase in the consumer price index (CPI, all items less fresh food) has been in the range of 2.0-2.5 percent recently, as services prices have continued to rise moderately, reflecting factors such as wage increases, although the effects of a pass-through to consumer prices of cost increases led by the past rise in import prices have waned. Inflation expectations have risen moderately.\n",
  "        <p>Japan's economy is likely to keep growing at a pace above its potential growth rate, with overseas economies continuing to grow moderately and as a virtuous cycle from income to spending gradually intensifies against the background of factors such as accommodative financial conditions. While the effects of the pass-through to consumer prices of cost increases led by the past rise in import prices are expected to wane, the year-on-year rate of increase in the CPI (all items less fresh food) is projected to be pushed up through fiscal 2025 by factors such as a waning of the effects of the government's economic measures pushing down CPI inflation. Meanwhile, underlying CPI inflation is expected to increase gradually, since it is projected that the output gap will improve and that medium- to long-term inflation expectations will rise with a virtuous cycle between wages and prices continuing to intensify. In the second half of the projection period of the April 2024 <em>Outlook for Economic Activity and Prices</em> (Outlook Report), it is likely to be at a level that is generally consistent with the price stability target.</p>\n",
  "        <p>Concerning risks to the outlook, there remain high uncertainties surrounding Japan's economic activity and prices, including developments in overseas economic activity and prices, developments in commodity prices, and domestic firms' wage- and price-setting behavior. Under these circumstances, it is necessary to pay due attention to developments in financial and foreign exchange markets and their impact on Japan's economic activity and prices.</p>\n",
  "    </li>\n",
  "</ol>\n",
  "<hr>\n",
  "<ol class=\"no-list indent3\">\n",
  "    <li id=\"note01\"><span class=\"red\">[Note]</span> Voting for the action: UEDA Kazuo, HIMINO Ryozo, UCHIDA Shinichi, ADACHI Seiji, NOGUCHI Asahi, NAKAGAWA Junko, TAKATA Hajime, and TAMURA Naoki. Voting against the action: NAKAMURA Toyoaki. While Nakamura Toyoaki was in favor of the idea of reducing the Bank's purchase amount of JGBs, he dissented, considering that the Bank should decide to reduce it after reassessing developments in economic activity and prices in the July 2024 Outlook Report. <a href=\"#nt01\" title=\"Return nt01\">Return to text</a></li>\n",
  "</ol>\n",
  "<hr class=\"double\">\n",
  "<p>(Reference)</p>\n",
  "<div class=\"ml1em\">\n",
  "    <dl>\n",
  "        <dt>Meeting hours:</dt>\n",
  "        <dd class=\"pl2em\">\n",
  "            <ul class=\"no-list\">\n",
  "                <li class=\"mb0\">Thursday, June 13: 14:00-15:33</li>\n",
  "                <li>Friday, June 14: 9:00-12:16</li>\n",
  "            </ul>\n",
  "        </dd>\n",
  "        <dt class=\"mt1em\">Policy Board members present:</dt>\n",
  "        <dd class=\"mb0 pl2em\">\n",
  "            <ul class=\"no-list\">\n",
  "                <li class=\"mb0\">UEDA Kazuo, Chairman (Governor)</li>\n",
  "                <li class=\"mb0\">HIMINO Ryozo (Deputy Governor)</li>\n",
  "                <li class=\"mb0\">UCHIDA Shinichi (Deputy Governor)</li>\n",
  "                <li class=\"mb0\">ADACHI Seiji</li>\n",
  "                <li class=\"mb0\">NAKAMURA Toyoaki</li>\n",
  "                <li class=\"mb0\">NOGUCHI Asahi</li>\n",
  "                <li class=\"mb0\">NAKAGAWA Junko</li>\n",
  "                <li class=\"mb0\">TAKATA Hajime</li>\n",
  "                <li class=\"mb0\">TAMURA Naoki</li>\n",
  "            </ul>\n",
  "        </dd>\n",
  "    </dl>\n",
  "    <p class=\"pt1em\">[Others present]</p>\n",
  "    <dl class=\"ml1em\">\n",
  "        <dt><strong>June 13</strong></dt>\n",
  "        <dd class=\"indent2 pl2em\">From the Ministry of Finance:<br>\n",
  "            SAKAMOTO Motoru, Deputy Vice-Minister for Policy Planning and Coordination (14:00-15:33)</dd>\n",
  "        <dd class=\"indent2 pl2em\">From the Cabinet Office:<br>\n",
  "            INOUE Hiroyuki, Vice-Minister for Policy Coordination (14:00-15:33)</dd>\n",
  "        <dt><strong>June 14</strong></dt>\n",
  "        <dd class=\"indent2 pl2em\">From the Ministry of Finance:<br>\n",
  "            AKAZAWA Ryosei, State Minister of Finance (9:00-12:02, 12:09-12:16)</dd>\n",
  "        <dd class=\"indent2 pl2em\">From the Cabinet Office:<br>\n",
  "            MORO Kengo, Deputy Director General for Economic and Fiscal Management (9:00-11:00)<br>\n",
  "            SHINDO Yoshitaka, Minister of State for Economic and Fiscal Policy (11:01-12:02, 12:09-12:16)</dd>\n",
  "    </dl>\n",
  "</div>\n",
  "<dl class=\"mt2em ml1em\">\n",
  "    <dt>Release dates and times:</dt>\n",
  "    <dd class=\"indent2 pl2em\">Statement on Monetary Policy -- Friday, June 14 at 12:23</dd>\n",
  "    <dd class=\"indent2 pl2em\">Summary of Opinions -- Monday, June 24 at 8:50</dd>\n",
  "    <dd class=\"indent2 pl2em\">Minutes of the Monetary Policy Meeting -- Monday, August 5 at 8:50</dd>\n",
  "</dl><!-- [END] CONTENT_2 -->\r\n",
  "      </div>\r\n",
  "      <!-- ▲▲　コンテンツ　▲▲-->\r\n",
  "    </main>\r\n",
  "    <!-- ▼▼　フッター　▼▼-->\r\n",
  "    <footer id=\"footer\">\r\n",
  "  <div class=\"outline\">\r\n",
  "    <div class=\"logo_area\">\r\n",
  "      <div class=\"left logo_area-toggle_left\">\r\n",
  "        <p class=\"logo\"><a href=\"/en/\"><img src=\"/common2/img/common/logo.gif\" alt=\"日本銀行 Bank of Japan\"></a></p>\r\n",
  "        <address>\r\n",
  "          2-1-1 Nihonbashi-Hongokucho,Chuo-ku,Tokyo (<a href=\"/en/about/outline/location/index.htm\">location</a>)<br>\r\n",
  "          Tel:+81-3-3279-1111\r\n",
  "        </address>\r\n",
  "      </div><!-- /left -->\r\n",
  "      <div class=\"right logo_area_right-top\">\r\n",
  "        <ul>\r\n",
  "          <li><a href=\"/en/about/services/index.htm\">Services</a>\r\n",
  "            <ul>\r\n",
  "              <li><a href=\"/en/about/services/bn/index.htm\">Exchange of Damaged Cash</a></li>\r\n",
  "            </ul>\r\n",
  "          </li>\r\n",
  "          <li>Organization\r\n",
  "            <ul>\r\n",
  "              <li><a href=\"/en/about/organization/index.htm\">Organization of the Bank</a></li>\r\n",
  "              <li><a href=\"/en/about/outline/location/map.htm\">Head Office, Branches, and Overseas Offices</a></li>\r\n",
  "            </ul>\r\n",
  "          </li>\r\n",
  "        </ul>\r\n",
  "      </div><!-- /right -->\r\n",
  "      <div class=\"left logo_area-toggle_bottom\">\r\n",
  "        <p class=\"logo\"><a href=\"/en/\"><img src=\"/common2/img/common/logo.gif\" alt=\"日本銀行 Bank of Japan\"></a></p>\r\n",
  "        <address>\r\n",
  "          2-1-1 Nihonbashi-Hongokucho,Chuo-ku,Tokyo <span class=\"gen-disp_inline-block\">(<a href=\"/en/about/outline/location/index.htm\">location</a>)</span><br>\r\n",
  "          Tel:+81-3-3279-1111\r\n",
  "        </address>\r\n",
  "      </div><!-- /left -->\r\n",
  "    </div>\r\n",
  "    <dl class=\"nav\">\r\n",
  "      <dt>Other Links</dt>\r\n",
  "      <dd><a class=\"no_icon\" href=\"https://www.imes.boj.or.jp/en/index.html\">Institute for Monetary and Economic Studies</a></dd>\r\n",
  "    </dl>\r\n",
  "    <ul class=\"nav\">\r\n",
  "      <li><a href=\"/en/about/abouthp.htm\">About the Site</a></li>\r\n",
  "      <li><a href=\"/en/mailing/index.htm\">E-mail Service</a></li>\r\n",
  "      <li><a href=\"/en/help.htm\">Help</a></li>\r\n",
  "      <li><a href=\"/en/about/services/contact.htm\">Contact</a></li>\r\n",
  "      <li><a href=\"/en/about/link/index.htm\">Links</a></li>\r\n",
  "      <li><a href=\"/en/about/sitemap.htm\">Site Map</a></li>\r\n",
  "    </ul>\r\n",
  "  </div><!-- /outline -->\r\n",
  "  <p id=\"copy\">\r\n",
  "    <small>Copyright Bank of Japan All Rights Reserved.</small>\r\n",
  "    <a href=\"#header_area\" id=\"page_top\"><img src=\"/common2/img/common/page_top.gif\" alt=\"Page top\"></a>\r\n",
  "  </p>\r\n",
  "</footer><!-- /footer -->\r\n",
  "    <!-- ▲▲　フッター　▲▲-->\r\n",
  "  </div>\r\n",
  "</div>\r\n",
  "<!-- ▼▼　JS読み込み　▼▼-->\r\n",
  "<script src=\"/common2/js/common2.js\"></script>\r\n",
  "<script src=\"/common2/js/qssearch.js\"></script>\r\n",
  "<!-- ▲▲　JS読み込み　▲▲--></body>\r\n",
  "</html>\r\n",
].join("");

const officialAprilHtml = [
  "<!DOCTYPE html><html lang=\"en\">\r\n",
  "<head prefix=\"og: http://ogp.me/ns# fb: http://ogp.me/ns/fb# article: http://ogp.me/ns/article#\">\r\n",
  "<meta http-equiv=\"Content-Type\" content=\"text/html; charset=UTF-8\"><meta name=\"author\" content=\"\">\r\n",
  "<meta name=\"description\" content=\"\">\r\n",
  "<meta name=\"keywords\" content=\"\">\r\n",
  "<title>Statement on Monetary Policy  : 日本銀行 Bank of Japan</title>\r\n",
  "<link rel=\"stylesheet\" type=\"text/css\" href=\"/common2/css/wysiwyg.css\">\r\n",
  "<link rel=\"stylesheet\" type=\"text/css\" href=\"/common2/css/style.css\">\r\n",
  "\r\n",
  "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1.0\">\r\n",
  "<meta name=\"format-detection\" content=\"telephone=no\">\r\n",
  "<meta property=\"og:title\" content=\"Statement on Monetary Policy  : 日本銀行 Bank of Japan\">\r\n",
  "<meta property=\"og:type\" content=\"article\">\r\n",
  "<meta property=\"og:url\" content=\"https://www.boj.or.jp/en/mopo/mpmdeci/state_2024/k240426a.htm\">\r\n",
  "<meta property=\"og:image\" content=\"https://www.boj.or.jp/common2/img/common/og_img.jpg\">\r\n",
  "<meta property=\"og:site_name\" content=\"Bank of Japan\">\r\n",
  "<meta property=\"og:description\" content=\"\">\r\n",
  "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\r\n",
  "<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\r\n",
  "<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@100;300;400;500;700;900&display=swap\">\r\n",
  "<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@600&display=swap\"></head>\r\n",
  "<body class=\"cate-mopo en\">\r\n",
  "\r\n",
  "\r\n",
  "\r\n",
  "<div class=\"block_skip\"><a href=\"#contents\">Skip to main content</a></div>\r\n",
  "<div class=\"clear_fix\">\r\n",
  "<header id=\"header_area\" class=\"lonav on\" role=\"banner\">\r\n",
  "  <button id=\"menuBtn\" aria-expanded=\"false\" aria-controls=\"left_col\">\r\n",
  "    <img class=\"open\" src=\"/common2/img/common/menu.png\" alt=\"Open the menu\">\r\n",
  "    <img class=\"close\" src=\"/common2/img/common/close.png\" alt=\"Close the menu\">\r\n",
  "  </button>\r\n",
  "  <div id=\"left_col\">\r\n",
  "    <!-- ▼▼　ヘッダー　▼▼-->\r\n",
  "    <div id=\"header\">\r\n",
  "  <p class=\"logo gen-disp_pc\"><a href=\"/en/\"><img src=\"/common2/img/common/logo.jpg\" alt=\"日本銀行 Bank of Japan\"></a></p>\r\n",
  "  <ul class=\"lang\">\r\n",
  "    <li lang=\"ja\"><a href=\"/\">日本語</a></li>\r\n",
  "    <li aria-current=\"page\"><em>English</em></li>\r\n",
  "  </ul>\r\n",
  "</div>\r\n",
  "    <!-- ▲▲　ヘッダー　▲▲-->\r\n",
  "    <!-- ▼▼　ナビゲーション　▼▼ -->\r\n",
  "    <nav id=\"glnav\" aria-label=\"Main menu\">\r\n",
  "      <ul class=\"glnav_ul\">\r\n",
  "      <li>\n",
  "<a class=\"glnav1st glnav-link glnav_home\" href=\"/en/\">Home</a>\n",
  "</li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav1st\" aria-expanded=\"false\" aria-controls=\"glnav2\">About the Bank</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav2\" class=\"glnav1st_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/about/index.htm\">About the Bank</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav2-1\">Outline of the Bank</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav2-1\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/outline/index.htm\">Outline of the Bank</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/outline/history/index.htm\">History</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/outline/history/pre_gov/index.htm\">List of Governors</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/outline/location/index.htm\">Location (Guide Map to Head Office) / Visiting the Bank</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/outline/location/map.htm\">Head Office, Branches, and Overseas Offices</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/outline/imes_archive/index.htm\">Archives</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav2-1\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav2-2\">Organization of the Bank</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav2-2\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/organization/index.htm\">Organization of the Bank</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/organization/policyboard/index.htm\">Policy Board</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/organization/tanto.htm\">Responsibilities of the Governor, Deputy Governors, and Executive Directors</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/organization/chart/index.htm\">Organization of Head office, Branches and Offices</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav2-2\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/about/boj_law/index.htm\">Laws and Rules</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/about/account/index.htm\">The Bank's Accounts</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav2-3\">Activities</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav2-3\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/activities/index.htm\">Activities</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/activities/principle.htm\">The Bank's Organizational Core Principles</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/activities/strategy/index.htm\">Medium-Term Strategic Plan</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/activities/act/index.htm\">Annual Review</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav2-3\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/about/bcp/index.htm\">Business Continuity Planning</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/about/press/index.htm\">Speeches and Statements</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav2-4\">Research Papers, Reports, Speeches and Statements Related to the Bank</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav2-4\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li class=\"glnav-nolink\">Research Papers, Reports, Speeches and Statements Related to the Bank</li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/r_menu_ron/index.htm\">Research Papers</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/r_menu_koen/index.htm\">Speeches</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/r_menu_dan/index.htm\">Statements</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav2-4\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/about/release_2026/index.htm\">Other Releases</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/about/pr_events/index.htm\">Tours and Museums</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/about/education/index.htm\">Guides to the Bank</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav2-5\">Services</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav2-5\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/services/index.htm\">Services</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/services/bn/index.htm\">Exchange of Damaged Cash</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/services/kengaku.htm\">Tours of the Bank's Head Office</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav2-5\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/about/climate/index.htm\">Climate Change</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/about/link/index.htm\">Links</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav1st_close\" aria-expanded=\"false\" aria-controls=\"glnav2\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li class=\"current\">\n",
  "<button class=\"glnav-btn glnav1st\" aria-expanded=\"false\" aria-controls=\"glnav3\">Monetary Policy</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav3\" class=\"glnav1st_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/mopo/index.htm\">Monetary Policy</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav3-1\">Outline of Monetary Policy</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav3-1\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/outline/index.htm\">Outline of Monetary Policy</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/outline/target.htm\">Price Stability Target of 2 Percent</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/outline/bpreview/index.htm\">Review of Monetary Policy from a Broad Perspective</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav3-1\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav3-2\">Monetary Policy Meetings</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav3-2\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/mpmsche_minu/index.htm\">Monetary Policy Meetings</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/mpmsche_minu/opinion_2026/index.htm\">Summary of Opinions</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/mpmsche_minu/minu_2026/index.htm\">Minutes</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/mpmsche_minu/m_ref/index.htm\">Others</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav3-2\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/mopo/mpmdeci/index.htm\">Monetary Policy Releases</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav3-3\">Monetary Policy Measures</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav3-3\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/measures/index.htm\">Monetary Policy Measures</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/measures/mkt_ope/index.htm\">Market Operations</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/measures/term_cond/index.htm\">Principal Terms and Conditions</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav3-3\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/mopo/outlook/index.htm\">Outlook for Economic Activity and Prices</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/mopo/diet/index.htm\">Reports to the Diet</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav3-4\">Research Papers, Reports, Speeches and Statements Related to Monetary Policy</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav3-4\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li class=\"glnav-nolink\">Research Papers, Reports, Speeches and Statements Related to Monetary Policy</li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/r_menu_ron/index.htm\">Research Papers</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/r_menu_koen/index.htm\">Speeches</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/r_menu_dan/index.htm\">Statements</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav3-4\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><button class=\"glnav-btn_close glnav1st_close\" aria-expanded=\"false\" aria-controls=\"glnav3\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav1st\" aria-expanded=\"false\" aria-controls=\"glnav4\">Financial System</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav4\" class=\"glnav1st_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/finsys/index.htm\">Financial System</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/finsys/outline/index.htm\">Overview: The Bank's Initiatives for Financial Stability</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/finsys/exam_monit/index.htm\">On-Site Examinations and Off-Site Monitoring</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/finsys/fsr/index.htm\">Financial System Report</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/finsys/fs_policy/index.htm\">Policy Actions for Financial Stability</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/finsys/cofsa/index.htm\">Coordination with the Financial Services Agency</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/finsys/c_aft/index.htm\">Seminars for Financial Institutions</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav4-1\">Other Releases Related to Financial System</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav4-1\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/finsys/release/index.htm\">Other Releases Related to Financial System</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/finsys/r_menu_ron/index.htm\">Research Papers</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/finsys/r_menu_koen/index.htm\">Speeches</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/finsys/r_menu_dan/index.htm\">Statements</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav4-1\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><button class=\"glnav-btn_close glnav1st_close\" aria-expanded=\"false\" aria-controls=\"glnav4\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav1st\" aria-expanded=\"false\" aria-controls=\"glnav5\">Payments and Markets</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav5\" class=\"glnav1st_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/paym/index.htm\">Payments and Markets</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav5-1\">Outline of Payment and Settlement Systems</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav5-1\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/outline/index.htm\">Outline of Payment and Settlement Systems</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/outline/pay_boj/index.htm\">Payment and Settlement Systems and the Bank</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/outline/pay_os/index.htm\">Oversight</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/outline/pay_forum/index.htm\">Forums</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/outline/pay_ps/index.htm\">Payment and Settlement Systems Operated by the Private Sector</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav5-1\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/paym/bojnet/index.htm\">Operation of BOJ-NET</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/paym/jgb_bes/index.htm\">JGB Book-Entry System</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/paym/fintech/index.htm\">FinTech Center</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/paym/digital/index.htm\">Central Bank Digital Currency</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav5-2\">Money Market</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav5-2\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/market/index.htm\">Money Market</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/market/jpy_cmte/index.htm\">Cross-Industry Committee on Japanese Yen Interest Rate Benchmarks</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/market/i_forum/index.htm\">Cross-Industry Forum on Interest Rate Benchmarks</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/market/sg/index.htm\">Study Group of Market Participants</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/market/r_forum/index.htm\">Repo Market Forum</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav5-2\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/paym/bond/index.htm\">Bond Market</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/paym/credit/index.htm\">Credit Market</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/paym/forum/index.htm\">Forums and Conferences</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav5-3\">Research Papers, Reports, Speeches and Statements Related to Payment and Markets</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav5-3\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li class=\"glnav-nolink\">Research Papers, Reports, Speeches and Statements Related to Payment and Markets</li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/research/brp/psr/index.htm\">Payment and Settlement Systems Report</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/research/brp/mor/index.htm\">Market Operations in Each Fiscal Year</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/m-climate/index.htm\">Market Functioning Survey concerning Climate Change</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/r_menu_ron/index.htm\">Research Papers</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/r_menu_koen/index.htm\">Speeches</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/r_menu_dan/index.htm\">Statements</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav5-3\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/paym/release/index.htm\">Other Releases Related to Payment and Markets</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav1st_close\" aria-expanded=\"false\" aria-controls=\"glnav5\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav1st\" aria-expanded=\"false\" aria-controls=\"glnav6\">Banknotes, The Bank's Treasury Funds and JGS Services</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav6\" class=\"glnav1st_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/note_tfjgs/index.htm\">Banknotes, The Bank's Treasury Funds and JGS Services</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav6-1\">General Information of Banknotes and Coins</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav6-1\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/note_tfjgs/note/index.htm\">General Information of Banknotes and Coins</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/note_tfjgs/note/n_note/index.htm\">A New Series of Banknotes and a New 500 Yen Coin</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/note_tfjgs/note/valid/index.htm\">Banknotes and Coins in Use</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/note_tfjgs/note/security/index.htm\">Security Features of Bank of Japan Notes</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/note_tfjgs/note/outline/index.htm\">Outline of Banknotes and Coins</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/note_tfjgs/note/related/index.htm\">Related Releases</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/note_tfjgs/note/n_other/index.htm\">Publications and Other Information</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/services/bn/index.htm\">Exchange of Damaged Cash</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav6-1\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/note_tfjgs/kokko/index.htm\">Treasury Funds Services</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/note_tfjgs/jgs/index.htm\">JGS Services</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/note_tfjgs/trans/index.htm\">The Bank's Transactions with the Government</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav6-2\">Research Papers, Reports, Speeches and Statements Related to Banknotes, Treasury Funds and JGS Services</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav6-2\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li class=\"glnav-nolink\">Research Papers, Reports, Speeches and Statements Related to Banknotes, Treasury Funds and JGS Services</li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/note_tfjgs/r_menu_ron/index.htm\">Research Papers</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/note_tfjgs/r_menu_koen/index.htm\">Speeches</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/note_tfjgs/r_menu_dan/index.htm\">Statements</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav6-2\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><button class=\"glnav-btn_close glnav1st_close\" aria-expanded=\"false\" aria-controls=\"glnav6\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav1st\" aria-expanded=\"false\" aria-controls=\"glnav7\">International Finance</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav7\" class=\"glnav1st_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/intl_finance/index.htm\">International Finance</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/intl_finance/outline/index.htm\">Outline of International Finance</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/intl_finance/meeting/index.htm\">International Meetings</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/intl_finance/ex_assets/index.htm\">Foreign Currency Assets</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/intl_finance/cooperate/index.htm\">Cooperation with Other Central Banks</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/intl_finance/cemcoa/index.htm\">Financial Cooperation in Asia</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav7-1\">Research Papers, Reports, Speeches and Statements Related to International Finance</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav7-1\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li class=\"glnav-nolink\">Research Papers, Reports, Speeches and Statements Related to International Finance</li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/intl_finance/r_menu_ron/index.htm\">Research Papers</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/intl_finance/r_menu_koen/index.htm\">Speeches</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/intl_finance/r_menu_dan/index.htm\">Statements</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav7-1\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/intl_finance/release/index.htm\">Other Releases Related to International Finance</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav1st_close\" aria-expanded=\"false\" aria-controls=\"glnav7\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav1st\" aria-expanded=\"false\" aria-controls=\"glnav8\">Research and Studies</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav8\" class=\"glnav1st_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/index.htm\">Research and Studies</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/outline/index.htm\">Outline of Research and Studies</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/rs_all_2026/index.htm\">List of Reports & Research Papers</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav8-1\">BOJ Reports & Research Papers</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav8-1\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/research/brp/index.htm\">BOJ Reports & Research Papers</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/research/brp/fsr/index.htm\">Financial System Report</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/research/brp/mor/index.htm\">Market Operations in Each Fiscal Year</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/research/brp/psr/index.htm\">Payment and Settlement Systems Report</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/research/brp/rer/index.htm\">Regional Economic Report</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/research/brp/ron_2026/index.htm\">Research Papers</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav8-1\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/wps_rev/index.htm\">Working Paper Series, Review Series, and Research Laboratory Series</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/research_data/index.htm\">Research Data</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/imes/index.htm\">Research Papers Released by IMES</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/other_release/index.htm\">Study Group Reports</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/o_survey/index.htm\">Opinion Survey</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/conf/index.htm\">Conferences</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/bigdata/index.htm\">Alternative Data Analysis</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/past_release/index.htm\">Discontinued Research Releases</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav1st_close\" aria-expanded=\"false\" aria-controls=\"glnav8\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav1st\" aria-expanded=\"false\" aria-controls=\"glnav9\">Statistics</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav9\" class=\"glnav1st_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/index.htm\">Statistics</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav9-1\">Outline of Statistics and Statistical Release Schedule</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav9-1\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/statistics/outline/index.htm\">Outline of Statistics and Statistical Release Schedule</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/statistics/outline/notice_2026/index.htm\">Notices of Changes and Corrections</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/statistics/outline/exp/index.htm\">Explanations of Statistics</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/statistics/outline/general_notice/index.htm\">Notices of Changes and Revisions</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/statistics/outline/note/index.htm\">Notes</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav9-1\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/boj/index.htm\">Bank of Japan Statistics</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/money/index.htm\">Currency</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/market/index.htm\">Financial Markets</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/asli_fi/index.htm\">Financial Institutions Accounts</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/dl/index.htm\">Deposits and Loans Market</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/sj/index.htm\">Flow of Funds</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/bis/index.htm\">Related to BIS/FSB</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/set/index.htm\">Payment and Settlement</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/tk/index.htm\">TANKAN</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/pi/index.htm\">Prices</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/public/index.htm\">Public Finance</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/br/index.htm\">Balance of Payments Related Statistics</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/stop/index.htm\">Discontinued Statistics / Revised Base Statistics</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"https://www.imes.boj.or.jp/en/historical/hstat/hstat.html\">Historical Statistics on the Web Site of IMES</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"https://www.stat-search.boj.or.jp/index_en.html\">BOJ Time-Series Data Search</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav1st_close\" aria-expanded=\"false\" aria-controls=\"glnav9\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "\r\n",
  "      </ul>\r\n",
  "    </nav>\r\n",
  "    <!-- ▲▲　ナビゲーション　▲▲ -->\r\n",
  "    <!-- ▼▼　SNS　▼▼-->\r\n",
  "    <aside role=\"complementary\" id=\"sns\">\r\n",
  "    <ul>\r\n",
  "      <li><a class=\"img\" href=\"https://twitter.com/Bank_of_Japan_e\"><img src=\"/common2/img/common/sns_x.gif\" alt=\"x\"></a></li>\r\n",
  "      <li><a class=\"img\" href=\"https://www.facebook.com/BankofJapan.en\"><img src=\"/common2/img/common/sns_facebook.gif\" alt=\"facebook\"></a></li>\r\n",
  "      <li><a class=\"img\" href=\"https://www.youtube.com/user/BOJchannel/\"><img src=\"/common2/img/common/sns_youtube.gif\" alt=\"youtube\"></a></li>\r\n",
  "    </ul>\r\n",
  "  <p class=\"lnk1\"><a href=\"/en/snspolicy.htm\">Social Networking Site Management Policy</a></p>\r\n",
  "</aside>\r\n",
  "    <!-- ▲▲　SNS　▲▲-->\r\n",
  "  </div>\r\n",
  "</header>\r\n",
  "  <div id=\"right_col\">\r\n",
  "    <div id=\"overlay\" class=\"off glnav-disp_non\"></div>\r\n",
  "    <!-- ▼▼　メインビジュアル　▼▼-->\r\n",
  "    <aside role=\"complementary\" id=\"main_v\">\r\n",
  "      <div class=\"logo gen-disp_sp\"><a href=\"/en/\"><img src=\"/common2/img/common/logo_s.jpg\" alt=\"日本銀行 Bank of Japan\"></a></div>\r\n",
  "      <!-- ▼▼　ヘッダ部タイトル　▼▼-->\r\n",
  "      <p class=\"main_v-title\">Monetary Policy</p>\r\n",
  "      <!-- ▲▲　ヘッダ部タイトル　▲▲-->\r\n",
  "      <div class=\"main_v-text_area\">\r\n",
  "        <!-- ▼▼　検索フォーム　▼▼-->\r\n",
  "        <form class=\"search_form\" role=\"search\">\r\n",
  "        <div class=\"searchbox\">\r\n",
  "          <input id=\"qs_sslang\" value=\"1\" type=\"hidden\">\r\n",
  "          <div class=\"autocomplete\">\r\n",
  "            <input id=\"qs_keyword\" name=\"search\" type=\"text\" title=\"search\" autocomplete=\"off\" list=\"suggest0-list\" role=\"combobox\" aria-owns=\"suggest0-list\" aria-autocomplete=\"list\" aria-expanded=\"false\">\r\n",
  "            <datalist id=\"suggest0-list\"></datalist>\r\n",
  "          </div><input onclick=\"QSSimpleSearchOnSubmit();return false\" type=\"image\" src=\"/common2/img/common/search.gif\" alt=\"Search\">\r\n",
  "          <div id=\"suggest0-result\" aria-live=\"polite\" role=\"status\" class=\"visually-hidden\"></div>\r\n",
  "        </div>\r\n",
  "      </form>\r\n",
  "        <!-- ▲▲　検索フォーム　▲▲-->\r\n",
  "        <!-- ▼▼　パンくずリスト　▼▼-->\r\n",
  "        <nav id=\"topic_path\" role=\"navigation\" aria-label=\"current position\">\r\n",
  "          <ul><li><a href=\"/en/index.htm\">Home</a>&gt;</li><li><a href=\"/en/mopo/index.htm\">Monetary Policy</a>&gt;</li><li><a href=\"/en/mopo/mpmdeci/index.htm\">Monetary Policy Releases</a>&gt;</li><li><a href=\"/en/mopo/mpmdeci/state_2024/index.htm\">Statements on Monetary Policy 2024</a>&gt;</li><li aria-current=\"page\"><em>Statement on Monetary Policy</em></li></ul>\r\n",
  "        </nav>\r\n",
  "        <!-- ▲▲　パンくずリスト　▲▲-->\r\n",
  "      </div>\r\n",
  "    </aside>\r\n",
  "    <!-- ▲▲　メインビジュアル　▲▲-->\r\n",
  "    <main id=\"contents\">\r\n",
  "      <h1>\n",
  "Statement on Monetary Policy\n",
  "</h1>\r\n",
  "      <!-- ▼▼　日本語・英語切り替え　▼▼-->\r\n",
  "      \r\n",
  "      <!-- ▲▲　日本語・英語切り替え　▲▲-->\r\n",
  "      <!-- ▼▼　コンテンツ　▼▼-->\r\n",
  "      <div class=\"outline mod_outer\">\r\n",
  "      <!-- [START] CONTENT_1 --><p>April 26, 2024<br>\n",
  "Bank of Japan</p>\n",
  "<ul class=\"link-list01\">\n",
  "    <li><a href=\"/en/mopo/mpmdeci/mpr_2024/k240426a.pdf\">PDF Version [PDF 368KB]</a></li>\n",
  "</ul><!-- [END] CONTENT_1 --><!-- [START] CONTENT_2 --><p>At the Monetary Policy Meeting (MPM) held today, the Policy Board of the Bank of Japan decided, by a unanimous vote, to set the following guideline for money market operations for the intermeeting period:</p>\n",
  "<div class=\"ml2em\">\n",
  "\t<p>The Bank will encourage the uncollateralized overnight call rate to remain at around 0 to 0.1 percent.</p>\n",
  "</div>\n",
  "<p>Regarding purchases of Japanese government bonds, CP, and corporate bonds, the Bank will conduct the purchases in accordance with the decisions made at the March 2024 MPM.</p>\n",
  "<hr class=\"double\">\n",
  "<p>(Reference)</p>\n",
  "<div class=\"ml1em\">\n",
  "\t<dl>\n",
  "\t\t<dt>Meeting hours:</dt>\n",
  "\t\t<dd class=\"pl2em\">\n",
  "\t\t\t<ul class=\"no-list\">\n",
  "\t\t\t\t<li class=\"mb0\">Thursday, April 25: 14:00-16:10</li>\n",
  "\t\t\t\t<li>Friday, April 26: 9:00-12:15</li>\n",
  "\t\t\t</ul>\n",
  "\t\t</dd>\n",
  "\t\t<dt class=\"mt1em\">Policy Board members present:</dt>\n",
  "\t\t<dd class=\"mb0 pl2em\">\n",
  "\t\t\t<ul class=\"no-list\">\n",
  "\t\t\t\t<li class=\"mb0\">UEDA Kazuo, Chairman (Governor)</li>\n",
  "\t\t\t\t<li class=\"mb0\">HIMINO Ryozo (Deputy Governor) <sup>1</sup></li>\n",
  "\t\t\t\t<li class=\"mb0\">UCHIDA Shinichi (Deputy Governor)</li>\n",
  "\t\t\t\t<li class=\"mb0\">ADACHI Seiji</li>\n",
  "\t\t\t\t<li class=\"mb0\">NAKAMURA Toyoaki</li>\n",
  "\t\t\t\t<li class=\"mb0\">NOGUCHI Asahi</li>\n",
  "\t\t\t\t<li class=\"mb0\">NAKAGAWA Junko</li>\n",
  "\t\t\t\t<li class=\"mb0\">TAKATA Hajime</li>\n",
  "\t\t\t\t<li class=\"mb0\">TAMURA Naoki</li>\n",
  "\t\t\t</ul>\n",
  "\t\t</dd>\n",
  "\t</dl>\n",
  "</div>\n",
  "<ol class=\"asterisk-number-red\">\n",
  "\t<li><span>1</span> HIMINO was present via conference call.</li>\n",
  "</ol>\n",
  "<div class=\"ml1em\">\n",
  "\t<p class=\"pt1em\">[Others present]</p>\n",
  "\t<dl class=\"ml1em\">\n",
  "\t\t<dt><strong>April 25</strong></dt>\n",
  "\t\t<dd class=\"indent2 pl2em\">From the Ministry of Finance:<br>\n",
  "\t\t\tSAKAMOTO Motoru, Deputy Vice-Minister for Policy Planning and Coordination (14:00-16:10)</dd>\n",
  "\t\t<dd class=\"indent2 pl2em\">From the Cabinet Office:<br>\n",
  "\t\t\tINOUE Hiroyuki, Vice-Minister for Policy Coordination (14:00-16:10)</dd>\n",
  "\t\t<dt><strong>April 26</strong></dt>\n",
  "\t\t<dd class=\"indent2 pl2em\">From the Ministry of Finance:<br>\n",
  "\t\t\tAKAZAWA Ryosei, State Minister of Finance (9:00-11:57, 12:03-12:15)</dd>\n",
  "\t\t<dd class=\"indent2 pl2em\">From the Cabinet Office:<br>\n",
  "\t\t\tMORO Kengo, Deputy Director General for Economic and Fiscal Management (9:00-10:56)<br>\n",
  "\t\t\tSHINDO Yoshitaka, Minister of State for Economic and Fiscal Policy (10:57-11:57, 12:03-12:15)</dd>\n",
  "\t</dl>\n",
  "</div>\n",
  "<dl class=\"mt2em ml1em\">\n",
  "\t<dt>Release dates and times:</dt>\n",
  "\t<dd class=\"indent2 pl2em\">Statement on Monetary Policy -- Friday, April 26 at 12:22</dd>\n",
  "\t<dd class=\"indent2 pl2em\">Outlook for Economic Activity and Prices (Outlook Report)</dd>\n",
  "\t<dd class=\"indent2 pl3em\">The Bank's View -- Friday, April 26 at 12:22</dd>\n",
  "\t<dd class=\"indent2 pl3em\">Full text -- Tuesday, April 30 at 14:00</dd>\n",
  "\t<dd class=\"indent2 pl2em\">Summary of Opinions -- Thursday, May 9 at 8:50</dd>\n",
  "\t<dd class=\"indent2 pl2em\">Minutes of the Monetary Policy Meeting -- Wednesday, June 19 at 8:50</dd>\n",
  "</dl><!-- [END] CONTENT_2 -->\r\n",
  "      </div>\r\n",
  "      <!-- ▲▲　コンテンツ　▲▲-->\r\n",
  "    </main>\r\n",
  "    <!-- ▼▼　フッター　▼▼-->\r\n",
  "    <footer id=\"footer\">\r\n",
  "  <div class=\"outline\">\r\n",
  "    <div class=\"logo_area\">\r\n",
  "      <div class=\"left logo_area-toggle_left\">\r\n",
  "        <p class=\"logo\"><a href=\"/en/\"><img src=\"/common2/img/common/logo.gif\" alt=\"日本銀行 Bank of Japan\"></a></p>\r\n",
  "        <address>\r\n",
  "          2-1-1 Nihonbashi-Hongokucho,Chuo-ku,Tokyo (<a href=\"/en/about/outline/location/index.htm\">location</a>)<br>\r\n",
  "          Tel:+81-3-3279-1111\r\n",
  "        </address>\r\n",
  "      </div><!-- /left -->\r\n",
  "      <div class=\"right logo_area_right-top\">\r\n",
  "        <ul>\r\n",
  "          <li><a href=\"/en/about/services/index.htm\">Services</a>\r\n",
  "            <ul>\r\n",
  "              <li><a href=\"/en/about/services/bn/index.htm\">Exchange of Damaged Cash</a></li>\r\n",
  "            </ul>\r\n",
  "          </li>\r\n",
  "          <li>Organization\r\n",
  "            <ul>\r\n",
  "              <li><a href=\"/en/about/organization/index.htm\">Organization of the Bank</a></li>\r\n",
  "              <li><a href=\"/en/about/outline/location/map.htm\">Head Office, Branches, and Overseas Offices</a></li>\r\n",
  "            </ul>\r\n",
  "          </li>\r\n",
  "        </ul>\r\n",
  "      </div><!-- /right -->\r\n",
  "      <div class=\"left logo_area-toggle_bottom\">\r\n",
  "        <p class=\"logo\"><a href=\"/en/\"><img src=\"/common2/img/common/logo.gif\" alt=\"日本銀行 Bank of Japan\"></a></p>\r\n",
  "        <address>\r\n",
  "          2-1-1 Nihonbashi-Hongokucho,Chuo-ku,Tokyo <span class=\"gen-disp_inline-block\">(<a href=\"/en/about/outline/location/index.htm\">location</a>)</span><br>\r\n",
  "          Tel:+81-3-3279-1111\r\n",
  "        </address>\r\n",
  "      </div><!-- /left -->\r\n",
  "    </div>\r\n",
  "    <dl class=\"nav\">\r\n",
  "      <dt>Other Links</dt>\r\n",
  "      <dd><a class=\"no_icon\" href=\"https://www.imes.boj.or.jp/en/index.html\">Institute for Monetary and Economic Studies</a></dd>\r\n",
  "    </dl>\r\n",
  "    <ul class=\"nav\">\r\n",
  "      <li><a href=\"/en/about/abouthp.htm\">About the Site</a></li>\r\n",
  "      <li><a href=\"/en/mailing/index.htm\">E-mail Service</a></li>\r\n",
  "      <li><a href=\"/en/help.htm\">Help</a></li>\r\n",
  "      <li><a href=\"/en/about/services/contact.htm\">Contact</a></li>\r\n",
  "      <li><a href=\"/en/about/link/index.htm\">Links</a></li>\r\n",
  "      <li><a href=\"/en/about/sitemap.htm\">Site Map</a></li>\r\n",
  "    </ul>\r\n",
  "  </div><!-- /outline -->\r\n",
  "  <p id=\"copy\">\r\n",
  "    <small>Copyright Bank of Japan All Rights Reserved.</small>\r\n",
  "    <a href=\"#header_area\" id=\"page_top\"><img src=\"/common2/img/common/page_top.gif\" alt=\"Page top\"></a>\r\n",
  "  </p>\r\n",
  "</footer><!-- /footer -->\r\n",
  "    <!-- ▲▲　フッター　▲▲-->\r\n",
  "  </div>\r\n",
  "</div>\r\n",
  "<!-- ▼▼　JS読み込み　▼▼-->\r\n",
  "<script src=\"/common2/js/common2.js\"></script>\r\n",
  "<script src=\"/common2/js/qssearch.js\"></script>\r\n",
  "<!-- ▲▲　JS読み込み　▲▲--></body>\r\n",
  "</html>\r\n",
].join("");

const selectedJuneGuideline = "The Bank will encourage the uncollateralized overnight call rate to remain at around 0 to 0.1 percent.";
const juneGuidelineParagraph = "<p>" + selectedJuneGuideline + "</p>";
const junePurchaseParagraph = officialJuneHtml.match(/<p>Regarding purchases[\s\S]*?<\/p>/)![0];
const junePurchaseNote = officialJuneHtml.match(/<li id="note01">[\s\S]*?<\/li>/)![0];
const juneDecisionList = officialJuneHtml.match(/<ol>\s*<li>At the Monetary Policy Meeting[\s\S]*?<\/ol>/)![0];
function officialDocument(html = officialJuneHtml, decisionDate = "2024-06-14") {
  return { url: bojPolicyDocumentUrlV1(decisionDate), html };
}
function replaceJune(before: string, after: string): string {
  assert.equal(officialJuneHtml.split(before).length, 2, "one mutation location in authentic June fixture");
  return officialJuneHtml.replace(before, after);
}
const officialTarget = { shape: "range", lower: 0, upper: 0.1, qualification: "around" } as const;
for (const [decisionDate, html, digest, bytes] of [
  ["2024-06-14", officialJuneHtml, "af0174ad9d0c16c9128292720ddec3fb8e96c601b68c06eadf6f3bea6a77bfff", 42692],
  ["2024-04-26", officialAprilHtml, "7d79d6b1d0e44fee1e709ec2a1f65fd5141c109d64c3ad52890c01256fcb75bf", 38733],
] as const) {
  test("complete unchanged official " + decisionDate + " statement preserves selected guideline and identity", () => {
    assert.equal(Buffer.byteLength(html), bytes); assert.equal(createHash("sha256").update(html).digest("hex"), digest);
    const doc = officialDocument(html, decisionDate); const fact = parseBojPolicyDocumentV1(doc, decisionDate);
    assert.deepEqual(fact, { institution: "Bank of Japan", productId: "eurjpy", instrument: BOJ_POLICY_INSTRUMENT_V1,
      decisionDate, documentKind: "statement", target: officialTarget, unit: "percent", sourceUrl: doc.url,
      releaseTimestamp: null, effectiveDate: null });
    const evidence = buildBojPolicyEvidenceV1(fact, captureTime);
    assert.equal(evidence.metadata.canonicalSeriesId, "japan-boj-policy-decision:" + decisionDate);
    assert.deepEqual(readBojPolicyFactV1(decisionDate, evidence), fact);
    const action = buildBojPolicyDecisionActionEvidenceV1({ document: doc, capture: {
      knownAt: captureTime, evidence, decodedSourceDigest: "sha256:" + digest,
    } });
    assert.equal(action.action, "set-guideline"); assert.deepEqual(action.capture.evidence, evidence);
    for (const key of ["direction", "predecessor", "comparison", "delta", "midpoint", "representativeRate"]) assert.equal(Object.hasOwn(action, key), false);
  });
  test("existing capture and action receipt readers qualify official " + decisionDate + " after completion clock", async () => {
    await checkOfficialDecisionCapture(html, decisionDate, true);
  });
}
async function checkOfficialDecisionCapture(html: string, decisionDate: string, accepted: boolean) {
  let clocks = 0, eof = false, releases = 0, issued: unknown;
  const parsed: string[] = [];
  const body = new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
  Object.defineProperty(body, "url", { value: bojPolicyDocumentUrlV1(decisionDate) });
  const stream = body.body!; const nativeGetReader = stream.getReader.bind(stream);
  Object.defineProperty(stream, "getReader", { value: () => {
    const reader = nativeGetReader(), nativeRead = reader.read.bind(reader), nativeRelease = reader.releaseLock.bind(reader);
    reader.read = async () => { const part = await nativeRead(); if (part.done) eof = true; return part; };
    reader.releaseLock = () => { releases++; nativeRelease(); };
    return reader;
  } });
  const owner = createBojPolicyDecisionCaptureAuthorityV1({
    fetchImpl: async (url, init) => { assert.equal(url, bojPolicyDocumentUrlV1(decisionDate)); assert.equal(init?.redirect, "error"); return body; },
    nowUnixSeconds: () => {
      assert.equal(issued, undefined); assert.ok(eof); assert.ok(parsed.length >= 6, "both selected-fact and action parsing completed");
      clocks++; parsed.push("clock"); return captureTime;
    },
  });
  const nativeParse = XMLParser.prototype.parse;
  try {
    XMLParser.prototype.parse = function (this: XMLParser, ...args: Parameters<typeof nativeParse>) {
      const result = nativeParse.apply(this, args); parsed.push("parsed"); return result;
    } as typeof nativeParse;
    if (accepted) {
      const result = await owner.acquire({ decisionDate, signal: new AbortController().signal }); issued = result;
      assert.equal(result.status, "acquired"); assert.equal(clocks, 1); assert.equal(parsed.at(-1), "clock");
      const assessment = { receipt: result.receipt, evaluatedAt: new Date(captureTime * 1000).toISOString() };
      const selected = owner.readAsKnownAt(assessment), action = owner.readActionAsKnownAt(assessment);
      assert.ok(selected.status === "available"); assert.ok(action.status === "available");
      assert.deepEqual(selected.capture.evidence.fact.target, officialTarget);
      assert.equal(selected.capture.evidence.metadata.canonicalSeriesId, "japan-boj-policy-decision:" + decisionDate);
      assert.equal(selected.capture.knownAt, captureTime); assert.equal(action.evidence.action, "set-guideline");
      assert.deepEqual(action.evidence.capture, selected.capture);
      assert.equal(selected.capture.decodedSourceDigest, "sha256:" + createHash("sha256").update(html).digest("hex"));
      assert.throws(() => readBojPolicyDecisionCaptureAsKnownAtV1(assessment), /Unrecognized/);
      assert.throws(() => owner.readAsKnownAt({ ...assessment, receipt: selected.capture as unknown as BojPolicyDecisionCaptureReceiptV1 }), /Unrecognized/);
      assert.deepEqual(owner.readAsKnownAt({ ...assessment, evaluatedAt: new Date(captureTime * 1000 - 1).toISOString() }), { status: "not-known-as-of" });
    } else {
      await assert.rejects(async () => { issued = await owner.acquire({ decisionDate, signal: new AbortController().signal }); }, BojPolicyValidationError);
      assert.equal(clocks, 0); assert.equal(issued, undefined);
      const forged = { receipt: {} as BojPolicyDecisionCaptureReceiptV1, evaluatedAt: new Date(captureTime * 1000).toISOString() };
      assert.throws(() => owner.readAsKnownAt(forged), /Unrecognized/);
      assert.throws(() => owner.readActionAsKnownAt(forged), /Unrecognized/);
    }
    assert.equal(eof, true); assert.equal(releases, 1); assert.equal(stream.locked, false);
  } finally { XMLParser.prototype.parse = nativeParse; }
}

test("June JGB vote and purchase-reduction note are separate from the selected call-rate guideline", () => {
  assert.ok(junePurchaseParagraph.includes("an 8-1 majority vote")); assert.ok(junePurchaseNote.includes("purchase amount of JGBs"));
  const original = parseBojPolicyDocumentV1(officialDocument(), "2024-06-14");
  assert.deepEqual(original.target, officialTarget);
  // The second decision item contains macro/observed-rate commentary, not a selected guideline.
  const unrelated = replaceJune("Japan's economy has recovered moderately", "The observed overnight call rate was 9 percent. Japan's economy has recovered moderately");
  // An observed-rate comment may be semantically unrelated, but its bytes are unapproved.
  assert.throws(() => parseBojPolicyDocumentV1(officialDocument(unrelated), "2024-06-14"), code("document"));
});

for (const [label, change] of [
  ["missing purchase paragraph", () => replaceJune(junePurchaseParagraph, "")],
  ["purchase paragraph displaced into second decision item", () => replaceJune(junePurchaseParagraph, "").replace("<li>Japan's economy", "<li>" + junePurchaseParagraph + "Japan's economy")],
  ["purchase paragraph displaced outside decision item", () => replaceJune(junePurchaseParagraph, "").replace("<!-- [END] CONTENT_2 -->", junePurchaseParagraph + "<!-- [END] CONTENT_2 -->")],
  ["renamed purchase paragraph displaced into second decision item", () => replaceJune(junePurchaseParagraph, "").replace("<li>Japan's economy", "<li>" + junePurchaseParagraph + "Japan's economy").replaceAll("note01", "note02").replaceAll("nt01", "nt02")],
  ["missing purchase paragraph with consistently renamed note IDs", () => replaceJune(junePurchaseParagraph, "").replaceAll("note01", "note02").replaceAll("nt01", "nt02")],
  ["additional renamed purchase measure in second decision item", () => replaceJune("<p>Japan's economy is likely", junePurchaseParagraph.replaceAll("note01", "note02").replaceAll("nt01", "nt02") + "<p>Japan's economy is likely")],
  ["extra distinct decision item", () => replaceJune(juneDecisionList, juneDecisionList.replace("</ol>", "<li>Unsupported additional decision.</li></ol>"))],
  ["June converted to ordinary flat layout", () => replaceJune(juneDecisionList, "<p>" + juneDecisionList.match(/<li>([\s\S]*?)<div/)![1]!.trim() + '</p><div class="ml2em">' + juneGuidelineParagraph + "</div>" + junePurchaseParagraph)],
  ["raw prose after purchase measure", () => replaceJune(junePurchaseParagraph, junePurchaseParagraph + " Unsupported additional measure.")],
  ["conflicting setting disguised inside purchase prose", () => replaceJune(junePurchaseParagraph, junePurchaseParagraph.replace("Regarding purchases", guideline("0.5") + " Regarding purchases"))],
  ["raw contradictory guideline in selected div", () => replaceJune(juneGuidelineParagraph, guideline("0.5") + juneGuidelineParagraph)],
  ["raw contradictory guideline in note list", () => replaceJune('<ol class="no-list indent3">', '<ol class="no-list indent3">' + guideline("0.5"))],
  ["extra distinct note-list item", () => replaceJune(junePurchaseNote, junePurchaseNote + "<li>" + guideline("0.5") + "</li>")],
  ["genuine duplicate selected div", () => replaceJune(juneGuidelineParagraph, juneGuidelineParagraph + '</div><div class="ml2em">' + juneGuidelineParagraph)],
  ["unknown trailing explanation", () => replaceJune(junePurchaseParagraph, "<p>An unrelated explanation.</p>")],
  ["changed JGB measure", () => replaceJune("that it would reduce its purchase amount of JGBs", "that it would increase its purchase amount of JGBs")],
  ["changed purchase vote", () => replaceJune("by an 8-1 majority vote, that it would reduce", "by a unanimous vote, that it would reduce")],
  ["changed future-plan qualifier", () => replaceJune("during the next one to two years or so", "starting immediately")],
  ["extra trailing paragraph", () => replaceJune(junePurchaseParagraph, junePurchaseParagraph + "<p>Additional measure.</p>")],
  ["duplicate purchase paragraph", () => replaceJune(junePurchaseParagraph, junePurchaseParagraph + junePurchaseParagraph)],
  ["purchase measure before selected div", () => replaceJune(junePurchaseParagraph, "").replace('<div class="ml2em">', junePurchaseParagraph + '<div class="ml2em">')],
  ["purchase measure inside selected div", () => replaceJune(junePurchaseParagraph, "").replace(juneGuidelineParagraph, juneGuidelineParagraph + junePurchaseParagraph)],
  ["wrapped purchase measure", () => replaceJune(junePurchaseParagraph, "<div>" + junePurchaseParagraph + "</div>")],
  ["unexpected purchase attributes", () => replaceJune(junePurchaseParagraph, junePurchaseParagraph.replace("<p>", '<p class="other">'))],
  ["altered selected div class", () => replaceJune('<div class="ml2em">', '<div class="ml1em">')],
  ["unexpected decision-list attributes", () => replaceJune(juneDecisionList, juneDecisionList.replace("<ol>", '<ol class="other">'))],
  ["unexpected meeting attributes", () => replaceJune("<li>At the Monetary Policy Meeting", '<li class="other">At the Monetary Policy Meeting')],
  ["changed call-rate vote context", () => replaceJune("by a unanimous vote, to set", "by an 8-1 majority vote, to set")],
  ["wrong note destination", () => replaceJune('href="#note01" id="nt01"', 'href="#note02" id="nt01"')],
  ["wrong note marker", () => replaceJune('id="nt01" class="red">[Note]', 'id="nt01" class="red">1')],
  ["missing purchase note", () => replaceJune(junePurchaseNote, "")],
  ["duplicate purchase note", () => replaceJune(junePurchaseNote, junePurchaseNote + junePurchaseNote)],
  ["changed note instrument", () => replaceJune("idea of reducing the Bank's purchase amount of JGBs", "idea of changing the overnight call-rate guideline")],
  ["broken note backlink", () => replaceJune('href="#nt01" title="Return nt01"', 'href="#p99" title="Return nt01"')],
  ["wrong note list context", () => replaceJune('<ol class="no-list indent3">', '<ol class="red-number">')],
  ["contradictory second guideline in meeting", () => replaceJune(junePurchaseParagraph, junePurchaseParagraph + "<p>" + guideline("0.5") + "</p>")],
  ["contradictory second guideline elsewhere", () => replaceJune("<!-- [END] CONTENT_2 -->", "<p>" + guideline("0.5") + "</p><!-- [END] CONTENT_2 -->")],
  ["duplicate selected paragraph", () => replaceJune(juneGuidelineParagraph, juneGuidelineParagraph + juneGuidelineParagraph)],
  ["wrong heading", () => replaceJune("<h1>\nStatement on Monetary Policy", "<h1>\nSummary of Opinions")],
  ["wrong publisher date", () => replaceJune("June 14, 2024<br>\nBank of Japan", "June 13, 2024<br>\nBank of Japan")],
  ["wrong PDF identity", () => replaceJune("mpr_2024/k240614a.pdf", "mpr_2024/k240613a.pdf")],
  ["malformed purchase markup", () => replaceJune(junePurchaseParagraph, junePurchaseParagraph.replace("</sup>", "</em>"))],
  ["hidden selected guideline", () => replaceJune(juneGuidelineParagraph, juneGuidelineParagraph.replace("<p>", '<p hidden="hidden">'))],
  ["unrelated instrument as selected target", () => replaceJune(selectedJuneGuideline, selectedJuneGuideline.replace("uncollateralized overnight call rate", "basic loan rate"))],
] as const) {
  test("authentic June qualification rejects " + label + " before receipt or clock", async () => {
    const html = change(); assert.notEqual(html, officialJuneHtml);
    const doc = officialDocument(html);
    assert.throws(() => parseBojPolicyDocumentV1(doc, "2024-06-14"), BojPolicyValidationError);
    assert.throws(() => prepareBojPolicyDecisionActionEvidenceV1({ document: doc, decisionDate: "2024-06-14" }), BojPolicyValidationError);
    await checkOfficialDecisionCapture(html, "2024-06-14", false);
  });
}
test("June measure cannot broaden support to another statement date or document kind", () => {
  for (const decisionDate of ["2024-04-26", "2024-06-15", "2025-01-24"]) {
    const year = decisionDate.slice(0, 4), stamp = decisionDate.slice(2).replaceAll("-", "");
    const englishDate = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" }).format(new Date(decisionDate + "T00:00:00Z"));
    const html = officialJuneHtml.replace("June 14, 2024<br>\nBank of Japan", englishDate + "<br>\nBank of Japan")
      .replace("mpr_2024/k240614a.pdf", "mpr_" + year + "/k" + stamp + "a.pdf");
    assert.throws(() => parseBojPolicyDocumentV1(officialDocument(html, decisionDate), decisionDate), code("document"));
  }
  const html = replaceJune("<h1>\nStatement on Monetary Policy", "<h1>\nChange in the Guideline for Money Market Operations");
  assert.throws(() => parseBojPolicyDocumentV1(officialDocument(html), "2024-06-14"), code("document"));
  assert.throws(() => parseBojPolicyDocumentV1({ html: officialJuneHtml, url: bojPolicyDocumentUrlV1("2024-04-26") }, "2024-06-14"), code("source"));
});

// Main-wide ID checks reject every duplicate; the appended body-container case also has closed-role protection.
for (const id of ["note01", "nt01"] as const) {
  for (const [location, change] of [
    ["publisher section CONTENT_1", () => replaceJune("June 14, 2024<br>\nBank of Japan", '<span id="' + id + '"></span>June 14, 2024<br>\nBank of Japan')],
    ["uppercase ID in publisher CONTENT_1", () => replaceJune("June 14, 2024<br>\nBank of Japan", '<span ID="' + id + '"></span>June 14, 2024<br>\nBank of Japan')],
    ["mixed-case iD in other decision item CONTENT_2", () => replaceJune("<p>Japan's economy is likely", '<p iD="' + id + '">Japan\'s economy is likely')],
    ["qualified main outside CONTENT blocks", () => replaceJune("<!-- [START] CONTENT_1 -->", '<span id="' + id + '"></span><!-- [START] CONTENT_1 -->')],
    ["nested publisher container CONTENT_1", () => replaceJune("June 14, 2024<br>\nBank of Japan", '<span><span id="' + id + '"></span></span>June 14, 2024<br>\nBank of Japan')],
    ["selected guideline CONTENT_2", () => replaceJune(juneGuidelineParagraph, juneGuidelineParagraph.replace("<p>", '<p id="' + id + '">'))],
    ["other decision item CONTENT_2", () => replaceJune("<p>Japan's economy is likely", '<p id="' + id + '">Japan\'s economy is likely')],
    ["nested footnote-area container CONTENT_2", () => replaceJune("<!-- [END] CONTENT_2 -->", '<div><span id="' + id + '"></span></div><!-- [END] CONTENT_2 -->')],
  ] as const) {
    test("main-wide June uniqueness rejects duplicate " + id + " in " + location + " before receipt or clock", async () => {
      const html = change();
      assert.equal((html.match(new RegExp('id="' + id + '"', "gi")) ?? []).length, 2);
      const doc = officialDocument(html);
      assert.throws(() => parseBojPolicyDocumentV1(doc, "2024-06-14"), code("document"));
      assert.throws(() => prepareBojPolicyDecisionActionEvidenceV1({ document: doc, decisionDate: "2024-06-14" }), code("document"));
      await checkOfficialDecisionCapture(html, "2024-06-14", false);
    });
  }
}

test("June pinned source rejects unapproved whitespace despite equivalent formatting", async () => {
  const html = replaceJune(juneGuidelineParagraph, " \t\r\n" + juneGuidelineParagraph + "\r\n\t ")
    .replace('<ol class="no-list indent3">', '<ol class="no-list indent3">\r\n\t ')
    .replace(junePurchaseNote, " \t\r\n" + junePurchaseNote + "\r\n\t ");
  assert.throws(() => parseBojPolicyDocumentV1(officialDocument(html), "2024-06-14"), code("document"));
  assert.throws(() => prepareBojPolicyDecisionActionEvidenceV1({ document: officialDocument(html), decisionDate: "2024-06-14" }), code("document"));
  await checkOfficialDecisionCapture(html, "2024-06-14", false);
});


for (const [label, change] of [
  ["conflicting sup", () => juneGuidelineParagraph.replace("</p>", "<sup>" + guideline("0.5") + "</sup></p>")],
  ["conflicting return-title anchor", () => juneGuidelineParagraph.replace("</p>", '<a title="Return forged">' + guideline("0.5") + "</a></p>")],
  ["CDATA replacing authentic selected text", () => "<p><![CDATA[" + selectedJuneGuideline + "]]></p>"],
  ["conflicting CDATA descendant", () => juneGuidelineParagraph.replace("</p>", "<![CDATA[" + guideline("0.5") + "]]></p>")],
  ["span around authentic selected text", () => "<p><span>" + selectedJuneGuideline + "</span></p>"],
  ["emphasis around authentic selected text", () => "<p><em>" + selectedJuneGuideline + "</em></p>"],
  ["apparently harmless empty span", () => juneGuidelineParagraph.replace("</p>", "<span></span></p>")],
  ["apparently harmless nested spans", () => juneGuidelineParagraph.replace("</p>", "<span><span></span></span></p>")],
  ["apparently harmless sup marker", () => juneGuidelineParagraph.replace("</p>", "<sup>1</sup></p>")],
  ["apparently harmless span text", () => juneGuidelineParagraph.replace("</p>", "<span>Additional note.</span></p>")],
  ["additional visible text before selected content", () => "<p>Unsupported additional text. " + selectedJuneGuideline + "</p>"],
  ["additional visible text after selected content", () => "<p>" + selectedJuneGuideline + " Unsupported additional text.</p>"],
] as const) {
  test("F1 June selected paragraph rejects " + label + " before receipt or clock", async () => {
    const html = replaceJune(juneGuidelineParagraph, change());
    const doc = officialDocument(html);
    // Full-source identity rejects every unapproved change before native target grammar.
    const expected = "document";
    assert.throws(() => parseBojPolicyDocumentV1(doc, "2024-06-14"), code(expected));
    assert.throws(() => prepareBojPolicyDecisionActionEvidenceV1({ document: doc, decisionDate: "2024-06-14" }), code(expected));
    await checkOfficialDecisionCapture(html, "2024-06-14", false);
  });
}

const renamedJunePurchase = (html: string) => html.replaceAll("note01", "note02").replaceAll("nt01", "nt02");
const extraPurchaseNoteGroup = '<ol class="no-list indent3">' + renamedJunePurchase(junePurchaseNote) + "</ol>";
const extraLinkedPurchase = (contradictory: boolean) => renamedJunePurchase(contradictory
  ? junePurchaseParagraph.replace("that it would reduce", "that it would increase") : junePurchaseParagraph) + extraPurchaseNoteGroup;
const appendJuneBody = (extra: string) => replaceJune("<!-- [END] CONTENT_2 -->", extra + "<!-- [END] CONTENT_2 -->");
const appendInJuneAttendance = (extra: string) => replaceJune('</div>\n<dl class="mt2em ml1em">', extra + '</div>\n<dl class="mt2em ml1em">');
for (const [label, change] of [
  ["fully linked contradictory trailing purchase", () => appendJuneBody(extraLinkedPurchase(true))],
  ["fully linked identical trailing purchase", () => appendJuneBody(extraLinkedPurchase(false))],
  ["additional purchase without a footnote marker", () => appendJuneBody(junePurchaseParagraph.replace(/<sup>[\s\S]*?<\/sup>/, ""))],
  ["additional linked note group", () => appendJuneBody(extraPurchaseNoteGroup)],
  ["additional note group with malformed backlink", () => appendJuneBody(extraPurchaseNoteGroup.replace('href="#nt02"', 'href="#missing"'))],
  ["fully linked purchase inside attendance metadata", () => appendInJuneAttendance(extraLinkedPurchase(true))],
  ["additional note group inside attendance metadata", () => appendInJuneAttendance(extraPurchaseNoteGroup)],
  ["extra unlinked paragraph inside attendance", () => appendInJuneAttendance("<p>An additional purchase decision with unrelated wording.</p>")],
  ["mixed-case extra purchase paragraph inside attendance", () => appendInJuneAttendance(renamedJunePurchase(junePurchaseParagraph).replace("<p>", "<P>").replace("</p>", "</P>"))],
  ["extra nested purchase paragraph inside attendance definition", () => replaceJune("SAKAMOTO Motoru, Deputy Vice-Minister for Policy Planning and Coordination (14:00-15:33)", "SAKAMOTO Motoru, Deputy Vice-Minister for Policy Planning and Coordination (14:00-15:33)" + extraLinkedPurchase(true))],
  ["additional purchase in another decision item", () => replaceJune("<p>Japan's economy is likely", renamedJunePurchase(junePurchaseParagraph) + "<p>Japan's economy is likely")],
  ["consistently renamed primary relationship", () => renamedJunePurchase(officialJuneHtml)],
  ["raw extra purchase text outside the decision items", () => appendJuneBody("An unsupported additional purchase decision.")],
] as const) {
  test("F2 June body rejects " + label + " before receipt or clock", async () => {
    const html = change();
    assert.notEqual(html, officialJuneHtml);
    const doc = officialDocument(html);
    assert.throws(() => parseBojPolicyDocumentV1(doc, "2024-06-14"), code("document"));
    assert.throws(() => prepareBojPolicyDecisionActionEvidenceV1({ document: doc, decisionDate: "2024-06-14" }), code("document"));
    await checkOfficialDecisionCapture(html, "2024-06-14", false);
  });
}


// Pinned trust matrix: expected approval identities above are literal reviewed constants.
// Neither the mutated bytes nor their self-consistent capture digest can approve a source.
const contradictoryDirective = " The Bank decided to set the uncollateralized overnight call rate at around 9 percent.";
const pinnedChanges: readonly (readonly [string, (html: string) => string])[] = [
  ["B1 narrative directive", html => html.replace("Concerning risks to the outlook,", "Concerning risks to the outlook," + contradictoryDirective)],
  ["B1 outlook paragraph directive", html => html.replace("Japan's economy is likely to keep growing", "Japan's economy is likely to keep growing" + contradictoryDirective)],
  ["B1 second-item directive", html => html.replace("Japan's economy has recovered moderately", "Japan's economy has recovered moderately" + contradictoryDirective)],
  ["B1 metadata descendant directive", html => html.replace("UEDA Kazuo, Chairman", "UEDA Kazuo, Chairman<span>" + contradictoryDirective + "</span>")],
  ["B1 metadata raw directive", html => html.replace("UEDA Kazuo, Chairman", "UEDA Kazuo, Chairman" + contradictoryDirective)],
  ["B2 directive after CONTENT_2", html => html.replace("<!-- [END] CONTENT_2 -->", "<!-- [END] CONTENT_2 --><p>" + contradictoryDirective + "</p>")],
  ["directive elsewhere inside main", html => html.replace("<!-- [START] CONTENT_1 -->", "<span>" + contradictoryDirective + "</span><!-- [START] CONTENT_1 -->")],
  ["directive outside main", html => html.replace("</main>", "</main><p>" + contradictoryDirective + "</p>")],
  ["altered policy numbers", html => html.replace("around 0 to 0.1 percent", "around 0 to 0.5 percent")],
  ["altered JGB measure", html => html.replace("that it would reduce", "that it would increase")],
  ["B3 uppercase STYLE", html => html.replace("<p>Concerning risks", '<p STYLE="display:none">Concerning risks')],
  ["B3 mixed-case StYlE", html => html.replace("<p>Concerning risks", '<p StYlE="visibility:hidden">Concerning risks')],
  ["B3 uppercase HIDDEN", html => html.replace("<p>Concerning risks", '<p HIDDEN="hidden">Concerning risks')],
  ["B3 mixed-case HiDdEn", html => html.replace("<p>Concerning risks", '<p HiDdEn="hidden">Concerning risks')],
  ["B3 mixed-case aria-hidden", html => html.replace("<p>Concerning risks", '<p aRiA-hIdDeN="true">Concerning risks')],
  ["encoded visibility attribute", html => html.replace("<p>Concerning risks", '<p STYLE="displ&#97;y:n&#111;ne">Concerning risks')],
  ["encoded aria-hidden attribute", html => html.replace("<p>Concerning risks", '<p ARIA-HIDDEN="tr&#117;e">Concerning risks')],
  ["CDATA directive in narrative", html => html.replace("Concerning risks to the outlook,", "Concerning risks to the outlook,<![CDATA[" + contradictoryDirective + "]]>")],
  ["comment directive", html => html.replace("Concerning risks to the outlook,", "Concerning risks to the outlook,<!--" + contradictoryDirective + "-->")],
  ["nested narrative directive", html => html.replace("Japan's economy has recovered moderately", "Japan's economy has recovered moderately<span><em>" + contradictoryDirective + "</em></span>")],
  ["duplicate note relationship outside main", html => html.replace("</main>", '</main><span id="note01"></span><span id="nt01"></span>')],
  ["fully renamed note relationships", html => html.replaceAll("note01", "note02").replaceAll("nt01", "nt02")],
  ["altered declared source identity", html => html.replace('k240614a.htm"', 'k240613a.htm"')],
  ["benign empty comment", html => html.replace("<!-- [END] CONTENT_2 -->", "<!-- benign --><!-- [END] CONTENT_2 -->")],
  ["benign nested empty elements outside main", html => html.replace("</main>", "</main><span><span></span></span>")],
  ["one-byte same-length footer change", html => html.replace("Copyright Bank of Japan", "copyright Bank of Japan")],
  ["one-byte whitespace addition", html => html + " "],
  ["line-ending normalization", html => html.replaceAll("\r\n", "\n")],
];

for (const [label, change] of pinnedChanges) {
  test("pinned June source rejects " + label + " across facts/action/acquisition/owner", async () => {
    const html = change(officialJuneHtml);
    assert.notEqual(html, officialJuneHtml, "mutation must actually change approved bytes");
    const doc = officialDocument(html);
    let actionEvidence: unknown;
    assert.throws(() => parseBojPolicyDocumentV1(doc, "2024-06-14"), code("document"));
    assert.throws(() => prepareBojPolicyDecisionActionEvidenceV1({ document: doc, decisionDate: "2024-06-14" }), code("document"));
    const evidence = buildBojPolicyEvidenceV1(parseBojPolicyDocumentV1(officialDocument(), "2024-06-14"), captureTime);
    // A supplied correct reference digest and a self-consistent mutated digest both fail.
    for (const decodedSourceDigest of [
      "sha256:af0174ad9d0c16c9128292720ddec3fb8e96c601b68c06eadf6f3bea6a77bfff",
      "sha256:" + createHash("sha256").update(html, "utf8").digest("hex"),
    ]) {
      assert.throws(() => { actionEvidence = buildBojPolicyDecisionActionEvidenceV1({ document: doc,
        capture: { knownAt: captureTime, evidence, decodedSourceDigest } }); }, code("document"));
    }
    assert.equal(actionEvidence, undefined);
    await checkOfficialDecisionCapture(html, "2024-06-14", false);
  });
}

for (const [label, change] of [
  ["one-byte same-length change", (html: string) => html.replace("Copyright Bank of Japan", "copyright Bank of Japan")],
  ["policy-number change", (html: string) => html.replace("around 0 to 0.1 percent", "around 0 to 0.5 percent")],
  ["post-CONTENT directive", (html: string) => html.replace("<!-- [END] CONTENT_2 -->", "<!-- [END] CONTENT_2 -->" + contradictoryDirective)],
  ["purchase-measure change", (html: string) => html.replace("the Bank will conduct the purchases", "the Bank will stop all the purchases")],
  ["formatting-only change", (html: string) => html + "\n"],
] as const) {
  test("pinned April retains closed approval for " + label, async () => {
    const html = change(officialAprilHtml);
    assert.notEqual(html, officialAprilHtml);
    const doc = officialDocument(html, "2024-04-26");
    assert.throws(() => parseBojPolicyDocumentV1(doc, "2024-04-26"), code("document"));
    assert.throws(() => prepareBojPolicyDecisionActionEvidenceV1({ document: doc, decisionDate: "2024-04-26" }), code("document"));
    await checkOfficialDecisionCapture(html, "2024-04-26", false);
  });
}

for (const extra of ["expectedDigest", "decodedSourceDigest", "approvedSource", "fixture", "sourceDescription"] as const) {
  test("caller " + extra + " cannot approve a mutated decoded document", async () => {
    const html = officialJuneHtml.replace("Copyright Bank of Japan", "copyright Bank of Japan");
    const document: ReturnType<typeof officialDocument> & Record<string, string> = {
      ...officialDocument(html), [extra]: "sha256:" + createHash("sha256").update(html, "utf8").digest("hex"),
    };
    assert.throws(() => parseBojPolicyDocumentV1(document, "2024-06-14"), code("source"));
    assert.throws(() => prepareBojPolicyDecisionActionEvidenceV1({ document, decisionDate: "2024-06-14" }), TypeError);
    let clocks = 0, fetches = 0, issued: unknown;
    const owner = createBojPolicyDecisionCaptureAuthorityV1({
      fetchImpl: async () => { fetches++; throw new Error("Extra approval input must fail before fetch"); },
      nowUnixSeconds: () => { clocks++; return captureTime; },
    });
    const input = { decisionDate: "2024-06-14", signal: new AbortController().signal, [extra]: document[extra] };
    await assert.rejects(async () => { issued = await owner.acquire(input); }, TypeError);
    assert.equal(fetches, 0); assert.equal(clocks, 0); assert.equal(issued, undefined);
    const forged = { receipt: {} as BojPolicyDecisionCaptureReceiptV1, evaluatedAt: new Date(captureTime * 1000).toISOString() };
    assert.throws(() => owner.readAsKnownAt(forged), /Unrecognized/);
    assert.throws(() => owner.readActionAsKnownAt(forged), /Unrecognized/);
  });
}

test("direct parser detaches closed data without invoking source accessors or proxy traps", () => {
  let calls = 0;
  for (const field of ["url", "html"] as const) {
    const document = officialDocument();
    Object.defineProperty(document, field, { enumerable: true, get: () => { calls++; return officialDocument()[field]; } });
    assert.throws(() => parseBojPolicyDocumentV1(document, "2024-06-14"), code("source"));
  }
  const proxy = new Proxy(officialDocument(), { ownKeys: () => { calls++; return ["url", "html"]; } });
  assert.throws(() => parseBojPolicyDocumentV1(proxy, "2024-06-14"), code("source"));
  const revoked = Proxy.revocable(officialDocument(), {}); revoked.revoke();
  assert.throws(() => parseBojPolicyDocumentV1(revoked.proxy, "2024-06-14"), code("source"));
  assert.equal(calls, 0);
  for (const document of [Object.freeze(officialDocument()), Object.assign(Object.create(null), officialDocument())]) {
    assert.deepEqual(parseBojPolicyDocumentV1(document, "2024-06-14").target, officialTarget);
  }
});

for (const [decisionDate, html] of [["2024-06-14", officialJuneHtml], ["2024-04-26", officialAprilHtml]] as const) {
  for (const drift of ["selected target", "absolute release time"] as const) {
    test("approved " + decisionDate + " bytes reject independent extraction drift in " + drift, async () => {
      const nativeParse = XMLParser.prototype.parse;
      XMLParser.prototype.parse = function (this: XMLParser, ...args: Parameters<typeof nativeParse>) {
        const result: unknown = nativeParse.apply(this, args);
        const visit = (value: unknown): void => {
          if (typeof value !== "object" || value === null) return;
          const node = value as Record<string, unknown>;
          if (typeof node["#text"] === "string") {
            if (drift === "selected target" && node["#text"] === selectedJuneGuideline) {
              node["#text"] = selectedJuneGuideline.replace("0 to 0.1", "0 to 0.5");
            }
            if (drift === "absolute release time" && typeof node["#text"] === "string" &&
                node["#text"].startsWith("Statement on Monetary Policy -- Friday,")) {
              node["#text"] += " JST";
            }
          }
          for (const child of Object.values(node)) visit(child);
        };
        visit(result); return result;
      } as typeof nativeParse;
      try {
        const document = officialDocument(html, decisionDate);
        assert.throws(() => parseBojPolicyDocumentV1(document, decisionDate), code("document"));
        assert.throws(() => prepareBojPolicyDecisionActionEvidenceV1({ document, decisionDate }), code("document"));
        await checkOfficialDecisionCapture(html, decisionDate, false);
      } finally { XMLParser.prototype.parse = nativeParse; }
    });
  }
}

for (const [decisionDate, html, digest] of [
  ["2024-06-14", officialJuneHtml, "af0174ad9d0c16c9128292720ddec3fb8e96c601b68c06eadf6f3bea6a77bfff"],
  ["2024-04-26", officialAprilHtml, "7d79d6b1d0e44fee1e709ec2a1f65fd5141c109d64c3ad52890c01256fcb75bf"],
] as const) {
  test("approved " + decisionDate + " source cannot accept substituted capture digest metadata", () => {
    const document = officialDocument(html, decisionDate);
    const evidence = buildBojPolicyEvidenceV1(parseBojPolicyDocumentV1(document, decisionDate), captureTime);
    for (const decodedSourceDigest of ["sha256:" + "0".repeat(64), "sha256:" + (digest[0] === "a" ? "b" : "a") + digest.slice(1)]) {
      assert.throws(() => buildBojPolicyDecisionActionEvidenceV1({ document,
        capture: { knownAt: captureTime, evidence, decodedSourceDigest } }), /decoded-source digest disagrees/);
    }
  });
}



// These controls reach owned acquisition directly, so receipt-path sensitivity does
// not depend on an earlier direct-parser assertion aborting the same test.
for (const [label, change] of pinnedChanges.filter(([label]) =>
  label.startsWith("B1") || label === "B2 directive after CONTENT_2" ||
  label === "B3 uppercase STYLE" || label === "B3 uppercase HIDDEN" ||
  label === "B3 mixed-case aria-hidden" || label === "one-byte same-length footer change")) {
  test("pinned acquisition gate rejects " + label + " before action clock and receipt", async () => {
    const html = change(officialJuneHtml); assert.notEqual(html, officialJuneHtml);
    await checkOfficialDecisionCapture(html, "2024-06-14", false);
  });
}

// In-memory mutation controls. Child compilation changes no source file and truncates
// only this control section to avoid recursively spawning mutation-test children.
for (const mode of ["source gate removed", "expected digest derived from mutated source", "fact contract removed"] as const) {
  test("in-memory mutation sensitivity: " + mode, () => {
    const factsPath = resolve("src/lib/markets/providers/boj/facts.ts");
    const testsPath = resolve("src/lib/markets/tests/boj/facts.test.ts");
    const beforeFacts = readFileSync(factsPath, "utf8"), beforeTests = readFileSync(testsPath, "utf8");
    const change = mode === "source gate removed"
      ? ["qualifyApprovedSource(document.html, decisionDate);", "/* source gate removed in memory */"]
      : mode === "expected digest derived from mutated source"
        ? ["!== approved.digest", '!== createHash("sha256").update(html, "utf8").digest("hex")']
        : ["Object.hasOwn(approvedSources, fact.decisionDate)", "false"];
    assert.equal(beforeFacts.split(change[0]!).length, 2, "exactly one mutation location");
    const script = [
      "const fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path');",
      "const original=Module._load;Module._load=function(name,parent,main){if(name==='server-only')return {};if(name.startsWith('@/'))name=path.resolve('src',name.slice(2));return original.call(this,name,parent,main);};",
      "const factsPath=" + JSON.stringify(factsPath) + ",testsPath=" + JSON.stringify(testsPath) + ",change=" + JSON.stringify(change) + ";",
      "require.extensions['.ts']=(module,filename)=>{let source=fs.readFileSync(filename,'utf8');",
      "if(filename===factsPath)source=source.replace(change[0],change[1]);",
      "if(filename===testsPath)source=source.split('// In-memory mutation controls.')[0];",
      "module._compile(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,filename);};",
      "require(testsPath);",
    ].join("\n");
    const result = spawnSync(process.execPath, [], { input: script, cwd: process.cwd(), encoding: "utf8", timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const failures = result.stdout.match(/(?:ℹ fail |# fail )(\d+)/);
    assert.ok(failures && Number(failures[1]) > 0, result.stdout);
    const expectedFailure = mode === "fact contract removed"
      ? "approved 2024-06-14 bytes reject independent extraction drift in selected target"
      : "pinned June source rejects one-byte same-length footer change";
    assert.ok(result.stdout.split("\n").some(line => /✖|not ok/.test(line) && line.includes(expectedFailure)), result.stdout);
    if (mode !== "fact contract removed") {
      assert.ok(result.stdout.split("\n").some(line => /✖|not ok/.test(line) && line.includes("pinned acquisition gate rejects one-byte same-length footer change")), result.stdout);
    }
    if (mode === "source gate removed") {
      assert.ok(result.stdout.split("\n").some(line => /✖|not ok/.test(line) && line.includes("pinned June source rejects B1 narrative directive")), result.stdout);
    }
    // Diagnostics expose the killed mutant and count while keeping failed-child noise small.
    console.log("Killed in-memory mutant: " + mode + "; failing negative tests=" + failures[1]);
    assert.equal(readFileSync(factsPath, "utf8"), beforeFacts);
    assert.equal(readFileSync(testsPath, "utf8"), beforeTests);
  });
}
