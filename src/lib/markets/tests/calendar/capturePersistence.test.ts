import assert from "node:assert/strict";
import test from "node:test";
import {
  CALENDAR_OFFLINE_CAPACITY_V1, createOfflineCalendarJournalV1, prepareCalendarCaptureV1,
  type CalendarCaptureInputV1, type CalendarCaptureRecordV1, type CalendarOfflineAppendResultV1,
} from "../../calendar/capturePersistence";
import { selectCalendarEventAsOfV1 } from "../../calendar/history";
import { CAPTURE_NOW_V1, captureFixtureV1, captureHtmlFixtureV1 } from "./capturePersistenceFixtures";

const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const at = (offset = 1000) => new Date(CAPTURE_NOW_V1 + offset).toISOString();
function prepared(input: unknown): CalendarCaptureRecordV1 {
  const result = prepareCalendarCaptureV1(input);
  if (result.status !== "prepared") assert.fail("Expected prepared capture.");
  return result.record;
}
function failure(result: CalendarOfflineAppendResultV1, reason: string) {
  assert.equal(result.status, "unavailable");
  assert.ok("reason" in result && result.reason === reason, JSON.stringify(result));
}
function checkpoint(journal: ReturnType<typeof createOfflineCalendarJournalV1>) {
  return journal.checkpoint() as { entries: { record: CalendarCaptureRecordV1; receipt: { observedAcknowledgedAt: string; sequence: number } }[] };
}
async function revision(previous: CalendarCaptureInputV1, offset = 2000, captureId = "synthetic-capture-2") {
  const input = await captureFixtureV1({ captureId, previousCaptureId: previous.captureId, offset,
    content: captureHtmlFixtureV1("ecb").replaceAll("17/12/2026", "18/12/2026") });
  return { ...input, bindings: previous.bindings.map(binding => ({ ...binding, versionId: binding.versionId + "-next",
    revision: { sequence: binding.revision.sequence + 1, supersedesVersionId: binding.versionId, change: "schedule-revision" as const } })) };
}
for (const publisher of ["ecb", "boj"] as const) {
  test("immutable " + publisher + " capture preserves original bytes, identity, uncertainty and separate clocks", async () => {
    const input = await captureFixtureV1({ publisher });
    const record = prepared(input);
    assert.equal(Buffer.from(record.input.bodyBase64Chunks.join(""), "base64").toString("utf8"), captureHtmlFixtureV1(publisher));
    assert.equal(record.acquisitionCutoff, at(100));
    assert.equal(record.input.acquisition.timing.evidenceAvailability.status, "recorded");
    assert.equal(record.evidenceAvailability.status, "unavailable");
    assert.equal(record.durablePersistence.status, "unavailable");
    assert.equal(record.input.acquisition.extraction.document.parserVersion, "official-schedule-html-parser-v1");
    assert.equal(record.eventVersions.length, input.bindings.length);
    for (const { event, sha256 } of record.eventVersions) {
      assert.equal(sha256.length, 64);
      assert.equal(event.eventTime.kind, publisher === "ecb" ? "date-only" : "unknown");
      assert.equal(event.publication.status, "unavailable");
      assert.equal(event.timing.evidenceAvailability.status, "unavailable");
      assert.equal(event.timing.persistence.status, "not-persisted");
      assert.equal(event.relevance.length, publisher === "ecb" ? 5 : 1);
      const selected = selectCalendarEventAsOfV1({ versions: [event], knowledgeCutoff: at(10000), evaluatedAt: at(10000) });
      assert.equal(selected.status, "unavailable"); // A volatile receipt cannot unlock historical admission.
    }
    assert.ok(Object.isFrozen(record.input.acquisition.extraction.rows[0]));
    assert.throws(() => { (record.input.bodyBase64Chunks as string[])[0] = "tampered"; });
    (input.bindings as unknown as { versionId: string }[])[0].versionId = "changed-after-validation";
    assert.notEqual(record.input.bindings[0].versionId, "changed-after-validation");
  });
}
test("canonical digest is stable across property order and JSON recovery", async () => {
  const input = await captureFixtureV1();
  assert.equal(prepared(input).recordSha256, prepared(Object.fromEntries(Object.entries(plain(input)).reverse())).recordSha256);
});
test("UTF-8 BOM is preserved in original bytes independently from decoded text digest", async () => {
  const input = await captureFixtureV1({ content: "\uFEFF" + captureHtmlFixtureV1("ecb") });
  const record = prepared(input);
  assert.notEqual(record.input.acquisition.http.deliveredBodySha256, record.input.acquisition.extraction.document.htmlTextSha256);
  assert.deepEqual([...Buffer.from(record.input.bodyBase64Chunks[0], "base64").subarray(0, 3)], [239, 187, 191]);
});
function setPath(value: unknown, path: string, replacement: unknown): void {
  const parts = path.split(".");
  let data = value as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) data = data[part] as Record<string, unknown>;
  data[parts.at(-1)!] = replacement;
}
const corruptions: [string, string, unknown][] = [
  ["changed original bytes", "bodyBase64Chunks.0", "AAAA"],
  ["noncanonical base64", "bodyBase64Chunks.0", "AAAA\n"],
  ["oversized evidence", "bodyBase64Chunks", Array(343).fill("A".repeat(2048))],
  ["missing evidence", "bodyBase64Chunks", []],
  ["partial extraction", "acquisition.extraction.rows", []],
  ["missing binding", "bindings", []],
  ["extra binding", "bindings.2", {}],
  ["changed source identity", "acquisition.extraction.document.documentId", "different"],
  ["changed digest", "acquisition.http.deliveredBodySha256", "0".repeat(64)],
  ["changed source URL", "acquisition.sourceUrl", "https://evil.example"],
  ["parser revision mismatch", "acquisition.extraction.document.parserVersion", "parser-v999"],
  ["invented extraction clock", "acquisition.extraction.rows.0.eventTime", { kind: "exact", at: at() }],
  ["invented authority", "acquisition.evidenceAdmission", "certified"],
  ["invented persistence", "acquisition.timing.persistence", { status: "acknowledged", acknowledgedAt: at(), recordId: "fake" }],
  ["clock regression", "acquisition.timing.acquisition.completedAt", at(-100)],
  ["expiry mismatch", "acquisition.freshness.expiresAt", at()],
  ["negative age", "acquisition.freshness.observedAgeMilliseconds", -1],
  ["invalid revision", "bindings.0.revision.sequence", 2],
  ["unknown field", "secret", "unexpected"],
  ["unsupported schema", "schemaVersion", "calendar-capture-input-v2"],
];
for (const [name, path, replacement] of corruptions) {
  test("capture rejects " + name + " before append", async () => {
    const data = plain(await captureFixtureV1());
    setPath(data, path, replacement);
    assert.equal(prepareCalendarCaptureV1(data).status, "unavailable");
  });
}
test("proxies, accessors and revoked proxies fail without invoking traps or getters", async () => {
  let invoked = 0;
  const input = await captureFixtureV1();
  for (const value of [
    new Proxy(input, { ownKeys() { invoked++; throw new Error(); } }),
    { ...input, get bindings() { invoked++; return []; } },
    { ...input, bindings: new Proxy(input.bindings, { get() { invoked++; throw new Error(); } }) },
  ]) assert.equal(prepareCalendarCaptureV1(value).status, "unavailable");
  const revoked = Proxy.revocable(input, {}); revoked.revoke();
  assert.equal(prepareCalendarCaptureV1(revoked.proxy).status, "unavailable");
  assert.equal(invoked, 0);
});
test("append is idempotent, retains original acknowledgement and checks immutable record integrity", async () => {
  const record = prepared(await captureFixtureV1());
  let clocks = 0;
  const journal = createOfflineCalendarJournalV1({ now: () => { clocks++; return at(); } });
  const first = journal.append(record);
  assert.equal(first.status, "appended");
  const retry = journal.append(plain(record));
  assert.equal(retry.status, "idempotent");
  assert.ok("receipt" in first && "receipt" in retry && first.receipt === retry.receipt);
  assert.equal(clocks, 1);
  const changed = plain(record); (changed as { acquisitionCutoff: string }).acquisitionCutoff = at();
  failure(journal.append(changed), "invalid-capture");
  assert.equal(checkpoint(journal).entries.length, 1);
});
test("same capture id with changed valid content conflicts, never overwrites", async () => {
  const journal = createOfflineCalendarJournalV1({ now: () => at(5000) });
  const initial = await captureFixtureV1();
  const first = prepared(initial);
  journal.append(first);
  const other = prepared(await captureFixtureV1({ offset: 1000 }));
  failure(journal.append(other), "conflict");
  assert.equal(checkpoint(journal).entries[0].record.recordSha256, first.recordSha256);
});
test("64 concurrent stale-head contenders have one winner and preserve all earlier captures", async () => {
  const input = await captureFixtureV1();
  const journal = createOfflineCalendarJournalV1({ now: () => at(10000) });
  const first = prepared(input);
  journal.append(first);
  const next = await revision(input);
  const records = Array.from({ length: 64 }, (_, index) => prepared({ ...next, captureId: "contender-" + index }));
  const results = await Promise.all(records.map(record => Promise.resolve().then(() => journal.append(record))));
  assert.equal(results.filter(result => result.status === "appended").length, 1);
  assert.equal(results.filter(result => result.status === "unavailable" && result.reason === "conflict").length, 63);
  assert.equal(checkpoint(journal).entries[0].record.recordSha256, first.recordSha256);
});
test("revision appends original bytes and stable event anchors; cutoffs are never rewritten", async () => {
  const input = await captureFixtureV1();
  const journal = createOfflineCalendarJournalV1({ now: () => at(10000) });
  journal.append(prepared(input));
  const revised = prepared(await revision(input));
  assert.equal(journal.append(revised).status, "appended");
  const entries = checkpoint(journal).entries;
  assert.equal(entries[0].record.acquisitionCutoff, at(100));
  assert.equal(entries[1].record.acquisitionCutoff, at(2100));
  assert.equal(entries[0].record.eventVersions[1].event.eventId, entries[1].record.eventVersions[1].event.eventId);
  assert.notDeepEqual(entries[0].record.eventVersions[1].event.eventTime, entries[1].record.eventVersions[1].event.eventTime);
  assert.notEqual(entries[0].record.input.bodyBase64Chunks.join(""), entries[1].record.input.bodyBase64Chunks.join(""));
  assert.equal(entries.filter(entry => Date.parse(entry.record.acquisitionCutoff) <= CAPTURE_NOW_V1 + 2000).length, 1);
});
test("ambiguous after-commit failure retries recover the original receipt without reappend or backdating", async () => {
  const record = prepared(await captureFixtureV1());
  let mode: "after-append" | "none" = "after-append";
  const journal = createOfflineCalendarJournalV1({ now: () => at(5000), fault: () => mode });
  failure(journal.append(record), "outcome-unknown");
  mode = "none";
  const recovered = createOfflineCalendarJournalV1({ now: () => at(9000) }, plain(journal.checkpoint()));
  const retry = recovered.append(record);
  assert.equal(retry.status, "idempotent");
  assert.ok("receipt" in retry && retry.receipt.observedAcknowledgedAt === at(5000));
});
test("before-commit failure writes nothing and retry appends once", async () => {
  const record = prepared(await captureFixtureV1());
  let failed = true;
  const journal = createOfflineCalendarJournalV1({ now: () => at(), fault: () => failed ? "before-append" : "none" });
  failure(journal.append(record), "simulated-failure");
  assert.equal(checkpoint(journal).entries.length, 0);
  failed = false;
  assert.equal(journal.append(record).status, "appended");
});
for (const name of [
  "tampered evidence", "altered event", "missing predecessor", "reordered history",
  "regressed receipt", "receipt digest mismatch", "duplicate capture", "unknown checkpoint schema",
]) {
  test("recovery quarantines " + name + " and never silently resets history", async () => {
    const input = await captureFixtureV1();
    const journal = createOfflineCalendarJournalV1({ now: () => at(10000) });
    journal.append(prepared(input)); journal.append(prepared(await revision(input)));
    const data = plain(checkpoint(journal));
    switch (name) {
      case "tampered evidence": setPath(data, "entries.0.record.input.bodyBase64Chunks.0", "AAAA"); break;
      case "altered event": setPath(data, "entries.0.record.eventVersions.0.event.title", "forged"); break;
      case "missing predecessor": data.entries.shift(); break;
      case "reordered history": data.entries.reverse(); break;
      case "regressed receipt": setPath(data, "entries.1.receipt.observedAcknowledgedAt", at(-1)); break;
      case "receipt digest mismatch": setPath(data, "entries.0.receipt.recordSha256", "0".repeat(64)); break;
      case "duplicate capture": data.entries.push(data.entries[0]); break;
      case "unknown checkpoint schema": setPath(data, "schemaVersion", "unknown"); break;
    }
    const recovered = createOfflineCalendarJournalV1({ now: () => at(20000) }, data);
    failure(recovered.append(prepared(input)), "corrupt-history");
    assert.deepEqual(recovered.checkpoint(), { status: "unavailable", reason: "corrupt-history" });
  });
}
test("clock failures and regression leave history untouched", async () => {
  const input = await captureFixtureV1();
  for (const value of ["invalid", at(0), "10000-01-01T00:00:00Z"]) {
    const journal = createOfflineCalendarJournalV1({ now: () => value });
    const result = journal.append(prepared(input));
    assert.equal(result.status, "unavailable");
    assert.equal(checkpoint(journal).entries.length, 0);
  }
  const journal = createOfflineCalendarJournalV1({ now: () => { throw new Error("private transport details"); } });
  failure(journal.append(prepared(input)), "clock-unavailable");
});
test("reentrant trusted callbacks cannot lose an intervening append", async () => {
  const record = prepared(await captureFixtureV1());
  let nested: CalendarOfflineAppendResultV1 | undefined;
  const journal = createOfflineCalendarJournalV1({ now: () => { nested = journal.append(record); return at(); } });
  assert.equal(journal.append(record).status, "appended");
  failure(nested!, "conflict");
  assert.equal(checkpoint(journal).entries.length, 1);
});
test("old captures remain archivable after freshness expiry but never become qualified evidence", async () => {
  const journal = createOfflineCalendarJournalV1({ now: () => "9999-12-31T23:59:59.999Z" });
  const record = prepared(await captureFixtureV1());
  assert.equal(journal.append(record).status, "appended");
  assert.equal(record.evidenceAvailability.status, "unavailable");
  assert.equal(record.durablePersistence.status, "unavailable");
});
test("capacity never evicts prior evidence; explicit bounded retention stops append", async () => {
  let input = await captureFixtureV1();
  const journal = createOfflineCalendarJournalV1({ now: () => at(100000) });
  for (let index = 0; index < CALENDAR_OFFLINE_CAPACITY_V1; index++) {
    assert.equal(journal.append(prepared(input)).status, "appended");
    input = await revision(input, (index + 1) * 2000, "synthetic-capture-" + (index + 2));
  }
  failure(journal.append(prepared(input)), "capacity-exceeded");
  assert.equal(checkpoint(journal).entries.length, CALENDAR_OFFLINE_CAPACITY_V1);
});

test("concurrent identical retries linearize to one append and one receipt", async () => {
  const record = prepared(await captureFixtureV1());
  const journal = createOfflineCalendarJournalV1({ now: () => at() });
  const results = await Promise.all(Array.from({ length: 64 }, () => Promise.resolve().then(() => journal.append(record))));
  assert.equal(results.filter(result => result.status === "appended").length, 1);
  assert.equal(results.filter(result => result.status === "idempotent").length, 63);
  assert.equal(checkpoint(journal).entries.length, 1);
});
test("wrong predecessor, skipped revisions, version reuse and cross-source appends fail closed", async () => {
  const input = await captureFixtureV1();
  const journal = createOfflineCalendarJournalV1({ now: () => at(100000) });
  journal.append(prepared(input));
  const next = await revision(input);
  failure(journal.append(prepared({ ...next, previousCaptureId: "missing" })), "conflict");
  const skipped = plain(next);
  setPath(skipped, "bindings.0.revision.sequence", 3);
  failure(journal.append(prepared(skipped)), "conflict");
  const wrong = plain(next);
  setPath(wrong, "bindings.0.revision.supersedesVersionId", "missing-version");
  failure(journal.append(prepared(wrong)), "conflict");
  assert.equal(journal.append(prepared(next)).status, "appended");
  const reused = await revision(next, 4000, "synthetic-capture-3");
  setPath(reused, "bindings.0.versionId", input.bindings[0].versionId);
  failure(journal.append(prepared(reused)), "conflict");
  failure(journal.append(prepared(await captureFixtureV1({ publisher: "boj", captureId: "cross-source",
    previousCaptureId: next.captureId, offset: 6000 }))), "conflict");
  assert.equal(checkpoint(journal).entries.length, 2);
});
test("recovery preserves a complete two-capture chain and returns an immutable detached checkpoint", async () => {
  const input = await captureFixtureV1();
  const journal = createOfflineCalendarJournalV1({ now: () => at(10000) });
  journal.append(prepared(input));
  const next = prepared(await revision(input));
  journal.append(next);
  const exported = plain(journal.checkpoint());
  const recovered = createOfflineCalendarJournalV1({ now: () => at(20000) }, exported);
  assert.equal(recovered.append(next).status, "idempotent");
  setPath(exported, "entries.0.record.recordSha256", "tampered");
  assert.deepEqual(recovered.checkpoint(), journal.checkpoint());
  assert.ok(Object.isFrozen(checkpoint(recovered).entries));
});
test("throwing pre-commit fault never leaks details or changes the journal", async () => {
  const journal = createOfflineCalendarJournalV1({ now: () => at(), fault: () => { throw new Error("private failure"); } });
  failure(journal.append(prepared(await captureFixtureV1())), "simulated-failure");
  assert.equal(checkpoint(journal).entries.length, 0);
});
test("untrusted record and checkpoint accessors/proxies do not run during persistence or recovery", async () => {
  let invoked = 0;
  const input = prepared(await captureFixtureV1());
  const proxy = new Proxy(input, { ownKeys() { invoked++; throw new Error(); } });
  const journal = createOfflineCalendarJournalV1({ now: () => at() });
  failure(journal.append(proxy), "invalid-capture");
  const recovered = createOfflineCalendarJournalV1({ now: () => at() }, { get entries() { invoked++; return []; } });
  failure(recovered.append(input), "corrupt-history");
  assert.equal(invoked, 0);
});
