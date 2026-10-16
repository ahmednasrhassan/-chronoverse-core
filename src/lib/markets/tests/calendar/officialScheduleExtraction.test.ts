import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ECB_GOVERNING_COUNCIL_CALENDAR_URL } from "../../events/ecbMonetaryPolicy";
import { selectCalendarEventAsOfV1 } from "../../calendar/history";
import { projectCalendarFreeLiteV1, projectCalendarVipDeepV1 } from "../../calendar/projections";
import {
  BOJ_OFFICIAL_MEETING_SCHEDULE_URL_V1, BOJ_OFFICIAL_SCHEDULE_INPUT_V1, ECB_OFFICIAL_SCHEDULE_INPUT_V1,
  normalizeBojOfficialScheduleV1, normalizeEcbOfficialScheduleV1,
} from "../../calendar/officialPolicySchedules";
import {
  OFFICIAL_SCHEDULE_DOCUMENT_V1, OFFICIAL_SCHEDULE_HTML_PARSER_V1, OFFICIAL_SCHEDULE_MAX_BYTES_V1,
  extractBojOfficialScheduleHtmlV1, extractEcbOfficialScheduleHtmlV1,
  type OfficialScheduleDocumentV1,
} from "../../calendar/officialScheduleExtraction";
import { FIXTURE_ACK_V1, fixtureTimingV1 } from "./fixtures";
import { scheduleContextFixtureV1 } from "./officialPolicyScheduleFixtures";

const ecbHtml = readFileSync(new URL("./documents/ecb-governing-council-v1.html", import.meta.url), "utf8");
const bojHtml = readFileSync(new URL("./documents/boj-mpm-index-v1.html", import.meta.url), "utf8");
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
function document(publisher: "ecb" | "boj", content = publisher === "ecb" ? ecbHtml : bojHtml): OfficialScheduleDocumentV1 {
  return { schemaVersion: OFFICIAL_SCHEDULE_DOCUMENT_V1, publisher, content,
    sourceUrl: publisher === "ecb" ? ECB_GOVERNING_COUNCIL_CALENDAR_URL : BOJ_OFFICIAL_MEETING_SCHEDULE_URL_V1,
    timeZone: publisher === "ecb" ? "Europe/Berlin" : "Asia/Tokyo",
    documentId: "synthetic-structural-fixture:" + publisher + ":v1",
    sourceVersionId: "synthetic-document-version-1", mediaType: "text/html" };
}
function available<T extends { readonly status: string }>(result: T): Extract<T, { status: "available" }> {
  if (result.status !== "available") assert.fail("Expected supported official HTML structure: " + JSON.stringify(result));
  return result as Extract<T, { status: "available" }>;
}
function invalid(result: { readonly status: string }) {
  assert.equal(result.status, "unavailable");
  assert.deepEqual(Object.keys(result).sort(), ["schemaVersion", "scope", "sourceAuthentication", "historicalOwnership", "status", "reason"].sort());
}

test("versioned ECB fixture extracts only Day-2 dates with document identity and row references", () => {
  const input = document("ecb");
  const result = available(extractEcbOfficialScheduleHtmlV1(input));
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.rows.map(row => row.candidate.meetingDate), ["2026-10-29", "2026-12-17"]);
  assert.deepEqual(result.rows.map(row => row.reference.rowIndex), [2, 7]);
  assert.deepEqual(plain(result.rows[0].eventTime), { kind: "date-only", date: "2026-10-29", timeZone: "Europe/Berlin" });
  assert.deepEqual(plain(result.rows[0].reference), { rowIndex: 2, tableYear: null, dateLabel: "29/10/2026" });
  assert.equal(result.document.documentId, input.documentId);
  assert.equal(result.document.sourceVersionId, input.sourceVersionId);
  assert.equal(result.document.sourceUrl, input.sourceUrl);
  assert.equal(result.document.publisher, "ecb");
  assert.equal(result.document.parserVersion, OFFICIAL_SCHEDULE_HTML_PARSER_V1);
  assert.equal(result.document.format, "ecb-governing-council-dl-v1");
  assert.equal(result.document.htmlTextSha256, createHash("sha256").update(input.content, "utf8").digest("hex"));
  assert.equal(result.sourceAuthentication, "not-performed");
  assert.equal(result.historicalOwnership, "not-certified");
});

test("versioned BoJ fixture binds years, weekdays, source labels and two-day meetings", () => {
  const result = available(extractBojOfficialScheduleHtmlV1(document("boj")));
  assert.equal(result.rows.length, 5);
  assert.deepEqual(result.rows.map(row => row.candidate.meetingEndsOn),
    ["2026-09-18", "2026-10-30", "2026-12-18", "2027-01-22", "2027-12-17"]);
  assert.deepEqual(result.rows.map(row => row.reference.tableYear), [2026, 2026, 2026, 2027, 2027]);
  assert.deepEqual(plain(result.rows[0].eventTime), { kind: "unknown", expectedDate: "2026-09-18",
    timeZone: "Asia/Tokyo", reason: "announcement-time-unspecified" });
  assert.equal(result.rows[0].reference.dateLabel, "Sept. 17 (Thurs.), 18 (Fri.) [PDF 204KB]");
  assert.equal(result.document.format, "boj-mpm-index-table-v1");
  assert.equal(result.document.publisher, "boj");
  assert.equal(result.document.timeZone, "Asia/Tokyo");
});

test("adjacent BoJ report/minutes dates, PDF links and clocks never become decision publication times", () => {
  const result = available(extractBojOfficialScheduleHtmlV1(document("boj")));
  for (const row of result.rows) {
    assert.equal(row.eventTime.kind, "unknown");
    for (const key of ["at", "startsAt", "endsAt", "publication", "actualReleasedAt"]) assert.equal(key in row.eventTime, false);
  }
  assert.ok(!result.rows.some(row => row.candidate.meetingEndsOn === "2027-01-27"));
  // An unknown minutes date is allowed; an unknown meeting date is not.
  invalid(extractBojOfficialScheduleHtmlV1(document("boj",
    bojHtml.replace("Oct. 29 (Thurs.), 30 (Fri.)", "To be announced"))));
});

test("extracted candidates reuse Phase 2B1 normalization and Phase 2A projections without inventing timing", () => {
  const ecb = available(extractEcbOfficialScheduleHtmlV1(document("ecb")));
  const boj = available(extractBojOfficialScheduleHtmlV1(document("boj")));
  const normalized = [
    normalizeEcbOfficialScheduleV1({ schemaVersion: ECB_OFFICIAL_SCHEDULE_INPUT_V1, candidate: ecb.rows[0].candidate,
      announcementClock: null, context: { ...scheduleContextFixtureV1("2026-10-29"), sourceVersionId: ecb.document.sourceVersionId } }),
    normalizeBojOfficialScheduleV1({ schemaVersion: BOJ_OFFICIAL_SCHEDULE_INPUT_V1, candidate: boj.rows[1].candidate,
      context: { ...scheduleContextFixtureV1("2026-10-30"), sourceVersionId: boj.document.sourceVersionId } }),
  ];
  for (const result of normalized) {
    if (result.status !== "available") assert.fail();
    assert.equal(result.event.publication.status, "unavailable");
    assert.deepEqual(result.event.eventTime, result.event.provenance.publisher === "ecb" ? ecb.rows[0].eventTime : boj.rows[1].eventTime);
    const input = { versions: [result.event], knowledgeCutoff: FIXTURE_ACK_V1, evaluatedAt: FIXTURE_ACK_V1 };
    const free = projectCalendarFreeLiteV1(input, FIXTURE_ACK_V1);
    const vip = projectCalendarVipDeepV1(input, FIXTURE_ACK_V1);
    assert.equal(free.availability, "available");
    assert.equal(vip.availability, "available");
    assert.ok(!JSON.stringify(free).includes("sourceVersionId"));
    assert.ok(!JSON.stringify(vip).includes("fixture-internal-persistence-record"));
    assert.ok(!JSON.stringify(result).includes("probability"));
  }
});

test("revised HTML has a distinct digest while caller-owned event identity and historical cutoffs remain stable", () => {
  for (const publisher of ["ecb", "boj"] as const) {
    const original = document(publisher);
    const changed = { ...original, sourceVersionId: "synthetic-document-version-2",
      content: publisher === "ecb" ? ecbHtml.replaceAll("29/10/2026", "30/10/2026")
        : bojHtml.replace("Oct. 29 (Thurs.), 30 (Fri.)", "Nov. 2 (Mon.), 3 (Tues.)") };
    const first = publisher === "ecb" ? available(extractEcbOfficialScheduleHtmlV1(original))
      : available(extractBojOfficialScheduleHtmlV1(original));
    const second = publisher === "ecb" ? available(extractEcbOfficialScheduleHtmlV1(changed))
      : available(extractBojOfficialScheduleHtmlV1(changed));
    assert.notEqual(first.document.htmlTextSha256, second.document.htmlTextSha256);
    assert.equal(first.document.documentId, second.document.documentId);
    const canonicalDate = publisher === "ecb" ? "2026-10-29" : "2026-10-30";
    const index = publisher === "ecb" ? 0 : 1;
    const normalize = publisher === "ecb" ? normalizeEcbOfficialScheduleV1 : normalizeBojOfficialScheduleV1;
    const payload = { schemaVersion: publisher === "ecb" ? ECB_OFFICIAL_SCHEDULE_INPUT_V1 : BOJ_OFFICIAL_SCHEDULE_INPUT_V1,
      ...(publisher === "ecb" ? { announcementClock: null } : {}) };
    const before = normalize({ ...payload, candidate: first.rows[index].candidate,
      context: { ...scheduleContextFixtureV1(canonicalDate), sourceVersionId: first.document.sourceVersionId } });
    if (before.status !== "available") assert.fail();
    const after = normalize({ ...payload, candidate: second.rows[index].candidate,
      context: { ...scheduleContextFixtureV1(canonicalDate), versionId: "synthetic-event-v2",
        sourceVersionId: second.document.sourceVersionId, timing: fixtureTimingV1("2026-10-16T08:01:00Z"),
        revision: { sequence: 2, supersedesVersionId: before.event.versionId, change: "schedule-revision" } } });
    if (after.status !== "available") assert.fail();
    assert.equal(before.event.eventId, after.event.eventId);
    assert.notDeepEqual(before.event.eventTime, after.event.eventTime);
    const selection = selectCalendarEventAsOfV1({ versions: [after.event, before.event],
      knowledgeCutoff: FIXTURE_ACK_V1, evaluatedAt: "2026-10-16T08:02:00Z" });
    assert.ok(selection.status === "selected" && selection.event.versionId === before.event.versionId);
  }
});

test("unsupported or malformed revisions fail the entire extraction without partial rows or fallback", () => {
  for (const content of [
    ecbHtml.replace("17/12/2026", "31/02/2026"),
    ecbHtml.replace("(Day 2), followed by press conference", "(Day 2), announcement at 14:15 CET"),
    ecbHtml.replace("<dt>17/12/2026</dt>", "<dt>2026-12-17</dt>"),
  ]) invalid(extractEcbOfficialScheduleHtmlV1(document("ecb", content)));
  for (const content of [
    bojHtml.replace("Dec. 17 (Thurs.), 18 (Fri.)", "Dec. 18 (Fri.), 17 (Thurs.)"),
    bojHtml.replace("Oct. 29 (Thurs.), 30 (Fri.)", "Oct. 29 (Fri.), 30 (Sat.)"),
    bojHtml.replace("Oct. 29 (Thurs.), 30 (Fri.)", "10/29/2026, 10/30/2026"),
    bojHtml.replace("Oct. 29 (Thurs.), 30 (Fri.)", "Oct. 29 (Thurs.), Nov. 1 (Sun.)"),
    bojHtml.replace("Oct. 29 (Thurs.), 30 (Fri.)", "Feb. 29 (Thurs.), 30 (Fri.)"),
    bojHtml.replace("Table : 2026", "Table : 2027"),
    bojHtml.replace('<h2 id="p2026">2026</h2>', '<h2 id="p2026">2025</h2>'),
    bojHtml.replace("Oct. 29 (Thurs.), 30 (Fri.)", "Oct. 29 (Thurs.), 30 (Fri.) JST"),
  ]) invalid(extractBojOfficialScheduleHtmlV1(document("boj", content)));
});

test("strict layouts reject missing/extra columns, altered headers, nested tables and broken tags", () => {
  for (const content of [
    bojHtml.replace("Date of MPM", "Decision announcement"),
    bojHtml.replace('colspan="3"', 'colspan="4"'),
    bojHtml.replace('scope="col">MPM Minutes', 'scope="col" rowspan="2">MPM Minutes'),
    bojHtml.replace("<td>-</td>", ""),
    bojHtml.replace("<td>-</td>", "<td>-</td><td>Extra</td>"),
    bojHtml.replace("</tr>", ""),
    bojHtml.replace("<tbody>", "<tbody><table></table>"),
    bojHtml.replace("<thead>", "<div>").replace("</thead>", "</div>"),
    bojHtml.replace("<caption", "<p").replace("</caption>", "</p>"),
  ]) invalid(extractBojOfficialScheduleHtmlV1(document("boj", content)));
  for (const content of [
    ecbHtml.replace("<dl>", "<div>").replace("</dl>", "</div>"),
    ecbHtml.replace("</dd>", ""),
    ecbHtml.replace("<dt>", "<dd>"),
    ecbHtml.replace("</dl>", "</dl><dl></dl>"),
    ecbHtml.replace("29/10/2026", "10/29/2026"),
    ecbHtml.replace("(Day 2), followed by press conference", "(Day 3), followed by press conference"),
  ]) invalid(extractEcbOfficialScheduleHtmlV1(document("ecb", content)));
});

test("duplicate and nonchronological meetings cannot silently merge", () => {
  const ecbRow = /<dt>29\/10\/2026<\/dt>\s*<dd>Governing Council[^<]+<br><\/dd>/.exec(ecbHtml)?.[0];
  assert.ok(ecbRow);
  invalid(extractEcbOfficialScheduleHtmlV1(document("ecb", ecbHtml.replace(ecbRow, ecbRow + ecbRow))));
  invalid(extractEcbOfficialScheduleHtmlV1(document("ecb", ecbHtml.replace("17/12/2026", "17/10/2026"))));
  invalid(extractBojOfficialScheduleHtmlV1(document("boj",
    bojHtml.replace("Oct. 29 (Thurs.), 30 (Fri.)", "Sept. 17 (Thurs.), 18 (Fri.)"))));
});

test("comments and raw scripts outside main cannot inject fake schedules", () => {
  const expected = available(extractEcbOfficialScheduleHtmlV1(document("ecb")));
  const fake = "<main><h1>Wrong page</h1><dl><dt>01/01/2027</dt><dd>Fake</dd></dl></main>";
  const content = '<!DOCTYPE html><html><head><script>const fake = ' + JSON.stringify(fake) +
    ';</script></head><body><!--' + fake + "-->" + ecbHtml + "</body></html>";
  const extracted = available(extractEcbOfficialScheduleHtmlV1(document("ecb", content)));
  assert.deepEqual(extracted.rows, expected.rows);
  for (const addition of ['<script>void 0</script>', '<style>dd {display:none}</style>',
    '<template>' + fake + "</template>", '<noscript>' + fake + "</noscript>"]) {
    invalid(extractEcbOfficialScheduleHtmlV1(document("ecb", ecbHtml.replace("<dl>", "<dl>" + addition))));
  }
  invalid(extractEcbOfficialScheduleHtmlV1(document("ecb", ecbHtml + ecbHtml)));
  invalid(extractEcbOfficialScheduleHtmlV1(document("ecb", "<template><template></template>" + ecbHtml + "</template>")));
});

test("outer raw-text and foreign content cannot masquerade as the real main schedule", () => {
  for (const tag of ["title", "textarea", "xmp", "iframe", "noembed", "svg", "math", "object", "select"]) {
    invalid(extractEcbOfficialScheduleHtmlV1(document("ecb", "<" + tag + ">" + ecbHtml + "</" + tag + ">")));
  }
  invalid(extractEcbOfficialScheduleHtmlV1(document("ecb", "<plaintext>" + ecbHtml)));
  const wrapped = "<html><head><title>Calendar format</title></head><body>" + ecbHtml + "</body></html>";
  assert.equal(available(extractEcbOfficialScheduleHtmlV1(document("ecb", wrapped))).rows.length, 2);
});

test("hidden, active, duplicate attributes and unsupported inline elements fail closed", () => {
  for (const [extract, publisher, html] of [
    [extractEcbOfficialScheduleHtmlV1, "ecb", ecbHtml], [extractBojOfficialScheduleHtmlV1, "boj", bojHtml],
  ] as const) {
    for (const main of ['<main hidden>', '<main style="display:none">', '<main aria-hidden="true">',
      '<main class="hidden">', '<main onclick="doSomething()">', '<main id="one" id="two">']) {
      invalid(extract(document(publisher, html.replace("<main>", main))));
    }
  }
  invalid(extractEcbOfficialScheduleHtmlV1(document("ecb",
    ecbHtml.replace("29/10/2026", "<img src='fake'>29/10/2026"))));
  invalid(extractBojOfficialScheduleHtmlV1(document("boj",
    bojHtml.replace("Oct. 29 (Thurs.), 30 (Fri.)", "<div>Oct. 29 (Thurs.), 30 (Fri.)</div>"))));
});

test("fixed HTML entity decoding and benign inline whitespace do not change dates", () => {
  const html = ecbHtml.replace("29/10/2026", "<span>29/10/2026</span>")
    .replaceAll("(Day 2), followed", "(Day&#32;2),&nbsp;followed");
  assert.deepEqual(available(extractEcbOfficialScheduleHtmlV1(document("ecb", html))).rows.map(row => row.candidate),
    available(extractEcbOfficialScheduleHtmlV1(document("ecb"))).rows.map(row => row.candidate));
  const boj = bojHtml.replace("Oct. 29 (Thurs.), 30 (Fri.)", "Oct.&#32;29 (Thurs.),\n  30 (Fri.)");
  assert.equal(available(extractBojOfficialScheduleHtmlV1(document("boj", boj))).rows[1].candidate.meetingEndsOn, "2026-10-30");
});

test("PDFs and mislabeled PDF text receive no HTML or PDF fallback", () => {
  for (const [extract, publisher] of [[extractEcbOfficialScheduleHtmlV1, "ecb"], [extractBojOfficialScheduleHtmlV1, "boj"]] as const) {
    const result = extract({ ...document(publisher), mediaType: "application/pdf", content: "%PDF-1.7 fake" });
    assert.ok(result.status === "unavailable" && result.reason === "unsupported-format");
    invalid(extract({ ...document(publisher), mediaType: "application/pdf" }));
    invalid(extract({ ...document(publisher), content: "%PDF-1.7 fake" }));
    invalid(extract({ ...document(publisher), mediaType: "text/plain" }));
  }
});

test("publisher, exact source URL, input version and qualified timezone are mandatory", () => {
  for (const [extract, publisher] of [[extractEcbOfficialScheduleHtmlV1, "ecb"], [extractBojOfficialScheduleHtmlV1, "boj"]] as const) {
    const input = document(publisher);
    for (const patch of [{ publisher: publisher === "ecb" ? "boj" : "ecb" }, { schemaVersion: "v2" },
      { sourceUrl: input.sourceUrl + "?token=synthetic" }, { sourceUrl: input.sourceUrl + "#section" },
      { sourceUrl: input.sourceUrl.replace("https:", "http:") }, { sourceUrl: input.sourceUrl.replace("www.", "user:password@www.") },
      { sourceUrl: input.sourceUrl.replace(".europa.eu", ".europa.eu.attacker.test").replace(".boj.or.jp", ".boj.or.jp.attacker.test") },
      { timeZone: "UTC" }, { timeZone: "+09:00" }, { timeZone: "JST" }, { timeZone: null },
      { sourceVersionId: "" }, { documentId: " " }, { documentId: "x".repeat(161) }, { sourceVersionId: "\n" },
    ]) invalid(extract({ ...input, ...patch }));
  }
});

test("bounded HTML rejects excess bytes, depth, node count, rows, DTDs and malformed encodings", () => {
  for (const content of [
    " ".repeat(OFFICIAL_SCHEDULE_MAX_BYTES_V1 + 1) + ecbHtml,
    "\u20ac".repeat(180_000) + ecbHtml,
    ecbHtml.replace("<dl>", "<div>".repeat(33) + "<dl>").replace("</dl>", "</dl>" + "</div>".repeat(33)),
    ecbHtml.replace("</main>", "<p> </p>".repeat(4_096) + "</main>"),
    ecbHtml.replace("<dl>", "<dl>" + "<dt>01/01/2026</dt><dd>Fake</dd>".repeat(129)),
    '<!DOCTYPE html [<!ENTITY fake "29/10/2026">]>' + ecbHtml,
    ecbHtml.replace("29/10/2026", "&unqualified;"),
    ecbHtml.replace("</main>", ""),
    ecbHtml + "<!--unterminated",
    ecbHtml + "\u0000",
    ecbHtml + "\ud800",
  ]) invalid(extractEcbOfficialScheduleHtmlV1(document("ecb", content)));
});

test("passive input snapshot rejects proxies, accessors, symbols and serializers without invoking them", () => {
  let calls = 0;
  const trap = () => { calls++; throw Error("Caller code forbidden"); };
  const input = document("ecb");
  const revoked = Proxy.revocable(input, {}); revoked.revoke();
  const proxy = new Proxy(input, { get: trap, ownKeys: trap, getPrototypeOf: trap });
  for (const value of [null, [], undefined, proxy, revoked.proxy,
    Object.defineProperty({ ...input }, "content", { get: trap }),
    Object.defineProperty({ ...input }, "hidden", { value: true }),
    { ...input, [Symbol("extra")]: true }, { ...input, toJSON: trap },
    { ...input, content: Object(ecbHtml) }, { ...input, content: { toString: trap } },
    { ...input, extra: "unsupported" },
  ]) invalid(extractEcbOfficialScheduleHtmlV1(value));
  assert.equal(calls, 0);
});

test("results are deeply immutable and detached, while document version labels are preserved verbatim", () => {
  const input = document("boj");
  const result = available(extractBojOfficialScheduleHtmlV1(input));
  const unchanged = available(extractBojOfficialScheduleHtmlV1({ ...input, sourceVersionId: "another-explicit-source-version" }));
  assert.equal(result.document.htmlTextSha256, unchanged.document.htmlTextSha256);
  assert.notEqual(result.document.sourceVersionId, unchanged.document.sourceVersionId);
  Object.assign(input, { content: "mutated", sourceVersionId: "mutated" });
  assert.equal(result.rows[1].candidate.meetingEndsOn, "2026-10-30");
  assert.equal(result.document.sourceVersionId, "synthetic-document-version-1");
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.document) && Object.isFrozen(result.rows));
  assert.ok(Object.isFrozen(result.rows[0].candidate) && Object.isFrozen(result.rows[0].reference));
  assert.throws(() => { Object.assign(result.rows[0].candidate, { meetingEndsOn: "forged" }); }, TypeError);
});

test("empty, wrong-page and partial documents are unavailable with sanitized errors", () => {
  for (const content of ["", " ", "<main><h1>Maintenance</h1></main>", "<dl><dt>29/10/2026</dt></dl>",
    ecbHtml.replace("Schedules for the meetings", "Other document"),
    ecbHtml.replaceAll("(Day 2), followed by press conference", "(Day 1)"),
  ]) invalid(extractEcbOfficialScheduleHtmlV1(document("ecb", content)));
  const result = extractEcbOfficialScheduleHtmlV1(document("ecb", "synthetic-private-input"));
  assert.ok(!JSON.stringify(result).includes("synthetic-private-input"));
});

test("extraction is offline and has no ambient clock, storage, routes or assessment dependencies", () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  try {
    globalThis.fetch = () => { throw Error("No network acquisition"); };
    Date.now = () => { throw Error("No ambient clock"); };
    assert.deepEqual(available(extractEcbOfficialScheduleHtmlV1(document("ecb"))),
      available(extractEcbOfficialScheduleHtmlV1(document("ecb"))));
    assert.equal(available(extractBojOfficialScheduleHtmlV1(document("boj"))).rows.length, 5);
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
  const source = readFileSync(new URL("../../calendar/officialScheduleExtraction.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /process\.env|fetch\(|Date\.now|new Redis|unstable_cache|OwnershipLedger|HistoricalResolution|assessCanonical/);
});
