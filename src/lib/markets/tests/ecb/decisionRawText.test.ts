import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";

import {
  captureKnownEcbDecisionDocumentHtmlV1,
  ecbDecisionVisibleTextV1,
  readCapturedEcbDecisionMainV1,
  type EcbDecisionDocumentCaptureResultV1,
} from "../../providers/ecb/monetaryPolicy/parser";
import { extractEcbPolicyDecisionFactsV1 } from "../../providers/ecb/monetaryPolicy/policyDecisionFacts";

const REFERENCE = {
  sourceInstitution: "ECB", decisionDate: "2026-09-10",
  documentUrl: "https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp260910~314e508016.en.html",
};
const FETCHED_AT = 1_789_100_000;
const RATE_TEXT = "The interest rates on the deposit facility, the main refinancing operations and the marginal lending facility " +
  "will remain unchanged at 2.00%, 2.15% and 2.40% respectively.";
// Synthetic offline regression for the demonstrated raw-text failure class.
const document = (rawText: string) => `<html><body><main><h1>Monetary policy decisions</h1><p>Before</p>${rawText}` +
  `<p>After</p><h2>Key ECB interest rates</h2><p>${RATE_TEXT}</p></main></body></html>`;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
function captured(result: EcbDecisionDocumentCaptureResultV1) {
  if (result.status !== "available") throw new Error(JSON.stringify(result));
  return result.data;
}
const baseline = captured(captureKnownEcbDecisionDocumentHtmlV1(document(""), REFERENCE, FETCHED_AT));
assert.equal(baseline.rawCaptureDigest, sha256(document("")));
assert.equal(baseline.semanticContentDigest, sha256(JSON.stringify([
  "ecb-monetary-policy-decision-content-v1", REFERENCE.documentUrl, REFERENCE.decisionDate,
  `Monetary policy decisions Before After Key ECB interest rates ${RATE_TEXT}`,
])));

const failureClass = "<script>for (let a = 0; a < n.length; a++) { run(a); }</script>";
assert.throws(() => new XMLParser({ preserveOrder: true, stopNodes: ["*.script", "*.style"] })
  .parse(document(failureClass)), /Unexpected end of script/);

for (const rawText of [
  failureClass,
  "<script data-label=\"a > b\" data-other='c > d'>\nfor (let a=0;a<n.length;a++) {}\nconst b = x > y;\n</script>",
  "<ScRiPt type=\"text/javascript\">/* <tag> */ const value = '<h2>fake rates 99%</h2>'; // >\n</sCrIpT >",
  "<SCRIPT>for(let a=0;a<n.length;a++) {}</SCRIPT><script>const b = 3 > 2;</script>",
  "<style data-label='x > y'>\n.x::before { content: '< or >'; } /* <script> */\n</style>",
  "<StYlE>.x { content: '<h2>Key ECB interest rates</h2> 99%'; }</STYLE>",
  "<style>.x { content: '<!--<script>'; }</style>",
  "<script>const notAClosingTag = '</scripture>';\n</script><style>.x { content: '</stylesheet>'; }</style>",
  "<script>const htmlTerminatorInsideString = '</script>",
  "<!-- <script>comment text without a closing script -->",
  "<div data-label=\"<script>not a tag\" data-other='>'></div>",
]) {
  const html = document(rawText);
  const capture = captured(captureKnownEcbDecisionDocumentHtmlV1(html, REFERENCE, FETCHED_AT));
  assert.equal(capture.rawCaptureDigest, sha256(html), "hash original unsanitized input");
  assert.equal(capture.semanticContentDigest, baseline.semanticContentDigest, "raw text supplies no visible evidence");
  assert.deepEqual(capture, captured(captureKnownEcbDecisionDocumentHtmlV1(html, REFERENCE, FETCHED_AT)));
  assert.equal(readCapturedEcbDecisionMainV1(html, capture).status, "available", "reopening uses the same parse-only boundary");
  const result = extractEcbPolicyDecisionFactsV1(html, capture);
  assert.equal(result.status, "available");
  if (result.status !== "available") throw new Error("Expected unchanged rates.");
  assert.deepEqual(result.rates, { depositFacility: 2, mainRefinancingOperations: 2.15,
    marginalLendingFacility: 2.4, unit: "percent", effectiveDate: null });
}

for (const tag of ["scripture", "stylesheet"]) {
  const html = document(`<${tag}>Visible boundary text</${tag}>`);
  const capture = captured(captureKnownEcbDecisionDocumentHtmlV1(html, REFERENCE, FETCHED_AT));
  const expectedText = `Monetary policy decisions Before Visible boundary text After Key ECB interest rates ${RATE_TEXT}`;
  assert.equal(capture.rawCaptureDigest, sha256(html));
  assert.equal(capture.semanticContentDigest, sha256(JSON.stringify([
    "ecb-monetary-policy-decision-content-v1", REFERENCE.documentUrl, REFERENCE.decisionDate, expectedText,
  ])));
  const main = readCapturedEcbDecisionMainV1(html, capture);
  if (main.status !== "available") throw new Error("Expected visible tag-name boundary content.");
  assert.equal(ecbDecisionVisibleTextV1(main.data), expectedText, `${tag} is not a raw-text element`);
  assert.equal(extractEcbPolicyDecisionFactsV1(html, capture).status, "available");
}

// Escaped HTML script modes are unsupported: never expose their remainder as evidence.
for (const rawText of [
  "<script><!--<script></script>",
  "<ScRiPt><!--\n<ScRiPt>\n</sCrIpT>",
  "<script>const marker = '<!--';</script>",
]) {
  const html = document(rawText);
  assert.deepEqual(captureKnownEcbDecisionDocumentHtmlV1(html, REFERENCE, FETCHED_AT), {
    status: "decision-document-malformed", reason: "ECB HTML has malformed script/style raw text.",
  });
  // Metadata the previous scanner could accept must also fail closed when reopened.
  const previousCapture = { ...baseline, rawCaptureDigest: sha256(html) };
  assert.deepEqual(readCapturedEcbDecisionMainV1(html, previousCapture), {
    status: "source-malformed", reason: "ECB HTML has malformed script/style raw text.",
  });
  assert.deepEqual(extractEcbPolicyDecisionFactsV1(html, previousCapture), {
    status: "policy-facts-unavailable", reason: "source-mismatch",
  });
}

for (const rawText of [
  "<script>for(let a=0;a<n.length;a++) {}", "<style>.x { content: '<'; }",
  "<script data-label=\"unterminated > ></script>", "<script>body</scripture>",
  "<style>body</stylesheet>", "<script />", "</script>", "</style>",
  "<script>body</script invalid>", "<style>body</style/>",
]) {
  const result = captureKnownEcbDecisionDocumentHtmlV1(document(rawText), REFERENCE, FETCHED_AT);
  assert.deepEqual(result, { status: "decision-document-malformed", reason: "ECB HTML has malformed script/style raw text." });
}

// No broad exception conversion for unrelated parser programming defects.
const originalParse = XMLParser.prototype.parse;
try {
  for (const defect of [new ReferenceError("internal defect"), new TypeError("internal defect")]) {
    XMLParser.prototype.parse = () => { throw defect; };
    assert.throws(() => captureKnownEcbDecisionDocumentHtmlV1(document(""), REFERENCE, FETCHED_AT), (error) => error === defect);
    assert.throws(() => readCapturedEcbDecisionMainV1(document(""), baseline), (error) => error === defect);
  }
} finally {
  XMLParser.prototype.parse = originalParse;
}

console.log("PASS: ECB decision raw-text boundary, original digests, visible semantics and defect propagation");
