import "server-only";
import { NEWSLETTER_BRAND, NEWSLETTER_ORIGIN, type NewsletterConfig } from "./config";
import { createUnsubscribeToken } from "./tokens";
import { type NewsletterArticle, type NewsletterStore, campaignId } from "./store";

export class RejectedNewsletterSend extends Error {}
export interface NewsletterMessage { recipient: string; subject: string; html: string; text: string; unsubscribeUrl: string }
export type NewsletterTransport = (message: NewsletterMessage) => Promise<{ messageId: string }>;
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function buildNewsletterMessage(articles: NewsletterArticle[], email: string, subject: string, config: NewsletterConfig): NewsletterMessage {
  const token = createUnsubscribeToken(email, config.unsubscribeSecret);
  const unsubscribeUrl = `${NEWSLETTER_ORIGIN}/api/newsletter/unsubscribe?token=${token}`;
  const rows = articles.map(article => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug)) throw new Error("Invalid newsletter article");
    return `<article><h2><a href="${NEWSLETTER_ORIGIN}/${article.slug}">${escapeHtml(article.title)}</a></h2><p>${escapeHtml(article.description)}</p></article>`;
  }).join("");
  return { recipient: email, subject, unsubscribeUrl,
    html: `<html lang="en"><body><h1>${NEWSLETTER_BRAND}</h1>${rows}<footer><p>${NEWSLETTER_BRAND}<br>${escapeHtml(config.postalAddress)}</p><p>You are receiving this newsletter because you subscribed. <a href="${unsubscribeUrl}">Unsubscribe</a></p></footer></body></html>`,
    text: `${NEWSLETTER_BRAND}\n\n${articles.map(a => `${a.title}\n${a.description}\n${NEWSLETTER_ORIGIN}/${a.slug}`).join("\n\n")}\n\n${NEWSLETTER_BRAND}\n${config.postalAddress}\nUnsubscribe: ${unsubscribeUrl}`,
  };
}

export interface CampaignInput { key: string; subject: string; loadArticles(): Promise<NewsletterArticle[]> }

export async function deliverCampaign(store: NewsletterStore, config: NewsletterConfig, input: CampaignInput, send: NewsletterTransport) {
  const id = campaignId(input.key);
  let campaign = await store.campaign(id);
  if (!campaign) {
    const articles = await input.loadArticles();
    if (articles.length > 50) throw new Error("Newsletter content requires a reviewed batch size");
    if (articles.length === 0) return { status: "skipped", complete: true, accepted: 0, failed: 0, unknown: 0, pending: 0, suppressed: 0 };
    // Freeze content and audience before any send; retries use the same snapshot.
    campaign = await store.createCampaign(id, articles, await store.recipients(), input.subject);
  }
  const counts = { accepted: 0, failed: 0, unknown: 0, pending: 0, suppressed: 0 };
  for (const email of campaign.recipients) {
    const previous = await store.delivery(id, email);
    if (previous?.state === "accepted" || previous?.state === "suppressed") {
      counts[previous.state]++; continue;
    }
    const message = buildNewsletterMessage(campaign.articles, email, campaign.subject, config);
    const claim = await store.claim(id, email);
    if (!claim) {
      const current = await store.delivery(id, email);
      if (current?.state === "accepted" || current?.state === "suppressed") counts[current.state]++;
      else if (current?.state === "unknown") counts.unknown++;
      else if (current?.state === "failed") counts.failed++;
      else counts.pending++;
      continue;
    }
    // Read durable suppression immediately before handing off to SES. A read
    // failure leaves the claim held; it must never be treated as an empty list.
    let suppressed: boolean;
    try { suppressed = await store.isSuppressed(email); }
    catch (error) {
      // Nothing was handed to SES; this known preflight failure is retryable.
      await store.mark(claim, "failed"); throw error;
    }
    if (suppressed) {
      await store.mark(claim, "suppressed"); counts.suppressed++; continue;
    }
    let acknowledgement: { messageId: string };
    try {
      acknowledgement = await send(message);
      if (!acknowledgement.messageId) throw new Error("Missing SES acknowledgement");
    } catch (error) {
      // Only an explicit provider rejection is safely retryable. Timeouts,
      // dropped acknowledgements and process crashes may already have sent.
      const state = error instanceof RejectedNewsletterSend ? "failed" : "unknown";
      await store.mark(claim, state);
      counts[state]++;
      continue;
    }
    // If this write fails, state stays sending (or accepted if the response was
    // lost). Neither state can be automatically resent. No exactly-once claim.
    await store.mark(claim, "accepted", acknowledgement.messageId);
    counts.accepted++;
  }
  const complete = counts.failed + counts.unknown + counts.pending === 0;
  if (complete && !campaign.complete) await store.completeCampaign(id);
  return { status: complete ? "success" : "incomplete", complete, ...counts };
}

export function digestWindow(now = new Date()) {
  const end = new Date(now);
  end.setUTCHours(9, 0, 0, 0);
  if (now < end) end.setUTCDate(end.getUTCDate() - 1);
  return { key: `digest:${end.toISOString()}`, end: end.toISOString(), start: new Date(end.getTime() - 86_400_000).toISOString() };
}
