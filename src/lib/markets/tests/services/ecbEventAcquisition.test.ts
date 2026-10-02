import assert from "node:assert/strict";
import { ECB_GOVERNING_COUNCIL_CALENDAR_URL } from "../../events/ecbMonetaryPolicy";
import { evaluateEventLifecycleV1 } from "../../events/eventLifecycle";
import { EcbEventTransportError } from "../../providers/ecb/monetaryPolicy/acquisitionTransport";
import { acquireEcbEventV1, type EcbEventAcquisitionInputV1 } from "../../services/ecbEventAcquisition";

const DOCUMENT_URL = "https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp260910~314e508016.en.html";
const INPUT: EcbEventAcquisitionInputV1 = {
  meetingDate: "2026-09-10", identity: { status: "initial" }, affectedProducts: ["eurusd"],
  knownDecisionReference: { sourceInstitution: "ECB", decisionDate: "2026-09-10", documentUrl: DOCUMENT_URL },
};
const calendar = (date = "10/09/2026") => `<html><main>${date} Governing Council of the ECB:
  monetary policy meeting (Day 2), followed by press conference</main></html>`;
const document = `<html><body><main><h1>Monetary policy decisions</h1><p>10 September 2026</p>
  <p>With effect from 16 September 2026. Rates 2.50%, 2.65%, 2.90%.</p></main></body></html>`;

async function run() {
  const calls: string[] = [];
  let clock = 1_789_100_000;
  const dependencies = {
    signal: new AbortController().signal,
    nowUnixSeconds: () => ++clock,
    fetchImpl: async (url: string | URL | Request) => {
      calls.push(String(url));
      return new Response(String(url) === ECB_GOVERNING_COUNCIL_CALENDAR_URL ? calendar() : document,
        { headers: { "Content-Type": "text/html", Date: "Thu, 10 Sep 2026 12:15:00 GMT" } });
    },
  };
  const result = await acquireEcbEventV1(INPUT, dependencies);
  if (result.status !== "acquired") throw new Error("Expected acquired ECB event.");
  const { event, fact } = result;
  assert.deepEqual(calls, [ECB_GOVERNING_COUNCIL_CALENDAR_URL, DOCUMENT_URL]);
  assert.equal(event.canonicalEventId, "ECB:ecb-monetary-policy-decision:2026-09-10");
  assert.equal(event.schedule.scheduledAt, "2026-09-10T12:15:00.000Z");
  assert.equal(event.schedule.fetchedAt, 1_789_100_001);
  assert.equal(event.decision?.fetchedAt, 1_789_100_002);
  assert.equal(event.decision?.firstObservedAt, event.decision?.fetchedAt);
  assert.equal(event.decision?.actualReleasedAt, null, "schedule and HTTP date are not release time");
  assert.equal(event.decision?.rates, null, "rates/effective date are not inferred from prose");
  assert.deepEqual(fact.affectedProducts, ["eurusd"]);
  assert.equal(fact.actual.availability, "unavailable");
  assert.equal(fact.consensus.availability, "unavailable");
  assert.equal(fact.schedule.provenance.provider, "ecb");
  assert.equal(fact.schedule.provenance.originalPublisher, "ECB");
  assert.equal(fact.schedule.provenance.sourceUrl, ECB_GOVERNING_COUNCIL_CALENDAR_URL);
  if (fact.release.availability !== "available") throw new Error("Expected document evidence.");
  const provenance = fact.release.data.provenance;
  assert.equal(provenance.sourceUrl, DOCUMENT_URL);
  assert.equal(provenance.fetchedAt, event.decision?.fetchedAt);
  assert.deepEqual(provenance.substitution, { status: "none" });
  const repeated = await acquireEcbEventV1(INPUT, dependencies);
  if (repeated.status !== "acquired") throw new Error("Expected repeated capture.");
  assert.equal(repeated.event.canonicalEventId, event.canonicalEventId);
  assert.equal(repeated.event.sourceVersionId, event.sourceVersionId);
  assert.notEqual(repeated.event.decision?.fetchedAt, event.decision?.fetchedAt);
  const fixed = { ...dependencies, nowUnixSeconds: () => clock };
  assert.deepEqual(await acquireEcbEventV1(INPUT, fixed), await acquireEcbEventV1(INPUT, fixed));
  const evidence = {
    semantic: "engine-assessment" as const, canonicalEventId: fact.canonicalEventId,
    productId: "eurusd" as const, assessmentId: "hypothesis", assessment: "contradiction" as const,
    basis: "official-release" as const, freshness: "within-cadence" as const,
    evidenceReferences: [provenance], observedAt: new Date(provenance.fetchedAt * 1_000).toISOString(),
    knownAt: provenance.fetchedAt,
  };
  const lifecycleInput = {
    event: fact, productId: "eurusd" as const, assessmentId: "hypothesis",
    evaluatedAt: new Date(clock * 1_000).toISOString(), previous: null,
  };
  assert.equal(evaluateEventLifecycleV1({ ...lifecycleInput, evidence: [evidence] }).state, "CONTRADICTED");
  const late = evaluateEventLifecycleV1({ ...lifecycleInput, event: repeated.fact, evidence: [evidence] });
  assert.equal(late.acceptedEvidence.length, 0, "later fetch cannot validate an earlier assessment");
  assert.equal(late.marketReaction.availability, "unavailable");
  assert.throws(() => evaluateEventLifecycleV1({ ...lifecycleInput,
    evaluatedAt: new Date((event.schedule.fetchedAt - 1) * 1_000).toISOString(), evidence: [],
  }), /source knowledge/);
  const scheduleOnly = await acquireEcbEventV1({ ...INPUT, knownDecisionReference: undefined }, dependencies);
  if (scheduleOnly.status !== "acquired") throw new Error("Expected schedule-only capture.");
  assert.equal(scheduleOnly.event.decision, null);
  assert.equal(scheduleOnly.fact.release.availability, "unavailable");
  const preserved = await acquireEcbEventV1({ ...INPUT,
    identity: { status: "preserve", canonicalMeetingDate: "2026-09-03" },
  }, dependencies);
  if (preserved.status !== "acquired") throw new Error("Expected preserved identity.");
  assert.equal(preserved.event.canonicalEventId, "ECB:ecb-monetary-policy-decision:2026-09-03");
  for (const [date, sourceDate, expected] of [
    ["2027-02-04", "04/02/2027", "2027-02-04T13:15:00.000Z"],
    ["2027-06-10", "10/06/2027", "2027-06-10T12:15:00.000Z"],
  ]) {
    const captured = await acquireEcbEventV1({ ...INPUT, meetingDate: date, knownDecisionReference: undefined }, {
      ...dependencies, fetchImpl: async () => new Response(calendar(sourceDate), { headers: { "Content-Type": "text/html" } }),
    });
    if (captured.status !== "acquired") throw new Error("Expected seasonal schedule.");
    assert.equal(captured.event.schedule.scheduledAt, expected);
  }
  const callCount = calls.length;
  assert.deepEqual(await acquireEcbEventV1({ ...INPUT, meetingDate: "2022-07-20", knownDecisionReference: undefined }, dependencies),
    { status: "schedule-unavailable", reason: "unsupported-schedule-time" });
  assert.equal((await acquireEcbEventV1({ ...INPUT,
    knownDecisionReference: { ...INPUT.knownDecisionReference!, documentUrl: DOCUMENT_URL.replace("www.ecb.europa.eu", "example.com") },
  }, dependencies)).status, "invalid-reference");
  assert.equal((await acquireEcbEventV1({ ...INPUT,
    knownDecisionReference: { ...INPUT.knownDecisionReference!, decisionDate: "2026-09-11" },
  }, dependencies)).status, "invalid-reference");
  assert.equal((await acquireEcbEventV1({ ...INPUT,
    identity: { status: "reconciliation-required", priorCanonicalMeetingDate: "2026-09-03" },
  }, dependencies)).status, "reconciliation-required");
  await assert.rejects(acquireEcbEventV1({ ...INPUT, meetingDate: "2026-02-30" }, dependencies), /Invalid/);
  await assert.rejects(acquireEcbEventV1({ ...INPUT,
    // @ts-expect-error Runtime guard also rejects a sixth product.
    affectedProducts: ["usdjpy"],
  }, dependencies), /canonical affected products/);
  await assert.rejects(acquireEcbEventV1({ ...INPUT,
    // @ts-expect-error Runtime guard rejects unsupported identity discriminators.
    identity: { status: "invented" },
  }, dependencies), /identity discriminator/);
  assert.equal(calls.length, callCount, "invalid inputs never reach any upstream");
  for (const body of ["", calendar("31/02/2026"), "<html><main>unsupported</main></html>"]) {
    assert.equal((await acquireEcbEventV1(INPUT, { ...dependencies,
      fetchImpl: async () => new Response(body, { headers: { "Content-Type": "text/html" } }),
    })).status, "source-malformed");
  }
  assert.equal((await acquireEcbEventV1({ ...INPUT, meetingDate: "2026-09-11", knownDecisionReference: undefined }, dependencies)).status,
    "schedule-unavailable");
  assert.equal((await acquireEcbEventV1(INPUT, { ...dependencies,
    fetchImpl: async (url) => new Response(String(url) === DOCUMENT_URL ? "<main>Not a decision</main>" : calendar(),
      { headers: { "Content-Type": "text/html" } }),
  })).status, "source-malformed");
  let acquisitions = 0;
  const failed = await acquireEcbEventV1(INPUT, { ...dependencies, fetchImpl: async () => {
    acquisitions++; return new Response("unavailable", { status: 503 });
  } });
  assert.equal(failed.status, "provider-failure");
  if (failed.status === "provider-failure") assert.equal(failed.error.code, "http");
  assert.equal(acquisitions, 1, "one shot, no fallback or retry");
  for (const error of [new TypeError("defect"), new ReferenceError("defect"), new Error("defect")]) {
    await assert.rejects(acquireEcbEventV1(INPUT, { ...dependencies, fetchImpl: async () => { throw error; } }), (actual) => actual === error);
  }
  assert.equal((await acquireEcbEventV1(INPUT, { ...dependencies,
    fetchImpl: async () => { throw new EcbEventTransportError("network"); },
  })).status, "provider-failure");
  await assert.rejects(acquireEcbEventV1(INPUT, { ...dependencies, nowUnixSeconds: () => Number.NaN }), /capture time/);
  let decreasing = 1_789_100_002;
  await assert.rejects(acquireEcbEventV1(INPUT, { ...dependencies, nowUnixSeconds: () => decreasing-- }), /backwards/);
  console.log("PASS: inactive official ECB event acquisition");
}

void run();
