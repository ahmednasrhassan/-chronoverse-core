import { NextResponse } from "next/server";
import {
  migrateAllBloggerImages,
  migrateDocumentImages,
  type BloggerDocument,
} from "@/lib/sanity/bloggerImages";
import { sanityWriteClient, assertWriteTokenConfigured } from "@/lib/sanity/writeClient";

export const dynamic = "force-dynamic";

interface BloggerImageMigrationRequestBody {
  /** If provided, only migrate images for this single document. */
  documentId?: string;
}

/**
 * Blogger Image Migration & Sync endpoint.
 *
 * POST body (optional): { "documentId": "<sanity-doc-id>" }
 *
 * - Without a body / with an empty body: scans every `post`/`page`
 *   document, parses Blogger/Google-hosted image URLs out of `bodyRaw`,
 *   downloads and re-uploads them to Sanity Assets, and rewrites the
 *   document's HTML to reference the new Sanity CDN URLs.
 * - With `documentId`: performs the same migration for just that document.
 */
export async function POST(request: Request) {
  try {
    assertWriteTokenConfigured();

    let body: BloggerImageMigrationRequestBody = {};
    try {
      body = (await request.json()) as BloggerImageMigrationRequestBody;
    } catch {
      // Empty body is fine — treat as "migrate all".
    }

    if (body.documentId) {
      const doc = await sanityWriteClient.fetch<BloggerDocument | null>(
        `*[_id == $id][0]{ _id, title, bodyRaw }`,
        { id: body.documentId }
      );

      if (!doc) {
        return NextResponse.json(
          { status: "error", message: `Document not found: ${body.documentId}` },
          { status: 404 }
        );
      }

      const result = await migrateDocumentImages(sanityWriteClient, doc);
      return NextResponse.json({ status: "success", results: [result] }, { status: 200 });
    }

    const results = await migrateAllBloggerImages(sanityWriteClient);

    return NextResponse.json(
      {
        status: "success",
        documentsUpdated: results.length,
        results,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to migrate Blogger images";
    console.error("Blogger Image Migration Webhook Error:", error);
    return NextResponse.json({ status: "error", message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json(
    {
      status: "active",
      system: "Chronoverse Capital Blogger Image Migration & Sync",
      usage: "POST {} to migrate all documents, or { documentId: string } for a single document",
    },
    { status: 200 }
  );
}
