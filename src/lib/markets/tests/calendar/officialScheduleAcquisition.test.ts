import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  OFFICIAL_SCHEDULE_ACQUISITION_V1, OFFICIAL_SCHEDULE_REQUEST_V1, OFFICIAL_SCHEDULE_RESPONSE_MAX_AGE_MS_V1,
  OFFICIAL_SCHEDULE_SOURCES_V1, OFFICIAL_SCHEDULE_TIMEOUT_MS_V1, createOfficialScheduleAcquirerV1,
  type OfficialScheduleAcquisitionFailureV1, type OfficialScheduleAcquisitionResultV1,
} from "../../calendar/officialScheduleAcquisition";
import { OFFICIAL_SCHEDULE_MAX_BYTES_V1 } from "../../calendar/officialScheduleExtraction";
import {
  BOJ_OFFICIAL_SCHEDULE_INPUT_V1, ECB_OFFICIAL_SCHEDULE_INPUT_V1,
  normalizeBojOfficialScheduleV1, normalizeEcbOfficialScheduleV1,
} from "../../calendar/officialPolicySchedules";
import { selectCalendarEventAsOfV1 } from "../../calendar/history";
import { projectCalendarFreeLiteV1 } from "../../calendar/projections";
import { scheduleContextFixtureV1 } from "./officialPolicyScheduleFixtures";

const NOW = Date.parse("2026-10-16T08:00:00Z");
const html = {
  ecb: readFileSync(new URL("./documents/ecb-governing-council-v1.html", import.meta.url), "utf8"),
  boj: readFileSync(new URL("./documents/boj-mpm-index-v1.html", import.meta.url), "utf8"),
};
const request = (publisher: "ecb" | "boj" = "ecb") => ({ schemaVersion: OFFICIAL_SCHEDULE_REQUEST_V1, publisher });
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
function available(result: OfficialScheduleAcquisitionResultV1) {
  if (result.status !== "acquired") assert.fail("Expected acquired schedule: " + JSON.stringify(result));
  return result;
}
function failed(result: OfficialScheduleAcquisitionResultV1, reason: OfficialScheduleAcquisitionFailureV1) {
  assert.ok(result.status === "unavailable" && result.reason === reason, JSON.stringify(result));
  assert.deepEqual(Object.keys(result).sort(), ["schemaVersion", "sourceAuthentication", "evidenceAdmission",
    "clockAccuracy", "historicalOwnership", "sourceCurrency", "status", "reason"].sort());
}
function response(publisher: "ecb" | "boj" = "ecb", body: BodyInit | null = html[publisher],
  headers: HeadersInit = {}, status = 200): Response {
  const values = new Headers({ "Content-Type": "text/html; charset=UTF-8", Date: new Date(NOW).toUTCString() });
  new Headers(headers).forEach((value, key) => values.set(key, value));
  const result = new Response(body, { status, headers: values });
  // Native Response constructor lacks a URL; mock only that network-owned slot.
  Object.defineProperty(result, "url", { value: OFFICIAL_SCHEDULE_SOURCES_V1[publisher].sourceUrl, configurable: true });
  return result;
}
function deferred<T>() {
  let resolve: (value: T) => void = () => assert.fail("Uninitialized deferred");
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
async function flush() { for (let index = 0; index < 12; index++) await Promise.resolve(); }
function fixture(publisher: "ecb" | "boj" = "ecb") {
  const initialReply: (url: string, init: RequestInit) => Promise<Response> = async () => response(publisher);
  const state = {
    calls: [] as { url: string; init: RequestInit }[], wallReads: 0, wallStart: NOW, wallValues: null as number[] | null,
    monotonic: 0, deadlines: new Set<() => void>(), cancelled: 0, clockCalls: 0,
    reply: initialReply,
  };
  const dependencies = {
    fetch: async (url: string, init: RequestInit) => { state.calls.push({ url, init }); return state.reply(url, init); },
    now: () => {
      state.clockCalls++;
      const index = state.wallReads++;
      return state.wallValues?.[Math.min(index, state.wallValues.length - 1)] ?? state.wallStart + index * 100;
    },
    monotonicNow: () => state.monotonic,
    armDeadline: (callback: () => void, milliseconds: number) => {
      assert.equal(milliseconds, OFFICIAL_SCHEDULE_TIMEOUT_MS_V1);
      state.deadlines.add(callback);
      return () => { state.cancelled++; state.deadlines.delete(callback); };
    },
  };
  const client = createOfficialScheduleAcquirerV1(dependencies);
  const expire = () => { state.monotonic = OFFICIAL_SCHEDULE_TIMEOUT_MS_V1; for (const callback of [...state.deadlines]) callback(); };
  return { state, dependencies, client, expire };
}

for (const publisher of ["ecb", "boj"] as const) {
  test("successful bounded " + publisher + " acquisition preserves identity, timing and unverified status", async () => {
    const { state, client } = fixture(publisher);
    const result = available(await client.acquire(request(publisher)));
    assert.equal(result.schemaVersion, OFFICIAL_SCHEDULE_ACQUISITION_V1);
    assert.equal(result.sourceUrl, OFFICIAL_SCHEDULE_SOURCES_V1[publisher].sourceUrl);
    assert.equal(result.network, "http-success");
    assert.equal(result.extraction.document.publisher, publisher);
    assert.equal(result.extraction.document.sourceUrl, result.sourceUrl);
    assert.equal(result.extraction.document.documentId, "official-schedule:" + publisher + ":html");
    assert.equal(result.extraction.document.parserVersion, "official-schedule-html-parser-v1");
    const digest = createHash("sha256").update(html[publisher], "utf8").digest("hex");
    assert.equal(result.http.deliveredBodySha256, digest);
    assert.equal(result.extraction.document.sourceVersionId, "sha256:" + digest);
    assert.equal(result.http.receivedBytes, Buffer.byteLength(html[publisher], "utf8"));
    assert.equal(result.startedAt, new Date(NOW).toISOString());
    assert.deepEqual(plain(result.timing), { acquisition: { status: "recorded", completedAt: new Date(NOW + 100).toISOString() },
      evidenceAvailability: { status: "recorded", availableAt: new Date(NOW + 200).toISOString() },
      persistence: { status: "not-persisted" } });
    assert.equal(result.freshness.scope, "unverified-response-age");
    assert.equal(result.freshness.observedAgeMilliseconds, 200);
    assert.equal(result.freshness.expiresAt, new Date(NOW + 60_000).toISOString());
    assert.equal(result.freshnessPolicy.maximumAgeMilliseconds, 59_800);
    assert.equal(result.sourceAuthentication, "not-performed");
    assert.equal(result.evidenceAdmission, "not-certified");
    assert.equal(result.clockAccuracy, "unknown");
    assert.equal(result.historicalOwnership, "not-certified");
    assert.equal(result.sourceCurrency, "not-certified");
    assert.equal(result.extraction.rows[0].eventTime.kind, publisher === "ecb" ? "date-only" : "unknown");
    assert.equal(state.calls.length, 1);
    const init = state.calls[0].init;
    assert.equal(init.method, "GET");
    assert.equal(init.redirect, "manual");
    assert.equal(init.cache, "no-store");
    assert.equal(init.credentials, "omit");
    assert.equal(init.referrerPolicy, "no-referrer");
    const headers = new Headers(init.headers);
    assert.equal(headers.get("accept"), "text/html");
    assert.equal(headers.get("accept-encoding"), "identity");
    assert.equal(headers.get("authorization"), null);
    assert.equal(headers.get("cookie"), null);
    assert.ok(init.signal instanceof AbortSignal && init.signal.aborted);
    assert.equal(state.deadlines.size, 0);
    assert.equal(state.cancelled, 1);
    assert.ok(Object.isFrozen(result) && Object.isFrozen(result.timing) && Object.isFrozen(result.extraction.rows[0]));
  });
}

test("request shape rejects arbitrary URLs, unsupported publishers and active objects before network or clocks", async () => {
  const { state, client } = fixture();
  let calls = 0;
  const trap = () => { calls++; throw Error("Caller code forbidden"); };
  const proxy = new Proxy(request(), { get: trap, ownKeys: trap, getPrototypeOf: trap });
  const revoked = Proxy.revocable(request(), {}); revoked.revoke();
  for (const input of [null, undefined, [], {}, "ecb", { ...request(), publisher: "fed" },
    { ...request(), schemaVersion: "v2" }, { ...request(), sourceUrl: "http://localhost/" },
    { ...request(), timeout: Infinity }, { ...request(), [Symbol("extra")]: true }, proxy, revoked.proxy,
    Object.defineProperty({ ...request() }, "publisher", { get: trap }),
    { ...request(), toJSON: trap }, Object.defineProperty({ ...request() }, "hidden", { value: true }),
  ]) failed(await client.acquire(input), "invalid-input");
  assert.equal(calls, 0);
  assert.equal(state.calls.length, 0);
  assert.equal(state.clockCalls, 0);
  assert.equal(state.deadlines.size, 0);
});

test("allowlist and captured dependencies cannot be changed during an acquisition", async () => {
  const { state, client, dependencies } = fixture();
  const input = { ...request() };
  const pending = client.acquire(input);
  input.publisher = "boj";
  dependencies.fetch = async () => { throw Error("Replacement must not run"); };
  const result = available(await pending);
  assert.equal(result.extraction.document.publisher, "ecb");
  assert.equal(state.calls.length, 1);
  assert.ok(Object.isFrozen(OFFICIAL_SCHEDULE_SOURCES_V1) && Object.isFrozen(OFFICIAL_SCHEDULE_SOURCES_V1.ecb));
  assert.throws(() => { Object.assign(OFFICIAL_SCHEDULE_SOURCES_V1.ecb, { sourceUrl: "https://attacker.test/" }); }, TypeError);
});

test("timeouts abort a stalled fetch and late success never escapes or starts extraction", async () => {
  const mock = fixture();
  const started = deferred<void>();
  const late = deferred<Response>();
  let bodyCancelled = 0;
  mock.state.reply = async () => { started.resolve(); return late.promise; };
  const pending = mock.client.acquire(request());
  await started.promise;
  mock.expire();
  failed(await pending, "timeout");
  assert.equal(mock.state.calls.length, 1);
  assert.ok(mock.state.calls[0].init.signal?.aborted);
  const body = new ReadableStream<Uint8Array>({ cancel() { bodyCancelled++; } });
  late.resolve(response("ecb", body));
  await flush();
  assert.equal(bodyCancelled, 1);
  assert.equal(mock.state.deadlines.size, 0);
});

test("the deadline covers stalled bodies, not only response headers", async () => {
  const mock = fixture();
  const started = deferred<void>();
  let cancelled = 0;
  const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled++; } });
  const getReader = stream.getReader.bind(stream);
  Object.defineProperty(stream, "getReader", { value: () => { started.resolve(); return getReader(); } });
  mock.state.reply = async () => response("ecb", stream);
  const pending = mock.client.acquire(request());
  await started.promise;
  mock.expire();
  failed(await pending, "timeout");
  assert.equal(cancelled, 1);
  assert.equal(mock.state.cancelled, 1);
});

test("monotonic deadline and regression checks do not rely on timer callback scheduling", async () => {
  for (const elapsed of [OFFICIAL_SCHEDULE_TIMEOUT_MS_V1, OFFICIAL_SCHEDULE_TIMEOUT_MS_V1 + 1]) {
    const mock = fixture();
    mock.state.reply = async () => { mock.state.monotonic = elapsed; return response(); };
    failed(await mock.client.acquire(request()), "timeout");
  }
  const mock = fixture();
  mock.state.monotonic = 10;
  mock.state.reply = async () => { mock.state.monotonic = 9; return response(); };
  failed(await mock.client.acquire(request()), "clock-unavailable");
});

test("final synchronous delivery work cannot outrun the nominal timeout or freshness expiry", async () => {
  const mock = fixture();
  const original = mock.dependencies.now;
  const client = createOfficialScheduleAcquirerV1({ ...mock.dependencies, now: () => {
    const value = original();
    if (mock.state.wallReads === 4) mock.state.monotonic = OFFICIAL_SCHEDULE_TIMEOUT_MS_V1;
    return value;
  } });
  failed(await client.acquire(request()), "timeout");
  const stale = fixture();
  stale.state.wallValues = [NOW, NOW + 100, NOW + 200, NOW + OFFICIAL_SCHEDULE_RESPONSE_MAX_AGE_MS_V1];
  failed(await stale.client.acquire(request()), "stale-response");
});

test("all redirects are rejected without following even same-origin or HTTPS targets", async () => {
  for (const status of [301, 302, 303, 307, 308]) {
    for (const location of [OFFICIAL_SCHEDULE_SOURCES_V1.ecb.sourceUrl, "/press/other",
      "http://www.ecb.europa.eu/", "https://attacker.test/"]) {
      const mock = fixture();
      mock.state.reply = async () => response("ecb", null, { Location: location }, status);
      failed(await mock.client.acquire(request()), "unsupported-redirect");
      assert.equal(mock.state.calls.length, 1);
    }
  }
  for (const url of ["", "https://www.ecb.europa.eu/other", "http://www.ecb.europa.eu/",
    OFFICIAL_SCHEDULE_SOURCES_V1.ecb.sourceUrl + "?query=1", "https://www.ecb.europa.eu.attacker.test/"]) {
    const mock = fixture();
    mock.state.reply = async () => {
      const result = response();
      Object.defineProperty(result, "url", { value: url });
      return result;
    };
    failed(await mock.client.acquire(request()), "unsupported-redirect");
  }
  const mock = fixture();
  mock.state.reply = async () => {
    const result = response();
    Object.defineProperty(result, "redirected", { value: true });
    return result;
  };
  failed(await mock.client.acquire(request()), "unsupported-redirect");
});

test("HTTP errors and partial/empty statuses never become schedule evidence", async () => {
  for (const status of [204, 206, 304, 400, 403, 404, 429, 500, 503]) {
    const mock = fixture();
    mock.state.reply = async () => response("ecb", [204, 304].includes(status) ? null : html.ecb, {}, status);
    failed(await mock.client.acquire(request()), "http-status");
    assert.equal(mock.state.calls.length, 1);
  }
});

test("network errors are sanitized and there is no retry or stale-success fallback", async () => {
  const mock = fixture();
  available(await mock.client.acquire(request()));
  mock.state.reply = async () => { throw Error("private-provider-detail token=synthetic"); };
  const result = await mock.client.acquire(request());
  failed(result, "network-failure");
  assert.ok(!JSON.stringify(result).includes("private-provider-detail"));
  assert.equal(mock.state.calls.length, 2);
  assert.equal(mock.state.deadlines.size, 0);
});

test("concurrent publisher requests keep independent deadlines and never substitute another source", async () => {
  const mock = fixture();
  const delayed = deferred<Response>();
  mock.state.reply = async (url) => url === OFFICIAL_SCHEDULE_SOURCES_V1.ecb.sourceUrl ? delayed.promise : response("boj");
  const ecb = mock.client.acquire(request("ecb"));
  const boj = available(await mock.client.acquire(request("boj")));
  assert.equal(boj.extraction.document.publisher, "boj");
  assert.equal(mock.state.deadlines.size, 1);
  assert.equal(mock.state.calls.length, 2);
  assert.equal(mock.state.calls[0].init.signal?.aborted, false);
  mock.expire();
  failed(await ecb, "timeout");
  delayed.resolve(response());
  await flush();
  assert.equal(mock.state.deadlines.size, 0);
});

test("media type and UTF-8-only response policy reject PDF, JSON, duplicates and other encodings", async () => {
  for (const contentType of ["application/pdf", "application/json", "application/xhtml+xml", "text/plain",
    "text/html; charset=shift_jis", "text/html; charset=utf-8; charset=utf-8", "text/html, text/html"]) {
    const mock = fixture();
    mock.state.reply = async () => response("ecb", html.ecb, { "Content-Type": contentType });
    failed(await mock.client.acquire(request()), "unsupported-media-type");
  }
  const missing = fixture();
  missing.state.reply = async () => { const result = response(); result.headers.delete("content-type"); return result; };
  failed(await missing.client.acquire(request()), "unsupported-media-type");
  for (const encoding of ["gzip", "br", "deflate"]) {
    const mock = fixture();
    mock.state.reply = async () => response("ecb", html.ecb, { "Content-Encoding": encoding });
    failed(await mock.client.acquire(request()), "unsupported-encoding");
  }
  for (const value of [new Uint8Array([0xc3, 0x28]), new Uint8Array([0xe2])]) {
    const mock = fixture();
    mock.state.reply = async () => response("ecb", value);
    failed(await mock.client.acquire(request()), "unsupported-encoding");
  }
});

test("streaming UTF-8 handles split multibyte characters and preserves delivered byte identity", async () => {
  const content = "<!-- \u20ac -->" + html.ecb;
  const bytes = new TextEncoder().encode(content);
  const euro = bytes.indexOf(0xe2);
  let index = 0;
  const chunks = [bytes.slice(0, euro + 1), bytes.slice(euro + 1, euro + 2), bytes.slice(euro + 2)];
  const body = new ReadableStream<Uint8Array>({ pull(controller) {
    if (index < chunks.length) controller.enqueue(chunks[index++]); else controller.close();
  } });
  const mock = fixture();
  mock.state.reply = async () => response("ecb", body, { "Content-Type": 'TEXT/HTML; charset="UTF-8"',
    "Content-Length": String(bytes.length), "Content-Encoding": "identity" });
  const result = available(await mock.client.acquire(request()));
  assert.equal(result.http.receivedBytes, bytes.length);
  assert.equal(result.http.deliveredBodySha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(result.extraction.rows.length, 2);
});

test("size bounds reject oversized declared and streamed bodies and cancel consumption", async () => {
  const early = fixture();
  let cancelled = 0;
  early.state.reply = async () => response("ecb", new ReadableStream({ cancel() { cancelled++; } }),
    { "Content-Length": String(OFFICIAL_SCHEDULE_MAX_BYTES_V1 + 1) });
  failed(await early.client.acquire(request()), "response-too-large");
  assert.equal(cancelled, 1);
  const streaming = fixture();
  let stage = 0;
  const body = new ReadableStream<Uint8Array>({ pull(controller) {
    if (stage++ === 0) controller.enqueue(new Uint8Array(OFFICIAL_SCHEDULE_MAX_BYTES_V1));
    else controller.enqueue(new Uint8Array([32]));
  }, cancel() { cancelled++; } });
  streaming.state.reply = async () => response("ecb", body);
  failed(await streaming.client.acquire(request()), "response-too-large");
  assert.equal(cancelled, 2);
});

test("truncated and malformed stream responses yield no partial extraction", async () => {
  const length = Buffer.byteLength(html.ecb);
  for (const value of [String(length - 1), String(length + 1), "-1", "1, 2", "1.5", "NaN", "99999999999999999999"]) {
    const mock = fixture();
    mock.state.reply = async () => response("ecb", html.ecb, { "Content-Length": value });
    failed(await mock.client.acquire(request()), "invalid-response");
  }
  const empty = fixture();
  empty.state.reply = async () => response("ecb", "");
  failed(await empty.client.acquire(request()), "invalid-response");
  const broken = fixture();
  broken.state.reply = async () => response("ecb", new ReadableStream({
    pull(controller) { controller.error(Error("private-body-failure")); },
  }));
  failed(await broken.client.acquire(request()), "body-failure");
  const endless = fixture();
  endless.state.reply = async () => response("ecb", new ReadableStream<Uint8Array>({
    pull(controller) { controller.enqueue(new Uint8Array()); },
  }));
  failed(await endless.client.acquire(request()), "invalid-response");
});

test("malformed and unexpected HTML fail the whole acquisition", async () => {
  for (const [publisher, content] of [
    ["ecb", "<main><h1>Maintenance</h1></main>"],
    ["ecb", html.ecb.replace("17/12/2026", "31/02/2026")],
    ["boj", html.boj.replace('colspan="3"', 'colspan="4"')],
    ["boj", html.boj.replace("Oct. 29 (Thurs.), 30 (Fri.)", "To be announced")],
  ] as const) {
    const mock = fixture(publisher);
    mock.state.reply = async () => response(publisher, content);
    failed(await mock.client.acquire(request(publisher)), "source-malformed");
  }
});

test("stale Date/Age and cache-expired or warned responses fail closed", async () => {
  for (const headers of [
    { Date: new Date(NOW - 60_000).toUTCString() }, { Age: "60" }, { Age: "59" },
    { Age: "9", "Cache-Control": "max-age=10" }, { "Cache-Control": 'max-age="0"' },
    { Warning: '110 origin "Response is stale"' },
    { Warning: '111 origin "Revalidation failed"' },
  ] as HeadersInit[]) {
    const mock = fixture();
    mock.state.reply = async () => response("ecb", html.ecb, headers);
    failed(await mock.client.acquire(request()), "stale-response");
  }
  const missing = fixture();
  missing.state.reply = async () => { const result = response(); result.headers.delete("date"); return result; };
  failed(await missing.client.acquire(request()), "freshness-unavailable");
});

test("HTTP dates and age directives must be unambiguous and valid", async () => {
  for (const headers of [{ Date: "invalid" }, { Date: "Sat, 16 Oct 2026 08:00:00 GMT" },
    { Age: "-1" }, { Age: "1.5" }, { Age: "NaN" }, { Age: "1, 2" },
    { "Cache-Control": "max-age=60, max-age=120" }, { "Cache-Control": "max-age=wrong" },
    { "Cache-Control": "s-maxage=12.5" }, { "Last-Modified": "not-a-date" },
    { "Content-Length": String(Buffer.byteLength(html.ecb)), "Transfer-Encoding": "chunked" }] as HeadersInit[]) {
    const mock = fixture();
    mock.state.reply = async () => response("ecb", html.ecb, headers);
    failed(await mock.client.acquire(request()), "invalid-response");
  }
  const future = fixture();
  future.state.reply = async () => response("ecb", html.ecb, { Date: new Date(NOW + 1_000).toUTCString() });
  failed(await future.client.acquire(request()), "clock-unavailable");
});

test("Age buckets, elapsed request time and source max-age conservatively reduce remaining lifetime", async () => {
  const mock = fixture();
  mock.state.reply = async () => { mock.state.monotonic = 250; return response("ecb", html.ecb,
    { Age: "10", "Cache-Control": "public, max-age=30, stale-while-revalidate=60, s-maxage=20" }); };
  const result = available(await mock.client.acquire(request()));
  assert.equal(result.freshness.observedAgeMilliseconds, 11_250);
  assert.equal(result.freshnessPolicy.maximumAgeMilliseconds, 8_750);
  assert.equal(result.freshness.expiresAt, new Date(NOW + 200 + 8_750).toISOString());
});

test("freshness expires at the exact local millisecond without fabricating clock accuracy", async () => {
  const before = fixture();
  before.state.wallValues = [NOW, NOW + 59_999, NOW + 59_999, NOW + 59_999];
  const result = available(await before.client.acquire(request()));
  assert.equal(result.freshnessPolicy.maximumAgeMilliseconds, 1);
  assert.equal(result.clockAccuracy, "unknown");
  const exact = fixture();
  exact.state.wallValues = [NOW, NOW + 60_000, NOW + 60_000, NOW + 60_000];
  failed(await exact.client.acquire(request()), "stale-response");
});

test("invalid or regressing observation clocks fail closed within canonical UTC bounds", async () => {
  for (const value of [NaN, Infinity, -1, -0, 0.5, 253_402_300_800_000]) {
    const mock = fixture();
    mock.state.wallValues = [value];
    failed(await mock.client.acquire(request()), "clock-unavailable");
    assert.equal(mock.state.calls.length, 0);
  }
  for (const values of [[NOW, NOW - 1], [NOW, NOW + 100, NOW + 99], [NOW, NOW + 100, NOW + 200, NOW + 199]]) {
    const mock = fixture();
    mock.state.wallValues = values;
    failed(await mock.client.acquire(request()), "clock-unavailable");
  }
  const throwing = fixture();
  const client = createOfficialScheduleAcquirerV1({ ...throwing.dependencies, now: () => { throw Error("private-clock-error"); } });
  failed(await client.acquire(request()), "clock-unavailable");
});

test("documents with only past meeting dates fail against the publisher's civil date", async () => {
  for (const publisher of ["ecb", "boj"] as const) {
    const mock = fixture(publisher);
    mock.state.wallStart = Date.parse("2029-01-01T00:00:00Z");
    mock.state.reply = async () => response(publisher, html[publisher], { Date: new Date(mock.state.wallStart).toUTCString() });
    failed(await mock.client.acquire(request(publisher)), "schedule-outdated");
  }
  // Last fixture meeting is Dec 17, 2027: UTC still Dec 17, but Tokyo is Dec 18.
  const tokyo = fixture("boj");
  tokyo.state.wallStart = Date.parse("2027-12-17T15:00:00Z");
  tokyo.state.reply = async () => response("boj", html.boj, { Date: new Date(tokyo.state.wallStart).toUTCString() });
  failed(await tokyo.client.acquire(request("boj")), "schedule-outdated");
});

test("stable body identity is retained across requests without using Last-Modified as freshness or publication", async () => {
  const mock = fixture();
  mock.state.reply = async () => response("ecb", html.ecb, { "Last-Modified": "Thu, 31 Jul 2025 00:00:00 GMT" });
  const first = available(await mock.client.acquire(request()));
  const second = available(await mock.client.acquire(request()));
  assert.equal(first.extraction.document.documentId, second.extraction.document.documentId);
  assert.equal(first.extraction.document.sourceVersionId, second.extraction.document.sourceVersionId);
  assert.notDeepEqual(first.timing.acquisition, second.timing.acquisition);
  assert.equal(first.http.lastModified, "2025-07-31T00:00:00.000Z");
  assert.equal("publication" in first.http, false);
  mock.state.reply = async () => response("ecb", html.ecb.replaceAll("29/10/2026", "30/10/2026"));
  const changed = available(await mock.client.acquire(request()));
  assert.notEqual(first.extraction.document.sourceVersionId, changed.extraction.document.sourceVersionId);
});

test("normalizers reuse acquisition clocks and precision, but historical selection still requires acknowledgement", async () => {
  for (const publisher of ["ecb", "boj"] as const) {
    const mock = fixture(publisher);
    const acquired = available(await mock.client.acquire(request(publisher)));
    const row = acquired.extraction.rows[publisher === "ecb" ? 0 : 1];
    const canonicalMeetingDate = publisher === "ecb" ? "2026-10-29" : "2026-10-30";
    const normalize = publisher === "ecb" ? normalizeEcbOfficialScheduleV1 : normalizeBojOfficialScheduleV1;
    const result = normalize({ schemaVersion: publisher === "ecb" ? ECB_OFFICIAL_SCHEDULE_INPUT_V1 : BOJ_OFFICIAL_SCHEDULE_INPUT_V1,
      candidate: row.candidate, ...(publisher === "ecb" ? { announcementClock: null } : {}),
      context: { ...scheduleContextFixtureV1(canonicalMeetingDate), sourceVersionId: acquired.extraction.document.sourceVersionId,
        timing: acquired.timing, freshnessPolicy: acquired.freshnessPolicy } });
    if (result.status !== "available") assert.fail();
    assert.deepEqual(result.event.eventTime, row.eventTime);
    assert.equal(result.event.publication.status, "unavailable");
    const at = acquired.freshness.assessedAt;
    const selection = selectCalendarEventAsOfV1({ versions: [result.event], knowledgeCutoff: at, evaluatedAt: at });
    assert.ok(selection.status === "unavailable" && selection.reason === "persistence-acknowledgement-unavailable");
    // Synthetic persistence only, to check existing downstream expiry semantics.
    const event = { ...result.event, timing: { ...result.event.timing,
      persistence: { status: "acknowledged", acknowledgedAt: at, recordId: "synthetic-test-receipt" } } };
    const projection = projectCalendarFreeLiteV1({ versions: [event], knowledgeCutoff: at, evaluatedAt: at }, acquired.freshness.expiresAt);
    assert.ok(projection.availability === "available" && projection.event.freshness.status === "stale");
  }
});

test("factory creation does no I/O; acquisition has no automatic runtime, storage or assessment integration", () => {
  let calls = 0;
  createOfficialScheduleAcquirerV1({ fetch: async () => { calls++; throw Error(); } });
  assert.equal(calls, 0);
  const source = readFileSync(new URL("../../calendar/officialScheduleAcquisition.ts", import.meta.url), "utf8");
  assert.match(source, /^import "server-only";/);
  assert.doesNotMatch(source, /process\.env|new Redis|unstable_cache|setInterval|OwnershipLedger|HistoricalResolution|assessCanonical/);
});
