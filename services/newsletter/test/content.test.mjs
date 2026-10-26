import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DynamoDBDocumentClient, GetCommand, PutCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { createAwsDependencies } from "../src/aws.mjs";
import { parseContentManifest, readContentObject, createContentSource, MAX_CONTENT_BYTES } from "../src/content.mjs";
import { weeklyWindow, hash } from "../src/domain.mjs";
import { fixture } from "./fixture.mjs";
import { approvedFixtureArticle } from "./fixture.mjs";
import { createService } from "../src/service.mjs";

const time = Date.parse("2026-10-26T10:00:00.000Z"), window = weeklyWindow(time), start = window.start;
const env = { AWS_REGION: "eu-north-1", CONTENT_BUCKET: "synthetic-private-content", CONTENT_MANIFEST_KEY: "newsletter-content/approved.json", CONTENT_BUCKET_OWNER: "000000000000" };
function doc() {
  const publishedAt = "2026-10-25T08:00:00.000Z";
  return { version: 1, sequence: 1, publicationApproved: true, approvedBy: "synthetic-editor", approvedAt: "2026-10-26T08:00:00.000Z", expiresAt: "2026-11-01T08:00:00.000Z", articles: [
    { id: "urn:chronoverse:article:synthetic", url: "https://reference.example.test/research", title: "Synthetic research", summary: "Synthetic approved summary", publishedAt,
      publicationApproved: true, approvedBy: "synthetic-editor", approvedAt: publishedAt,
      provenance: { sourceId: "synthetic-source", revision: "synthetic-v1", originalPublishedAt: publishedAt, evidenceSha256: "a".repeat(64) } },
  ] };
}
const parse = d => parseContentManifest(JSON.stringify(d), window, time, start);

test("approved archive preserves stable identity, canonical references and explicit original evidence", () => {
  const d = doc(), result = parse(d); assert.equal(result.articles.length, 1);
  assert.equal(result.articles[0].id, d.articles[0].id); assert.equal(result.articles[0].url, d.articles[0].url);
  assert.equal(result.articles[0].published, Date.parse(d.articles[0].publishedAt));
  assert.deepEqual(result.articles[0].provenance, d.articles[0].provenance);
});
for (const [name, change] of [
  ["unapproved upload", d => { d.publicationApproved = false; }],
  ["unapproved article", d => { d.articles[0].publicationApproved = false; }],
  ["string approval", d => { d.publicationApproved = "true"; }],
  ["missing provenance", d => { delete d.articles[0].provenance; }],
  ["rewritten original date", d => { d.articles[0].provenance.originalPublishedAt = "2026-10-24T08:00:00.000Z"; }],
  ["stale archive", d => { d.expiresAt = "2026-10-26T09:00:00.000Z"; }],
  ["unbounded freshness", d => { d.expiresAt = "2027-10-26T08:00:00.000Z"; }],
  ["future approval", d => { d.approvedAt = "2026-10-27T08:00:00.000Z"; }],
  ["duplicate identity", d => { d.articles.push({ ...d.articles[0], url: "https://reference.example.test/other" }); }],
  ["duplicate canonical URL", d => { d.articles.push({ ...d.articles[0], id: "urn:chronoverse:article:other" }); }],
  ["unsafe reference", d => { d.articles[0].url = "javascript:alert(1)"; }],
  ["HTML summary", d => { d.articles[0].summary = "<script>unsafe</script>"; }],
  ["unknown fields", d => { d.importAll = true; }],
]) test(`content fails closed: ${name}`, () => { const d = doc(); change(d); assert.throws(() => parse(d), /invalid_content_archive/); });

test("cutover and approval time prevent historical replay and late approval backdating", () => {
  for (const [publishedAt, approvedAt] of [["2026-10-18T08:00:00.000Z", "2026-10-25T08:00:00.000Z"], ["2026-10-25T08:00:00.000Z", "2026-10-26T09:30:00.000Z"]]) {
    const d = doc(); d.approvedAt = "2026-10-26T09:30:00.000Z"; Object.assign(d.articles[0], { publishedAt, approvedAt });
    d.articles[0].provenance.originalPublishedAt = publishedAt; assert.equal(parse(d).articles.length, 0);
  }
  assert.throws(() => parseContentManifest("x".repeat(MAX_CONTENT_BYTES + 1), window, time, start), /invalid_content_archive/);
  assert.throws(() => parseContentManifest(JSON.stringify(doc()), window, time, undefined), /invalid_content_archive/);
  const draft = JSON.parse(readFileSync(new URL("../content-manifest.example.json", import.meta.url)));
  assert.equal(draft.publicationApproved, false); assert.throws(() => parse(draft), /invalid_content_archive/);
});

test("S3 adapter makes one bounded signed GET to the exact key and expected owner, without website requests", async () => {
  const requests = [], credentials = async () => ({ accessKeyId: "synthetic-session-key", secretAccessKey: "synthetic-session-secret", sessionToken: "synthetic-session-token" });
  const result = await readContentObject(env, credentials, async (url, options) => {
    requests.push(url); assert.equal(url, "https://synthetic-private-content.s3.eu-north-1.amazonaws.com/newsletter-content/approved.json");
    assert.equal(options.method, "GET"); assert.equal(options.redirect, "error");
    assert.equal(options.headers["x-amz-expected-bucket-owner"], env.CONTENT_BUCKET_OWNER);
    assert.match(options.headers.authorization, /^AWS4-HMAC-SHA256 /);
    return new Response(JSON.stringify(doc()), { headers: { "content-type": "application/json", "x-amz-version-id": "synthetic-version" } });
  });
  assert.equal(result.versionId, "synthetic-version"); assert.equal(requests.length, 1);
});

test("missing configuration, nonversioned objects, redirects, bad media, errors and oversized objects never fall back", async () => {
  let credentialReads = 0;
  await assert.rejects(() => readContentObject({ ...env, CONTENT_BUCKET: "" }, () => { credentialReads++; }), /content_not_configured/);
  assert.equal(credentialReads, 0);
  const credentials = async () => ({ accessKeyId: "synthetic", secretAccessKey: "synthetic" });
  for (const response of [new Response("{}"), new Response("{}", { status: 403 }), new Response("{}", { headers: { "content-type": "text/html", "x-amz-version-id": "v" } }), new Response("{}", { headers: { "content-type": "application/json", "x-amz-version-id": "null" } }), new Response("x".repeat(MAX_CONTENT_BYTES + 1), { headers: { "content-type": "application/json", "x-amz-version-id": "v" } })]) {
    await assert.rejects(() => readContentObject(env, credentials, async () => response), /content_unavailable|invalid_content_archive/);
  }
  await assert.rejects(() => readContentObject(env, credentials, async () => { throw new Error("synthetic-outage"); }), /synthetic-outage/);
});

test("publication cutover approval and monotonic manifest checkpoint are mandatory; concurrent rollback is held", async () => {
  let control = {}, current, reads = 0;
  const store = { get: async () => control, acceptContentManifest: async next => {
    if (current && (next.sequence < current.sequence || (next.sequence === current.sequence && (next.sha256 !== current.sha256 || next.versionId !== current.versionId)))) return false;
    current = next; return true;
  } };
  let document = doc(); const read = async () => { reads++; return { raw: JSON.stringify(document), versionId: "synthetic-v" }; };
  const source = createContentSource(env, store, undefined, () => time, read);
  await assert.rejects(() => source(window), /content_not_approved/); assert.equal(reads, 0);
  control = { contentSourceApproved: true, contentStartAt: start };
  const first = await source(window); assert.equal(first.length, 1); assert.equal(first[0].contentManifest.sha256, hash(JSON.stringify(document)));
  await source(window); document = { ...doc(), sequence: 2 }; await source(window);
  document = doc(); await assert.rejects(() => source(window), /content_rollback_or_conflict/);
  document = { ...doc(), sequence: 2, approvedBy: "other-synthetic-editor" }; await assert.rejects(() => source(window), /content_rollback_or_conflict/);
});

test("DynamoDB checkpoint and campaign transaction prevent stale-manifest races without resetting article claims", async () => {
  const commands = []; mock.method(DynamoDBDocumentClient.prototype, "send", async command => { commands.push(command); return {}; });
  try {
    const f = fixture(), deps = createAwsDependencies({ ...f.env, AWS_REGION: "eu-north-1", TABLE_NAME: "synthetic" });
    const observation = { sequence: 2, sha256: "a".repeat(64), versionId: "synthetic-v2" };
    assert.equal(await deps.store.acceptContentManifest(observation), true);
    assert.ok(commands[0] instanceof PutCommand); assert.equal(commands[0].input.Item.pk, "CONTENT#STATE");
    assert.match(commands[0].input.ConditionExpression, /#sequence < :sequence/);
    const a = (await f.deps.articles())[0]; a.contentManifest = observation;
    await deps.store.freezeCampaign({ pk: "CAMPAIGN#synthetic", id: "synthetic", articles: [a] });
    assert.ok(commands[1] instanceof TransactWriteCommand);
    const check = commands[1].input.TransactItems[0].Put;
    assert.equal(check.Item.pk, "CONTENT#STATE"); assert.equal(check.ExpressionAttributeValues[":hash"], observation.sha256);
  } finally { mock.restoreAll(); }
});

test("runtime adapter denies old/unapproved content without any external request when durable approval is absent", async () => {
  const f = fixture(); mock.method(DynamoDBDocumentClient.prototype, "send", async c => {
    assert.ok(c instanceof GetCommand); return { Item: { ...f.state.documents.get("CONTROL"), contentSourceApproved: false } };
  });
  try { const deps = createAwsDependencies({ ...f.env, ...env }); await assert.rejects(() => deps.articles(window), /content_not_approved/); }
  finally { mock.restoreAll(); }
});

test("a newer content checkpoint prevents an older concurrent campaign transaction from committing", async () => {
  const f = fixture(), a = (await f.deps.articles())[0], manifest = a.contentManifest;
  const current = { sequence: manifest.sequence + 1, contentHash: "c".repeat(64), versionId: "newer-synthetic-version" };
  let committed = false;
  mock.method(DynamoDBDocumentClient.prototype, "send", async command => {
    assert.ok(command instanceof TransactWriteCommand);
    const check = command.input.TransactItems[0].Put, values = check.ExpressionAttributeValues;
    assert.match(check.ConditionExpression, /#sequence = :sequence AND contentHash = :hash AND versionId = :version/);
    if (current.sequence !== values[":sequence"] || current.contentHash !== values[":hash"] || current.versionId !== values[":version"]) {
      throw Object.assign(new Error("synthetic_stale_manifest"), { name: "TransactionCanceledException", CancellationReasons: [{ Code: "ConditionalCheckFailed" }] });
    }
    committed = true; return {};
  });
  try {
    const deps = createAwsDependencies({ ...f.env, AWS_REGION: "eu-north-1", TABLE_NAME: "synthetic" });
    assert.equal(await deps.store.freezeCampaign({ pk: "CAMPAIGN#synthetic", id: "synthetic", articles: [a] }), false);
    assert.equal(committed, false); assert.equal(current.sequence, manifest.sequence + 1);
  } finally { mock.restoreAll(); }
});

test("immutable original source provenance cannot be replaced by a newly approved manifest", async () => {
  const f = fixture(); let found = await f.deps.articles();
  const service = createService({ ...f.deps, articles: async () => found }, f.env);
  await service.plan({ kind: "weekly" });
  f.state.time += 7 * 86400000;
  found = found.map(a => ({ ...approvedFixtureArticle(a, f.state.time), provenance: { ...a.provenance, sourceId: "different-synthetic-source" } }));
  await assert.rejects(() => service.plan({ kind: "weekly" }), /article_provenance_changed/);
  assert.equal(f.state.sends.length, 0);
});
