import { NextResponse } from "next/server";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { client } from "@/sanity/client";


/**
 * Automated Daily RSS -> Newsletter Dispatch
 * -------------------------------------------
 * Triggered daily at 09:00 UTC by Vercel Cron (see `vercel.json`).
 *
 * 1. Fetches `post` documents published in the last 24 hours from Sanity
 *    (the same underlying data source that powers `/rss.xml`).
 * 2. Fetches active subscriber emails from the `subscriber` document type
 *    in Sanity (populated by `/api/newsletter`).
 * 3. Builds a clean HTML email digest with article summaries + links.
 * 4. Sends the digest via Amazon SES from
 *    `contact@newsletter.chronoversecapital.com` — one email per
 *    subscriber (BCC-free, so no subscriber sees another's address).
 *
 * If there are no new posts, or no subscribers, the job exits early
 * without sending anything (and without treating that as an error).
 */
export const dynamic = "force-dynamic";

const BASE_URL = "https://chronoversecapital.com";
const SENDER_EMAIL =
  process.env.NEWSLETTER_SENDER_EMAIL || "contact@newsletter.chronoversecapital.com";

const sesClient = new SESClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

interface RecentPost {
  slug: string;
  title: string;
  publishedAt: string;
  seoDescription: string | null;
  excerpt: string | null;
  bodyPlainText: string | null;
  categoryTitle: string | null;
}

interface Subscriber {
  _id: string;
  email: string;
}

/** Fetches posts published within the last 24 hours, newest first. */
async function getRecentPosts(): Promise<RecentPost[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const query = `*[
      _type == "post" &&
      defined(slug.current) &&
      defined(publishedAt) &&
      publishedAt <= now() &&
      publishedAt >= $since
    ] | order(publishedAt desc) {
      "slug": slug.current,
      title,
      publishedAt,
      seoDescription,
      excerpt,
      "bodyPlainText": pt::text(body),
      "categoryTitle": category->title
    }`;

  try {
    const posts = await client.fetch<RecentPost[]>(query, { since });
    return posts || [];
  } catch (error) {
    console.warn("[send-newsletter] Failed to fetch recent Sanity posts:", error);
    return [];
  }
}

/** Fetches all active subscriber emails from Sanity. */
async function getActiveSubscribers(): Promise<Subscriber[]> {
  const query = `*[_type == "subscriber" && active != false && defined(email)]{
      _id,
      email
    }`;

  try {
    const subscribers = await client.fetch<Subscriber[]>(query);
    return subscribers || [];
  } catch (error) {
    console.warn("[send-newsletter] Failed to fetch Sanity subscribers:", error);
    return [];
  }
}

function resolveDescription(post: RecentPost): string {
  return (
    (post.seoDescription && post.seoDescription.trim()) ||
    (post.excerpt && post.excerpt.trim()) ||
    (post.bodyPlainText && post.bodyPlainText.trim().slice(0, 220) + "…") ||
    "Read the full analysis on Chronoverse Capital."
  );
}

/** Builds the shared HTML article-list body used inside every recipient's email. */
function buildArticlesHtml(posts: RecentPost[]): string {
  return posts
    .map((post) => {
      const link = `${BASE_URL}/${post.slug}`;
      const description = resolveDescription(post);
      const category = post.categoryTitle
        ? `<span style="display:inline-block;font-size:11px;color:#c87d55;background-color:#18181b;border:1px solid #c87d5540;border-radius:4px;padding:2px 8px;margin-bottom:8px;">${post.categoryTitle}</span><br/>`
        : "";

      return `
        <tr>
          <td style="padding:16px 0;border-bottom:1px solid #27272a;">
            ${category}
            <a href="${link}" style="color:#f4f4f5;font-size:17px;font-weight:600;text-decoration:none;line-height:1.4;">${post.title}</a>
            <p style="color:#a1a1aa;font-size:14px;line-height:1.5;margin:8px 0 12px 0;">${description}</p>
            <a href="${link}" style="color:#c87d55;font-size:13px;font-weight:bold;text-decoration:none;">Read Full Dispatch →</a>
          </td>
        </tr>`;
    })
    .join("");
}

/** Wraps the article list in the full HTML email template shell. */
function buildEmailHtml(posts: RecentPost[]): string {
  const articlesHtml = buildArticlesHtml(posts);
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#0a0a0a;color:#f4f4f5;padding:32px 16px;">
    <table style="max-width:600px;margin:0 auto;width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding-bottom:24px;border-bottom:1px solid #27272a;">
          <span style="color:#c87d55;font-size:12px;letter-spacing:2px;text-transform:uppercase;">// Daily Dispatch</span>
          <h1 style="font-size:24px;font-weight:bold;margin:8px 0 0 0;color:#ffffff;">Chronoverse Capital Newsletter</h1>
          <p style="color:#71717a;font-size:13px;margin:8px 0 0 0;">${today}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 0 0 0;color:#a1a1aa;font-size:14px;line-height:1.6;">
          The latest institutional market intelligence from Chronoverse Capital, delivered straight to your inbox.
        </td>
      </tr>
      ${articlesHtml}
      <tr>
        <td style="padding-top:32px;text-align:center;color:#71717a;font-size:12px;">
          You are receiving this email because you subscribed to Chronoverse Capital's newsletter.<br/>
          Chronoverse Capital LLC, 1207 Delaware Ave #1234, Wilmington, DE 19806, United States
        </td>
      </tr>
    </table>
  </div>`;
}

async function sendNewsletterToSubscriber(email: string, htmlBody: string): Promise<void> {
  const command = new SendEmailCommand({
    Source: SENDER_EMAIL,
    Destination: { ToAddresses: [email] },
    Message: {
      Subject: {
        Data: "Chronoverse Capital — Daily Market Intelligence Dispatch",
        Charset: "UTF-8",
      },
      Body: {
        Html: { Data: htmlBody, Charset: "UTF-8" },
      },
    },
  });

  await sesClient.send(command);
}

async function handleSendNewsletter(): Promise<{
  sent: number;
  failed: number;
  postsCount: number;
  subscribersCount: number;
}> {
  const [posts, subscribers] = await Promise.all([
    getRecentPosts(),
    getActiveSubscribers(),
  ]);

  if (posts.length === 0 || subscribers.length === 0) {
    return {
      sent: 0,
      failed: 0,
      postsCount: posts.length,
      subscribersCount: subscribers.length,
    };
  }

  const htmlBody = buildEmailHtml(posts);

  let sent = 0;
  let failed = 0;

  // Send sequentially to stay comfortably within SES rate limits.
  for (const subscriber of subscribers) {
    try {
      await sendNewsletterToSubscriber(subscriber.email, htmlBody);
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error(
        `[send-newsletter] Failed to send to ${subscriber.email}:`,
        error
      );
    }
  }

  return { sent, failed, postsCount: posts.length, subscribersCount: subscribers.length };
}

/**
 * Vercel Cron invokes this route via GET. Also exposed as POST for manual
 * triggering/testing.
 */
export async function GET(request: Request) {
  // Optional shared-secret guard: if `CRON_SECRET` is configured, require
  // the request to present it (Vercel Cron sends this automatically as a
  // Bearer token when the env var is set in the project).
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ status: "error", message: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await handleSendNewsletter();
    return NextResponse.json({ status: "success", ...result });
  } catch (error: unknown) {
    console.error("[send-newsletter] Execution error:", error);
    const message = error instanceof Error ? error.message : "Failed to send newsletter";
    return NextResponse.json({ status: "error", message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}


