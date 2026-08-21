import { NextResponse } from "next/server";
import { generateSeoForArticle } from "@/lib/sanity/aiSeo";
import { sanityWriteClient, assertWriteTokenConfigured } from "@/lib/sanity/writeClient";

export const dynamic = "force-dynamic";

interface SeoGenerateRequestBody {
  /** Sanity document _id to generate & save SEO fields for. */
  documentId?: string;
  /** If true, only returns generated text without writing to Sanity. */
  dryRun?: boolean;
}

interface SanityPostForSeo {
  _id: string;
  title?: string;
  body?: unknown;
  bodyRaw?: string;
}

/**
 * Auto SEO & Description Generation endpoint.
 *
 * POST body: { "documentId": "<sanity-doc-id>", "dryRun"?: boolean }
 *
 * Fetches the given `post` (or `page`) document, generates a professional
 * SEO meta description and rich excerpt using AI (with an automatic local
 * fallback), and patches the document's `excerpt` and `seoDescription`
 * fields — unless `dryRun` is set, in which case it only returns the
 * generated text.
 *
 * Can also be wired up as a Sanity webhook (Settings > API > Webhooks)
 * triggered on create/update of `post` documents, sending `{ documentId: _id }`.
 */
export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as SeoGenerateRequestBody;
    const { documentId, dryRun } = payload;

    if (!documentId) {
      return NextResponse.json(
        { status: "error", message: "Missing required field: documentId" },
        { status: 400 }
      );
    }

        // if (!dryRun) {
    //   assertWriteTokenConfigured();
    // }

    const doc = await sanityWriteClient.fetch<SanityPostForSeo | null>(
      `*[_id == $id][0]{ _id, title, body, bodyRaw }`,
      { id: documentId }
    );

    if (!doc) {
      return NextResponse.json(
        { status: "error", message: `Document not found: ${documentId}` },
        { status: 404 }
      );
    }

    const seo = await generateSeoForArticle({
      title: doc.title || "Untitled",
      body: doc.body,
      bodyRaw: doc.bodyRaw,
    });

    if (!dryRun) {
      await sanityWriteClient
        .patch(documentId)
        .set({ excerpt: seo.excerpt, seoDescription: seo.seoDescription })
        .commit();
    }

    return NextResponse.json(
      {
        status: "success",
        documentId,
        applied: !dryRun,
        source: seo.source,
        excerpt: seo.excerpt,
        seoDescription: seo.seoDescription,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to generate SEO content";
    console.error("SEO Generation Webhook Error:", error);
    return NextResponse.json({ status: "error", message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json(
    {
      status: "active",
      system: "Chronoverse Capital Auto SEO & Excerpt Generator",
      usage: "POST { documentId: string, dryRun?: boolean }",
    },
    { status: 200 }
  );
}
