import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { buildRssXml, type RssArticle } from "../rss";
import { createRssResponse, GET } from "@/app/rss.xml/route";
import { freshClient } from "@/sanity/client";

const date = new Date("2026-10-24T12:00:00Z");
const post = (id: string, overrides: Partial<RssArticle> = {}): RssArticle => ({
  _id: id, slug: `article-${id}`, title: 'Research & <facts> "quoted"', publishedAt: "2026-10-20T12:00:00Z",
  seoDescription: "<p>Plain <strong>research</strong> &amp; facts.</p>", excerpt: null, bodyPlainText: null,
  bodyRaw: null, categoryTitle: "Macro & Rates", authorName: "Research team", ...overrides,
});
function entries(xml: string) {
  assert.equal(XMLValidator.validate(xml), true);
  const parsed = new XMLParser({ ignoreAttributes: false, parseTagValue: false }).parse(xml);
  const items = parsed.rss.channel.item;
  return items === undefined ? [] : Array.isArray(items) ? items : [items];
}

test("RSS is valid XML with stable opaque GUIDs, canonical links, original dates and plain descriptions", () => {
  const xml = buildRssXml([post("stable-id")], date), [item] = entries(xml);
  assert.equal(item.guid["#text"], "urn:chronoverse:article:stable-id"); assert.equal(item.guid["@_isPermaLink"], "false");
  assert.equal(item.link, "https://chronoversecapital.com/article-stable-id");
  assert.equal(item.title, 'Research & <facts> "quoted"'); assert.equal(item.pubDate, "Tue, 20 Oct 2026 12:00:00 GMT");
  assert.equal(item.description, "Plain research & facts."); assert.doesNotMatch(xml, /<strong>|<p>/);
  const renamed = entries(buildRssXml([post("stable-id", { slug: "changed-public-slug" })], date))[0];
  assert.equal(renamed.guid["#text"], item.guid["#text"]); assert.notEqual(renamed.link, item.link);
});

test("RSS excludes drafts, release versions, future/missing dates, reserved/redirect roots and unsafe slugs", () => {
  const invalid = [post("drafts.hidden"), post("versions.release.hidden"), post("future", { publishedAt: "2026-10-25T00:00:00Z" }),
    post("missing-date", { publishedAt: null }), post("bad-date", { publishedAt: "invalid" }), post("empty-title", { title: " " }),
    post("redirect", { slug: "research" }), post("retired", { slug: "markets" }), post("reserved", { slug: "newsletter" }),
    post("unsafe", { slug: "../account" }), post("absolute", { slug: "https://evil.example/path" })];
  const items = entries(buildRssXml([post("published"), ...invalid], date));
  assert.equal(items.length, 1); assert.equal(items[0].guid["#text"], "urn:chronoverse:article:published");
});

test("RSS removes duplicate records and produces identical ordering from unordered query results", () => {
  const posts = [post("b"), post("a"), post("copy", { slug: "article-a" }), post("b"),
    post("recent", { publishedAt: "2026-10-23T00:00:00Z" })];
  const first = buildRssXml(posts, date); assert.equal(first, buildRssXml([...posts].reverse(), date));
  assert.deepEqual(entries(first).map(item => item.guid["#text"]), ["urn:chronoverse:article:recent", "urn:chronoverse:article:a", "urn:chronoverse:article:b"]);
});

test("RSS exposes the complete public archive beyond 50 articles and represents an empty archive honestly", () => {
  assert.equal(entries(buildRssXml(Array.from({ length: 61 }, (_, i) => post(String(i))), date)).length, 61);
  assert.equal(entries(buildRssXml([], date)).length, 0);
  assert.throws(() => buildRssXml(Array.from({ length: 5001 }, (_, i) => post(String(i))), date));
});

test("XML escaping removes invalid XML 1.0 controls without permitting markup injection", () => {
  const xml = buildRssXml([post("escaping", { title: `A${String.fromCharCode(0)} & <facts>`, authorName: `B${String.fromCharCode(0xffff)}` })], date);
  const [item] = entries(xml); assert.equal(item.title, "A & <facts>"); assert.equal(item["dc:creator"], "B");
});

test("successful RSS uses a bounded public cache; content failures return uncacheable 503", async () => {
  const success = await createRssResponse(async () => [post("cache")]);
  assert.equal(success.status, 200); assert.equal(success.headers.get("cache-control"), "public, max-age=0, s-maxage=300, must-revalidate");
  entries(await success.text());
  const failure = await createRssResponse(async () => { throw new Error("synthetic outage"); });
  assert.equal(failure.status, 503); assert.equal(failure.headers.get("cache-control"), "no-store"); assert.doesNotMatch(await failure.text(), /<rss/);
});

test("native RSS loader uses an anonymous fresh public-post query without a 50-item limit or data cache", async () => {
  const calls: { query: string; options: unknown }[] = [];
  mock.method(freshClient, "fetch", async (query: string, _params: unknown, options: unknown) => {
    calls.push({ query, options }); return [post("native")];
  });
  try {
    const response = await GET(); assert.equal(response.status, 200); assert.equal(entries(await response.text()).length, 1);
    assert.equal(calls.length, 1); assert.match(calls[0].query, /_type == "post"/); assert.match(calls[0].query, /publishedAt <= now\(\)/);
    assert.match(calls[0].query, /drafts\.\*\*/); assert.match(calls[0].query, /versions\.\*\*/); assert.doesNotMatch(calls[0].query, /\[0\.\.\.50\]/);
    assert.deepEqual(calls[0].options, { cache: "no-store" });
  } finally { mock.restoreAll(); }
});
