import "server-only";
import { createHash } from "node:crypto";
import { getNewsletterReadClient, getNewsletterWriteClient } from "./clients";
import { normalizeEmail } from "./config";
import { emailKey } from "./tokens";

export interface NewsletterArticle { id: string; revision: string; title: string; slug: string; description: string }
export interface Campaign {
  _id: string; _rev: string; _type: "newsletterCampaign";
  articles: NewsletterArticle[]; recipients: string[]; subject: string;
  complete: boolean;
}
export interface Delivery {
  _id: string; _rev: string; _type: "newsletterDelivery";
  state: "ready" | "sending" | "accepted" | "failed" | "unknown" | "suppressed";
  attempts: number; messageId?: string;
}
export type SuppressionReason = "unsubscribe" | "hard-bounce" | "complaint" | "manual";
const privateId = (prefix: string, value: string) => `${prefix}.${createHash("sha256").update(value).digest("hex")}`;
export const campaignId = (key: string) => privateId("newsletterCampaign", key);

export function createNewsletterStore(
  read = getNewsletterReadClient,
  write = getNewsletterWriteClient,
) {
  return {
    async isSuppressed(email: string): Promise<boolean> {
      return !!await read().getDocument(`newsletterSuppression.${emailKey(email)}`);
    },
    async suppress(email: string, reason: SuppressionReason) {
      // One transaction: durable suppression survives duplicate documents and
      // public repeat signup. It is never cleared by an unauthenticated call.
      await write().transaction().createIfNotExists({
        _id: `newsletterSuppression.${emailKey(email)}`, _type: "newsletterSuppression",
        reason, createdAt: new Date().toISOString(),
      }).patch({ query: '*[_type == "subscriber" && lower(email) == $email]', params: { email } },
        { set: { active: false, suppressed: true } }).commit({ visibility: "sync" });
    },
    async recipients(): Promise<string[]> {
      const records = await read().fetch<{ email: unknown }[]>(
        '*[_type == "subscriber" && active == true && suppressed != true && !(_id in path("drafts.**")) && !(_id in path("versions.**"))] | order(_id asc)[0...1001]{email}',
      );
      if (!Array.isArray(records) || records.length > 1000) throw new Error("Newsletter audience requires a reviewed batch size");
      const emails = [...new Set(records.map(record => normalizeEmail(record.email)).filter((email): email is string => email !== null))];
      const eligible: string[] = [];
      for (const email of emails) if (!await this.isSuppressed(email)) eligible.push(email);
      return eligible;
    },
    async campaign(id: string): Promise<Campaign | undefined> { return read().getDocument<Campaign>(id); },
    async createCampaign(id: string, articles: NewsletterArticle[], recipients: string[], subject: string): Promise<Campaign> {
      return write().createIfNotExists({ _id: id, _type: "newsletterCampaign" as const,
        articles, recipients, subject, complete: false, createdAt: new Date().toISOString() });
    },
    async completeCampaign(id: string) { await write().patch(id).set({ complete: true }).commit(); },
    async delivery(campaign: string, email: string): Promise<Delivery | undefined> {
      return read().getDocument<Delivery>(privateId("newsletterDelivery", `${campaign}:${email}`));
    },
    async claim(campaign: string, email: string): Promise<Delivery | null> {
      const id = privateId("newsletterDelivery", `${campaign}:${email}`);
      const doc = await write().createIfNotExists({ _id: id, _type: "newsletterDelivery" as const,
        state: "ready" as Delivery["state"], attempts: 0, campaign });
      if (!["ready", "failed"].includes(doc.state) || doc.attempts >= 3) return null;
      try {
        return await write().patch(id).ifRevisionId(doc._rev)
          .set({ state: "sending", attempts: doc.attempts + 1 }).commit<Delivery>();
      } catch (error) {
        if ((error as { statusCode?: number }).statusCode === 409) return null;
        throw error;
      }
    },
    async mark(delivery: Delivery, state: Delivery["state"], messageId?: string) {
      await write().patch(delivery._id).ifRevisionId(delivery._rev)
        .set({ state, ...(messageId ? { messageId } : {}) }).commit();
    },
  };
}

export type NewsletterStore = ReturnType<typeof createNewsletterStore>;
