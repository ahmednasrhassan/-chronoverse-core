import { XMLParser, XMLValidator } from "fast-xml-parser";
import { FEED, ORIGIN, escapeHtml } from "./domain.mjs";

export const MAX_FEED_BYTES = 2000000;
const plain = value => String(value || "").replace(/<[^>]*>/g, " ").replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim();
const canonical = value => {
  if (typeof value !== "string") throw new Error("invalid_feed");
  const url = new URL(value);
  if (url.origin !== ORIGIN || url.username || url.password || url.search || url.hash ||
      !/^\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(url.pathname) || url.href !== value) throw new Error("invalid_feed");
  return url.href;
};
// Parse the complete archive. Selection belongs to the durable planner, not a
// transient seven-day filter or feed-size truncation that could lose backlog.
export function parseArticles(xml, end) {
  if (!Number.isFinite(end) || Buffer.byteLength(xml) > MAX_FEED_BYTES || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error("invalid_feed");
  const parsed = new XMLParser({ ignoreAttributes: false, processEntities: true, parseTagValue: false }).parse(xml);
  const channel = parsed.rss?.channel;
  if (parsed.rss?.["@_version"] !== "2.0" || !channel || typeof channel.title !== "string" ||
      channel.link !== `${ORIGIN}/` || typeof channel.description !== "string") throw new Error("invalid_feed");
  const entries = channel.item;
  if (entries === undefined) return [];
  const unique = new Map();
  const urls = new Set();
  const candidates = [];
  if ((Array.isArray(entries) ? entries.length : 1) > 5000) throw new Error("invalid_feed");
  for (const item of Array.isArray(entries) ? entries : [entries]) {
    const url = canonical(item.link);
    const id = typeof item.guid === "string" ? item.guid : item.guid?.["#text"];
    if (typeof id !== "string" || !id || id.length > 512 || typeof item.title !== "string" ||
        !item.title.trim() || item.title.length > 2048 || typeof item.pubDate !== "string" ||
        !/^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(item.pubDate) ||
        (item.description !== undefined && typeof item.description !== "string")) throw new Error("invalid_feed");
    if (!/^urn:chronoverse:article:[a-zA-Z0-9_.-]+$/.test(id)) canonical(id); // Original permalink GUIDs remain readable.
    const published = Date.parse(item.pubDate);
    if (!Number.isFinite(published) || new Date(published).toUTCString() !== item.pubDate) throw new Error("invalid_feed");
    if (published >= end) continue; // Half-open weekly periods: [start, end).
    candidates.push({ id, title: item.title.trim(), summary: plain(item.description).slice(0, 280), url, published });
  }
  candidates.sort((a, b) => a.published - b.published || a.id.localeCompare(b.id, "en") || a.url.localeCompare(b.url, "en"));
  for (const article of candidates) {
    const previous = unique.get(article.id);
    if (previous && (previous.url !== article.url || previous.published !== article.published)) throw new Error("invalid_feed");
    if (previous || urls.has(article.url)) continue;
    unique.set(article.id, article); urls.add(article.url);
  }
  return [...unique.values()];
}
export async function fetchArticles(window, fetcher = fetch) {
  const response = await fetcher(FEED, { redirect: "error", signal: AbortSignal.timeout(10000), headers: { Accept: "application/rss+xml, application/xml" } });
  if (response.status !== 200 || !/^(?:application\/(?:rss\+xml|xml)|text\/xml)(?:;|$)/i.test(response.headers.get("content-type") || "") ||
      Number(response.headers.get("content-length")) > MAX_FEED_BYTES || !response.body) throw new Error("feed_unavailable");
  const reader = response.body.getReader(); const chunks = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length; if (length > MAX_FEED_BYTES) throw new Error("invalid_feed"); chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return parseArticles(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)), window.end);
}
export function digestMessage(articles, postalAddress, unsubscribeUrl) {
  const rows = articles.map(a => `<article><h2><a href="${escapeHtml(a.url)}">${escapeHtml(a.title)}</a></h2><p>${escapeHtml(a.summary)}</p></article>`).join("");
  return {
    unsubscribeUrl,
    subject: "Chronoverse Capital — weekly research",
    html: `<!doctype html><html lang="en"><body><h1>Chronoverse Capital</h1>${rows}<footer><p>${escapeHtml(postalAddress)}</p><p>You confirmed a subscription to our weekly research newsletter.</p><p><a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe permanently</a> · <a href="{{amazonSESUnsubscribeUrl}}">SES subscription preferences</a></p></footer></body></html>`,
    text: `Chronoverse Capital\n\n${articles.map(a => `${a.title}\n${a.summary}\n${a.url}`).join("\n\n")}\n\n${postalAddress}\nUnsubscribe permanently: ${unsubscribeUrl}\nSES subscription preferences: {{amazonSESUnsubscribeUrl}}`,
  };
}
