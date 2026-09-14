import { NextResponse } from "next/server";

import {
  migrateDocumentImages,
  type BloggerDocument,
} from "@/lib/sanity/bloggerImages";
import { getSanityWriteClient } from "@/lib/sanity/writeClient";
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
import { dataset, projectId } from "@/sanity/client";

export const dynamic = "force-dynamic";

interface BloggerImageWebhookPayload extends Record<string, unknown> {
  documentId?: unknown;
  documentType?: unknown;
  revision?: unknown;
}

const ALLOWED_DOCUMENT_TYPES = new Set(["post", "page"]);

/**
 * Signed, single-document Blogger image migration webhook.
 *
 * Configure the Sanity webhook with a secret and this projection:
 * {"documentId": _id, "documentType": _type, "revision": _rev}
 */
export async function POST(request: Request) {
  let lease: SanityWebhookLease | null = null;
  let operationStarted = false;

  try {
    const verified = await verifySanityWebhookRequest<BloggerImageWebhookPayload>(
      request,
      {
        secret: process.env.SANITY_WEBHOOK_SECRET,
        expectedProjectId: projectId,
        expectedDataset: dataset,
      },
    );

    if (verified.operation !== "create" && verified.operation !== "update") {
      return NextResponse.json(
        { status: "skipped", message: "Unsupported document operation" },
        { status: 200 },
      );
    }

    const { documentId, documentType, revision } = verified.payload;
    if (
      !isValidSanityDocumentId(documentId) ||
      !ALLOWED_DOCUMENT_TYPES.has(String(documentType)) ||
      typeof revision !== "string" ||
      !revision ||
      request.headers.get("sanity-document-id") !== documentId
    ) {
      return NextResponse.json(
        { status: "error", message: "Invalid migration target" },
        { status: 400 },
      );
    }

    const sanityWriteClient = getSanityWriteClient();
    lease = await beginSanityWebhookOperation(
      "blogger-images",
      verified.idempotencyKey,
    );
    if (!lease) {
      return NextResponse.json(
        { status: "skipped", message: "Webhook delivery already processed" },
        { status: 200 },
      );
    }

    const doc = await sanityWriteClient.fetch<BloggerDocument | null>(
      `*[_id == $id && _type == $documentType && _rev == $revision][0]{ _id, title, bodyRaw }`,
      { id: documentId, documentType, revision },
    );

    if (!doc) {
      await lease.complete();
      return NextResponse.json(
        { status: "skipped", message: "Migration target is no longer current" },
        { status: 200 },
      );
    }

    operationStarted = true;
    const result = await migrateDocumentImages(sanityWriteClient, doc);
    await lease.complete();
    return NextResponse.json(
      { status: "success", results: [result] },
      { status: 200 },
    );
  } catch (error: unknown) {
    if (lease && !operationStarted) {
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
      "[webhook/blogger-images] Migration failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return NextResponse.json(
      { status: "error", message: "Blogger image migration failed" },
      { status: 500 },
    );
  }
}
