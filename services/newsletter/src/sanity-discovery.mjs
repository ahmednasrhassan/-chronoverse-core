import { hash, nonce, weeklyWindow } from "./domain.mjs";
import { parseContentManifest, MAX_CONTENT_BYTES } from "./content.mjs";
import { PUBLICATION_POLICY, publicationKey } from "./publication.mjs";
import { articleKey } from "./discovery.mjs";
import { legacyExclusionIds, legacyPublicationExcluded } from "./legacy-exclusions.mjs";

export const LOOKBACK_MS = 35 * 86400000;
export const MAX_PUBLICATIONS = 40;
const PAGE = 20, MAX_SCAN = 80;
const ID = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;
const iso = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) &&
  Number.isSafeInteger(Date.parse(value)) && new Date(Date.parse(value)).toISOString().slice(0, 19) === value.slice(0, 19);
const publicId = id => typeof id === "string" && id.length <= 128 && ID.test(id) && !/^(?:drafts|versions)\./.test(id);
const reserved = new Set("about account api apps archive auth billing category contact cookie-policy data-sources disclaimer dmca editorial-policy faq feed.xml freshness intelligence manifesto markets methodology newsletter premium pricing privacy-policy products reports refund-policy social-image research robots.txt rss.xml sitemap.xml sponsors studio terms-of-service vip".split(" "));
const plain = value => typeof value === "string" ? value.replace(/<[^>]*>/g, " ").replace(/[<>\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim() : "";
const fail = message => { throw new Error(message); };
const stable = docs => JSON.stringify(docs.map(doc => Object.fromEntries(Object.keys(doc).sort().map(key => [key, doc[key]]))));
export function discoveryConfig(env) {
  if (env.AWS_REGION !== "eu-north-1" || !/^[a-z0-9]{1,30}$/.test(env.SANITY_PROJECT_ID || "") ||
      !/^[a-z0-9][a-z0-9_-]{0,31}$/.test(env.SANITY_DATASET || "")) fail("publication_not_configured");
  let origin; try { origin = new URL(env.ARTICLE_ORIGIN); } catch { fail("publication_not_configured"); }
  if (origin.protocol !== "https:" || origin.origin !== env.ARTICLE_ORIGIN || origin.username || origin.password || origin.port) fail("publication_not_configured");
  return { project: env.SANITY_PROJECT_ID, dataset: env.SANITY_DATASET, origin: origin.origin };
}

export async function boundedText(response, limit) {
  if (!response.body || Number(response.headers.get("content-length")) > limit) fail("publication_response_limit");
  const reader = response.body.getReader(), parts = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length; if (size > limit) fail("publication_response_limit"); parts.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts));
}

// No tokens, drafts, previews, history endpoints, mutations or CDN are used.
export async function queryPublications(config, { since, cutover, known }, fetcher = fetch,
  { wait = ms => new Promise(resolve => setTimeout(resolve, ms)), deadline = Date.now() + 90000 } = {}) {
  const excluded = legacyExclusionIds(config);
  const filter = `_type == "post" && !(_id in path("drafts.**")) && !(_id in path("versions.**")) && !(_id in $legacyExcluded) &&
    ((defined(publishedAt) && publishedAt >= $since && publishedAt >= $cutover && publishedAt <= now()) || _id in $known)`;
  const query = `{"total":count(*[${filter}]),"items":*[${filter} && _id > $cursor] | order(_id asc)[0...${PAGE}]{
    _id,_type,_rev,_createdAt,_updatedAt,"slug":slug.current,title,publishedAt,seoDescription,excerpt,"bodyPlainText":pt::text(body)}}`;
  let total, cursor = ""; const docs = [];
  do {
    const url = new URL(`https://${config.project}.api.sanity.io/v2024-03-01/data/query/${config.dataset}`);
    for (const [key, value] of Object.entries({ query, perspective: "published", $cursor: JSON.stringify(cursor),
      $since: JSON.stringify(since), $cutover: JSON.stringify(cutover), $known: JSON.stringify(known), $legacyExcluded: JSON.stringify(excluded) })) url.searchParams.set(key, value);
    let response;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (Date.now() + 7000 > deadline) fail("publication_scan_timeout");
      try { response = await fetcher(url.href, { method: "GET", headers: { accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(7000) }); }
      catch (error) { if (attempt === 2) throw error; await wait(250 * 2 ** attempt); continue; }
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) break;
      const delay = Math.min(2000, Math.max(250, Number(response.headers.get("retry-after")) * 1000 || 250 * 2 ** attempt));
      await response.body?.cancel(); await wait(delay);
    }
    if (!response || response.status !== 200 || !/^application\/json(?:;|$)/i.test(response.headers.get("content-type") || "")) fail("publication_source_unavailable");
    const body = JSON.parse(await boundedText(response, 512000)), result = body.result;
    if (body.error || !result || !Number.isSafeInteger(result.total) || result.total < 0 || result.total > MAX_SCAN || !Array.isArray(result.items)) fail("publication_scan_incomplete");
    total ??= result.total;
    if (result.total !== total || result.items.length !== Math.min(PAGE, total - docs.length)) fail("publication_scan_incomplete");
    for (const doc of result.items) {
      if (!publicId(doc?._id) || doc._type !== "post" || doc._id <= cursor) fail("publication_document_invalid");
      cursor = doc._id; docs.push(doc);
    }
  } while (docs.length < total);
  return docs;
}

function validDocument(doc, time) {
  if (!publicId(doc?._id) || doc._type !== "post" || typeof doc._rev !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(doc._rev) ||
      !iso(doc._createdAt) || !iso(doc._updatedAt) || Date.parse(doc._createdAt) > Date.parse(doc._updatedAt) || Date.parse(doc._updatedAt) > time) fail("publication_document_invalid");
}
export function publicationArticle(doc, previous, config, cutover, time) {
  validDocument(doc, time);
  if (legacyPublicationExcluded(config, doc._id)) return undefined;
  if (previous?.active === false) return undefined; // Unpublication is permanent for this identity, never an implicit republish.
  if (previous && (previous.cutover !== cutover || !iso(doc.publishedAt) || previous.article.publishedAt !== new Date(doc.publishedAt).toISOString() ||
      previous.createdAt !== doc._createdAt)) fail("publication_identity_changed");
  // Creation can predate publication (including drafts created before cutover).
  // The integrity-pinned original 72-ID baseline above independently prevents
  // legacy date edits or republication from admitting historical articles.
  if (!iso(doc.publishedAt) || Date.parse(doc.publishedAt) < cutover || Date.parse(doc.publishedAt) > time ||
      typeof doc.slug !== "string" || doc.slug.length > 96 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(doc.slug) || reserved.has(doc.slug) ||
      !plain(doc.title) || typeof doc.title !== "string" || /[<>\x00-\x1f\x7f]/.test(doc.title) || doc.title.trim() !== doc.title || doc.title.length > 2048) return undefined;
  if (previous && (Date.parse(previous.updatedAt) > Date.parse(doc._updatedAt) ||
      (previous.updatedAt === doc._updatedAt && previous.article.provenance.revision !== doc._rev))) fail("publication_revision_regression");
  const evidenceSha256 = hash(JSON.stringify({ project: config.project, dataset: config.dataset, document: stable([doc]) }));
  if (previous?.article.provenance.revision === doc._rev && previous.article.provenance.evidenceSha256 !== evidenceSha256) fail("publication_revision_conflict");
  // This policy uses the actual published revision timestamp and declared
  // scheduled date. AWS observation time is retained separately in the ledger;
  // neither value is a claim about a human approver or first Publish history.
  const approvedAt = previous?.article.provenance.revision === doc._rev ? previous.article.approvedAt :
    new Date(Math.max(Date.parse(doc.publishedAt), Date.parse(doc._updatedAt))).toISOString();
  return { id: `urn:chronoverse:article:${doc._id}`, url: `${config.origin}/${doc.slug}`, title: doc.title,
    summary: plain(doc.seoDescription || doc.excerpt || doc.bodyPlainText).slice(0, 280) || doc.title.slice(0, 280),
    publishedAt: new Date(doc.publishedAt).toISOString(), publicationApproved: true, approvedBy: PUBLICATION_POLICY, approvedAt,
    provenance: { sourceId: `sanity:${config.project}/${config.dataset}:${doc._id}`, revision: doc._rev,
      originalPublishedAt: new Date(doc.publishedAt).toISOString(), evidenceSha256 } };
}

export async function discoverPublications(deps, env) {
  const config = discoveryConfig(env), { store, object, now = Date.now, query = queryPublications } = deps;
  if (env.DELIVERY_ENABLED !== "true" || env.LEGACY_DISPATCH_RETIRED !== "true" || env.COMPLIANCE_APPROVED !== "true") fail("publication_paused");
  legacyExclusionIds(config); // Verify source binding before any ledger access/lease.
  const control = await store.get("CONTROL"), started = now(), cutover = control?.contentStartAt;
  if (control?.contentSourceApproved !== true || control?.sanityPublishedStateApproved !== true || !Number.isSafeInteger(cutover) || cutover > started) fail("publication_not_approved");
  const owner = nonce(), head = await store.begin(owner, started), source = hash(JSON.stringify(config));
  try {
    if (head.lastSuccessfulAt > started) fail("publication_observation_regression");
    if (head.cutover !== undefined && head.cutover !== cutover) fail("publication_cutover_changed");
    if (head.source !== undefined && head.source !== source) fail("publication_source_changed");
    if (started - (head.lastSuccessfulAt ?? cutover) > LOOKBACK_MS) fail("publication_catchup_limit");
    await object.versioning();
    const old = await object.read((head.sequence || 0) === 0);
    let existing;
    if (old) {
      existing = JSON.parse(old.raw);
      const observed = Date.parse(existing.approvedAt);
      if (!Number.isSafeInteger(observed) || observed > started || existing.approvedBy !== PUBLICATION_POLICY) fail("publication_source_mismatch");
      parseContentManifest(old.raw, { end: observed + 1 }, observed, cutover);
      if (existing.articles.some(a => a.provenance.sourceId !== `sanity:${config.project}/${config.dataset}:${a.id.slice("urn:chronoverse:article:".length)}` ||
          !a.url.startsWith(`${config.origin}/`))) fail("publication_source_mismatch");
      if (existing.sequence < (head.sequence || 0) || (existing.sequence === head.sequence &&
          (head.sha256 !== hash(old.raw) || head.versionId !== old.versionId))) fail("publication_object_regression");
    } else if (head.sequence) fail("publication_object_missing");
    const known = (existing?.articles || []).map(a => a.id.slice("urn:chronoverse:article:".length));
    if (known.some(id => !publicId(id)) || known.length > MAX_PUBLICATIONS) fail("publication_scan_limit");
    const options = { since: new Date(Math.max(cutover, started - LOOKBACK_MS)).toISOString(), cutover: new Date(cutover).toISOString(), known };
    // Two bounded, complete reads detect cursor movement/concurrent source edits.
    const first = await query(config, options), docs = await query(config, options);
    if (!Array.isArray(first) || !Array.isArray(docs) || stable(first) !== stable(docs)) fail("publication_source_changed");
    if (!Array.isArray(docs) || docs.length > MAX_SCAN) fail("publication_scan_limit");
    const byId = new Map();
    for (const doc of docs) { validDocument(doc, now()); if (byId.has(doc._id)) fail("publication_scan_incomplete"); byId.set(doc._id, doc); }
    const articles = [], approvedTime = now();
    for (const id of [...new Set([...known, ...byId.keys()])].sort()) {
      const articleId = `urn:chronoverse:article:${id}`, key = publicationKey(articleId), prior = await store.get(key), doc = byId.get(id);
      if (prior?.observedAt > started) fail("publication_observation_regression");
      let article = doc ? publicationArticle(doc, prior, config, cutover, approvedTime) : undefined;
      if (article && Date.parse(article.publishedAt) < started - LOOKBACK_MS) {
        if (!prior) article = undefined;
        else {
          // Prune only identities already assigned to an expired immutable
          // issue. Unassigned old backlog is an incident, never a silent drop.
          const ledger = await store.get(articleKey(article.id));
          if (ledger?.state !== "ISSUED" || !/^\d{4}-\d{2}-\d{2}$/.test(ledger.campaign || "")) fail("publication_backlog_expired");
          const end = Date.parse(`${ledger.campaign}T09:00:00.000Z`);
          if (!Number.isSafeInteger(end) || end > started) fail("publication_backlog_expired");
          if (started - end > 72 * 3600000) article = undefined;
        }
      }
      if (article) articles.push(article);
      if (prior || article) await store.observe({ pk: key, version: (prior?.version || 0) + 1, cutover,
        createdAt: prior?.createdAt || doc._createdAt, updatedAt: doc?._updatedAt || prior.updatedAt,
        observedAt: started, active: Boolean(article), article: article || prior.article }, prior?.version);
    }
    if (articles.length > MAX_PUBLICATIONS || new Set(articles.map(a => a.url)).size !== articles.length) fail("publication_manifest_limit");
    const manifest = { version: 1, sequence: (existing?.sequence || 0) + 1, publicationApproved: true, approvedBy: PUBLICATION_POLICY,
      approvedAt: new Date(approvedTime).toISOString(), expiresAt: new Date(approvedTime + 7 * 86400000).toISOString(), articles };
    const raw = JSON.stringify(manifest);
    if (Buffer.byteLength(raw) > MAX_CONTENT_BYTES) fail("publication_manifest_limit");
    parseContentManifest(raw, { end: approvedTime + 1 }, approvedTime, cutover);
    const latest = await store.get("CONTROL");
    if (latest?.contentStartAt !== cutover || latest?.contentSourceApproved !== true || latest?.sanityPublishedStateApproved !== true) fail("publication_not_approved");
    await store.owned(owner, now());
    const stored = await object.write(raw, old?.etag); // Atomic S3 If-Match / If-None-Match; no blind overwrite.
    await store.initDiscovery(Math.min(cutover, weeklyWindow(approvedTime).start), approvedTime); // The real cutover still filters every source article; never reset an existing origin.
    await store.finish(owner, { sequence: manifest.sequence, source, cutover, lastSuccessfulAt: started, sha256: hash(raw), versionId: stored.versionId }, now());
    return { articles: articles.length, sequence: manifest.sequence };
  } catch (error) { await store.fail(owner).catch(() => {}); throw error; }
}
