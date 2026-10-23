import { NextResponse } from "next/server";
import { isValidSanityDocumentId, SanityWebhookRequestError, verifySanityWebhookRequest } from "@/lib/sanity/webhookSecurity";
import { client, dataset, projectId } from "@/sanity/client";
import { getNewsletterConfig, NEWSLETTER_BRAND } from "@/lib/newsletter/config";
import { deliverCampaign } from "@/lib/newsletter/delivery";
import { createNewsletterStore, type NewsletterArticle } from "@/lib/newsletter/store";
import { sendNewsletter } from "@/lib/newsletter/transport";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Existing signed create-only publication boundary remains. The durable campaign
// and recipient ledger replace a webhook-ID lease that could hide partial failure.
export async function POST(request: Request) {
  try {
    const verified = await verifySanityWebhookRequest(request, {
      secret: process.env.SANITY_WEBHOOK_SECRET, expectedProjectId: projectId, expectedDataset: dataset,
    });
    const { documentId, documentType, revision, becamePublished } = verified.payload;
    if (verified.operation !== "create" || documentType !== "post" || becamePublished !== true) {
      return NextResponse.json({ status: "skipped", message: "Not a new published post" });
    }
    if (!isValidSanityDocumentId(documentId) || documentId.startsWith("drafts.") ||
        typeof revision !== "string" || !revision || request.headers.get("sanity-document-id") !== documentId) {
      return NextResponse.json({ status: "error", message: "Invalid published post target" }, { status: 400 });
    }
    const config = getNewsletterConfig();
    if (config.mode !== "publication") return NextResponse.json({ status: "skipped", message: "Publication delivery is disabled" });
    const result = await deliverCampaign(createNewsletterStore(), config, {
      // A provider retry with a new webhook ID must not resend the same article.
      key: `publication:${documentId}`,
      subject: `${NEWSLETTER_BRAND} - New Research`,
      async loadArticles() {
        const post = await client.fetch<NewsletterArticle | null>(`*[
          _id == $id && _rev == $revision && _type == "post" && defined(title) &&
          defined(slug.current) && defined(publishedAt) && publishedAt <= now() &&
          !(_id in path("drafts.**")) && !(_id in path("versions.**"))
        ][0]{"id": _id, "revision": _rev, title, "slug": slug.current,
          "description": coalesce(seoDescription, excerpt, pt::text(body), "")}`,
          { id: documentId, revision });
        return post ? [post] : [];
      },
    }, sendNewsletter);
    return NextResponse.json(result, { status: result.complete ? 200 : 503 });
  } catch (error) {
    if (error instanceof SanityWebhookRequestError) {
      return NextResponse.json({ status: "error", message: error.message }, { status: error.status });
    }
    console.error("Newsletter publication processing failed");
    return NextResponse.json({ status: "error", message: "Publish webhook processing failed" }, { status: 503 });
  }
}
