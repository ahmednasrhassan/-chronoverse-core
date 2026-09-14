import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { NextResponse } from "next/server";

import { generateExecutiveSummary } from "@/lib/executiveSummary";
import {
  isValidSanityDocumentId,
  SanityWebhookRequestError,
  verifySanityWebhookRequest,
} from "@/lib/sanity/webhookSecurity";
import {
  beginSanityWebhookOperation,
  SanityWebhookReplayError,
  type SanityWebhookLease,
} from "@/lib/sanity/webhookReplay";
import { client, dataset, projectId } from "@/sanity/client";

export const dynamic = "force-dynamic";

const BASE_URL = "https://chronoversecapital.com";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface SanityPublishWebhookPayload extends Record<string, unknown> {
  documentId?: unknown;
  documentType?: unknown;
  revision?: unknown;
  becamePublished?: unknown;
}

interface PublishedPost {
  _id: string;
  title: string;
  slug: string;
  publishedAt: string;
  excerpt: string | null;
  seoDescription: string | null;
  categoryTitle: string | null;
  tags: string[] | null;
  bodyPlainText: string | null;
}

interface Subscriber {
  email: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}

async function fetchPublishedPost(
  documentId: string,
  revision: string,
): Promise<PublishedPost | null> {
  return client.fetch<PublishedPost | null>(
    `*[
      _id == $id &&
      _rev == $revision &&
      _type == "post" &&
      defined(title) &&
      defined(slug.current) &&
      defined(publishedAt) &&
      publishedAt <= now() &&
      !(_id in path("drafts.**"))
    ][0]{
      _id,
      title,
      "slug": slug.current,
      publishedAt,
      excerpt,
      seoDescription,
      "categoryTitle": category->title,
      tags,
      "bodyPlainText": pt::text(body)
    }`,
    { id: documentId, revision },
  );
}

async function fetchActiveSubscribers(): Promise<string[]> {
  const subscribers = await client.fetch<Subscriber[]>(
    `*[_type == "subscriber" && active != false && defined(email)] | order(_id asc)[0...1000]{email}`,
  );
  const emails = subscribers
    .map(({ email }) => (typeof email === "string" ? email.trim().toLowerCase() : ""))
    .filter((email) => EMAIL_REGEX.test(email));
  return Array.from(new Set(emails));
}

function resolveSummaryPoints(post: PublishedPost): string[] {
  if (post.excerpt?.trim()) return [post.excerpt.trim()];
  if (post.seoDescription?.trim()) return [post.seoDescription.trim()];
  return generateExecutiveSummary(
    post.title,
    post.categoryTitle || undefined,
    post.bodyPlainText || undefined,
    post.tags || [],
  );
}

function buildArticleEmailHtml(post: PublishedPost, articleUrl: string): string {
  const summaryPoints = resolveSummaryPoints(post).map(escapeHtml);
  const summaryHtml =
    summaryPoints.length === 1
      ? `<p style="color:#CFC5B8;font-size:15px;line-height:1.6;margin:0 0 24px 0;">${summaryPoints[0]}</p>`
      : `<ul style="color:#CFC5B8;font-size:15px;line-height:1.6;margin:0 0 24px 0;padding-left:20px;">${summaryPoints.map((point) => `<li style="margin-bottom:8px;">${point}</li>`).join("")}</ul>`;
  const category = post.categoryTitle
    ? `<span style="display:inline-block;font-size:11px;color:#C8A7E8;margin-bottom:12px;text-transform:uppercase;">${escapeHtml(post.categoryTitle)}</span>`
    : "";

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#050506;color:#F3EBDD;padding:32px 16px;">
    <table style="max-width:600px;margin:0 auto;width:100%;border-collapse:collapse;">
      <tr><td style="padding-bottom:24px;border-bottom:1px solid #292432;"><strong>Chronoverse Capital</strong></td></tr>
      <tr><td style="padding:28px 0 0 0;">${category}<h2><a href="${articleUrl}" style="color:#ffffff;text-decoration:none;">${escapeHtml(post.title)}</a></h2>${summaryHtml}<a href="${articleUrl}" style="color:#C8A7E8;">Read Full Article →</a></td></tr>
      <tr><td style="padding-top:40px;text-align:center;color:#91889A;font-size:12px;">You are receiving this email because you subscribed to Chronoverse Capital's newsletter.</td></tr>
    </table>
  </div>`;
}

async function broadcastToSubscribers(
  post: PublishedPost,
  emails: string[],
): Promise<{ sent: number; failed: number; total: number }> {
  const sender =
    process.env.NEWSLETTER_FROM_EMAIL ||
    process.env.NEWSLETTER_SENDER_EMAIL ||
    "contact@newsletter.chronoversecapital.com";
  const articleUrl = `${BASE_URL}/${post.slug}`;
  const html = buildArticleEmailHtml(post, articleUrl);
  const sesClient = new SESClient({ region: process.env.AWS_REGION || "us-east-1" });
  let sent = 0;
  let failed = 0;

  for (const email of emails) {
    try {
      await sesClient.send(
        new SendEmailCommand({
          Source: sender,
          Destination: { ToAddresses: [email] },
          Message: {
            Subject: {
              Data: `New Dispatch: ${post.title} — Chronoverse Capital`,
              Charset: "UTF-8",
            },
            Body: { Html: { Data: html, Charset: "UTF-8" } },
          },
        }),
      );
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error(
        "[webhook/sanity] Failed to send one article email:",
        error instanceof Error ? error.message : "unknown SES error",
      );
    }
  }

  return { sent, failed, total: emails.length };
}

/**
 * Configure this signed Sanity webhook for `post` creates only, with drafts
 * and versions disabled, and projection:
 * {"documentId": _id, "documentType": _type, "revision": _rev,
 *  "becamePublished": before() == null && defined(after().publishedAt)}
 */
export async function POST(request: Request) {
  let lease: SanityWebhookLease | null = null;
  let deliveryStarted = false;

  try {
    const verified = await verifySanityWebhookRequest<SanityPublishWebhookPayload>(
      request,
      {
        secret: process.env.SANITY_WEBHOOK_SECRET,
        expectedProjectId: projectId,
        expectedDataset: dataset,
      },
    );
    const { documentId, documentType, revision, becamePublished } =
      verified.payload;

    if (
      verified.operation !== "create" ||
      documentType !== "post" ||
      becamePublished !== true
    ) {
      return NextResponse.json(
        { status: "skipped", message: "Not a new published post" },
        { status: 200 },
      );
    }

    if (
      !isValidSanityDocumentId(documentId) ||
      documentId.startsWith("drafts.") ||
      typeof revision !== "string" ||
      !revision ||
      request.headers.get("sanity-document-id") !== documentId
    ) {
      return NextResponse.json(
        { status: "error", message: "Invalid published post target" },
        { status: 400 },
      );
    }

    const [post, subscribers] = await Promise.all([
      fetchPublishedPost(documentId, revision),
      fetchActiveSubscribers(),
    ]);
    if (!post || !SLUG_REGEX.test(post.slug)) {
      return NextResponse.json(
        { status: "skipped", message: "Published post is unavailable or stale" },
        { status: 200 },
      );
    }
    if (subscribers.length === 0) {
      return NextResponse.json(
        { status: "skipped", message: "No active subscribers" },
        { status: 200 },
      );
    }

    lease = await beginSanityWebhookOperation("publish", verified.idempotencyKey);
    if (!lease) {
      return NextResponse.json(
        { status: "skipped", message: "Webhook delivery already processed" },
        { status: 200 },
      );
    }

    deliveryStarted = true;
    const result = await broadcastToSubscribers(post, subscribers);
    await lease.complete();
    return NextResponse.json({ status: "success", ...result }, { status: 200 });
  } catch (error: unknown) {
    if (lease && !deliveryStarted) {
      await lease.release().catch(() => undefined);
    }

    if (error instanceof SanityWebhookRequestError) {
      return NextResponse.json(
        { status: "error", message: error.message },
        { status: error.status },
      );
    }
    if (error instanceof SanityWebhookReplayError) {
      return NextResponse.json(
        { status: "error", message: error.message },
        { status: 503 },
      );
    }

    console.error(
      "[webhook/sanity] Verified delivery failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return NextResponse.json(
      { status: "error", message: "Publish webhook processing failed" },
      { status: 500 },
    );
  }
}
