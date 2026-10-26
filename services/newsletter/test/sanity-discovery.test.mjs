import test from "node:test";
import assert from "node:assert/strict";
import { discoverPublications, queryPublications, publicationArticle, discoveryConfig, LOOKBACK_MS } from "../src/sanity-discovery.mjs";
import { PUBLICATION_POLICY, PUBLICATION_STATE, publicationKey } from "../src/publication.mjs";
import { parseContentManifest } from "../src/content.mjs";
import { weeklyWindow } from "../src/domain.mjs";
import { articleKey } from "../src/discovery.mjs";
import legacySnapshot from "../src/legacy-publication-exclusions.json" with { type: "json" };
import { legacyExclusionIds, legacyPublicationExcluded, verifyLegacySnapshot, LEGACY_SNAPSHOT_SHA256 } from "../src/legacy-exclusions.mjs";
import { hash } from "../src/domain.mjs";

const initial = Date.parse("2026-10-26T09:00:30.000Z"), cutover = Date.parse("2026-10-19T09:00:00.000Z");
const env = { AWS_REGION: "eu-north-1", SANITY_PROJECT_ID: "xfs4j01p", SANITY_DATASET: "production", ARTICLE_ORIGIN: "https://reference.example.test",
  DELIVERY_ENABLED: "true", LEGACY_DISPATCH_RETIRED: "true", COMPLIANCE_APPROVED: "true" };
function document(id = "synthetic-a") {
  return { _id: id, _type: "post", _rev: "synthetic-v1", _createdAt: "2026-10-25T08:00:00Z", _updatedAt: "2026-10-25T08:30:00Z",
    slug: id, title: "Synthetic published research", publishedAt: "2026-10-25T08:30:00Z", seoDescription: null, excerpt: "Synthetic factual excerpt.", bodyPlainText: "Synthetic body." };
}
function fixture() {
  const rows = new Map([["CONTROL", { contentStartAt: cutover, contentSourceApproved: true, sanityPublishedStateApproved: true }]]);
  const state = { time: initial, docs: [document()], rows, writes: 0, queries: 0, sequence: 0, calls: [], object: undefined, writeFailure: false, finishFailure: false };
  const clone = x => x === undefined ? undefined : structuredClone(x);
  const store = {
    get: async key => clone(rows.get(key)),
    async begin(owner, time) {
      const old = rows.get(PUBLICATION_STATE) || { sequence: 0 };
      if (old.leaseUntil > time) throw new Error("publication_busy");
      const next = { ...old, status: "CHECKING", owner, leaseUntil: time + 180000 }; rows.set(PUBLICATION_STATE, next); return clone(next);
    },
    async owned(owner, time) { const h = rows.get(PUBLICATION_STATE); if (h.owner !== owner || h.leaseUntil <= time) throw new Error("publication_lease_lost"); },
    async observe(row, previousVersion) { if (rows.get(row.pk)?.version !== previousVersion) throw new Error("conditional_conflict"); rows.set(row.pk, clone(row)); },
    async initDiscovery(start, time) { if (!rows.has("DISCOVERY")) rows.set("DISCOVERY", { start, createdAt: time }); },
    async finish(owner, observation) {
      if (state.finishFailure) throw new Error("synthetic_checkpoint_failure");
      assert.equal(rows.get(PUBLICATION_STATE).owner, owner); state.calls.push("checkpoint");
      rows.set(PUBLICATION_STATE, { ...observation, status: "READY", leaseUntil: 0 });
    },
    async fail(owner) { const head = rows.get(PUBLICATION_STATE); if (head.owner === owner) rows.set(PUBLICATION_STATE, { ...head, status: "FAILED", leaseUntil: 0 }); },
  };
  const deps = { store, now: () => state.time, query: async () => { state.queries++; return clone(state.docs); }, object: {
    versioning: async () => {}, read: async () => clone(state.object),
    async write(raw, etag) {
      if (state.writeFailure) throw new Error("synthetic_s3_failure");
      if (state.object?.etag !== etag) throw new Error("publication_write_conflict");
      state.writes++; state.calls.push("manifest"); state.object = { raw, etag: `"synthetic-${state.writes}"`, versionId: `synthetic-${state.writes}` };
      return { versionId: state.object.versionId };
    },
  } };
  return { state, deps, run: () => discoverPublications(deps, env) };
}

test("new public post is persisted with strict versioned provenance and an actual observation policy, not a person", async () => {
  const f = fixture(); assert.deepEqual(await f.run(), { articles: 1, sequence: 1 });
  const m = JSON.parse(f.state.object.raw), a = m.articles[0];
  assert.equal(a.id, "urn:chronoverse:article:synthetic-a"); assert.equal(a.url, "https://reference.example.test/synthetic-a");
  assert.equal(a.publishedAt, "2026-10-25T08:30:00.000Z"); assert.equal(a.provenance.originalPublishedAt, a.publishedAt);
  assert.equal(a.approvedBy, PUBLICATION_POLICY); assert.equal(a.provenance.revision, "synthetic-v1"); assert.match(a.provenance.evidenceSha256, /^[a-f0-9]{64}$/);
  assert.equal(m.approvedAt, new Date(initial).toISOString()); assert.equal(f.state.rows.get("DISCOVERY").start, cutover);
  assert.deepEqual(f.state.calls, ["manifest", "checkpoint"]);
  assert.equal(parseContentManifest(f.state.object.raw, { end: initial + 1 }, initial, cutover).articles.length, 1);
});
for (const [name, change] of [
  ["draft", d => { d._id = "drafts.synthetic-a"; }], ["preview", d => { d._id = "versions.synthetic-a"; }],
  ["wrong type", d => { d._type = "page"; }], ["missing revision", d => { delete d._rev; }],
  ["future update", d => { d._updatedAt = "2026-10-27T09:00:00Z"; }],
]) test(`invalid upstream ${name} cannot create a manifest or advance the checkpoint`, async () => {
  const f = fixture(); change(f.state.docs[0]); await assert.rejects(f.run()); assert.equal(f.state.writes, 0); assert.equal(f.state.rows.get(PUBLICATION_STATE).sequence, 0);
});
test("the real schema has no additional approval field; durable policy approval must nevertheless be explicit", async () => {
  const f = fixture(); f.state.rows.get("CONTROL").sanityPublishedStateApproved = false;
  await assert.rejects(f.run(), /publication_not_approved/); assert.equal(f.state.queries, 0); assert.equal(f.state.writes, 0);
});
test("routine edits retain identity and original date; a date rewrite is held", async () => {
  const f = fixture(); await f.run(); const id = JSON.parse(f.state.object.raw).articles[0].id;
  f.state.time += 3600000; Object.assign(f.state.docs[0], { _rev: "synthetic-v2", _updatedAt: "2026-10-26T09:30:00Z", title: "Edited public title" });
  await f.run(); const a = JSON.parse(f.state.object.raw).articles[0]; assert.equal(a.id, id); assert.equal(a.publishedAt, "2026-10-25T08:30:00.000Z"); assert.equal(a.provenance.revision, "synthetic-v2");
  f.state.docs[0].publishedAt = "2026-10-26T08:30:00Z"; const raw = f.state.object.raw;
  await assert.rejects(f.run(), /publication_identity_changed/); assert.equal(f.state.object.raw, raw);
});
test("unpublication/deletion removes eligibility and persists a tombstone; republish cannot resurrect it", async () => {
  const f = fixture(); await f.run(); f.state.docs = []; f.state.time += 3600000; await f.run();
  assert.equal(JSON.parse(f.state.object.raw).articles.length, 0); assert.equal(f.state.rows.get(publicationKey("urn:chronoverse:article:synthetic-a")).active, false);
  f.state.docs = [document()]; f.state.time += 3600000; await f.run(); assert.equal(JSON.parse(f.state.object.raw).articles.length, 0);
});
test("multiple publications and duplicate scans do not create duplicate identities or reset first approval", async () => {
  const f = fixture(); f.state.docs.push(document("synthetic-b")); await f.run(); const first = JSON.parse(f.state.object.raw);
  f.state.time += 86400000; await f.run(); const second = JSON.parse(f.state.object.raw);
  assert.equal(second.articles.length, 2); assert.equal(second.articles[0].approvedAt, first.articles[0].approvedAt); assert.equal(second.sequence, first.sequence + 1);
  assert.notEqual(second.approvedAt, first.approvedAt); // Refresh the snapshot, never backdate article approval.
});
test("a failed/incomplete or changing scan cannot erase the last manifest and immediately denies eligibility", async () => {
  const f = fixture(); await f.run(); const original = f.state.object.raw;
  f.deps.query = async () => { throw new Error("synthetic_outage"); };
  await assert.rejects(f.run()); assert.equal(f.state.object.raw, original); assert.equal(f.state.rows.get(PUBLICATION_STATE).status, "FAILED");
  let call = 0; f.deps.query = async () => ++call === 1 ? [document()] : [];
  await assert.rejects(f.run(), /publication_source_changed/); assert.equal(f.state.object.raw, original);
});
test("lost daily schedules catch up within 35 days; an excessive gap holds without silently moving the checkpoint", async () => {
  const f = fixture(); await f.run(); const original = f.state.rows.get(PUBLICATION_STATE).lastSuccessfulAt;
  f.state.time += 14 * 86400000; await f.run(); assert.equal(JSON.parse(f.state.object.raw).articles.length, 1);
  const lastSuccessful = f.state.rows.get(PUBLICATION_STATE).lastSuccessfulAt; assert.notEqual(lastSuccessful, original);
  f.state.time += LOOKBACK_MS + 1; const raw = f.state.object.raw;
  await assert.rejects(f.run(), /publication_catchup_limit/); assert.equal(f.state.object.raw, raw); assert.equal(f.state.rows.get(PUBLICATION_STATE).lastSuccessfulAt, lastSuccessful);
});
test("pre-cutover creation qualifies by publication date while historical publication and future scheduling remain excluded", async () => {
  const f = fixture(); f.state.docs = [document("old-created"), document("old-published"), document("future")];
  f.state.docs[0]._createdAt = "2026-01-01T00:00:00Z"; f.state.docs[1].publishedAt = "2026-01-01T00:00:00Z";
  f.state.docs[2].publishedAt = "2026-10-27T00:00:00Z"; await f.run();
  assert.deepEqual(JSON.parse(f.state.object.raw).articles.map(article => article.id), ["urn:chronoverse:article:old-created"]);
});
test("a stale revision or conflicting content under one revision cannot replace a newer manifest", async () => {
  const f = fixture(); await f.run(); f.state.time += 3600000; f.state.docs[0]._rev = "synthetic-v2"; f.state.docs[0]._updatedAt = "2026-10-26T09:30:00Z"; await f.run();
  const raw = f.state.object.raw; f.state.docs = [document()]; await assert.rejects(f.run(), /publication_revision_regression/); assert.equal(f.state.object.raw, raw);
  f.state.docs[0]._rev = "synthetic-v2"; f.state.docs[0]._updatedAt = "2026-10-26T09:30:00Z"; f.state.docs[0].title = "Conflicting same-revision title";
  await assert.rejects(f.run(), /publication_revision_conflict/); assert.equal(f.state.object.raw, raw);
});
test("concurrent invocation and S3 conditional conflicts never advance the checkpoint", async () => {
  const f = fixture(); f.state.rows.set(PUBLICATION_STATE, { sequence: 0, owner: "synthetic-other", leaseUntil: initial + 10000 });
  await assert.rejects(f.run(), /publication_busy/); assert.equal(f.state.writes, 0);
  f.state.rows.delete(PUBLICATION_STATE); f.deps.object.write = async () => { throw new Error("publication_write_conflict"); };
  await assert.rejects(f.run(), /publication_write_conflict/); assert.equal(f.state.rows.get(PUBLICATION_STATE).sequence, 0);
});
test("manifest failure cannot advance the checkpoint; successful PUT with lost commit recovers from the current S3 version", async () => {
  const f = fixture(); f.state.writeFailure = true; await assert.rejects(f.run()); assert.equal(f.state.rows.get(PUBLICATION_STATE).sequence, 0);
  f.state.writeFailure = false; f.state.finishFailure = true; await assert.rejects(f.run()); assert.equal(JSON.parse(f.state.object.raw).sequence, 1); assert.equal(f.state.rows.get(PUBLICATION_STATE).sequence, 0);
  f.state.finishFailure = false; await f.run(); assert.equal(f.state.rows.get(PUBLICATION_STATE).sequence, 2);
});
test("post-boundary publication survives daily refresh and seven-day age at the next weekly issue", async () => {
  const f = fixture(); f.state.time = Date.parse("2026-10-26T09:15:00Z");
  Object.assign(f.state.docs[0], { _createdAt: "2026-10-26T09:11:00Z", _updatedAt: "2026-10-26T09:12:00Z", publishedAt: "2026-10-26T09:12:00Z" });
  await f.run(); const firstApproval = JSON.parse(f.state.object.raw).articles[0].approvedAt;
  f.state.time = Date.parse("2026-11-02T09:00:30Z"); await f.run();
  const result = parseContentManifest(f.state.object.raw, weeklyWindow(f.state.time), f.state.time, cutover);
  assert.equal(result.articles.length, 1); assert.equal(result.articles[0].approval.approvedAt, firstApproval);
});

const json = x => new Response(JSON.stringify(x), { headers: { "content-type": "application/json" } });
test("tokenless published-only cursor pagination checks totals, excludes drafts and preserves exact source fields", async () => {
  let calls = 0;
  const docs = Array.from({ length: 22 }, (_, i) => document(`synthetic-${String(i).padStart(2, "0")}`));
  const result = await queryPublications(discoveryConfig(env), { since: new Date(cutover).toISOString(), cutover: new Date(cutover).toISOString(), known: [] }, async (url, options) => {
    const u = new URL(url); assert.equal(u.hostname, "xfs4j01p.api.sanity.io"); assert.equal(options.method, "GET"); assert.equal(options.redirect, "error");
    assert.equal(u.searchParams.get("perspective"), "published"); assert.equal(options.headers.authorization, undefined); assert.match(u.searchParams.get("query"), /drafts\.\*\*/);
    return json({ result: { total: 22, items: calls++ === 0 ? docs.slice(0, 20) : docs.slice(20) } });
  });
  assert.equal(result.length, 22); assert.equal(calls, 2);
});
for (const [name, response] of [
  ["short page", () => json({ result: { total: 2, items: [document()] } })],
  ["error payload", () => json({ error: { description: "synthetic" }, result: { total: 0, items: [] } })],
  ["excess count", () => json({ result: { total: 9999, items: [] } })],
  ["draft result", () => json({ result: { total: 1, items: [{ ...document(), _id: "drafts.synthetic-a" }] } })],
]) test(`pagination fails closed for ${name}`, async () => {
  await assert.rejects(() => queryPublications(discoveryConfig(env), { since: "synthetic", cutover: "synthetic", known: [] }, response));
});
test("429, transient server and transport timeouts retry within a bounded budget; exhausted errors never become empty success", async () => {
  for (const failure of [() => new Response("", { status: 429, headers: { "retry-after": "9999" } }), () => new Response("", { status: 503 }), () => { throw new Error("synthetic_timeout"); }]) {
    let calls = 0; const delays = [];
    const fetcher = async () => ++calls < 3 ? failure() : json({ result: { total: 0, items: [] } });
    assert.deepEqual(await queryPublications(discoveryConfig(env), { since: "synthetic", cutover: "synthetic", known: [] }, fetcher, { wait: async ms => delays.push(ms) }), []);
    assert.equal(calls, 3); assert.ok(delays.every(ms => ms <= 2000));
  }
  await assert.rejects(() => queryPublications(discoveryConfig(env), {}, async () => new Response("", { status: 503 }), { wait: async () => {} }), /publication_source_unavailable/);
});
test("publication conversion rejects missing/future cutover through the runner and does not invent an approver", async () => {
  const f = fixture(); delete f.state.rows.get("CONTROL").contentStartAt; await assert.rejects(f.run(), /publication_not_approved/);
  const article = publicationArticle(document(), undefined, discoveryConfig(env), cutover, initial); assert.equal(article.approvedBy, PUBLICATION_POLICY);
});

test("a midweek approved cutover does not initialize DISCOVERY after its first weekly window", async () => {
  const f = fixture(); f.state.rows.get("CONTROL").contentStartAt = Date.parse("2026-10-22T09:00:00Z");
  await f.run(); assert.equal(f.state.rows.get("DISCOVERY").start, weeklyWindow(f.state.time).start);
});
test("an expired S3 snapshot becomes usable only after a complete successful refresh, without losing its articles", async () => {
  const f = fixture(); await f.run(); f.state.time = Date.parse("2026-11-02T09:20:30Z");
  assert.throws(() => parseContentManifest(f.state.object.raw, weeklyWindow(f.state.time), f.state.time, cutover), /invalid_content_archive/);
  await f.run(); assert.equal(parseContentManifest(f.state.object.raw, weeklyWindow(f.state.time), f.state.time, cutover).articles.length, 1);
});
test("simultaneous scans serialize and only one conditional manifest publication commits", async () => {
  const f = fixture(), results = await Promise.allSettled([f.run(), f.run()]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal(f.state.writes, 1);
  assert.equal(f.state.rows.get(PUBLICATION_STATE).sequence, 1);
});
test("an older invocation clock cannot regress a successful empty checkpoint", async () => {
  const f = fixture(); f.state.docs = []; await f.run(); f.state.time--;
  const raw = f.state.object.raw; await assert.rejects(f.run(), /publication_observation_regression/);
  assert.equal(f.state.object.raw, raw); assert.equal(f.state.rows.get(PUBLICATION_STATE).lastSuccessfulAt, initial);
});
test("Sunday publication first observed Monday uses authentic published-revision timing and meets the current weekly boundary", async () => {
  const f = fixture(); Object.assign(f.state.docs[0], { publishedAt: "2026-10-25T23:59:00Z", _updatedAt: "2026-10-25T23:59:00Z" });
  await f.run(); const parsed = parseContentManifest(f.state.object.raw, weeklyWindow(f.state.time), f.state.time, cutover);
  assert.equal(parsed.articles.length, 1); assert.equal(parsed.articles[0].approval.approvedAt, "2026-10-25T23:59:00.000Z");
  assert.equal(f.state.rows.get(publicationKey(parsed.articles[0].id)).observedAt, initial);
});
test("over forty lifetime publications continue automatically while expired issued identities leave the rolling manifest", async () => {
  const f = fixture();
  f.deps.query = async (_, options) => structuredClone(f.state.docs.filter(d => d.publishedAt >= options.since || options.known.includes(d._id)));
  for (let day = 0; day < 45; day++) {
    if (day) {
      f.state.time += 86400000; const d = document(`synthetic-day-${String(day).padStart(2, "0")}`);
      d._createdAt = new Date(f.state.time - 3600000).toISOString(); d._updatedAt = d.publishedAt = new Date(f.state.time - 1800000).toISOString(); f.state.docs.push(d);
    }
    await f.run(); const m = JSON.parse(f.state.object.raw); assert.ok(m.articles.length <= 40);
    for (const a of m.articles) if (!f.state.rows.has(articleKey(a.id))) f.state.rows.set(articleKey(a.id), { state: "ISSUED", campaign: weeklyWindow(f.state.time).id });
  }
  assert.equal(f.state.rows.get(PUBLICATION_STATE).status, "READY"); assert.equal(f.state.writes, 45);
  assert.equal(f.state.rows.get(publicationKey("urn:chronoverse:article:synthetic-a")).active, false);
});
test("aging unassigned backlog stops explicitly instead of being silently pruned", async () => {
  const f = fixture(); await f.run(); f.state.time += LOOKBACK_MS;
  f.state.rows.get(PUBLICATION_STATE).lastSuccessfulAt = f.state.time - 86400000;
  const raw = f.state.object.raw; await assert.rejects(f.run(), /publication_backlog_expired/); assert.equal(f.state.object.raw, raw);
  assert.equal(f.state.rows.get(PUBLICATION_STATE).status, "FAILED");
});

// The ID/title and calendar dates below reproduce the reported production bug.
// Revision, slug, exact time-of-day and all 72 legacy IDs are synthetic fixtures;
// no live source document, CONTROL item, legacy inventory or S3 data is imported.
const productionCutover = Date.parse("2026-10-24T21:00:00Z");
const sourceEnv = { ...env, SANITY_PROJECT_ID: "xfs4j01p" };
function alexandrian() {
  return { ...document("post-99-1785240729810"), title: "The Alexandrian Blueprint intel dossier",
    slug: "alexandrian-blueprint-fixture", _createdAt: "2026-07-28T00:00:00Z",
    _updatedAt: "2026-10-26T08:30:00Z", publishedAt: "2026-10-26T08:30:00Z" };
}
function legacyArticles() {
  return Array.from({ length: 72 }, (_, i) => ({ ...document(`legacy-fixture-${String(i).padStart(2, "0")}`),
    _createdAt: "2026-07-01T00:00:00Z", _updatedAt: "2026-10-23T12:00:00Z",
    publishedAt: new Date(Date.parse("2026-10-23T00:00:00Z") + i * 60000).toISOString() }));
}
function publicationDateFixture() {
  const f = fixture(); f.state.rows.get("CONTROL").contentStartAt = productionCutover;
  f.state.docs = [alexandrian()];
  return { ...f, run: () => discoverPublications(f.deps, sourceEnv) };
}
function dateFilteredTransport(docs, requests) {
  return async (url, options) => {
    const u = new URL(url), query = u.searchParams.get("query"); requests.push(u);
    assert.equal(u.hostname, "xfs4j01p.api.sanity.io");
    assert.equal(u.pathname, "/v2024-03-01/data/query/production");
    assert.equal(u.searchParams.get("perspective"), "published");
    assert.equal(options.method, "GET"); assert.equal(options.headers.authorization, undefined);
    assert.match(query, /publishedAt >= \$since/); assert.match(query, /publishedAt >= \$cutover/);
    assert.match(query, /publishedAt <= now\(\)/); assert.doesNotMatch(query, /_createdAt\s*>=/);
    assert.match(query, /!\(_id in \$legacyExcluded\)/);
    const excluded = JSON.parse(u.searchParams.get("$legacyExcluded"));
    assert.deepEqual(excluded, legacySnapshot.excludedIds);
    assert.match(query, /\|\| _id in \$known/); assert.match(query, /drafts\.\*\*/); assert.match(query, /versions\.\*\*/);
    const since = Date.parse(JSON.parse(u.searchParams.get("$since"))), start = Date.parse(JSON.parse(u.searchParams.get("$cutover")));
    const known = JSON.parse(u.searchParams.get("$known")), cursor = JSON.parse(u.searchParams.get("$cursor"));
    const eligible = docs.filter(d => !/^(drafts|versions)\./.test(d._id) && d._type === "post" && !excluded.includes(d._id) &&
      ((Date.parse(d.publishedAt) >= since && Date.parse(d.publishedAt) >= start && Date.parse(d.publishedAt) <= initial) || known.includes(d._id)))
      .sort((a, b) => a._id < b._id ? -1 : 1);
    return json({ result: { total: eligible.length, items: eligible.filter(d => d._id > cursor).slice(0, 20) } });
  };
}

test("Alexandrian document created July 28 qualifies at the real October 24 cutover by its October 26 publication", () => {
  const article = publicationArticle(alexandrian(), undefined, discoveryConfig(sourceEnv), productionCutover, initial);
  assert.equal(article.id, "urn:chronoverse:article:post-99-1785240729810");
  assert.equal(article.title, "The Alexandrian Blueprint intel dossier");
  assert.equal(article.provenance.sourceId, "sanity:xfs4j01p/production:post-99-1785240729810");
  assert.equal(article.provenance.originalPublishedAt, "2026-10-26T08:30:00.000Z");
});

test("all 72 older publication dates remain excluded independently of document creation date", () => {
  const old = legacyArticles(); assert.equal(old.length, 72);
  for (const doc of old) assert.equal(publicationArticle(doc, undefined, discoveryConfig(sourceEnv), productionCutover, initial), undefined, doc._id);
});

test("published-only query admits exactly Alexandrian from 73 records with an explicit publication-date cutover", async () => {
  const requests = [], docs = [...legacyArticles(), alexandrian()];
  const found = await queryPublications(discoveryConfig(sourceEnv), {
    since: "2026-01-01T00:00:00.000Z", cutover: new Date(productionCutover).toISOString(), known: [],
  }, dateFilteredTransport(docs, requests));
  assert.deepEqual(found, [alexandrian()]); assert.equal(requests.length, 1);
});

test("existing empty sequence 1 advances to sequence 2 through two real query passes without resetting CONTROL or DISCOVERY", async () => {
  const f = publicationDateFixture(); f.state.docs = []; await f.run();
  const priorManifest = structuredClone(f.state.object), control = structuredClone(f.state.rows.get("CONTROL"));
  const discovery = structuredClone(f.state.rows.get("DISCOVERY"));
  assert.equal(JSON.parse(priorManifest.raw).sequence, 1); assert.deepEqual(JSON.parse(priorManifest.raw).articles, []);
  const requests = [], transport = dateFilteredTransport([...legacyArticles(), alexandrian()], requests);
  f.deps.query = (config, options) => queryPublications(config, options, transport);
  f.state.time += 60000;
  assert.deepEqual(await f.run(), { articles: 1, sequence: 2 }); assert.equal(requests.length, 2);
  assert.notEqual(f.state.object.versionId, priorManifest.versionId);
  assert.equal(JSON.parse(f.state.object.raw).articles[0].id, "urn:chronoverse:article:post-99-1785240729810");
  assert.deepEqual(f.state.rows.get("CONTROL"), control); assert.deepEqual(f.state.rows.get("DISCOVERY"), discovery);
  assert.deepEqual(f.state.calls, ["manifest", "checkpoint", "manifest", "checkpoint"]);
  assert.equal(parseContentManifest(f.state.object.raw, { end: f.state.time + 1 }, f.state.time, productionCutover).articles.length, 1);
});

test("a pre-cutover draft qualifies only after it becomes a published document with an eligible date", () => {
  const draft = { ...alexandrian(), _id: "drafts.pre-cutover-fixture" };
  assert.throws(() => publicationArticle(draft, undefined, discoveryConfig(sourceEnv), productionCutover, initial), /publication_document_invalid/);
  const published = { ...draft, _id: "pre-cutover-fixture" };
  assert.ok(publicationArticle(published, undefined, discoveryConfig(sourceEnv), productionCutover, initial));
});

test("pre-cutover-created article updates keep recorded identity, creation and publication dates", async () => {
  const f = publicationDateFixture(); await f.run(); const first = JSON.parse(f.state.object.raw).articles[0];
  f.state.time += 3600000;
  Object.assign(f.state.docs[0], { _rev: "synthetic-v2", title: "Edited Alexandrian fixture title", _updatedAt: "2026-10-26T09:30:00Z" });
  await f.run(); const updated = JSON.parse(f.state.object.raw).articles[0];
  assert.equal(updated.id, first.id); assert.equal(updated.publishedAt, first.publishedAt);
  assert.equal(updated.provenance.sourceId, first.provenance.sourceId); assert.equal(updated.provenance.revision, "synthetic-v2");
  assert.equal(f.state.rows.get(publicationKey(first.id)).createdAt, "2026-07-28T00:00:00Z");
});

for (const [field, value] of [["publishedAt", "2026-10-24T20:59:59Z"], ["publishedAt", "2026-10-26T08:45:00Z"], ["_createdAt", "2026-07-27T00:00:00Z"]]) {
  test(`an observed old-created article cannot rewrite ${field} to ${value}`, async () => {
    const f = publicationDateFixture(); await f.run(); const raw = f.state.object.raw, head = f.state.rows.get(PUBLICATION_STATE);
    f.state.docs[0][field] = value;
    await assert.rejects(f.run(), /publication_identity_changed/);
    assert.equal(f.state.object.raw, raw); assert.equal(f.state.rows.get(PUBLICATION_STATE).sequence, head.sequence);
  });
}

for (const [label, value] of [["missing", undefined], ["invalid", "not-a-timestamp"], ["impossible date", "2026-02-30T08:00:00Z"],
  ["backdated before cutover", "2026-10-24T20:59:59.999Z"], ["future", "2026-10-27T00:00:00Z"]]) {
  test(`an old-created document with ${label} publishedAt stays ineligible`, () => {
    const doc = { ...alexandrian(), publishedAt: value };
    assert.equal(publicationArticle(doc, undefined, discoveryConfig(sourceEnv), productionCutover, initial), undefined);
  });
}

for (const [field, value] of [["_createdAt", "invalid"], ["_createdAt", "2026-10-27T00:00:00Z"],
  ["_updatedAt", "invalid"], ["_updatedAt", "2026-07-27T00:00:00Z"], ["_updatedAt", "2026-10-27T00:00:00Z"]]) {
  test(`malformed or inconsistent source ${field}=${value} still fails before manifest persistence`, async () => {
    const f = publicationDateFixture(); f.state.docs[0][field] = value;
    await assert.rejects(f.run(), /publication_document_invalid/); assert.equal(f.state.writes, 0);
    assert.equal(f.state.rows.get(PUBLICATION_STATE).sequence, 0);
  });
}

test("publication cutover is inclusive and independent from the older creation timestamp", () => {
  const doc = { ...alexandrian(), publishedAt: new Date(productionCutover).toISOString() };
  assert.ok(publicationArticle(doc, undefined, discoveryConfig(sourceEnv), productionCutover, initial));
});

test("query retains known identities after backdating so immutable publication checks can hold them", async () => {
  const f = publicationDateFixture(); await f.run();
  const backdated = { ...alexandrian(), publishedAt: "2026-10-23T12:00:00Z" }, requests = [];
  f.deps.query = (config, options) => queryPublications(config, options, dateFilteredTransport([backdated], requests));
  const raw = f.state.object.raw;
  await assert.rejects(f.run(), /publication_identity_changed/); assert.equal(requests.length, 2); assert.equal(f.state.object.raw, raw);
});

test("pre-cutover-created content cannot cross a recorded source namespace", async () => {
  const f = publicationDateFixture(); await f.run(); const raw = f.state.object.raw;
  await assert.rejects(() => discoverPublications(f.deps, { ...sourceEnv, SANITY_DATASET: "other" }), /legacy_exclusion_source_mismatch/);
  assert.equal(f.state.object.raw, raw);
});

test("future durable cutover is rejected before any scan, lease or object write", async () => {
  const f = publicationDateFixture(); f.state.rows.get("CONTROL").contentStartAt = initial + 1;
  await assert.rejects(f.run(), /publication_not_approved/);
  assert.equal(f.state.queries, 0); assert.equal(f.state.writes, 0); assert.equal(f.state.rows.has(PUBLICATION_STATE), false);
});

test("a real snapshotted legacy publication stays excluded after an unseen publishedAt edit", () => {
  const legacy = { ...legacyArticles()[0], _id: legacySnapshot.excludedIds[0] }, config = discoveryConfig(sourceEnv);
  assert.equal(publicationArticle(legacy, undefined, config, productionCutover, initial), undefined);
  const edited = { ...legacy, publishedAt: "2026-10-26T08:30:00Z", _updatedAt: "2026-10-26T08:30:00Z", _rev: "synthetic-date-edit" };
  assert.equal(publicationArticle(edited, undefined, config, productionCutover, initial), undefined);
});

test("actual 73-post baseline has a pinned digest and exactly 72 exclusions, with Alexandrian retained", () => {
  assert.equal(hash(JSON.stringify(legacySnapshot)), LEGACY_SNAPSHOT_SHA256);
  assert.equal(legacySnapshot.publishedCount, 73); assert.equal(legacySnapshot.publishedIds.length, 73);
  assert.equal(verifyLegacySnapshot(legacySnapshot).excludedIds.length, 72);
  assert.deepEqual(legacySnapshot.excludedIds, legacySnapshot.publishedIds.filter(id => id !== "post-99-1785240729810"));
  assert.equal(legacyPublicationExcluded(discoveryConfig(sourceEnv), "post-99-1785240729810"), false);
  assert.ok(Object.isFrozen(legacyExclusionIds(discoveryConfig(sourceEnv))));
});

for (const [name, mutate] of [
  ["missing", () => undefined], ["empty", () => ({})],
  ["truncated", x => { x.excludedIds.pop(); return x; }],
  ["wrong namespace", x => { x.dataset = "other"; return x; }],
  ["duplicate", x => { x.excludedIds[0] = x.excludedIds[1]; return x; }],
  ["new ID excluded", x => { x.excludedIds[0] = x.firstNewId; return x; }],
  ["changed observation", x => { x.observedAt = "2026-10-01T00:00:00.000Z"; return x; }],
]) test(`legacy snapshot fails closed when ${name}`, () => {
  assert.throws(() => verifyLegacySnapshot(mutate(structuredClone(legacySnapshot))), /legacy_exclusion_snapshot_invalid/);
});

test("every actual legacy ID remains excluded after publication-date and revision edits or republication", () => {
  const config = discoveryConfig(sourceEnv);
  for (const id of legacySnapshot.excludedIds) {
    const edited = { ...alexandrian(), _id: id, _rev: "synthetic-new-revision" };
    assert.equal(publicationArticle(edited, undefined, config, productionCutover, initial), undefined, id);
    assert.equal(publicationArticle(edited, { active: false }, config, productionCutover, initial), undefined, id);
  }
});

test("two real query passes exclude all 72 date-edited legacy documents, even a known legacy ID", async () => {
  const f = publicationDateFixture(), docs = legacySnapshot.excludedIds.map((id, i) => ({ ...alexandrian(), _id: id, slug: `legacy-fixture-${i}` }));
  docs.push(alexandrian()); const requests = [], transport = dateFilteredTransport(docs, requests);
  const found = await queryPublications(discoveryConfig(sourceEnv), { since: new Date(productionCutover).toISOString(),
    cutover: new Date(productionCutover).toISOString(), known: [legacySnapshot.excludedIds[0]] }, transport);
  assert.deepEqual(found.map(d => d._id), ["post-99-1785240729810"]);
  f.deps.query = (config, options) => queryPublications(config, options, transport);
  const control = structuredClone(f.state.rows.get("CONTROL"));
  assert.deepEqual(await f.run(), { articles: 1, sequence: 1 });
  assert.equal(requests.length, 3); assert.deepEqual(f.state.rows.get("CONTROL"), control);
  assert.equal(JSON.parse(f.state.object.raw).articles.length, 1);
});

test("conversion independently excludes legacy data returned by an incorrectly filtering source adapter", async () => {
  const f = publicationDateFixture();
  f.state.docs = legacySnapshot.excludedIds.map((id, i) => ({ ...alexandrian(), _id: id, slug: `legacy-fixture-${i}` }));
  f.state.docs.push(alexandrian());
  assert.deepEqual(await f.run(), { articles: 1, sequence: 1 });
  assert.equal(f.state.queries, 2); assert.equal(JSON.parse(f.state.object.raw).articles[0].id, "urn:chronoverse:article:post-99-1785240729810");
});

test("namespace mismatch fails before any ledger read, lease, source query or S3 operation", async () => {
  const f = publicationDateFixture(); let reads = 0; f.deps.store.get = async () => { reads++; };
  await assert.rejects(() => discoverPublications(f.deps, { ...sourceEnv, SANITY_PROJECT_ID: "other" }), /legacy_exclusion_source_mismatch/);
  assert.equal(reads, 0); assert.equal(f.state.queries, 0); assert.equal(f.state.writes, 0);
});
