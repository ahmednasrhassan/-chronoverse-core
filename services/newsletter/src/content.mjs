import { SignatureV4 } from "@smithy/signature-v4";
import { Sha256Node } from "@smithy/core/checksum";
import { hash } from "./domain.mjs";

export const MAX_CONTENT_BYTES = 2000000;
export function approvedArticle(article, time, end = Infinity) {
  return article?.contentManifest && Number.isSafeInteger(article.contentManifest.sequence) && article.contentManifest.sequence > 0 &&
    /^[a-f0-9]{64}$/.test(article.contentManifest.sha256 || "") && typeof article.contentManifest.versionId === "string" &&
    article.contentManifest.expiresAt > time && Number.isSafeInteger(article.published) && Number.isSafeInteger(article.approvedAt) &&
    Math.max(article.published, article.approvedAt) < end && article.approval?.approvedAt === new Date(article.approvedAt).toISOString() &&
    typeof article.approval?.approvedBy === "string" && article.provenance?.originalPublishedAt === new Date(article.published).toISOString() &&
    /^[a-f0-9]{64}$/.test(article.provenance?.evidenceSha256 || "");
}
const requireContent = ok => { if (!ok) throw new Error("invalid_content_archive"); };
const keys = (value, expected) => value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).sort().join(",") === expected.split(" ").sort().join(",");
const date = value => {
  const time = typeof value === "string" ? Date.parse(value) : NaN;
  requireContent(Number.isSafeInteger(time) && new Date(time).toISOString() === value);
  return time;
};
const text = (value, max) => typeof value === "string" && value.trim() === value && value.length > 0 &&
  value.length <= max && !/[<>\x00-\x1f\x7f]/.test(value);
function canonical(value) {
  requireContent(text(value, 2048));
  let url; try { url = new URL(value); } catch { throw new Error("invalid_content_archive"); }
  requireContent(url.protocol === "https:" && !url.username && !url.password && !url.port && !url.search && !url.hash && url.href === value);
  return value;
}

// This validates an operator-authored approval record. It does not manufacture
// consent/provenance, approve uploads, import a CMS, or publish anything.
export function parseContentManifest(raw, window, time, startAt) {
  requireContent(typeof raw === "string" && Buffer.byteLength(raw) <= MAX_CONTENT_BYTES);
  let doc; try { doc = JSON.parse(raw); } catch { throw new Error("invalid_content_archive"); }
  requireContent(keys(doc, "version sequence publicationApproved approvedBy approvedAt expiresAt articles") && doc.version === 1 &&
    Number.isSafeInteger(doc.sequence) && doc.sequence > 0 && doc.publicationApproved === true && text(doc.approvedBy, 100));
  const approved = date(doc.approvedAt), expires = date(doc.expiresAt);
  requireContent(Number.isSafeInteger(time) && Number.isSafeInteger(startAt) && startAt <= time &&
    approved <= time && expires > time && expires > approved && expires - approved <= 7 * 86400000 &&
    Array.isArray(doc.articles) && doc.articles.length <= 5000 && Number.isFinite(window?.end));
  const ids = new Set(), urls = new Set(), articles = [];
  for (const a of doc.articles) {
    requireContent(keys(a, "id url title summary publishedAt publicationApproved approvedBy approvedAt provenance") &&
      a.publicationApproved === true && text(a.id, 512) && text(a.title, 2048) && text(a.summary, 280) && text(a.approvedBy, 100) &&
      keys(a.provenance, "sourceId revision originalPublishedAt evidenceSha256") && text(a.provenance.sourceId, 200) &&
      text(a.provenance.revision, 200) && /^[a-f0-9]{64}$/.test(a.provenance.evidenceSha256));
    if (!/^urn:chronoverse:article:[A-Za-z0-9_.-]+$/.test(a.id)) canonical(a.id);
    const url = canonical(a.url), published = date(a.publishedAt), approvedAt = date(a.approvedAt);
    requireContent(a.provenance.originalPublishedAt === a.publishedAt && approvedAt <= approved && !ids.has(a.id) && !urls.has(url));
    ids.add(a.id); urls.add(url);
    // Approval cannot backdate eligibility, nor resurrect pre-cutover articles.
    if (published >= startAt && Math.max(published, approvedAt) < window.end) articles.push({
      id: a.id, url, title: a.title, summary: a.summary, published, approvedAt,
      approval: { approvedBy: a.approvedBy, approvedAt: a.approvedAt }, provenance: a.provenance,
    });
  }
  articles.sort((a, b) => a.published - b.published || a.id.localeCompare(b.id, "en"));
  return { sequence: doc.sequence, approvedAt: approved, expiresAt: expires, approvedBy: doc.approvedBy, articles };
}

export async function readContentObject(env, credentials, fetcher = fetch) {
  const bucket = env.CONTENT_BUCKET, key = env.CONTENT_MANIFEST_KEY, owner = env.CONTENT_BUCKET_OWNER;
  if (env.AWS_REGION !== "eu-north-1" || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket || "") ||
      !/^[A-Za-z0-9][A-Za-z0-9/_.-]{0,400}$/.test(key || "") || key.split("/").some(x => !x || x === "." || x === "..") ||
      !/^\d{12}$/.test(owner || "")) throw new Error("content_not_configured");
  const hostname = `${bucket}.s3.eu-north-1.amazonaws.com`, path = `/${key.split("/").map(encodeURIComponent).join("/")}`;
  const signer = new SignatureV4({ service: "s3", region: "eu-north-1", credentials, sha256: Sha256Node, uriEscapePath: false });
  const request = await signer.sign({ method: "GET", protocol: "https:", hostname, path, query: {},
    headers: { host: hostname, "x-amz-expected-bucket-owner": owner } });
  const response = await fetcher(`https://${hostname}${path}`, { method: "GET", headers: request.headers,
    redirect: "error", signal: AbortSignal.timeout(10000) });
  const versionId = response.headers.get("x-amz-version-id");
  if (response.status !== 200 || !/^application\/json(?:;|$)/i.test(response.headers.get("content-type") || "") ||
      !versionId || versionId === "null" || versionId.length > 1024 || Number(response.headers.get("content-length")) > MAX_CONTENT_BYTES || !response.body) throw new Error("content_unavailable");
  const reader = response.body.getReader(), chunks = []; let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.length; if (bytes > MAX_CONTENT_BYTES) throw new Error("invalid_content_archive"); chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return { raw: new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)), versionId };
}

export function createContentSource(env, store, credentials, now = Date.now, read = readContentObject) {
  return async window => {
    const control = await store.get("CONTROL");
    if (control?.contentSourceApproved !== true || !Number.isSafeInteger(control.contentStartAt)) throw new Error("content_not_approved");
    const { raw, versionId } = await read(env, credentials);
    const parsed = parseContentManifest(raw, window, now(), control.contentStartAt);
    const observation = { sequence: parsed.sequence, sha256: hash(raw), versionId,
      approvedAt: parsed.approvedAt, expiresAt: parsed.expiresAt, approvedBy: parsed.approvedBy,
      bucket: env.CONTENT_BUCKET, key: env.CONTENT_MANIFEST_KEY };
    if (!await store.acceptContentManifest(observation)) throw new Error("content_rollback_or_conflict");
    return parsed.articles.map(article => ({ ...article, contentManifest: observation }));
  };
}
