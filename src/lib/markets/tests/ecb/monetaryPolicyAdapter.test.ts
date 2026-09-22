import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ECB_GOVERNING_COUNCIL_CALENDAR_URL } from "../../events/ecbMonetaryPolicy";
import { EcbMonetaryPolicyClientV1 } from "../../providers/ecb/monetaryPolicy/client";
import {
  attachKnownEcbDecisionCaptureV1,
  captureKnownEcbDecisionDocumentHtmlV1,
  normalizeEcbScheduleCandidateV1,
  parseEcbMonetaryPolicyScheduleHtmlV1,
  validateKnownEcbDecisionReferenceV1,
  type EcbDecisionAttachmentResultV1,
  type EcbDecisionDocumentCaptureResultV1,
  type EcbMonetaryPolicyDocumentCaptureV1,
  type EcbMonetaryPolicyScheduleCandidateV1,
  type EcbSourceParseResultV1,
} from "../../providers/ecb/monetaryPolicy/parser";

const SCHEDULE_HTML = `
<!doctype html><html><body><main>
  <section><time>03/02/2027</time><p>Governing Council of the ECB: monetary policy meeting in Frankfurt (Day 1)</p></section>
  <section><time>04/02/2027</time><p>Governing Council of the ECB: monetary policy meeting in Frankfurt (Day 2), followed by press conference</p></section>
  <section><time>24/02/2027</time><p>Governing Council of the ECB: non-monetary policy meeting (virtual)</p></section>
  <section><time>09/06/2027</time><p>Governing Council of the ECB: monetary policy meeting in Frankfurt (Day 1)</p></section>
  <section><time>10/06/2027</time><p>Governing Council of the ECB: monetary <strong>policy meeting</strong> in Frankfurt (Day 2), followed by press conference</p></section>
  <section><time>24/06/2027</time><p>General Council meeting of the ECB</p></section>
</main></body></html>`;
const DECISION_URL =
  "https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp260910~314e508016.en.html";
const KNOWN_REFERENCE = Object.freeze({
  sourceInstitution: "ECB",
  decisionDate: "2026-09-10",
  documentUrl: DECISION_URL,
});
const DOCUMENT_HTML = `
<!doctype html><html><body><nav>Volatile navigation</nav><main>
  <h1>Monetary policy decisions</h1><time>10 September 2026</time>
  <p>Minimal decision evidence.</p>
</main><footer>Volatile footer</footer></body></html>`;

async function run(): Promise<void> {
  const singleMeeting = available(parseEcbMonetaryPolicyScheduleHtmlV1(`
    <html><body><main><div>29/10/2026</div>
    <div>Governing Council of the ECB: monetary policy meeting in Frankfurt (Day 2), followed by press conference</div>
    </main></body></html>`));
  assert.deepEqual(singleMeeting.map((entry) => entry.meetingDate), ["2026-10-29"]);

  const schedule = available(parseEcbMonetaryPolicyScheduleHtmlV1(SCHEDULE_HTML));
  assert.equal(schedule.length, 2, "multiple Day-2 meetings parsed");
  assert.deepEqual(schedule.map((entry) => entry.meetingDate), ["2027-02-04", "2027-06-10"]);
  assert.equal(schedule[0]?.sourceUrl, ECB_GOVERNING_COUNCIL_CALENDAR_URL);
  assert.equal(schedule[0]?.sourceInstitution, "ECB");
  assert.equal(schedule.some((entry) => entry.meetingDate === "2027-02-24"), false);
  assert.equal(schedule.some((entry) => entry.meetingDate === "2027-06-24"), false);

  const winter = normalized(schedule[0]!, 100, { status: "initial" });
  const summer = normalized(schedule[1]!, 100, { status: "initial" });
  assert.equal(winter.schedule.scheduledAt, "2027-02-04T13:15:00.000Z");
  assert.equal(summer.schedule.scheduledAt, "2027-06-10T12:15:00.000Z");
  assert.equal(winter.schedule.scheduledLocalTime, "14:15");
  assert.equal(winter.schedule.sourceUrl, ECB_GOVERNING_COUNCIL_CALENDAR_URL);
  assert.equal(normalized(schedule[0]!, 200, { status: "initial" }).sourceVersionId,
    winter.sourceVersionId, "fetch time excluded from event semantics");

  const movedCandidate: EcbMonetaryPolicyScheduleCandidateV1 = Object.freeze({
    ...schedule[0]!, meetingDate: "2027-02-11",
  });
  const moved = normalized(movedCandidate, 300, {
    status: "preserve", canonicalMeetingDate: winter.canonicalMeetingDate,
  });
  assert.equal(moved.schedule.meetingDate, "2027-02-11");
  assert.equal(moved.canonicalEventId, winter.canonicalEventId);
  const unresolved = normalizeEcbScheduleCandidateV1(movedCandidate, 300, {
    status: "reconciliation-required", priorCanonicalMeetingDate: winter.canonicalMeetingDate,
  });
  assert.deepEqual(unresolved, {
    status: "reconciliation-required",
    priorCanonicalMeetingDate: "2027-02-04",
    currentMeetingDate: "2027-02-11",
  });

  const duplicateTitles = available(parseEcbMonetaryPolicyScheduleHtmlV1(`
    <html><body><main>
      <div>01/03/2028</div><div>Governing Council of the ECB: monetary policy meeting (Day 2), followed by press conference</div>
      <div>02/04/2028</div><div>Governing Council of the ECB: monetary policy meeting (Day 2), followed by press conference</div>
    </main></body></html>`));
  assert.notEqual(
    normalized(duplicateTitles[0]!, 1, { status: "initial" }).canonicalEventId,
    normalized(duplicateTitles[1]!, 1, { status: "initial" }).canonicalEventId,
    "title alone is never event identity",
  );
  assert.equal(parseEcbMonetaryPolicyScheduleHtmlV1("<html><main>unsupported</main></html>").status,
    "source-malformed");
  assert.equal(parseEcbMonetaryPolicyScheduleHtmlV1("").status, "source-malformed");
  assert.equal(parseEcbMonetaryPolicyScheduleHtmlV1(`
    <html><main>31/02/2027 Governing Council of the ECB: monetary policy meeting
    (Day 2), followed by press conference</main></html>`).status, "source-malformed");

  const validated = validateKnownEcbDecisionReferenceV1(KNOWN_REFERENCE);
  assert.deepEqual(validated, { status: "available", reference: KNOWN_REFERENCE });
  const invalidReferences = [
    { ...KNOWN_REFERENCE, documentUrl: DECISION_URL.replace("https://", "http://") },
    { ...KNOWN_REFERENCE, documentUrl: "not a URL" },
    { ...KNOWN_REFERENCE, documentUrl: DECISION_URL.replace("www.ecb.europa.eu", "example.com") },
    { ...KNOWN_REFERENCE, documentUrl: DECISION_URL.replace("www.ecb.europa.eu", "www.ecb.europa.eu.attacker.example") },
    { ...KNOWN_REFERENCE, documentUrl: DECISION_URL.replace("https://", "https://user@") },
    { ...KNOWN_REFERENCE, documentUrl: DECISION_URL.replace("https://", "https://user:password@") },
    { ...KNOWN_REFERENCE, documentUrl: DECISION_URL.replace("www.ecb.europa.eu", "www.ecb.europa.eu:443") },
    { ...KNOWN_REFERENCE, documentUrl: DECISION_URL.replace("www.ecb.europa.eu", "www.ecb.europa.eu:444") },
    { ...KNOWN_REFERENCE, documentUrl: `${DECISION_URL}?download=1` },
    { ...KNOWN_REFERENCE, documentUrl: `${DECISION_URL}#content` },
    { ...KNOWN_REFERENCE, documentUrl: DECISION_URL.replace("/press/", "//press/") },
    { ...KNOWN_REFERENCE, documentUrl: DECISION_URL.replace("/press/pr/", "/press/%70r/") },
    { ...KNOWN_REFERENCE, documentUrl: DECISION_URL.replace("/press/", "/ignored/../press/") },
    { ...KNOWN_REFERENCE, documentUrl: DECISION_URL.replace("ecb.mp", "ecb.pr") },
    { ...KNOWN_REFERENCE, documentUrl: DECISION_URL.replace("~314e508016", "") },
    { ...KNOWN_REFERENCE, documentUrl: DECISION_URL.replace("~314e508016", "~not-hex") },
    { ...KNOWN_REFERENCE, decisionDate: "2026-09-11" },
    { ...KNOWN_REFERENCE, documentUrl: DECISION_URL.replace("/date/2026/", "/date/2025/") },
    { ...KNOWN_REFERENCE, documentUrl: DECISION_URL.replace("mp260910", "mp260911") },
    { ...KNOWN_REFERENCE, documentUrl: DECISION_URL.replace("ecb.mp", "ECB.MP") },
    { ...KNOWN_REFERENCE, decisionDate: "9999-99-99" },
    { ...KNOWN_REFERENCE, sourceInstitution: "NOT_ECB" },
  ];
  for (const input of invalidReferences) {
    assert.equal(validateKnownEcbDecisionReferenceV1(input).status, "invalid-reference");
  }

  const capture = captured(captureKnownEcbDecisionDocumentHtmlV1(
    DOCUMENT_HTML, KNOWN_REFERENCE, 1_789_100_000,
  ));
  const repeatedCapture = captured(captureKnownEcbDecisionDocumentHtmlV1(
    DOCUMENT_HTML, KNOWN_REFERENCE, 1_789_100_001,
  ));
  assert.equal(repeatedCapture.rawCaptureDigest, capture.rawCaptureDigest);
  assert.equal(repeatedCapture.semanticContentDigest, capture.semanticContentDigest);
  const whitespaceCapture = captured(captureKnownEcbDecisionDocumentHtmlV1(
    DOCUMENT_HTML.replace("<p>Minimal decision evidence.</p>", "<p>  Minimal   decision evidence. </p>"),
    KNOWN_REFERENCE,
    1_789_100_002,
  ));
  assert.notEqual(whitespaceCapture.rawCaptureDigest, capture.rawCaptureDigest);
  assert.equal(whitespaceCapture.semanticContentDigest, capture.semanticContentDigest);
  const scriptStyleNoiseCapture = captured(captureKnownEcbDecisionDocumentHtmlV1(
    DOCUMENT_HTML.replace(
      "<p>Minimal decision evidence.</p>",
      "<script>volatile script noise</script><style>.volatile { color: red; }</style>" +
        "<p>Minimal decision evidence.</p>",
    ),
    KNOWN_REFERENCE,
    1_789_100_002,
  ));
  assert.notEqual(scriptStyleNoiseCapture.rawCaptureDigest, capture.rawCaptureDigest);
  assert.equal(scriptStyleNoiseCapture.semanticContentDigest, capture.semanticContentDigest);
  const changedCapture = captured(captureKnownEcbDecisionDocumentHtmlV1(
    DOCUMENT_HTML.replace("Minimal decision evidence.", "Meaningfully changed decision evidence."),
    KNOWN_REFERENCE,
    1_789_100_003,
  ));
  assert.notEqual(changedCapture.semanticContentDigest, capture.semanticContentDigest);
  assert.equal(captureKnownEcbDecisionDocumentHtmlV1(
    "<html><body>No main decision content</body></html>", KNOWN_REFERENCE, 1,
  ).status, "decision-document-malformed");
  assert.equal(captureKnownEcbDecisionDocumentHtmlV1(
    DOCUMENT_HTML, invalidReferences[1]!, 1,
  ).status, "invalid-reference");

  const decisionSchedule: EcbMonetaryPolicyScheduleCandidateV1 = Object.freeze({
    ...schedule[0]!, meetingDate: "2026-09-10",
  });
  const scheduledDecision = normalized(decisionSchedule, 1_789_000_000, { status: "initial" });
  const event = attached(attachKnownEcbDecisionCaptureV1(
    scheduledDecision, capture, 1_789_099_900,
  ));
  assert.equal(event.decision?.documentUrl, DECISION_URL);
  assert.equal(event.decision?.actualReleasedAt, null);
  assert.notEqual(event.schedule.scheduledAt, event.decision?.actualReleasedAt);
  assert.equal(event.decision?.rates, null);
  assert.equal(JSON.stringify(event).includes("effectiveDate"), false);
  assert.equal(event.availability, "partial");
  assert.equal(event.canonicalEventId, scheduledDecision.canonicalEventId);

  const preservedSchedule = normalized(decisionSchedule, 1_789_000_000, {
    status: "preserve", canonicalMeetingDate: "2026-09-03",
  });
  const preservedEvent = attached(attachKnownEcbDecisionCaptureV1(
    preservedSchedule, capture, 1_789_099_900,
  ));
  assert.equal(preservedEvent.canonicalMeetingDate, "2026-09-03");
  assert.equal(preservedEvent.schedule.meetingDate, "2026-09-10");
  assert.equal(preservedEvent.decision?.decisionDate, "2026-09-10");

  const wrongCurrentDate = normalized({ ...decisionSchedule, meetingDate: "2026-09-11" },
    1_789_000_000, { status: "preserve", canonicalMeetingDate: "2026-09-03" });
  assert.deepEqual(attachKnownEcbDecisionCaptureV1(wrongCurrentDate, capture, 1_789_099_900), {
    status: "reconciliation-required",
    canonicalMeetingDate: "2026-09-03",
    currentMeetingDate: "2026-09-11",
    decisionDate: "2026-09-10",
  });

  const refetchedEvent = attached(attachKnownEcbDecisionCaptureV1(scheduledDecision, {
    ...capture, fetchedAt: capture.fetchedAt + 1,
  }, 1_789_099_901));
  assert.equal(refetchedEvent.sourceVersionId, event.sourceVersionId,
    "capture metadata does not create an economic version");

  const failingClient = new EcbMonetaryPolicyClientV1({
    fetchImpl: async () => { throw new Error("offline"); },
    nowSeconds: () => 1,
  });
  assert.equal((await failingClient.getSchedule()).status, "source-unavailable");
  assert.equal((await failingClient.getKnownDecisionDocument(KNOWN_REFERENCE)).status,
    "decision-document-unavailable");
  const malformedClient = new EcbMonetaryPolicyClientV1({
    fetchImpl: async () => htmlResponse("<html><main>unsupported</main></html>"),
    nowSeconds: () => 1,
  });
  assert.equal((await malformedClient.getSchedule()).status, "source-malformed");
  assert.equal((await malformedClient.getKnownDecisionDocument(KNOWN_REFERENCE)).status,
    "decision-document-malformed");

  for (const contentType of ["text/html", "text/html; charset=utf-8", "TEXT/HTML; charset=UTF-8"]) {
    const htmlClient = new EcbMonetaryPolicyClientV1({
      fetchImpl: async (input) => htmlResponse(
        String(input) === ECB_GOVERNING_COUNCIL_CALENDAR_URL ? SCHEDULE_HTML : DOCUMENT_HTML,
        200,
        contentType,
      ),
      nowSeconds: () => 1,
    });
    assert.equal((await htmlClient.getSchedule()).status, "available");
    assert.equal((await htmlClient.getKnownDecisionDocument(KNOWN_REFERENCE)).status, "available");
  }
  for (const contentType of [
    "application/json",
    "text/plain",
    "application/xhtml+xml",
    "application/not-text/html",
    "application/x-text/html-wrapper",
    "text/htmlish",
  ]) {
    const unsupportedMediaClient = new EcbMonetaryPolicyClientV1({
      fetchImpl: async () => htmlResponse("unsupported", 200, contentType),
      nowSeconds: () => 1,
    });
    assert.equal((await unsupportedMediaClient.getSchedule()).status, "source-malformed");
    assert.equal((await unsupportedMediaClient.getKnownDecisionDocument(KNOWN_REFERENCE)).status,
      "decision-document-malformed");
  }

  let redirectFailureCalls = 0;
  const redirectFailureRequests: string[] = [];
  const redirectModes: (RequestRedirect | undefined)[] = [];
  const redirectFailureClient = new EcbMonetaryPolicyClientV1({
    fetchImpl: async (input, init) => {
      redirectFailureCalls += 1;
      redirectFailureRequests.push(String(input));
      redirectModes.push(init?.redirect);
      throw new TypeError("redirect rejected");
    },
    nowSeconds: () => 1,
  });
  assert.equal((await redirectFailureClient.getSchedule()).status, "source-unavailable");
  assert.equal(redirectFailureCalls, 1, "schedule redirect failure makes one provider call");
  assert.equal((await redirectFailureClient.getKnownDecisionDocument(KNOWN_REFERENCE)).status,
    "decision-document-unavailable");
  assert.equal(redirectFailureCalls, 2, "decision redirect failure makes one provider call");
  assert.deepEqual(redirectFailureRequests, [ECB_GOVERNING_COUNCIL_CALENDAR_URL, DECISION_URL]);
  assert.deepEqual(redirectModes, ["error", "error"]);

  let defensiveRedirectCalls = 0;
  let defensiveRedirectBodyReads = 0;
  const defensiveRedirectClient = new EcbMonetaryPolicyClientV1({
    fetchImpl: async (input) => {
      defensiveRedirectCalls += 1;
      const response = htmlResponse(
        String(input) === ECB_GOVERNING_COUNCIL_CALENDAR_URL ? SCHEDULE_HTML : DOCUMENT_HTML,
      );
      Object.defineProperty(response, "redirected", { value: true });
      Object.defineProperty(response, "text", {
        value: async () => {
          defensiveRedirectBodyReads += 1;
          return "unexpected redirected body";
        },
      });
      return response;
    },
    nowSeconds: () => 1,
  });
  assert.equal((await defensiveRedirectClient.getSchedule()).status, "source-unavailable");
  assert.equal((await defensiveRedirectClient.getKnownDecisionDocument(KNOWN_REFERENCE)).status,
    "decision-document-unavailable");
  assert.equal(defensiveRedirectCalls, 2);
  assert.equal(defensiveRedirectBodyReads, 0, "redirected response bodies are never consumed");

  let rejectedBodyReads = 0;
  const rejectedBodyClient = new EcbMonetaryPolicyClientV1({
    fetchImpl: async (input) => {
      const response = htmlResponse(
        String(input) === ECB_GOVERNING_COUNCIL_CALENDAR_URL ? SCHEDULE_HTML : DOCUMENT_HTML,
      );
      Object.defineProperty(response, "text", {
        value: async () => {
          rejectedBodyReads += 1;
          throw new Error("body stream failed");
        },
      });
      return response;
    },
    nowSeconds: () => 1,
  });
  assert.equal((await rejectedBodyClient.getSchedule()).status, "source-unavailable");
  assert.equal((await rejectedBodyClient.getKnownDecisionDocument(KNOWN_REFERENCE)).status,
    "decision-document-unavailable");
  assert.equal(rejectedBodyReads, 2, "body rejections become explicit unavailable results");

  let timeoutSignalObserved = false;
  const bodyTimeoutClient = new EcbMonetaryPolicyClientV1({
    fetchImpl: async (_input, init) => {
      const signal = init?.signal;
      if (signal === undefined || signal === null) throw new Error("missing abort signal");
      timeoutSignalObserved = true;
      const response = htmlResponse(SCHEDULE_HTML);
      Object.defineProperty(response, "text", {
        value: () => new Promise<string>((_resolve, reject) => {
          const rejectAsAborted = () => reject(new Error("body consumption aborted"));
          if (signal.aborted) rejectAsAborted();
          else signal.addEventListener("abort", rejectAsAborted, { once: true });
        }),
      });
      return response;
    },
    timeoutMs: 1,
    nowSeconds: () => 1,
  });
  assert.equal((await bodyTimeoutClient.getSchedule()).status, "source-unavailable");
  assert.equal(timeoutSignalObserved, true, "timeout signal remains active during body consumption");

  let transportCalls = 0;
  const fixtureClient = new EcbMonetaryPolicyClientV1({
    fetchImpl: async (input) => {
      transportCalls += 1;
      const url = String(input);
      if (url === ECB_GOVERNING_COUNCIL_CALENDAR_URL) return htmlResponse(SCHEDULE_HTML);
      if (url === DECISION_URL) return htmlResponse(DOCUMENT_HTML, 200, "text/html", {
        Date: "Thu, 10 Sep 2026 12:16:03 GMT",
        "Last-Modified": "Thu, 10 Sep 2026 12:16:03 GMT",
      });
      return htmlResponse("missing", 404);
    },
    nowSeconds: () => 1_789_100_000,
  });
  assert.equal((await fixtureClient.getSchedule()).status, "available");
  const fetchedDocument = await fixtureClient.getKnownDecisionDocument(KNOWN_REFERENCE);
  assert.equal(fetchedDocument.status, "available");
  if (fetchedDocument.status === "available") {
    const fromHttp = attached(attachKnownEcbDecisionCaptureV1(
      scheduledDecision, fetchedDocument.data, 1_789_099_900,
    ));
    assert.equal(fromHttp.decision?.actualReleasedAt, null,
      "HTTP Date and Last-Modified never become actual release evidence");
  }
  const callsBeforeInvalidReference = transportCalls;
  for (const invalidReference of invalidReferences) {
    assert.equal((await fixtureClient.getKnownDecisionDocument(invalidReference)).status,
      "invalid-reference");
  }
  assert.equal(transportCalls, callsBeforeInvalidReference,
    "every invalid reference is rejected before transport");
  assert.throws(() => new EcbMonetaryPolicyClientV1({ timeoutMs: 0 }), /positive integer/);

  const cacheSource = readFileSync(join(process.cwd(),
    "src/lib/markets/providers/ecb/monetaryPolicy/cache.ts"), "utf8");
  const clientSource = readFileSync(join(process.cwd(),
    "src/lib/markets/providers/ecb/monetaryPolicy/client.ts"), "utf8");
  const parserSource = readFileSync(join(process.cwd(),
    "src/lib/markets/providers/ecb/monetaryPolicy/parser.ts"), "utf8");
  assert.equal(cacheSource.includes('import "server-only"'), true);
  assert.equal(clientSource.includes('typeof window !== "undefined"'), true);
  assert.equal(cacheSource.match(/= unstable_cache\(/g)?.length, 2,
    "only schedule and known-document shared caches remain");
  for (const source of [cacheSource, clientSource, parserSource]) {
    assert.equal(source.includes("press/govcdec/mopo"), false);
    assert.equal(source.includes("not-published"), false);
    assert.equal(source.includes("DecisionIndex"), false);
    assert.equal(source.includes("discoverEcbDecision"), false);
  }
  assert.equal(cacheSource.includes("no-store"), false);
  for (const product of ["eurusd", "eurjpy", "eurgbp", "eurchf", "estr"]) {
    assert.equal(cacheSource.toLowerCase().includes(product), false,
      `${product} does not own an ECB event fetch`);
  }
  console.log("PASS: verified-scope ECB monetary-policy adapter V1");
}

void run();

function available<T>(result: EcbSourceParseResultV1<T>): T {
  if (result.status !== "available") throw new Error(result.reason);
  return result.data;
}

function captured(result: EcbDecisionDocumentCaptureResultV1): EcbMonetaryPolicyDocumentCaptureV1 {
  if (result.status !== "available") throw new Error(result.reason);
  return result.data;
}

function attached(result: EcbDecisionAttachmentResultV1) {
  if (result.status !== "available") {
    throw new Error(result.status === "invalid-reference" ? result.reason : "Reconciliation required.");
  }
  return result.event;
}

function normalized(
  candidate: EcbMonetaryPolicyScheduleCandidateV1,
  fetchedAt: number,
  identity: Parameters<typeof normalizeEcbScheduleCandidateV1>[2],
) {
  const result = normalizeEcbScheduleCandidateV1(candidate, fetchedAt, identity);
  assert.equal(result.status, "available");
  if (result.status !== "available") throw new Error("Expected normalized schedule event.");
  return result.event;
}

function htmlResponse(
  body: string,
  status = 200,
  contentType = "text/html",
  extraHeaders: Readonly<Record<string, string>> = {},
): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": contentType, ...extraHeaders },
  });
}
