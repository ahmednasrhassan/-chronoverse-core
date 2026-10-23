import { NextResponse } from "next/server";
import { client } from "@/sanity/client";
import { getNewsletterConfig, NEWSLETTER_BRAND } from "@/lib/newsletter/config";
import { deliverCampaign, digestWindow } from "@/lib/newsletter/delivery";
import { createNewsletterStore, type NewsletterArticle } from "@/lib/newsletter/store";
import { sendNewsletter } from "@/lib/newsletter/transport";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ status: "error", message: "Newsletter dispatch is not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ status: "error", message: "Unauthorized" }, { status: 401 });
  }
  try {
    const config = getNewsletterConfig();
    if (config.mode !== "digest") return NextResponse.json({ status: "skipped", message: "Digest delivery is disabled" });
    const window = digestWindow();
    const result = await deliverCampaign(createNewsletterStore(), config, {
      key: window.key,
      subject: `${NEWSLETTER_BRAND} - Research Dispatch`,
      async loadArticles() {
        const articles = await client.fetch<NewsletterArticle[]>(`*[
          _type == "post" && !(_id in path("drafts.**")) && !(_id in path("versions.**")) &&
          defined(title) && defined(slug.current) && publishedAt >= $start && publishedAt < $end
        ] | order(publishedAt desc)[0...51]{"id": _id, "revision": _rev, title, "slug": slug.current,
          "description": coalesce(seoDescription, excerpt, pt::text(body), "")}`,
          { start: window.start, end: window.end });
        if (!Array.isArray(articles)) throw new Error("Newsletter content unavailable");
        return articles;
      },
    }, sendNewsletter);
    return NextResponse.json(result, { status: result.complete ? 200 : 503 });
  } catch {
    console.error("Newsletter digest processing failed");
    return NextResponse.json({ status: "error", message: "Newsletter dispatch could not be completed" }, { status: 503 });
  }
}

export async function POST(request: Request) { return GET(request); }
