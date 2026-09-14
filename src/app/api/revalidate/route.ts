import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  SanityWebhookRequestError,
  verifySanityWebhookRequest,
} from "@/lib/sanity/webhookSecurity";
import { dataset, projectId } from "@/sanity/client";

interface SanityRevalidationPayload extends Record<string, unknown> {
  _type?: unknown;
  slug?: unknown;
}

const REVALIDATED_TYPES = new Set(["post", "page", "category"]);
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Configure with the shared Sanity webhook secret and a projection that
 * supplies `_type` and `slug.current` (using before() for deletes).
 */
export async function POST(request: Request) {
  try {
    const { payload } =
      await verifySanityWebhookRequest<SanityRevalidationPayload>(request, {
        secret: process.env.SANITY_WEBHOOK_SECRET,
        expectedProjectId: projectId,
        expectedDataset: dataset,
      });

    if (typeof payload._type !== "string" || !REVALIDATED_TYPES.has(payload._type)) {
      return NextResponse.json(
        { revalidated: false, message: "Unsupported document type" },
        { status: 200 },
      );
    }

    const slug =
      typeof payload.slug === "string" && SLUG_PATTERN.test(payload.slug)
        ? payload.slug
        : null;

    revalidatePath("/");
    revalidatePath("/reports");
    revalidatePath("/archive");
    revalidatePath("/sitemap.xml");
    revalidatePath("/feed.xml");
    revalidatePath("/rss.xml");

    if (slug && (payload._type === "post" || payload._type === "page")) {
      revalidatePath(`/${slug}`);
    } else {
      revalidatePath("/[slug]", "page");
    }

    revalidatePath("/category/[slug]", "page");

    return NextResponse.json({ revalidated: true, slug });
  } catch (error) {
    if (error instanceof SanityWebhookRequestError) {
      return NextResponse.json(
        { revalidated: false, message: error.message },
        { status: error.status },
      );
    }

    console.error(
      "[Sanity revalidate] Verified request failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return NextResponse.json(
      { revalidated: false, message: "Error revalidating" },
      { status: 500 },
    );
  }
}
