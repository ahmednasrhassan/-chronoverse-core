import { hash } from "./domain.mjs";

export const articleKey = id => `ARTICLE#${hash(id)}`;
export const articleUrlKey = url => `ARTICLE_URL#${hash(url)}`;

// Approved articles only: no scan or subscriber access. Retained PENDING rows
// are reconsidered only while still present in the current approved archive.
export async function initializeDiscovery(store, window, time) {
  await store.putAbsent({ pk: "DISCOVERY", start: window.start, createdAt: time });
  const origin = await store.get("DISCOVERY");
  if (!Number.isFinite(origin?.start) || origin.start > window.start) throw new Error("invalid_discovery_state");
  return origin;
}

export async function discoverCampaign(store, window, found, time) {
  const origin = await initializeDiscovery(store, window, time);
  const eligible = found.filter(article => article.published >= origin.start && article.published < window.end);
  const keys = eligible.flatMap(article => [articleKey(article.id), articleUrlKey(article.url)]);
  let records = await store.getMany(keys);
  // Conditional inserts preserve every excess article, including partial runs.
  for (let offset = 0; offset < eligible.length; offset += 8) {
    await Promise.all(eligible.slice(offset, offset + 8).map(async article => {
      const pk = articleKey(article.id);
      if (!records.has(pk) && !records.has(articleUrlKey(article.url))) {
        await store.putAbsent({ pk, ...article, state: "PENDING", discoveredAt: time });
      }
    }));
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    // Strong reads plus the transaction prevent stale reads or simultaneous
    // planners from assigning the same ID/canonical URL to different issues.
    records = await store.getMany(keys);
    const selected = eligible.filter(article => {
      const record = records.get(articleKey(article.id));
      if (record && record.published !== article.published) throw new Error("article_publication_changed");
      if (record?.provenance && (record.provenance.originalPublishedAt !== article.provenance?.originalPublishedAt ||
          record.provenance.sourceId !== article.provenance?.sourceId)) throw new Error("article_provenance_changed");
      return record?.state === "PENDING" && !records.has(articleUrlKey(article.url));
    }).sort((a, b) => a.published - b.published || a.id.localeCompare(b.id, "en")).slice(0, 10);
    if (!selected.length) return undefined;
    const campaign = { pk: `CAMPAIGN#${window.id}`, ...window, articles: selected, createdAt: time };
    if (await store.freezeCampaign(campaign)) return campaign;
    const existing = await store.get(campaign.pk);
    if (existing) return existing;
  }
  throw new Error("planner_retry_required");
}
