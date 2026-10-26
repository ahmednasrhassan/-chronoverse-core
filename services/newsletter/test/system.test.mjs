import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fixture } from "./fixture.mjs";
import { capability, readCapability, subscriberId, weeklyWindow, TOPIC } from "../src/domain.mjs";
import { parseArticles, fetchArticles, digestMessage, MAX_FEED_BYTES } from "../src/rss.mjs";
import { prepareMigration } from "../src/migration.mjs";
import { createHandlers } from "../src/handlers.mjs";
import { createService } from "../src/service.mjs";

for (const gate of ["DELIVERY_ENABLED", "LEGACY_DISPATCH_RETIRED", "COMPLIANCE_APPROVED"]) test(`missing ${gate} blocks scheduled and direct dispatch`, async () => {
  const f = fixture(); const job = f.confirmed(); delete f.env[gate];
  await assert.rejects(() => f.service.deliver(job), /sending_paused/);
  await assert.rejects(() => f.service.plan({ kind: "weekly" }), /sending_paused/);
  assert.equal(f.state.sends.length, 0);
});
for (const gate of ["registrationEnabled", "legacyRetired", "complianceApproved"]) test(`control ${gate} cannot be bypassed by enabled environment`, async () => {
  const f = fixture(); f.state.documents.get("CONTROL")[gate] = false;
  assert.equal((await f.subscribe("reader@example.test")).statusCode, 503); assert.equal(f.state.sends.length, 0);
});
test("confirmation sending remains disabled independently; missing control blocks", async () => {
  const f = fixture(); delete f.env.CONFIRMATION_ENABLED;
  assert.equal((await f.subscribe("reader@example.test")).statusCode, 503);
  f.env.CONFIRMATION_ENABLED = "true"; f.state.documents.delete("CONTROL");
  assert.equal((await f.subscribe("reader@example.test")).statusCode, 503); assert.equal(f.state.sends.length, 0);
});
test("bridge authentication, methods and explicit consent are required", async () => {
  const f = fixture();
  assert.equal((await f.api("/subscribe", {}, { headers: { "x-newsletter-bridge": "wrong" } })).statusCode, 401);
  assert.equal((await f.api("/subscribe", {}, { requestContext: { http: { method: "GET" } } })).statusCode, 405);
  assert.equal((await f.api("/subscribe", { email: "reader@example.test" })).statusCode, 400);
  assert.equal((await f.api("/subscribe", {}, { body: "{" })).statusCode, 400);
  assert.equal((await f.api("/subscribe", {}, { body: "x".repeat(4097) })).statusCode, 400);
  assert.equal(f.state.sends.length, 0);
});
test("request only creates pending consent; repeated requests are limited and no SES contact is activated", async () => {
  const f = fixture(); const email = "reader@example.test";
  assert.equal((await f.subscribe(email)).statusCode, 202);
  assert.equal((await f.subscribe(email)).statusCode, 202);
  const row = f.state.documents.get(`SUB#${subscriberId(email)}`);
  assert.equal(row.state, "PENDING"); assert.equal(row.audienceKey, undefined); assert.match(row.consentText, /unsubscribe at any time/);
  assert.equal(f.state.sends.length, 1); assert.equal(f.state.contacts.size, 0);
});
test("confirmation is signed, expires, purpose-bound, nonce-bound and single-use", async () => {
  const f = fixture(); await f.subscribe("reader@example.test");
  const id = subscriberId("reader@example.test"), row = f.state.documents.get(`SUB#${id}`);
  const token = f.token(id, "confirm", row.confirmationNonce, f.state.time + 10000);
  for (const bad of [token + "x", f.token(id), f.token(id, "confirm", row.confirmationNonce, f.state.time - 1), f.token(id, "confirm", "z".repeat(32), f.state.time + 10000)]) assert.equal((await f.api("/confirm", { token: bad })).statusCode, 400);
  assert.equal((await f.api("/confirm", { token })).statusCode, 200);
  assert.equal((await f.api("/confirm", { token })).statusCode, 400);
  assert.equal(f.state.documents.get(`SUB#${id}`).state, "CONFIRMED"); assert.equal(f.state.sends.length, 1);
});
test("suppression racing confirmation wins and cannot be cleared", async () => {
  const f = fixture(); await f.subscribe("reader@example.test"); const id = subscriberId("reader@example.test"); const row = f.state.documents.get(`SUB#${id}`);
  const token = f.token(id, "confirm", row.confirmationNonce, f.state.time + 10000);
  await f.deps.store.suppress(id, row.email, "complaint", "fixture", f.state.time);
  assert.equal((await f.api("/confirm", { token })).statusCode, 400); await f.subscribe(row.email);
  assert.equal(f.state.documents.get(`SUB#${id}`).state, "SUPPRESSED"); assert.equal(f.state.sends.length, 1);
});
test("legacy held records and existing provider suppressions cannot be reactivated by signup", async () => {
  for (const mode of ["HOLD", "SUPPRESSED", "provider"]) {
    const f = fixture(); const email = "reader@example.test", id = subscriberId(email);
    if (mode === "provider") f.state.suppressed.add(email);
    else f.state.documents.set(`SUB#${id}`, { pk: `SUB#${id}`, id, email, state: mode });
    assert.equal((await f.subscribe(email)).statusCode, 202); assert.equal(f.state.sends.length, 0);
    assert.equal(f.state.documents.get(`SUB#${id}`).state, mode === "HOLD" ? "HOLD" : "SUPPRESSED");
  }
});
test("unsubscribe works while every mail gate is off; repeated opt-out preserves first suppression", async () => {
  const f = fixture(), job = f.confirmed(); const token = f.token(job.id);
  for (const name of ["DELIVERY_ENABLED", "REGISTRATION_ENABLED", "CONFIRMATION_ENABLED", "COMPLIANCE_APPROVED"]) delete f.env[name];
  f.state.documents.delete("CONTROL");
  assert.equal((await f.api("/unsubscribe", { token })).statusCode, 200);
  const before = structuredClone(f.state.documents.get(`SUB#${job.id}`)); f.state.time += 2000;
  assert.equal((await f.api("/unsubscribe", { token })).statusCode, 200);
  assert.deepEqual(f.state.documents.get(`SUB#${job.id}`), before); assert.equal(before.audienceKey, undefined); assert.equal(f.state.sends.length, 0);
});
test("lost unsubscribe acknowledgement reports uncertainty and a retry preserves suppression", async () => {
  const f = fixture(), job = f.confirmed(); const token = f.token(job.id);
  const original = f.deps.store.suppress;
  f.deps.store.suppress = async (...args) => { await original(...args); throw new Error("synthetic_lost_ack"); };
  assert.equal((await f.api("/unsubscribe", { token })).statusCode, 503);
  const saved = structuredClone(f.state.documents.get(`SUB#${job.id}`)); assert.equal(saved.state, "SUPPRESSED");
  f.deps.store.suppress = original;
  assert.equal((await f.api("/unsubscribe", { token })).statusCode, 200);
  assert.deepEqual(f.state.documents.get(`SUB#${job.id}`), saved); assert.equal(f.state.sends.length, 0);
});
test("v1 encrypted opt-out decrypts only with original key; no guessed or replacement key fallback", async () => {
  const f = fixture(); const email = "historical@example.test";
  const iv = Buffer.alloc(12, 5), cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(f.keys.legacyV1Key).digest(), iv);
  cipher.setAAD(Buffer.from("chronoverse-newsletter-optout-v1"));
  const encrypted = Buffer.concat([cipher.update(email), cipher.final()]);
  const token = "v1." + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
  const key = f.keys.legacyV1Key; delete f.keys.legacyV1Key;
  assert.equal((await f.api("/unsubscribe", { token })).statusCode, 503); assert.equal(f.state.documents.has(`SUB#${subscriberId(email)}`), false);
  f.keys.legacyV1Key = key;
  assert.equal((await f.api("/unsubscribe", { token })).statusCode, 200);
  assert.equal(f.state.documents.get(`SUB#${subscriberId(email)}`).state, "SUPPRESSED"); assert.equal(f.state.sends.length, 0);
});
test("concurrent duplicate jobs and repeated delivery never resend an accepted recipient", async () => {
  const f = fixture(), job = f.confirmed();
  await Promise.all([f.service.deliver(job), f.service.deliver(job), f.service.deliver(job)]);
  await f.service.deliver(job); assert.equal(f.state.sends.length, 1);
  assert.equal(f.state.documents.get(`MAIL#${job.campaign}#${job.id}`).state, "ACCEPTED");
});
test("SES timeout and lost storage acknowledgement are held rather than resent", async () => {
  for (const mode of ["timeout", "lost-ack"]) {
    const f = fixture(), job = f.confirmed();
    if (mode === "timeout") f.state.sendError = new Error("synthetic_timeout"); else f.state.lostAck = true;
    await f.service.deliver(job); await f.service.deliver(job);
    assert.equal(f.state.sends.length, 1); assert.ok(["UNKNOWN", "CLAIMED"].includes(f.state.documents.get(`MAIL#${job.campaign}#${job.id}`).state));
  }
});
test("explicit throttling rejection retries at most three times", async () => {
  const f = fixture(), job = f.confirmed(); f.state.sendError = { name: "TooManyRequestsException", $metadata: { httpStatusCode: 429 } };
  for (let i = 0; i < 3; i++) await assert.rejects(() => f.service.deliver(job), /retryable_rejection/);
  await f.service.deliver(job); assert.equal(f.state.sends.length, 3); assert.equal(f.state.documents.get(`MAIL#${job.campaign}#${job.id}`).attempts, 3);
});
test("unsubscribe after claim and before SES handoff prevents dispatch", async () => {
  const f = fixture(), job = f.confirmed(); f.state.beforeSend = () => f.deps.store.suppress(job.id, "reader@example.test", "unsubscribe", "race", f.state.time);
  await f.service.deliver(job); assert.equal(f.state.sends.length, 0);
});
test("a damaged subscriber record cannot receive mail with an unusable unsubscribe capability", async () => {
  const f = fixture(), job = f.confirmed(); delete f.state.documents.get(`SUB#${job.id}`).unsubscribeNonce;
  await assert.rejects(() => f.service.deliver(job), /invalid_capability/); assert.equal(f.state.sends.length, 0);
});
test("SES preference opt-out, account suppression and missing contact all fail closed", async () => {
  for (const mode of ["topic", "account", "missing"]) {
    const f = fixture(), job = f.confirmed();
    if (mode === "topic") f.state.contacts.set("reader@example.test", { TopicPreferences: [{ TopicName: TOPIC, SubscriptionStatus: "OPT_OUT" }] });
    if (mode === "account") f.state.suppressed.add("reader@example.test");
    if (mode === "missing") f.state.contacts.clear();
    try { await f.service.deliver(job); } catch (e) { assert.equal(e.message, "contact_sync_pending"); }
    assert.equal(f.state.sends.length, 0);
  }
});
test("contact sync only creates absent confirmed contacts; it never clears provider opt-out", async () => {
  const f = fixture(), job = f.confirmed(); f.state.contacts.clear(); await f.service.sync(job.id);
  assert.equal(f.state.contacts.get("reader@example.test").TopicPreferences[0].SubscriptionStatus, "OPT_IN");
  f.state.contacts.set("reader@example.test", { UnsubscribeAll: true }); await f.service.sync(job.id); await f.service.sync(job.id);
  assert.equal(f.state.contacts.get("reader@example.test").UnsubscribeAll, true); assert.equal(f.state.documents.get(`SUB#${job.id}`).state, "SUPPRESSED");
});
test("bounce, complaint and SES unsubscribe events persist suppression; soft bounces do not", async () => {
  for (const type of ["Bounce", "Complaint", "Subscription", "Transient"]) {
    const f = fixture(), job = f.confirmed();
    const event = { eventType: type === "Transient" ? "Bounce" : type, mail: { destination: ["reader@example.test"] }, bounce: { bounceType: type === "Transient" ? "Transient" : "Permanent", bouncedRecipients: [{ emailAddress: "reader@example.test" }] }, complaint: { complainedRecipients: [{ emailAddress: "reader@example.test" }] }, subscription: { contactList: f.env.CONTACT_LIST, newTopicPreferences: { unsubscribeAll: true } } };
    const envelope = { Type: "Notification", TopicArn: f.env.FEEDBACK_TOPIC_ARN, MessageId: "fixture", Message: JSON.stringify(event) };
    await f.service.feedback(envelope); await f.service.feedback(envelope);
    assert.equal(f.state.documents.get(`SUB#${job.id}`).state, type === "Transient" ? "CONFIRMED" : "SUPPRESSED");
  }
});
test("forged topic, direct queue and stream invocations are rejected; partial failures request retry", async () => {
  const f = fixture(); await assert.rejects(() => f.service.feedback({ TopicArn: "wrong" }), /untrusted_feedback/);
  const handlers = createHandlers(f.service, f.env);
  await assert.rejects(() => handlers.worker({ Records: [{ eventSourceARN: "wrong", eventSource: "aws:sqs" }] }), /untrusted_queue/);
  await assert.rejects(() => handlers.contacts({ Records: [{ eventSourceARN: "wrong", eventSource: "aws:dynamodb" }] }), /untrusted_stream/);
  const result = await handlers.worker({ Records: [{ eventSourceARN: "digest", eventSource: "aws:sqs", messageId: "fixture", body: "not-json" }] });
  assert.deepEqual(result.batchItemFailures, [{ itemIdentifier: "fixture" }]); assert.ok(f.state.metrics.includes("QueueProcessingFailure"));
});
test("weekly window is deterministic across retries; frozen campaign is not replaced", async () => {
  const f = fixture(); const first = weeklyWindow(f.state.time), second = weeklyWindow(f.state.time + 86400000);
  assert.deepEqual(first, second); const job = f.confirmed();
  const before = structuredClone(f.state.documents.get(`CAMPAIGN#${job.campaign}`));
  await f.service.plan({ kind: "weekly" }); assert.deepEqual(f.state.documents.get(`CAMPAIGN#${job.campaign}`), before);
});
test("planner paginates all shards and delivery excludes post-window joins and stale campaigns", async () => {
  const f = fixture(), job = f.confirmed(); await f.service.plan({ kind: "weekly" });
  const digestJobs = [];
  while (f.state.jobs.length) {
    const queued = f.state.jobs.shift();
    if (queued.type === "plan") await f.service.plan(queued);
    else digestJobs.push(queued);
  }
  assert.equal(f.state.metrics.filter(x => x === "PlannedPage").length, 16);
  assert.equal(digestJobs.length, 1); assert.equal(digestJobs[0].id, job.id);
  f.state.documents.get(`SUB#${job.id}`).confirmedAt = f.state.time;
  await f.service.deliver(job); assert.equal(f.state.sends.length, 0);
  f.state.documents.get(`SUB#${job.id}`).confirmedAt = f.state.time - 7200000; f.state.time += 4 * 86400000;
  await f.service.deliver(job); assert.equal(f.state.sends.length, 0);
});
test("empty or unavailable RSS cannot create mail jobs; incomplete migration blocks direct workers", async () => {
  const f = fixture(); const empty = createService({ ...f.deps, articles: async () => [] }, f.env);
  await empty.plan({ kind: "weekly" }); assert.equal(f.state.jobs.length, 0);
  assert.equal([...f.state.documents.keys()].filter(x => x.startsWith("CAMPAIGN#")).length, 0);
  const broken = createService({ ...f.deps, articles: async () => { throw new Error("synthetic-outage"); } }, f.env);
  await assert.rejects(() => broken.plan({ kind: "weekly" })); assert.equal(f.state.jobs.length, 0);
  const job = f.confirmed(); f.state.documents.get("CONTROL").migrationComplete = false;
  await assert.rejects(() => f.service.deliver(job), /sending_paused/); assert.equal(f.state.sends.length, 0);
});
test("RSS retains the complete eligible archive, deduplicates and rejects unsafe feeds", () => {
  const window = weeklyWindow(Date.parse("2026-10-26T10:00:00Z"));
  const item = (link, title = "Research", date = "Sun, 25 Oct 2026 12:00:00 GMT") => `<item><guid>${link}</guid><title>${title}</title><link>${link}</link><description><![CDATA[<p>Summary</p>]]></description><pubDate>${date}</pubDate></item>`;
  const wrap = items => `<rss version="2.0"><channel><title>Chronoverse Capital</title><link>https://chronoversecapital.com/</link><description>Research</description>${items}</channel></rss>`;
  const xml = wrap(`${Array.from({ length: 12 }, (_, i) => item(`https://chronoversecapital.com/article-${i}`)).join("")}${item("https://chronoversecapital.com/article-1")}${item("https://chronoversecapital.com/future", "Future", "Tue, 27 Oct 2026 12:00:00 GMT")}`);
  const selected = parseArticles(xml, window.end); assert.equal(selected.length, 12); assert.equal(new Set(selected.map(x => x.url)).size, 12);
  assert.ok(selected.every(x => !x.summary.includes("<"))); assert.throws(() => parseArticles("<!DOCTYPE rss><rss/>", window.end));
  assert.throws(() => parseArticles(wrap(item("https://evil.example/article")), window.end));
  assert.throws(() => parseArticles("x".repeat(MAX_FEED_BYTES + 1), window.end));
  const message = digestMessage([{ title: "<script>", url: "https://chronoversecapital.com/safe", summary: "<img>" }], "Fixture", "https://chronoversecapital.com/api/newsletter/unsubscribe?token=fixture");
  assert.doesNotMatch(message.html, /<script>|<img>/); assert.match(message.html, /amazonSESUnsubscribeUrl/);
});
test("RSS fetch refuses redirects, network errors and oversized streaming responses", async () => {
  const window = weeklyWindow(Date.now());
  await assert.rejects(() => fetchArticles(window, async (_url, options) => { assert.equal(options.redirect, "error"); throw new Error("synthetic_feed_outage"); }));
  await assert.rejects(() => fetchArticles(window, async () => new Response("x".repeat(MAX_FEED_BYTES + 1), { headers: { "content-type": "application/rss+xml" } })), /invalid_feed/);
});
test("migration deduplicates, preserves evidence, keeps opt-outs dominant and all other legacy records held", () => {
  const email = "reader@example.test";
  const plan = prepareMigration([{ sourceId: "old-a", email, active: true, consentEvidence: { at: "fixture-time" } }, { sourceId: "old-b", email: email.toUpperCase(), active: false }, { sourceId: "hash-only", emailHash: subscriberId(email), type: "newsletterSuppression" }, { sourceId: "active-other", email: "other@example.test", active: true }], "synthetic-batch");
  assert.equal(plan.uniqueCount, 2); assert.equal(plan.suppressedCount, 1); assert.equal(plan.holdCount, 1);
  const row = plan.items.find(x => x.id === subscriberId(email)); assert.equal(row.sources.length, 3); assert.equal(row.state, "SUPPRESSED"); assert.equal(row.audienceKey, undefined);
  assert.throws(() => prepareMigration([{ sourceId: "bad", email, emailHash: "0".repeat(64) }], "fixture"), /hash_mismatch/);
});
test("tokens do not contain addresses and do not accept different purposes or keys", () => {
  const f = fixture(), id = subscriberId("reader@example.test"); const token = capability(f.keys.capabilityKey, "confirm", id, "x".repeat(32), f.state.time + 1000);
  assert.doesNotMatch(token, /reader|example/); assert.throws(() => readCapability(f.keys.capabilityKey, token, "unsubscribe", f.state.time));
  assert.throws(() => readCapability("different-synthetic-key".repeat(3), token, "confirm", f.state.time));
});
test("infrastructure defaults have no sending permission, enabled scheduler, delete permission or public database", () => {
  const template = JSON.parse(readFileSync(new URL("../template.json", import.meta.url), "utf8"));
  for (const name of ["DeliveryEnabled", "RegistrationEnabled", "ConfirmationEnabled", "LegacyDispatchRetired", "ComplianceApproved"]) assert.equal(template.Parameters[name].Default, "false");
  assert.deepEqual(template.Resources.WeeklySchedule.Properties.State, { "Fn::If": ["DigestMaySend", "ENABLED", "DISABLED"] });
  assert.equal(template.Resources.Contacts.Properties.Topics[0].DefaultSubscriptionStatus, "OPT_OUT");
  assert.equal(template.Resources.Ledger.Properties.DeletionProtectionEnabled, true);
  assert.doesNotMatch(JSON.stringify(template), /ses:SendRawEmail|ses:Delete|dynamodb:DeleteItem|dynamodb:TransactWriteItems|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY/);
});
