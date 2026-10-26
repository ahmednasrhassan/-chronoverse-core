import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { readFileSync } from "node:fs";
import { DynamoDBDocumentClient, BatchGetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { fixture, approvedFixtureArticle } from "./fixture.mjs";
import { createService } from "../src/service.mjs";
import { createAwsDependencies } from "../src/aws.mjs";
import { parseArticles, fetchArticles } from "../src/rss.mjs";
import { weeklyWindow, escapeHtml, FEED } from "../src/domain.mjs";
import { articleKey, articleUrlKey } from "../src/discovery.mjs";

const week = 7 * 86400000;
const origin = "https://chronoversecapital.com";
const article = (i, published = Date.parse("2026-10-20T12:00:00Z") + i * 1000) => ({
  id: `urn:chronoverse:article:fixture-${i}`, title: `Research ${i} & <facts>`, summary: `Summary ${i}`,
  url: `${origin}/research-${i}`, published,
});
const xml = articles => `<?xml version="1.0"?><rss version="2.0"><channel><title>Chronoverse Capital</title><link>${origin}/</link><description>Research</description>${articles.map(a =>
  `<item><title>${escapeHtml(a.title)}</title><link>${a.url}</link><guid isPermaLink="false">${a.id}</guid><pubDate>${new Date(a.published).toUTCString()}</pubDate><description>${escapeHtml(a.summary)}</description></item>`).join("")}</channel></rss>`;
function planner(f, read) {
  return createService({ ...f.deps, articles: async window => (await fetchArticles(window, async (url, options) => {
    assert.equal(url, FEED); assert.equal(options.redirect, "error");
    return new Response(xml(await read()), { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
  })).map(a => approvedFixtureArticle(a, f.state.time)) }, f.env);
}
const campaign = f => f.state.documents.get(`CAMPAIGN#${weeklyWindow(f.state.time).id}`);
const pending = f => [...f.state.documents.values()].filter(row => row.pk?.startsWith("ARTICLE#") && row.state === "PENDING");

test("RSS keeps exact titles, stable GUIDs, canonical links and original timestamps without an eight/50-item cap", () => {
  const articles = Array.from({ length: 61 }, (_, i) => article(i));
  const result = parseArticles(xml(articles), weeklyWindow(Date.parse("2026-10-26T10:00:00Z")).end);
  assert.deepEqual(result, articles); assert.equal(result.length, 61);
});

test("weekly periods are UTC Monday 09:00 half-open intervals across month/year and DST changes", () => {
  for (const boundary of ["2026-10-26T09:00:00Z", "2026-11-02T09:00:00Z", "2027-01-04T09:00:00Z", "2027-03-29T09:00:00Z"]) {
    const end = Date.parse(boundary), window = weeklyWindow(end);
    assert.equal(window.end, end); assert.equal(window.start, end - week);
    assert.equal(weeklyWindow(end - 1).end, end - week);
    assert.deepEqual(weeklyWindow(end + 71 * 3600000), window);
    const result = parseArticles(xml([article(0, window.start), article(1, end - 1000), article(2, end), article(3, end + 1000)]), end);
    assert.deepEqual(result.map(a => a.id), [article(0).id, article(1).id]);
  }
});

test("RSS deduplicates IDs and canonical URLs deterministically and accepts original permalink GUIDs", () => {
  const a = article(1), b = { ...a, id: "urn:chronoverse:article:duplicate-record" };
  const result = parseArticles(xml([a, a, b]), Date.parse("2026-10-26T09:00:00Z"));
  assert.equal(result.length, 1);
  assert.deepEqual(result, parseArticles(xml([b, a, a]), Date.parse("2026-10-26T09:00:00Z")));
  const old = { ...article(2), id: article(2).url };
  assert.equal(parseArticles(xml([old]), Date.parse("2026-10-26T09:00:00Z"))[0].id, old.url);
});

test("malformed or incomplete RSS fails closed rather than looking like an empty week", () => {
  const valid = xml([article(1)]), end = Date.parse("2026-10-26T09:00:00Z");
  for (const bad of ["", "<html/>", "<rss/>", "<rss><channel/></rss>", valid.replace(/<guid[^>]*>.*?<\/guid>/, ""),
    valid.replace(/<pubDate>.*?<\/pubDate>/, "<pubDate>not-a-date</pubDate>"), valid.replace(origin + "/research-1", "https://evil.example/research-1"),
    valid.replace("</channel>", ""), "<!DOCTYPE rss [<!ENTITY x 'unsafe'>]>" + valid,
    xml([article(1), { ...article(1), url: origin + "/changed-slug" }])]) {
    assert.throws(() => parseArticles(bad, end));
  }
  assert.deepEqual(parseArticles(xml([]), end), []);
});

test("fetch rejects wrong content types, error responses, truncation, redirects and network failure", async () => {
  const window = weeklyWindow(Date.parse("2026-10-26T10:00:00Z"));
  for (const response of [new Response(xml([])), new Response(xml([]), { status: 503 }),
    new Response("<rss", { headers: { "content-type": "application/rss+xml" } }),
    new Response(xml([]), { status: 206, headers: { "content-type": "application/rss+xml" } }),
    new Response(xml([]), { headers: { "content-type": "application/rss+xml", "content-length": "2000001" } })]) {
    await assert.rejects(() => fetchArticles(window, async () => response));
  }
  await assert.rejects(() => fetchArticles(window, async (_url, options) => {
    assert.equal(options.redirect, "error"); throw new Error("synthetic-outage");
  }));
});

test("23 articles form three weekly issues; excess persists while newer articles cannot starve backlog", async () => {
  const f = fixture(); let found = Array.from({ length: 23 }, (_, i) => article(i));
  const service = planner(f, async () => found);
  await service.plan({ kind: "weekly" });
  assert.deepEqual(campaign(f).articles.map(a => a.id), found.slice(0, 10).map(a => a.id));
  assert.equal(pending(f).length, 13); assert.equal(f.state.sends.length, 0);
  f.state.jobs.length = 0; f.state.time += week;
  found = [...found, ...Array.from({ length: 12 }, (_, i) => article(i + 23, Date.parse("2026-10-28T12:00:00Z") + i * 1000))];
  await service.plan({ kind: "weekly" });
  assert.deepEqual(campaign(f).articles.map(a => a.id), found.slice(10, 20).map(a => a.id));
  assert.equal(pending(f).length, 15);
  f.state.time += week; await service.plan({ kind: "weekly" });
  assert.deepEqual(campaign(f).articles.map(a => a.id), found.slice(20, 30).map(a => a.id));
  f.state.time += week; await service.plan({ kind: "weekly" }); assert.equal(campaign(f).articles.length, 5);
  assert.equal(pending(f).length, 0);
  const all = [...f.state.documents.values()].filter(a => a.pk?.startsWith("CAMPAIGN#")).flatMap(c => c.articles.map(a => a.id));
  assert.equal(new Set(all).size, 35); assert.equal(all.length, 35);
  f.state.jobs.length = 0; f.state.time += week; await service.plan({ kind: "weekly" });
  assert.equal(campaign(f), undefined); assert.equal(f.state.jobs.length, 0); assert.equal(f.state.sends.length, 0);
});

test("initial run includes the start boundary, excludes older history and leaves the end boundary for next week", async () => {
  const f = fixture(), window = weeklyWindow(f.state.time);
  const found = [article(0, window.start - 1000), article(1, window.start), article(2, window.end - 1000), article(3, window.end)];
  const service = planner(f, async () => found); await service.plan({ kind: "weekly" });
  assert.deepEqual(campaign(f).articles.map(a => a.id), [found[1].id, found[2].id]);
  assert.equal(f.state.documents.has(articleKey(found[0].id)), false);
  f.state.time += week; await service.plan({ kind: "weekly" }); assert.deepEqual(campaign(f).articles.map(a => a.id), [found[3].id]);
});

test("first-run outage records the period before fetch; recovery a week later includes the missed week", async () => {
  const f = fixture(), window = weeklyWindow(f.state.time);
  const broken = createService({ ...f.deps, articles: async () => { throw new Error("synthetic-outage"); } }, f.env);
  await assert.rejects(() => broken.plan({ kind: "weekly" }));
  assert.equal(f.state.documents.get("DISCOVERY").start, window.start); assert.equal(f.state.jobs.length, 0);
  f.state.time += week;
  await planner(f, async () => [article(1)]).plan({ kind: "weekly" });
  assert.equal(campaign(f).articles[0].id, article(1).id); assert.equal(f.state.sends.length, 0);
});

test("empty, unavailable and invalid feeds cannot send cached backlog; removed public articles remain held", async () => {
  const f = fixture(), found = Array.from({ length: 11 }, (_, i) => article(i));
  await planner(f, async () => found).plan({ kind: "weekly" });
  const retained = structuredClone(pending(f)); f.state.time += week;
  for (const source of [async () => [], async () => { throw new Error("synthetic-outage"); }]) {
    f.state.jobs.length = 0;
    try { await planner(f, source).plan({ kind: "weekly" }); } catch (e) { assert.equal(e.message, "synthetic-outage"); }
    assert.equal(campaign(f), undefined); assert.deepEqual(pending(f), retained); assert.equal(f.state.jobs.length, 0);
  }
  await planner(f, async () => found.slice(0, 10)).plan({ kind: "weekly" });
  assert.equal(campaign(f), undefined); assert.deepEqual(pending(f), retained); assert.equal(f.state.sends.length, 0);
});

test("simultaneous planner invocations freeze one issue; repeated invocations reuse it without another feed fetch", async () => {
  const f = fixture(); let reads = 0;
  const service = planner(f, async () => { reads++; return Array.from({ length: 14 }, (_, i) => article(i)); });
  await Promise.all(Array.from({ length: 8 }, () => service.plan({ kind: "weekly" })));
  assert.equal(campaign(f).articles.length, 10); assert.equal(pending(f).length, 4);
  const before = structuredClone(campaign(f)), previousReads = reads;
  await service.plan({ kind: "weekly" }); assert.equal(reads, previousReads); assert.deepEqual(campaign(f), before);
  assert.equal(f.state.sends.length, 0);
});

test("lost campaign acknowledgement retries the frozen issue without consuming another ten articles", async () => {
  const f = fixture(), freeze = f.deps.store.freezeCampaign;
  let lost = true;
  f.deps.store.freezeCampaign = async row => { const result = await freeze(row); if (lost) { lost = false; throw new Error("synthetic-lost-ack"); } return result; };
  const service = planner(f, async () => Array.from({ length: 21 }, (_, i) => article(i)));
  await assert.rejects(() => service.plan({ kind: "weekly" }), /synthetic-lost-ack/);
  assert.equal(f.state.jobs.length, 0); assert.equal(campaign(f).articles.length, 10);
  await service.plan({ kind: "weekly" }); assert.equal(pending(f).length, 11); assert.equal(campaign(f).articles.length, 10);
});

test("stable GUID prevents resend after a canonical slug change; URL tombstone also protects legacy GUID changes", async () => {
  const f = fixture(); let found = [article(1)]; const service = planner(f, async () => found);
  await service.plan({ kind: "weekly" }); f.state.time += week; f.state.jobs.length = 0;
  found = [{ ...found[0], url: origin + "/new-slug" }]; await service.plan({ kind: "weekly" });
  assert.equal(campaign(f), undefined);
  found = [{ ...article(1), id: article(1).url }]; await service.plan({ kind: "weekly" });
  assert.equal(campaign(f), undefined); assert.equal(f.state.jobs.length, 0);
});

test("pending backlog uses the current public canonical URL and title, and changed publication dates fail closed", async () => {
  const f = fixture(); let found = Array.from({ length: 11 }, (_, i) => article(i));
  const service = planner(f, async () => found); await service.plan({ kind: "weekly" }); f.state.time += week;
  found = [{ ...found[10], title: "Current factual title", url: origin + "/updated-canonical" }];
  await service.plan({ kind: "weekly" }); assert.equal(campaign(f).articles[0].url, found[0].url); assert.equal(campaign(f).articles[0].title, found[0].title);
  f.state.time += week; f.state.jobs.length = 0; found = [{ ...found[0], published: found[0].published + 1000 }];
  await assert.rejects(() => service.plan({ kind: "weekly" }), /article_publication_changed/); assert.equal(f.state.jobs.length, 0);
});

test("expired delivery period does not consume new articles; disabled controls deny discovery before any feed fetch", async () => {
  const f = fixture(); let fetched = false;
  const service = planner(f, async () => { fetched = true; return [article(1)]; });
  f.state.time += 4 * 86400000; await service.plan({ kind: "weekly" });
  assert.equal(fetched, false); assert.equal(f.state.documents.has("DISCOVERY"), false);
  f.state.time -= 4 * 86400000; delete f.env.DELIVERY_ENABLED;
  await assert.rejects(() => service.plan({ kind: "weekly" }), /sending_paused/);
  assert.equal(fetched, false); assert.equal(f.state.documents.size, 1); assert.equal(f.state.sends.length, 0);
});

test("actual BatchGet adapter chunks, deduplicates and retries unprocessed public-article keys with strong consistency", async () => {
  const keys = Array.from({ length: 121 }, (_, i) => articleKey(article(i).id)); let calls = 0;
  mock.method(DynamoDBDocumentClient.prototype, "send", async command => {
    assert.ok(command instanceof BatchGetCommand); calls++;
    const request = command.input.RequestItems.synthetic; assert.equal(request.ConsistentRead, true); assert.ok(request.Keys.length <= 100);
    if (calls === 1) return { Responses: { synthetic: request.Keys.slice(1) }, UnprocessedKeys: { synthetic: { Keys: request.Keys.slice(0, 1) } } };
    return { Responses: { synthetic: request.Keys } };
  });
  try {
    const deps = createAwsDependencies({ AWS_REGION: "eu-north-1", TABLE_NAME: "synthetic" });
    const result = await deps.store.getMany([...keys, keys[0]]); assert.equal(result.size, 121); assert.equal(calls, 3);
    await assert.rejects(() => deps.store.getMany(["SUB#forbidden"]), /invalid_article_key/);
  } finally { mock.restoreAll(); }
});

test("unprocessed article reads are never mistaken for missing records", async () => {
  let calls = 0;
  mock.method(DynamoDBDocumentClient.prototype, "send", async command => { calls++; return { UnprocessedKeys: command.input.RequestItems }; });
  try {
    const deps = createAwsDependencies({ AWS_REGION: "eu-north-1", TABLE_NAME: "synthetic" });
    await assert.rejects(() => deps.store.getMany([articleKey(article(1).id)]), /article_reads_incomplete/); assert.equal(calls, 5);
  } finally { mock.restoreAll(); }
});

test("actual campaign transaction atomically owns IDs and URLs; cross-issue races and duplicate campaigns lose safely", async () => {
  const records = new Map(), a = article(1); records.set(articleKey(a.id), { ...a, state: "PENDING" });
  const commands = [];
  mock.method(DynamoDBDocumentClient.prototype, "send", async command => {
    assert.ok(command instanceof TransactWriteCommand); commands.push(command.input);
    const operations = command.input.TransactItems;
    const failed = operations.some(op => op.Put ? records.has(op.Put.Item.pk) :
      records.get(op.Update.Key.pk)?.state !== "PENDING" || records.get(op.Update.Key.pk)?.published !== op.Update.ExpressionAttributeValues[":published"]);
    if (failed) throw { name: "TransactionCanceledException", CancellationReasons: [{ Code: "ConditionalCheckFailed" }] };
    for (const op of operations) {
      if (op.Put) records.set(op.Put.Item.pk, structuredClone(op.Put.Item));
      else Object.assign(records.get(op.Update.Key.pk), { state: op.Update.ExpressionAttributeValues[":issued"], campaign: op.Update.ExpressionAttributeValues[":campaign"] });
    }
    return {};
  });
  try {
    const deps = createAwsDependencies({ AWS_REGION: "eu-north-1", TABLE_NAME: "synthetic" });
    const c = { pk: "CAMPAIGN#2026-10-26", id: "2026-10-26", articles: [a], createdAt: 1 };
    assert.deepEqual(await Promise.all([deps.store.freezeCampaign(c), deps.store.freezeCampaign({ ...c, pk: "CAMPAIGN#2026-11-02", id: "2026-11-02" })]), [true, false]);
    assert.equal(await deps.store.freezeCampaign(c), false); assert.equal(records.has("CAMPAIGN#2026-11-02"), false);
    assert.equal(records.get(articleUrlKey(a.url)).campaign, c.id);
    const ops = commands[0].TransactItems; assert.equal(ops.length, 3);
    assert.match(ops[1].Update.ConditionExpression, /#state = :pending AND #published = :published/);
    assert.equal(ops[1].Update.ExpressionAttributeNames["#published"], "published");
    assert.equal(ops[1].Update.ExpressionAttributeValues[":pending"], "PENDING");
    assert.match(ops[2].Put.ConditionExpression, /attribute_not_exists/);
  } finally { mock.restoreAll(); }
});

test("infrastructure adds only scoped article ledger access and retains all disabled defaults", () => {
  const t = JSON.parse(readFileSync(new URL("../template.json", import.meta.url)));
  const statements = t.Resources.PlannerRole.Properties.Policies[0].PolicyDocument.Statement;
  const added = statements.find(s => s.Action.includes("dynamodb:BatchGetItem"));
  assert.deepEqual(added.Resource, { "Fn::GetAtt": ["Ledger", "Arn"] });
  assert.deepEqual(added.Condition["ForAllValues:StringLike"]["dynamodb:LeadingKeys"], ["ARTICLE#*", "ARTICLE_URL#*", "CAMPAIGN#*"]);
  assert.deepEqual(added.Condition.Null, { "dynamodb:LeadingKeys": "false" });
  assert.ok(added.Action.includes("dynamodb:UpdateItem")); assert.doesNotMatch(JSON.stringify(statements), /ses:Send|DeleteItem|Scan/);
  for (const name of ["DeliveryEnabled", "RegistrationEnabled", "ConfirmationEnabled", "LegacyDispatchRetired", "ComplianceApproved"]) assert.equal(t.Parameters[name].Default, "false");
});
