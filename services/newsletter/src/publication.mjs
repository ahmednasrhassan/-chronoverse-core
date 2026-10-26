import { hash, SendCapacityUnavailable } from "./domain.mjs";

// This names a source policy, never a person or an assertion of human identity.
export const PUBLICATION_POLICY = "sanity-published-state-v1";
export const PUBLICATION_STATE = "PUBLICATION#STATE";
export const PUBLICATION_MAX_AGE = 3600000;
export const publicationKey = id => `PUBLICATION#ARTICLE#${hash(id)}`;
export const isPublicationArticle = article => article?.approval?.approvedBy === PUBLICATION_POLICY;
export class PublicationUnavailable extends SendCapacityUnavailable {}

export async function assertPublicationCurrent(store, articles, time, end) {
  const managed = articles.filter(isPublicationArticle);
  if (!managed.length) return;
  const head = await store.get(PUBLICATION_STATE), control = await store.get("CONTROL");
  if (control?.sanityPublishedStateApproved !== true || control?.contentSourceApproved !== true ||
      head?.cutover !== control.contentStartAt || head?.status !== "READY" || !Number.isSafeInteger(head.sequence) || head.sequence < 1 ||
      !Number.isSafeInteger(head.lastSuccessfulAt) || head.lastSuccessfulAt < end || head.lastSuccessfulAt > time ||
      time - head.lastSuccessfulAt > PUBLICATION_MAX_AGE) throw new PublicationUnavailable();
  for (const article of managed) {
    const row = await store.get(publicationKey(article.id));
    if (row?.active !== true || row.cutover !== head.cutover || row.article?.url !== article.url ||
        row.article?.publishedAt !== article.provenance?.originalPublishedAt ||
        row.article?.provenance?.revision !== article.provenance?.revision ||
        row.article?.provenance?.evidenceSha256 !== article.provenance?.evidenceSha256 ||
        head.sequence < article.contentManifest?.sequence) throw new PublicationUnavailable();
  }
  // A poll beginning or committing during these reads invalidates this check.
  const latest = await store.get(PUBLICATION_STATE);
  if (latest?.status !== "READY" || latest.sequence !== head.sequence || latest.owner !== head.owner) throw new PublicationUnavailable();
}
