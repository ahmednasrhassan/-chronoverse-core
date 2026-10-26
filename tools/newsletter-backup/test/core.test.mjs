import test from "node:test";
import assert from "node:assert/strict";
import { unlockKey, encrypt, decrypt, envelope } from "../src/crypto.mjs";
import { reconcile, recoveryBundle, validateStats, sha } from "../src/model.mjs";
import { collect, pages, SyncSession } from "../src/sync.mjs";
import { config, address, id, data, source, passphrase, time, row } from "./fixtures.mjs";
import { scope } from "../src/aws.mjs";
import { canonical } from "../src/safe.mjs";

test("portable authenticated encryption uses fixed strong KDF, fresh IVs and conceals records", async () => {
  const key = await unlockKey(passphrase);
  try {
    const one = encrypt(data(), key, "snapshot"), two = encrypt(data(), key, "snapshot");
    assert.notDeepEqual(one, two); assert.equal(one.includes(address), false);
    assert.deepEqual(decrypt(one, key, "snapshot"), data());
    assert.equal(envelope(one).header.kdf.N, 131072);
    const restored = await unlockKey(passphrase, envelope(one).header.salt);
    try { assert.deepEqual(decrypt(one, restored, "snapshot"), data()); } finally { restored.key.fill(0); }
    assert.throws(() => decrypt(one, key, "recovery"), /authentication/);
    const tampered = JSON.parse(one); tampered.ciphertext = (tampered.ciphertext[0] === "A" ? "B" : "A") + tampered.ciphertext.slice(1);
    assert.throws(() => decrypt(JSON.stringify(tampered), key, "snapshot"), /authentication/);
    tampered.header.kdf.N = 2 ** 30; assert.throws(() => envelope(JSON.stringify(tampered)), /invalid_backup/);
    assert.throws(() => decrypt(one.subarray(0, one.length - 10), key, "snapshot"), /authentication/);
    const wrong = await unlockKey(passphrase + "wrong", key.salt);
    try { assert.throws(() => decrypt(one, wrong, "snapshot"), /authentication/); } finally { wrong.key.fill(0); }
  } finally { key.key.fill(0); }
});
test("short passphrases are rejected", async () => { await assert.rejects(unlockKey("short"), /passphrase/); });
test("SDK timestamps and binary attributes retain their AWS JSON values; absent optional fields stay absent", () => {
  const raw = { LastUpdatedTimestamp: new Date(time), optional: undefined, attributes: { B: Uint8Array.from([1, 2, 3]), N: "9007199254740993" } };
  assert.deepEqual(JSON.parse(canonical(raw)), { LastUpdatedTimestamp: time, attributes: { B: "AQID", N: "9007199254740993" } });
});
test("pagination follows empty filtered pages and removes identical duplicate records", async () => {
  const calls = []; const output = await pages(async input => { calls.push(input); return calls.length === 1 ? { Items: [], LastEvaluatedKey: { pk: { S: "cursor" } } } : { Items: [row("A"), row("A")] }; }, "Items", "LastEvaluatedKey", "ExclusiveStartKey");
  assert.equal(output.length, 1); assert.deepEqual(calls[1], { ExclusiveStartKey: { pk: { S: "cursor" } } });
});
test("SES pagination uses NextToken, rejects repeated tokens and malformed/incomplete pages", async () => {
  let count = 0;
  const output = await pages(async input => { count++; return count === 1 ? { Contacts: [], NextToken: "next" } : (assert.equal(input.NextToken, "next"), { Contacts: [{ EmailAddress: address }] }); }, "Contacts", "NextToken", "NextToken");
  assert.equal(output.length, 1);
  await assert.rejects(pages(async () => ({ Contacts: [], NextToken: "loop" }), "Contacts", "NextToken", "NextToken"), /pagination_loop/);
  await assert.rejects(pages(async () => ({}), "Items", "LastEvaluatedKey", "ExclusiveStartKey"), /invalid_page/);
  await assert.rejects(pages(async () => ({ Contacts: [], NextToken: {} }), "Contacts", "NextToken", "NextToken"), /invalid_page/);
  await assert.rejects(pages(async () => ({ Items: [], LastEvaluatedKey: { pk: { S: "next" } } }), "Items", "LastEvaluatedKey", "ExclusiveStartKey", 1), /pagination_limit/);
});
test("fully empty sources produce a truthful zero-subscriber encrypted-snapshot payload", async () => {
  const output = await collect(source({ ledger: [], contacts: [], accountChecks: [] }), scope(config));
  assert.equal(output.stats.identities, 0); assert.equal(output.data.accountChecks.length, 0); assert.equal(output.stats.sendable, 0);
});
test("collection retains raw ledger/audits and completes per-newsletter-address suppression checks", async () => {
  const output = await collect(source(), scope(config), [], () => time);
  assert.equal(output.stats.identities, 1); assert.equal(output.stats.consentReviewCandidates, 1); assert.equal(output.stats.sendable, 0);
  assert.deepEqual(output.data.ledger, data().ledger); assert.equal(output.data.accountChecks.length, 1); assert.equal(output.atomicPointInTime, false);
});
test("any source failure aborts collection, rather than substituting an empty audience or suppression list", async () => {
  for (const method of ["verify", "scan", "contacts", "suppression"]) {
    const f = source(); f[method] = async () => { throw new Error("synthetic-provider-error"); };
    await assert.rejects(collect(f, scope(config)));
  }
  await assert.rejects(collect({ ...source(), async suppression() { return {}; } }, scope(config)), /invalid_page/);
});
test("duplicate state variants cannot erase opt-outs or become consent review candidates", () => {
  const d = data(); d.ledger.push(d.ledger[0], row(`SUB#${id}`, { email: address, state: "SUPPRESSED", suppressionReason: "unsubscribe" }));
  const result = reconcile(d); assert.equal(result.stats.identities, 1); assert.equal(result.stats.conflicts, 1); assert.equal(result.stats.suppressed, 1); assert.equal(result.records[0].activationAuthorized, false);
});
test("SES explicit unsubscribe wins across duplicates, but the default opt-out does not fabricate unsubscribe", () => {
  assert.equal(reconcile(data()).stats.suppressed, 0);
  for (const optout of [{ UnsubscribeAll: true }, { TopicPreferences: [{ TopicName: "weekly-research", SubscriptionStatus: "OPT_OUT" }] }]) {
    const d = data(); d.contacts.push({ EmailAddress: address.toUpperCase(), ...optout }); assert.equal(reconcile(d).stats.suppressed, 1);
  }
});
test("hash-only historical suppression, suppression audits and account complaint all dominate later opt-in", () => {
  assert.equal(reconcile(data(), [{ id, email: null, reasons: ["unsubscribe"] }]).stats.suppressed, 1);
  const d = data(); d.ledger.push(row(`AUDIT#${id}#suppress#event`, { kind: "suppressed", reason: "hard-bounce", at: 3000 }));
  assert.equal(reconcile(d).stats.hardBounces, 1);
  d.accountChecks = [{ email: address, suppressed: true, reason: "COMPLAINT" }]; assert.equal(reconcile(d).stats.complaints, 1);
});
test("mismatched email hashes cannot hide a negative record or create a sendable record", () => {
  const d = data(), otherId = sha("second@example.test");
  d.ledger.push(row(`SUB#${otherId}`, { email: address, state: "SUPPRESSED" }));
  const result = reconcile(d); assert.equal(result.stats.suppressed, 2); assert.equal(result.stats.sendable, 0);
});
test("legacy provenance preserves original opt-outs even when the visible legacy state is HOLD", () => {
  const d = data(), migration = row(`MIGRATION#synthetic-batch#${id}`, { state: "HOLD" });
  migration.sources = { L: [{ M: { sourceId: { S: "synthetic-source" }, originalActive: { BOOL: false } } }] };
  d.ledger.push(migration); const result = reconcile(d);
  assert.equal(result.stats.suppressed, 1); assert.ok(result.records[0].consentEvidence.some(e => e.kind === "legacy-provenance"));
});
test("pending, missing and unpaired consent evidence stay on hold", () => {
  const d = data(); d.ledger[0].state.S = "PENDING";
  assert.equal(reconcile(d).stats.pending, 1); assert.equal(reconcile(d).stats.consentReviewCandidates, 0);
  d.ledger[0].state.S = "CONFIRMED"; d.ledger[1].pk.S += "mismatch";
  assert.equal(reconcile(d).stats.consentReviewCandidates, 0);
});
test("encrypted recovery review preserves old evidence and suppression without active imports, controls or replay nonces", async () => {
  const old = await collect(source(), scope(config), [], () => time);
  old.stickySuppressions = [{ id, email: address, reasons: ["complaint"] }];
  const latest = await collect(source(), scope(config), [], () => time); latest.data.ledger = latest.data.ledger.slice(0, 1);
  const bundle = recoveryBundle([old, latest], scope(config));
  assert.equal(bundle.stats.suppressed, 1); assert.equal(bundle.records[0].consentEvidence.length, 2); assert.equal(bundle.stats.sendable, 0);
  assert.equal(JSON.stringify(bundle).includes("synthetic-nonce"), false); assert.equal(bundle.activationAuthorized, false);
  assert.throws(() => recoveryBundle([{ ...latest, scope: {} }], scope(config)), /scope/);
});
test("statistics reject untrusted extra fields instead of printing decrypted arbitrary content", () => {
  const stats = reconcile(data()).stats; assert.deepEqual(validateStats(stats), stats);
  assert.throws(() => validateStats({ ...stats, privateData: address }), /invalid_snapshot/);
});
test("automatic synchronization is opt-in, non-overlapping, completion-relative and pauses on error", async () => {
  const timers = [], announcements = []; let release, fail = false;
  const session = new SyncSession({ sync: () => fail ? Promise.reject(new Error("sensitive-data")) : new Promise(resolve => { release = resolve; }), announce: s => announcements.push(s), set: fn => { timers.push(fn); return timers.length; }, clear() {} });
  assert.equal(session.active, false); session.enable(); assert.equal(timers.length, 1);
  const inFlight = session.refresh(); assert.throws(() => session.refresh(), /busy/);
  release(); await inFlight; assert.equal(timers.length, 2);
  fail = true; await assert.rejects(session.refresh(), /sync_failed/); assert.equal(session.active, false);
  assert.equal(announcements.some(s => s.includes("sensitive")), false); await session.stop(); assert.throws(() => session.refresh(), /stopped/);
});
test("closing aborts and drains an in-flight refresh before key disposal can occur", async () => {
  let drained = false;
  const session = new SyncSession({ sync: signal => new Promise((resolve, reject) => { signal.addEventListener("abort", () => { drained = true; reject(new Error("cancelled")); }); }) });
  const pending = session.refresh(); const rejection = assert.rejects(pending, /sync_failed/);
  await session.stop(); await rejection; assert.equal(drained, true); assert.equal(session.busy, false);
});
test("a queued automatic callback cannot read after pause", async () => {
  let callback, calls = 0;
  const session = new SyncSession({ sync: async () => { calls++; }, set: fn => { callback = fn; return 1; }, clear() {} });
  session.enable(); session.pause(); callback(); await Promise.resolve(); assert.equal(calls, 0); await session.stop();
});
