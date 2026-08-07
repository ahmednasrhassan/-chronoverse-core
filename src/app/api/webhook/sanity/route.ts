import { NextResponse } from "next/server";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { sanityWriteClient } from "@/lib/sanity/writeClient";
import { generateExecutiveSummary } from "@/lib/executiveSummary";

/**
 * Sanity "Publish" Webhook -> Amazon SES Broadcast
 * -------------------------------------------------
 * Configure this endpoint in Sanity (Manage Project > API > Webhooks) to
 * fire on `create`/`update` of `post` documents (filter: `_type == "post"`),
 * with a projection that includes at least `_id` and `_type` — e.g.:
 *
 *   { "_id": _id, "_type": _type, "slug": slug.current }
 *
 * On receipt, this route:
 *   1. Re-fetches the full post from Sanity (never trusts webhook payload
 *      body directly — Sanity webhooks can be configured with partial
 *      projections and may be stale/replayed).
 *   2. Skips silently (200 OK) if the document isn't a published `post`.
 *   3. Builds a branded "Chronoverse Capital" HTML email containing the
 *      article title, an auto-generated executive summary, and a direct
 *      link to the live article.
 *   4. Parses `SUBSCRIBER_EMAILS` (comma-separated) from the environment
 *      and dispatches one email per subscriber via Amazon SES.
 *
 * Error handling philosophy: a failure to send to any single subscriber
 * (or even a total configuration failure) must never crash the route or
 * cause Sanity to treat the webhook as failed/retry indefinitely — so all
 * errors are caught, logged, and the route still resolves with HTTP 200.
 */
export const dynamic = "force-dynamic";

const BASE_URL = "https://www.chronoversecapital.com";
const SENDER_EMAIL =
  process.env.NEWSLETTER_SENDER_EMAIL || "contact@newsletter.chronoversecapital.com";

const sesClient = new SESClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

interface SanityWebhookPayload {
  _id?: string;
  _type?: string;
  slug?: string | { current?: string };
}

interface PublishedPost {
  _id: string;
  title: string;
  slug: string;
  publishedAt: string | null;
  excerpt: string | null;
  seoDescription: string | null;
  categoryTitle: string | null;
  tags: string[] | null;
  bodyPlainText: string | null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Parses the comma-separated `SUBSCRIBER_EMAILS` env var into a clean, de-duplicated list of valid addresses. */
function getSubscriberEmailsFromEnv(): string[] {
  const raw = process.env.SUBSCRIBER_EMAILS || "";

  const emails = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0 && EMAIL_REGEX.test(e));

  return Array.from(new Set(emails));
}

/** Re-fetches the canonical post document from Sanity by `_id`, never trusting the raw webhook payload. */
async function fetchPublishedPost(documentId: string): Promise<PublishedPost | null> {
  const query = `*[_id == $id && _type == "post" && defined(slug.current) && defined(publishedAt) && publishedAt <= now()][0]{
      _id,
      title,
      "slug": slug.current,
      publishedAt,
      excerpt,
      seoDescription,
      "categoryTitle": category->title,
      tags,
      "bodyPlainText": pt::text(body)
    }`;

  try {
    const post = await sanityWriteClient.fetch<PublishedPost | null>(query, { id: documentId });
    return post || null;
  } catch (error) {
    console.error("[webhook/sanity] Failed to fetch post from Sanity:", error);
    return null;
  }
}

/** Resolves a one-paragraph description for the email preview text (excerpt/seoDescription first, AI summary fallback). */
function resolveSummaryPoints(post: PublishedPost): string[] {
  if (post.excerpt && post.excerpt.trim()) {
    return [post.excerpt.trim()];
  }
  if (post.seoDescription && post.seoDescription.trim()) {
    return [post.seoDescription.trim()];
  }

  return generateExecutiveSummary(
    post.title,
    post.categoryTitle || undefined,
    post.bodyPlainText || undefined,
    post.tags || []
  );
}

/** Builds the branded "Chronoverse Capital" HTML email template for a single article. */
function buildArticleEmailHtml(post: PublishedPost, articleUrl: string): string {
  const summaryPoints = resolveSummaryPoints(post);

  const summaryHtml =
    summaryPoints.length === 1
      ? `<p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 24px 0;">${summaryPoints[0]}</p>`
      : `<ul style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 24px 0;padding-left:20px;">
          ${summaryPoints.map((point) => `<li style="margin-bottom:8px;">${point}</li>`).join("")}
        </ul>`;

  const category = post.categoryTitle
    ? `<span style="display:inline-block;font-size:11px;color:#c87d55;background-color:#18181b;border:1px solid #c87d5540;border-radius:4px;padding:3px 10px;margin-bottom:12px;letter-spacing:1px;text-transform:uppercase;">${post.categoryTitle}</span>`
    : "";

  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#0a0a0a;color:#f4f4f5;padding:32px 16px;">
    <table style="max-width:600px;margin:0 auto;width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding-bottom:24px;border-bottom:1px solid #27272a;">
          <span style="color:#c87d55;font-size:12px;letter-spacing:2px;text-transform:uppercase;">// New Dispatch</span>
          <h1 style="font-size:22px;font-weight:bold;margin:8px 0 0 0;color:#ffffff;">Chronoverse Capital</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 0 0 0;">
          ${category}
          <h2 style="font-size:24px;font-weight:700;line-height:1.35;margin:0 0 16px 0;color:#ffffff;">
            <a href="${articleUrl}" style="color:#ffffff;text-decoration:none;">${post.title}</a>
          </h2>
          ${summaryHtml}
          <a href="${articleUrl}" style="display:inline-block;background-color:#c87d55;color:#0a0a0a;font-size:14px;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:6px;">Read Full Article →</a>
        </td>
      </tr>
      <tr>
        <td style="padding-top:40px;text-align:center;color:#71717a;font-size:12px;">
          You are receiving this email because you subscribed to Chronoverse Capital's newsletter.<br/>
          Chronoverse Capital LLC, 1207 Delaware Ave #1234, Wilmington, DE 19806, United States
        </td>
      </tr>
    </table>
  </div>`;
}

async function sendArticleEmail(email: string, subject: string, html: string): Promise<void> {
  const command = new SendEmailCommand({
    Source: SENDER_EMAIL,
    Destination: { ToAddresses: [email] },
    Message: {
      Subject: { Data: subject, Charset: "UTF-8" },
      Body: { Html: { Data: html, Charset: "UTF-8" } },
    },
  });

  await sesClient.send(command);
}

/** Dispatches the article email to every subscriber, isolating failures so one bad address never blocks the rest. */
async function broadcastToSubscribers(
  post: PublishedPost,
  articleUrl: string
): Promise<{ sent: number; failed: number; total: number }> {
  const subscribers = getSubscriberEmailsFromEnv();

  if (subscribers.length === 0) {
    console.warn("[webhook/sanity] SUBSCRIBER_EMAILS is empty or unset — no emails dispatched.");
    return { sent: 0, failed: 0, total: 0 };
  }

  const subject = `New Dispatch: ${post.title} — Chronoverse Capital`;
  const html = buildArticleEmailHtml(post, articleUrl);

  let sent = 0;
  let failed = 0;

  for (const email of subscribers) {
    try {
      await sendArticleEmail(email, subject, html);
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error(`[webhook/sanity] Failed to send article email to ${email}:`, error);
    }
  }

  return { sent, failed, total: subscribers.length };
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as SanityWebhookPayload;

    if (!payload?._id) {
      return NextResponse.json(
        { status: "skipped", message: "Missing document _id in webhook payload" },
        { status: 200 }
      );
    }

    if (payload._type && payload._type !== "post") {
      return NextResponse.json(
        { status: "skipped", message: `Ignoring non-post document type: ${payload._type}` },
        { status: 200 }
      );
    }

    const post = await fetchPublishedPost(payload._id);

    if (!post) {
      return NextResponse.json(
        {
          status: "skipped",
          message: "Document is not a published post, or could not be fetched from Sanity",
        },
        { status: 200 }
      );
    }

    const articleUrl = `${BASE_URL}/${post.slug}`;
    const result = await broadcastToSubscribers(post, articleUrl);

    return NextResponse.json(
      {
        status: "success",
        message: "Sanity publish webhook processed",
        article: { id: post._id, title: post.title, url: articleUrl },
        ...result,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    // Never let a failure here surface as a non-200 — Sanity webhooks may
    // retry aggressively on non-2xx responses, and a single malformed
    // payload or transient AWS/Sanity error should not trigger retry storms.
    console.error("[webhook/sanity] Unhandled error while processing webhook:", error);
    const message = error instanceof Error ? error.message : "Failed to process Sanity webhook";
    return NextResponse.json({ status: "error", message }, { status: 200 });
  }
}

export async function GET() {
  return NextResponse.json(
    {
      status: "active",
      system: "Chronoverse Capital Sanity Publish -> SES Broadcast Webhook",
      endpoint: "https://www.chronoversecapital.com/api/webhook/sanity",
      usage: "POST { _id: string, _type?: string } — configure as a Sanity webhook on post publish/update.",
    },
    { status: 200 }
  );
}
