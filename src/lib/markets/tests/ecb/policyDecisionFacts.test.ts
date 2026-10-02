import assert from "node:assert/strict";

import { normalizeEcbMonetaryPolicyEventV1 } from "../../events/ecbMonetaryPolicy";
import { eventFactFromEcbMonetaryPolicyV1 } from "../../events/eventFact";
import { evaluateEventLifecycleV1 } from "../../events/eventLifecycle";
import { captureKnownEcbDecisionDocumentHtmlV1 } from "../../providers/ecb/monetaryPolicy/parser";
import {
  attachEcbPolicyDecisionFactsV1,
  extractEcbPolicyDecisionFactsV1,
  type EcbPolicyDecisionFactsResultV1,
} from "../../providers/ecb/monetaryPolicy/policyDecisionFacts";
import { acquireEcbEventV1 } from "../../services/ecbEventAcquisition";

const REFERENCE = {
  sourceInstitution: "ECB", decisionDate: "2026-09-10",
  documentUrl: "https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp260910~314e508016.en.html",
};
const CHANGED = "The Governing Council decided to raise the three key ECB interest rates by 25 basis points. " +
  "Accordingly, the interest rates on the deposit facility, the main refinancing operations and the marginal lending facility " +
  "will be increased to 2.50%, 2.65% and 2.90% respectively, with effect from 16 September 2026.";
const UNCHANGED = "The interest rates on the deposit facility, the main refinancing operations and the marginal lending facility " +
  "will remain unchanged at 2.00%, 2.15% and 2.40% respectively.";
// Synthetic minimal HTML shaped like the inspected official 2026 publications.
// No full official pages or live requests are used in these tests.
const document = (section: string, heading = "<h2>Key ECB interest rates</h2>") =>
  `<html><body><nav>99%</nav><main><h1>Monetary policy decisions</h1>
  <p>Inflation 99%, growth 88%. With effect from 31 February 2026.</p><div>${heading}${section}
  <h2>Asset purchase programmes</h2><p>77%, 66%, 55%. With effect from 1 January 2020.</p></div>
  </main><footer>44%</footer></body></html>`;
const captured = (html: string, fetchedAt = 1_789_100_000) => {
  const capture = captureKnownEcbDecisionDocumentHtmlV1(html, REFERENCE, fetchedAt);
  if (capture.status !== "available") throw new Error("Fixture must be a captured official document.");
  return capture.data;
};
const extract = (sentence: string) => {
  const html = document(`<p>${sentence}</p>`);
  return extractEcbPolicyDecisionFactsV1(html, captured(html));
};
function available(result: EcbPolicyDecisionFactsResultV1) {
  if (result.status !== "available") throw new Error(result.reason);
  assert.equal(result.status, "available");
  return result;
}
function fails(result: { readonly status: string; readonly reason?: string }, reason: string) {
  assert.deepEqual(result, { status: "policy-facts-unavailable", reason });
}

const changed = available(extract(CHANGED));
assert.deepEqual(changed.rates, {
  depositFacility: 2.5, mainRefinancingOperations: 2.65, marginalLendingFacility: 2.9,
  unit: "percent", effectiveDate: "2026-09-16",
});
assert.notEqual(changed.rates.depositFacility, 25, "basis-point delta is not a resulting rate");
const unchanged = available(extract(UNCHANGED));
assert.equal(unchanged.rates.depositFacility, 2);
assert.equal(unchanged.rates.mainRefinancingOperations, 2.15);
assert.equal(unchanged.rates.marginalLendingFacility, 2.4);
assert.equal(unchanged.rates.effectiveDate, null, "no effective date carried forward or invented");
assert.equal(available(extract(CHANGED.replace("raise", "lower").replace("increased", "decreased"))).rates.effectiveDate,
  "2026-09-16");
assert.equal(available(extract(UNCHANGED.replace("2.00%", "-0.50%"))).rates.depositFacility, -0.5);
assert.equal(available(extract(CHANGED.replace("2.50%", "<strong>2.50%</strong>"))).rates.depositFacility, 2.5);
for (const member of ["deposit facility", "main refinancing operations", "marginal lending facility"]) {
  fails(extract(CHANGED.replace(member, "unsupported member")), "incomplete-rate-set");
}
for (const value of ["2.50%", "2.65%", "2.90%"] ) {
  fails(extract(CHANGED.replace(value, "")), "incomplete-rate-set");
}
for (const bad of ["NaN%", "two%", "2.500%", "2,50%", "2.50oops%", "1e2%", "Infinity%", "9007199254740991%", "90071992547409.91%"] ) {
  fails(extract(CHANGED.replace("2.50%", bad)), "invalid-rate");
}
for (const date of ["31 February 2026", "29 February 2023", "16 Smarch 2026", "2026-09-16", "16/09/2026", "0 September 2026"]) {
  fails(extract(CHANGED.replace("16 September 2026", date)), "invalid-effective-date");
}
assert.equal(available(extract(CHANGED.replace("16 September 2026", "29 February 2024"))).rates.effectiveDate, "2024-02-29");
assert.equal(available(extract(CHANGED.replace(", with effect from 16 September 2026", ""))).rates.effectiveDate, null);
for (const section of [`<p>${CHANGED}</p><p>${UNCHANGED}</p>`, `<p>${CHANGED}</p><p>Another rate 3.00%.</p>`]) {
  const html = document(section);
  fails(extractEcbPolicyDecisionFactsV1(html, captured(html)), "ambiguous-section");
}
fails(extract(CHANGED.replace("will be increased to", "might eventually reach")), "malformed-section");
for (const html of [document(`<p>${CHANGED}</p>`, ""), document(`<p>${CHANGED}</p>`, "<h3>Key ECB interest rates</h3>"),
  document(`<table><tr><td>${CHANGED}</td></tr></table>`), document("<p>No explicit values.</p>")]) {
  const result = extractEcbPolicyDecisionFactsV1(html, captured(html));
  assert.equal(result.status, "policy-facts-unavailable");
}
const duplicated = document(`<p>${CHANGED}</p><h2>Key ECB interest rates</h2><p>${UNCHANGED}</p>`);
fails(extractEcbPolicyDecisionFactsV1(duplicated, captured(duplicated)), "ambiguous-section");
const html = document(`<p>${CHANGED}</p>`);
const capture = captured(html);
fails(extractEcbPolicyDecisionFactsV1(html.replace("2.50%", "9.50%"), capture), "source-mismatch");
fails(extractEcbPolicyDecisionFactsV1(html, { ...capture, semanticContentDigest: "a".repeat(64) }), "source-mismatch");
fails(extractEcbPolicyDecisionFactsV1(html, { ...capture, reference: { ...REFERENCE, sourceInstitution: "NOT_ECB" as "ECB" } }), "source-mismatch");
for (const defect of [new ReferenceError("defect"), new TypeError("defect")]) {
  const badCapture = { ...capture, get rawCaptureDigest(): string { throw defect; } };
  assert.throws(() => extractEcbPolicyDecisionFactsV1(html, badCapture), (error) => error === defect);
}
const event = normalizeEcbMonetaryPolicyEventV1({ canonicalMeetingDate: "2026-09-03",
  schedule: { meetingDate: REFERENCE.decisionDate, fetchedAt: capture.fetchedAt - 60 },
  decision: { decisionDate: REFERENCE.decisionDate, documentUrl: REFERENCE.documentUrl,
    contentDigest: capture.semanticContentDigest, fetchedAt: capture.fetchedAt,
    firstObservedAt: capture.fetchedAt, actualReleasedAt: null, rates: null },
});
const enriched = attachEcbPolicyDecisionFactsV1(event, available(extractEcbPolicyDecisionFactsV1(html, capture)));
if (enriched.status !== "available") throw new Error("Expected canonical attachment.");
assert.equal(enriched.event.canonicalEventId, event.canonicalEventId);
assert.equal(enriched.event.decision?.fetchedAt, capture.fetchedAt);
assert.equal(enriched.event.decision?.firstObservedAt, capture.fetchedAt);
assert.equal(enriched.event.decision?.contentDigest, capture.semanticContentDigest);
assert.equal(enriched.event.decision?.actualReleasedAt, null);
assert.equal(enriched.event.schedule.fetchedAt, event.schedule.fetchedAt);
assert.notEqual(enriched.event.sourceVersionId, event.sourceVersionId, "new rate semantics use canonical versioning");
const wrongCapture = { ...capture, fetchedAt: capture.fetchedAt + 60 };
fails(attachEcbPolicyDecisionFactsV1(event, available(extractEcbPolicyDecisionFactsV1(html, wrongCapture))), "source-mismatch");
const fact = eventFactFromEcbMonetaryPolicyV1(enriched.event, ["eurusd"]);
assert.equal(fact.actual.availability, "available");
if (fact.actual.availability !== "available") throw new Error("Expected actual rates.");
assert.equal(fact.actual.data.provenance.fetchedAt, capture.fetchedAt);
assert.equal(fact.actual.data.provenance.sourceUrl, REFERENCE.documentUrl);
assert.equal(fact.actual.data.provenance.originalPublisher, "ECB");
assert.deepEqual(fact.actual.data.provenance.substitution, { status: "none" });
assert.equal(fact.consensus.availability, "unavailable");
assert.throws(() => eventFactFromEcbMonetaryPolicyV1(enriched.event,
  // @ts-expect-error Sixth product remains forbidden.
  ["usdjpy"]), /locked five-product/);

async function run() {
  let time = capture.fetchedAt;
  const dependencies = {
    signal: new AbortController().signal, nowUnixSeconds: () => time,
    fetchImpl: async (url: string | URL | Request) => new Response(String(url) === REFERENCE.documentUrl ? html :
      "<html><main>10/09/2026 Governing Council of the ECB: monetary policy meeting (Day 2), followed by press conference</main></html>",
    { headers: { "Content-Type": "text/html" } }),
  };
  const input = { meetingDate: REFERENCE.decisionDate, identity: { status: "initial" as const },
    affectedProducts: ["eurusd" as const], knownDecisionReference: REFERENCE, extractPolicyRates: true };
  const acquired = await acquireEcbEventV1(input, dependencies);
  if (acquired.status !== "acquired" || acquired.fact.actual.availability !== "available") throw new Error("Expected opt-in extraction.");
  assert.equal(acquired.policyRatesExtraction?.status, "available");
  const repeated = await acquireEcbEventV1(input, dependencies);
  assert.deepEqual(repeated, acquired, "same captures normalize deterministically");
  time += 15 * 60;
  const later = await acquireEcbEventV1(input, dependencies);
  if (later.status !== "acquired") throw new Error("Expected later capture.");
  assert.equal(later.event.canonicalEventId, acquired.event.canonicalEventId);
  assert.equal(later.event.sourceVersionId, acquired.event.sourceVersionId);
  const evidence = { semantic: "engine-assessment" as const, canonicalEventId: acquired.fact.canonicalEventId,
    productId: "eurusd" as const, assessmentId: "policy-test", assessment: "confirmation" as const,
    basis: "official-release" as const, evidenceReferences: [acquired.fact.actual.data.provenance],
    knownAt: capture.fetchedAt, observedAt: new Date(capture.fetchedAt * 1_000).toISOString(), freshness: "within-cadence" as const };
  const lifecycle = { productId: "eurusd" as const, assessmentId: "policy-test", evaluatedAt: new Date(time * 1_000).toISOString(), previous: null, evidence: [evidence] };
  assert.equal(evaluateEventLifecycleV1({ ...lifecycle, event: acquired.fact }).state, "CONFIRMED");
  assert.equal(evaluateEventLifecycleV1({ ...lifecycle, event: later.fact }).acceptedEvidence.length, 0);
  const unsupported = await acquireEcbEventV1(input, { ...dependencies,
    fetchImpl: async (url) => new Response(String(url) === REFERENCE.documentUrl ? document("<p>No rate section.</p>", "") :
      "<main>10/09/2026 Governing Council of the ECB: monetary policy meeting (Day 2), followed by press conference</main>",
      { headers: { "Content-Type": "text/html" } }),
  });
  if (unsupported.status !== "acquired") throw new Error("Expected captured document with unavailable rates.");
  assert.equal(unsupported.policyRatesExtraction?.status, "policy-facts-unavailable");
  assert.equal(unsupported.fact.actual.availability, "unavailable");
  const disabled = await acquireEcbEventV1({ ...input, extractPolicyRates: false }, dependencies);
  if (disabled.status !== "acquired") throw new Error("Expected capture without extraction.");
  assert.equal(disabled.event.decision?.rates, null);
  await assert.rejects(acquireEcbEventV1({ ...input,
    // @ts-expect-error Opt-in is validated at runtime.
    extractPolicyRates: "yes" }, dependencies), /must be boolean/);
  console.log("PASS: deterministic captured ECB policy-rate extraction, atomicity, provenance and inactive integration");
}

void run();
