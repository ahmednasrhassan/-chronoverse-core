import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture.mjs";
import { campaignEligible, ENROLLMENT_POLICY, CONSENT_TEXT, CONSENT_VERSION, subscriberId } from "../src/domain.mjs";

function historical(f, email = "historical@example.test", state = "CONFIRMED") {
  const job = f.confirmed(email), row = f.state.documents.get(`SUB#${job.id}`);
  for (const name of ["enrollmentPolicy", "confirmedPolicy", "awsConsentVersion", "awsConsentText", "awsRequestedAt", "confirmedRequestNonce"]) delete row[name];
  Object.assign(row, { state, consentVersion: "historical-consent", consentText: "Original evidence", sources: ["original-import"], customEvidence: { preserved: true } });
  return { job, row };
}
function pendingToken(f, id) {
  const request = f.state.documents.get(`RENEW#${id}`) || f.state.documents.get(`SUB#${id}`);
  return f.token(id, "confirm", request.confirmationNonce, f.state.time + 60000);
}

test("15 synthetic historical subscribers remain excluded even with CONFIRMED state, audience index and SES opt-in", async () => {
  const f = fixture(), jobs = [];
  for (let i = 0; i < 15; i++) jobs.push(historical(f, `old-${i}@example.test`).job);
  const before = structuredClone([...f.state.documents]);
  for (const job of jobs) { assert.equal(campaignEligible(f.state.documents.get(`SUB#${job.id}`)), false); await f.service.deliver(job); await f.service.sync(job.id); }
  for (let shard = 0; shard < 16; shard++) await f.service.plan({ campaign: jobs[0].campaign, shard });
  assert.equal(f.state.jobs.filter(job => job.type === "digest").length, 0);
  assert.equal(f.state.sends.length, 0); assert.deepEqual([...f.state.documents], before);
});
for (const state of ["HOLD", "CONFIRMED", "PENDING"]) test(`fresh request preserves historical ${state} consent; only mailbox confirmation grants campaign eligibility`, async () => {
  const f = fixture(), { row, job } = historical(f, "returning@example.test", state), original = structuredClone(row);
  delete f.keys.legacyV1Key;
  assert.equal((await f.subscribe(row.email)).statusCode, 202);
  assert.deepEqual(f.state.documents.get(row.pk), original); assert.equal(f.state.sends.length, 1);
  const renewal = f.state.documents.get(`RENEW#${job.id}`);
  assert.equal(renewal.enrollmentPolicy, ENROLLMENT_POLICY); assert.equal(renewal.consentText, CONSENT_TEXT);
  const token = pendingToken(f, job.id);
  assert.equal((await f.api("/confirm", { token })).statusCode, 200);
  assert.equal(campaignEligible(row), true); assert.equal(row.consentVersion, original.consentVersion);
  assert.deepEqual(row.sources, original.sources); assert.deepEqual(row.customEvidence, original.customEvidence);
  assert.equal(row.consentText, original.consentText); assert.equal(row.unsubscribeNonce, original.unsubscribeNonce);
  assert.equal(row.awsConsentVersion, CONSENT_VERSION); assert.equal(renewal.state, "CONFIRMED");
  const confirmed = structuredClone([...f.state.documents]);
  assert.equal((await f.api("/confirm", { token })).statusCode, 400); assert.deepEqual([...f.state.documents], confirmed);
  // Renewing now never enrolls this address in an already frozen historical issue.
  await f.service.deliver(job); assert.equal(f.state.sends.length, 1);
  assert.equal((await f.api("/unsubscribe", { token: f.token(job.id, "unsubscribe", row.unsubscribeNonce) })).statusCode, 200);
  assert.equal(campaignEligible(f.state.documents.get(row.pk)), false);
});

test("pre-policy pending capability cannot renew consent and does not modify historical data", async () => {
  const f = fixture(), { row, job } = historical(f, "old-pending@example.test", "PENDING"), before = structuredClone(row);
  assert.equal((await f.api("/confirm", { token: f.token(job.id, "confirm", row.confirmationNonce, f.state.time + 60000) })).statusCode, 400);
  assert.deepEqual(row, before); assert.equal(f.state.sends.length, 0);
});
for (const marker of ["state", "suppressedAt", "suppressionReason", "provider", "contact"]) test(`suppression ${marker} prevents fresh opt-in without clearing original evidence`, async () => {
  const f = fixture(), { row, job } = historical(f);
  if (marker === "state") row.state = "SUPPRESSED";
  else if (marker === "suppressedAt") row.suppressedAt = 0;
  else if (marker === "suppressionReason") row.suppressionReason = "unsubscribe";
  else if (marker === "provider") f.state.suppressed.add(row.email);
  else f.state.contacts.set(row.email, { UnsubscribeAll: true });
  const evidence = row.consentText;
  assert.equal((await f.subscribe(row.email)).statusCode, 202); assert.equal(f.state.sends.length, 0);
  assert.equal(f.state.documents.has(`RENEW#${job.id}`), false);
  const saved = f.state.documents.get(row.pk); assert.equal(saved.consentText, evidence); assert.equal(campaignEligible(saved), false);
});
test("suppression arriving between renewal request and confirmation wins", async () => {
  const f = fixture(), { row, job } = historical(f);
  await f.subscribe(row.email); const token = pendingToken(f, job.id);
  await f.deps.store.suppress(job.id, row.email, "complaint", "synthetic", f.state.time);
  const before = structuredClone([...f.state.documents]);
  assert.equal((await f.api("/confirm", { token })).statusCode, 400); assert.deepEqual([...f.state.documents], before);
});
test("revoking fresh consent proof after claiming delivery stops the final handoff", async () => {
  const f = fixture(), job = f.confirmed();
  f.state.beforeSend = () => { delete f.state.documents.get(`SUB#${job.id}`).confirmedPolicy; };
  await f.service.deliver(job); assert.equal(f.state.sends.length, 0);
});
test("fresh AWS signup, confirmation and secure unsubscribe work without a legacy signing key", async () => {
  const f = fixture(); delete f.keys.legacyV1Key; delete f.keys.websiteKey;
  const email = "fresh@example.test", id = subscriberId(email);
  const event = { version: "2.0", routeKey: "POST /register", rawPath: "/register", requestContext: { http: { method: "POST", sourceIp: "192.0.2.12" } }, headers: { origin: f.env.PUBLIC_ORIGIN, "content-type": "application/x-www-form-urlencoded" }, body: `email=${encodeURIComponent(email)}&consent=yes` };
  assert.equal((await f.service.api(event)).statusCode, 202); assert.equal(f.state.sends.length, 1);
  assert.match(f.state.sends[0].message.text, /execute-api.*\/confirm\?token=v2\./);
  const token = pendingToken(f, id);
  const confirm = { ...event, rawPath: "/confirm", rawQueryString: `token=${token}`, body: "action=confirm" };
  assert.equal((await f.service.api(confirm)).statusCode, 200);
  const row = f.state.documents.get(`SUB#${id}`); assert.equal(campaignEligible(row), true);
  const unsubscribe = { ...event, rawPath: "/unsubscribe", rawQueryString: `token=${f.token(id, "unsubscribe", row.unsubscribeNonce)}`, body: "action=unsubscribe" };
  assert.equal((await f.service.api({ ...unsubscribe, requestContext: { http: { method: "GET" } } })).statusCode, 200);
  assert.equal(row.state, "CONFIRMED");
  assert.equal((await f.service.api(unsubscribe)).statusCode, 200);
  assert.equal(f.state.documents.get(row.pk).state, "SUPPRESSED"); assert.equal(f.state.sends.length, 1);
});
test("unrecoverable historical links expose honest manual support without touching any subscriber", async () => {
  const f = fixture(), { row } = historical(f); delete f.keys.legacyV1Key;
  const before = structuredClone([...f.state.documents]);
  const result = await f.service.api({ rawPath: "/unsubscribe", rawQueryString: `token=v1.${"a".repeat(80)}`, requestContext: { http: { method: "POST" } }, headers: { "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" });
  assert.equal(result.statusCode, 410); assert.match(result.body, /cannot decrypt/); assert.match(result.body, /mailto:info@chronoversecapital.com/);
  assert.deepEqual([...f.state.documents], before); assert.equal(row.state, "CONFIRMED");
});
