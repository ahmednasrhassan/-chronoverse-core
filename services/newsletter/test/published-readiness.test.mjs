import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fixture } from "./fixture.mjs";
import { createService } from "../src/service.mjs";
import { createContentSource } from "../src/content.mjs";
import { discoverPublications } from "../src/sanity-discovery.mjs";
import { PUBLICATION_STATE } from "../src/publication.mjs";
import { hash, weeklyWindow, subscriberId } from "../src/domain.mjs";

// Public published-only projection, fetched twice without credentials. This is
// content evidence, never a subscriber/production-state fixture.
const raw = readFileSync(new URL("./fixtures/published-readiness-2026-10-28.json", import.meta.url), "utf8");
const snapshot = JSON.parse(raw);
const nextBoundary = Date.parse("2026-11-02T09:00:00Z");
async function isolated(time = nextBoundary + 600000) {
  const f = fixture(); f.state.time = time;
  const reader = f.confirmed(); f.state.documents.delete("CAMPAIGN#2026-10-26");
  const rows = f.state.documents, copy = value => value === undefined ? undefined : structuredClone(value);
  const control = rows.get("CONTROL");
  Object.assign(control, { contentStartAt: Date.parse(snapshot.cutover), sanityPublishedStateApproved: true });
  Object.assign(f.env, { AWS_REGION: "eu-north-1", SANITY_PROJECT_ID: snapshot.config.project, SANITY_DATASET: snapshot.config.dataset,
    ARTICLE_ORIGIN: snapshot.config.origin, CONTENT_BUCKET: "synthetic-content", CONTENT_MANIFEST_KEY: "manifest.json" });
  let object;
  Object.assign(f.deps.store, {
    begin: async (owner, at) => { const h = { ...(rows.get(PUBLICATION_STATE) || { sequence: 0 }), owner, status: "CHECKING", leaseUntil: at + 180000 }; rows.set(PUBLICATION_STATE, h); return copy(h); },
    owned: async owner => assert.equal(rows.get(PUBLICATION_STATE).owner, owner),
    observe: async (row, version) => { assert.equal(rows.get(row.pk)?.version, version); rows.set(row.pk, copy(row)); },
    initDiscovery: async (start, at) => { if (!rows.has("DISCOVERY")) rows.set("DISCOVERY", { start, createdAt: at }); },
    finish: async (owner, observation) => { assert.equal(rows.get(PUBLICATION_STATE).owner, owner); rows.set(PUBLICATION_STATE, { ...observation, status: "READY", leaseUntil: 0 }); },
    fail: async () => { rows.get(PUBLICATION_STATE).status = "FAILED"; },
    acceptContentManifest: async observation => {
      const old = rows.get("CONTENT#STATE");
      if (old && (old.sequence > observation.sequence || old.sequence === observation.sequence && old.sha256 !== observation.sha256)) return false;
      rows.set("CONTENT#STATE", copy(observation)); return true;
    },
  });
  const objectStore = { versioning: async () => {}, read: async () => copy(object),
    write: async (text, etag) => { assert.equal(etag, object?.etag); object = { raw: text, etag: "synthetic-etag", versionId: "synthetic-v1" }; return { versionId: object.versionId }; } };
  const discovery = await discoverPublications({ store: f.deps.store, object: objectStore, now: f.deps.now,
    query: async () => copy(snapshot.documents) }, f.env);
  f.deps.articles = createContentSource(f.env, f.deps.store, {}, f.deps.now, async () => copy(object));
  f.service = createService(f.deps, f.env);
  return { ...f, reader, discovery };
}
async function planAll(f) {
  await f.service.plan({ kind: "weekly" });
  for (let index = 0; index < f.state.jobs.length; index++) {
    if (f.state.jobs[index].type === "plan") await f.service.plan(f.state.jobs[index]);
  }
  return f.state.jobs.filter(job => job.type === "digest");
}
test("public source snapshot identity is pinned and contains only published post projections", () => {
  assert.equal(hash(raw), "8ef3a5ee25ceb39bc25d1817312a981b031fbeda70e571e57717b05febb15e24");
  assert.equal(snapshot.documents.length, 1);
  for (const doc of snapshot.documents) {
    assert.equal(doc._type, "post"); assert.doesNotMatch(doc._id, /^(drafts|versions)\./);
    assert.ok(Date.parse(doc.publishedAt) >= Date.parse(snapshot.cutover));
    assert.ok(Date.parse(doc._updatedAt) <= Date.parse(snapshot.capturedAt));
  }
});
test("actual published revision flows through discovery, selection, rendering and one immutable weekly send claim", async () => {
  const f = await isolated(); assert.equal(f.discovery.articles, 1);
  const jobs = await planAll(f); assert.equal(jobs.length, 1);
  assert.equal(jobs[0].campaign, "2026-11-02");
  const campaign = f.state.documents.get("CAMPAIGN#2026-11-02");
  assert.equal(campaign.articles[0].provenance.revision, snapshot.documents[0]._rev);
  await f.service.deliver(jobs[0]); await f.service.deliver(jobs[0]);
  assert.equal(f.state.sends.length, 1);
  const message = f.state.sends[0].message;
  assert.ok(message.text.includes(snapshot.documents[0].title));
  assert.ok(message.html.includes(`${snapshot.config.origin}/${snapshot.documents[0].slug}`));
  assert.ok(message.text.includes("Unsubscribe permanently"));
  assert.ok(message.html.includes("{{amazonSESUnsubscribeUrl}}"));
  assert.equal(f.state.documents.get(`MAIL#2026-11-02#${f.reader.id}`).state, "ACCEPTED");
  const frozen = structuredClone(campaign);
  await f.service.plan({ kind: "weekly" });
  assert.deepEqual(f.state.documents.get(campaign.pk), frozen);
});
test("Monday boundary excludes future content and consent completed after a closed issue", async () => {
  assert.equal(weeklyWindow(nextBoundary - 1).id, "2026-10-26");
  assert.equal(weeklyWindow(nextBoundary).id, "2026-11-02");
  const before = await isolated(nextBoundary - 1);
  assert.equal((await planAll(before)).length, 0); assert.equal(before.state.sends.length, 0);
  const after = await isolated();
  after.state.documents.get(`SUB#${after.reader.id}`).confirmedAt = nextBoundary + 1;
  assert.equal((await planAll(after)).length, 0);
});
test("suppression after planning blocks delivery; sync opts out and repeat unsubscribe preserves state", async () => {
  const f = await isolated(), jobs = await planAll(f), token = f.token(f.reader.id);
  const other = f.confirmed("historical-isolation@example.test");
  const historical = structuredClone(f.state.documents.get(`SUB#${other.id}`));
  const call = body => f.service.api({ rawPath: "/unsubscribe", rawQueryString: `token=${token}`,
    requestContext: { http: { method: "POST" } }, headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  assert.equal((await call("action=unsubscribe")).statusCode, 200);
  const suppressed = structuredClone(f.state.documents.get(`SUB#${f.reader.id}`));
  assert.equal((await call("List-Unsubscribe=One-Click")).statusCode, 200);
  assert.deepEqual(f.state.documents.get(`SUB#${f.reader.id}`), suppressed);
  await f.service.deliver(jobs[0]); await f.service.sync(f.reader.id);
  assert.equal(f.state.sends.length, 0); assert.equal(suppressed.state, "SUPPRESSED"); assert.equal(suppressed.audienceKey, undefined);
  assert.equal(f.state.contacts.get(suppressed.email).UnsubscribeAll, true);
  assert.deepEqual(f.state.documents.get(`SUB#${other.id}`), historical);
});
for (const type of ["Bounce", "Complaint"]) test(`isolated ${type} feedback blocks the queued published-content delivery and deduplicates`, async () => {
  const f = await isolated(), jobs = await planAll(f), email = "reader@example.test";
  const message = { eventType: type, mail: { destination: [email] },
    bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: email }] }, complaint: { complainedRecipients: [{ emailAddress: email }] } };
  const envelope = { Type: "Notification", TopicArn: f.env.FEEDBACK_TOPIC_ARN, MessageId: `synthetic-${type}`, Message: JSON.stringify(message) };
  await f.service.feedback(envelope);
  const before = structuredClone(f.state.documents);
  await f.service.feedback(envelope); assert.deepEqual(f.state.documents, before);
  await f.service.sync(subscriberId(email)); await f.service.deliver(jobs[0]);
  assert.equal(f.state.sends.length, 0); assert.equal(f.state.documents.get(`SUB#${subscriberId(email)}`).state, "SUPPRESSED");
  assert.equal(f.state.contacts.get(email).UnsubscribeAll, true);
});
test("confirmation renders one postal address per MIME alternative", async () => {
  const f = fixture(); await f.subscribe("postal@example.test");
  assert.equal(f.state.sends.length, 1);
  for (const format of ["text", "html"]) assert.equal(f.state.sends[0].message[format].split(f.env.POSTAL_ADDRESS).length - 1, 1);
});
test("native unsubscribe review/cancel stays read-only and retains an origin for deliberate POST with gates closed", async () => {
  const f = fixture(), job = f.confirmed(), token = f.token(job.id);
  Object.assign(f.state.documents.get("CONTROL"), { registrationEnabled: false, confirmationEnabled: false, deliveryEnabled: false });
  const before = structuredClone(f.state.documents);
  const review = await f.service.api({ rawPath: "/unsubscribe", rawQueryString: `token=${token}`, requestContext: { http: { method: "GET" } } });
  assert.equal(review.statusCode, 200); assert.deepEqual(f.state.documents, before);
  assert.equal(review.headers["referrer-policy"], "strict-origin");
  assert.ok(!review.body.includes(token)); assert.ok(!review.body.includes("reader@example.test"));
  // Leaving the review page is cancellation: no subscriber or claim write.
  assert.equal(f.state.sends.length, 0);
  const post = await f.service.api({ rawPath: "/unsubscribe", rawQueryString: `token=${token}`, requestContext: { http: { method: "POST" } },
    headers: { origin: f.env.PUBLIC_ORIGIN, "content-type": "application/x-www-form-urlencoded" }, body: "action=unsubscribe" });
  assert.equal(post.statusCode, 200); assert.equal(f.state.documents.get(`SUB#${job.id}`).state, "SUPPRESSED");
  assert.equal(f.state.sends.length, 0);
});
