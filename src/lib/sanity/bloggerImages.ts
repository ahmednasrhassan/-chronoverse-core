/**
 * Blogger Image Migration & Sync utility.
 *
 * Parses Blogger/Google-hosted image URLs from imported post/page bodies
 * (the legacy `bodyRaw` HTML field), downloads them, uploads them directly
 * to Sanity Assets, and rewrites the document's HTML to reference the new
 * Sanity CDN URLs.
 *
 * This module is consumed by:
 *  - `src/app/api/webhook/blogger-images/route.ts` (on-demand HTTP trigger)
 *  - `migrate-images.mjs` (standalone CLI script) — logic kept in sync manually
 *    since that script runs outside the Next.js/TypeScript build pipeline.
 */

import type { SanityClient } from "@sanity/client";

const BLOGGER_IMAGE_URL_REGEX =
  /https?:\/\/(?:[a-z0-9-]+\.)*(?:blogspot\.com|googleusercontent\.com|bp\.blogspot\.com)[^\s"'>]+/gi;

export interface BloggerDocument {
  _id: string;
  title?: string;
  bodyRaw?: string;
}

export interface MigrationResult {
  documentId: string;
  title: string;
  imagesFound: number;
  replacedCount: number;
}

/**
 * Extracts unique Blogger/Google-hosted image URLs from an HTML string,
 * excluding any already migrated to Sanity's CDN.
 */
export function extractBloggerImageUrls(html?: string): string[] {
  if (!html) return [];
  const matches = html.match(BLOGGER_IMAGE_URL_REGEX) || [];
  return Array.from(new Set(matches)).filter((url) => !url.includes("cdn.sanity.io"));
}

/**
 * Downloads a remote image into a Buffer with a bounded timeout so a single
 * slow/unreachable host can't stall an entire migration run.
 */
export async function downloadImageBuffer(url: string, timeoutMs = 8000): Promise<Buffer | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ChronoverseImageBot/1.0",
      },
    });

    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Downloads a single image and uploads it to Sanity Assets, returning the
 * new CDN URL (with `?auto=format`) or `null` if the download/upload failed.
 */
export async function uploadImageToSanity(client: SanityClient, url: string): Promise<string | null> {
  const buffer = await downloadImageBuffer(url);
  if (!buffer) return null;

  const filename = url.split("/").pop()?.split("?")[0] || `blogger-image-${Date.now()}.jpg`;

  try {
    const asset = await client.assets.upload("image", buffer, { filename });
    return `${asset.url}?auto=format`;
  } catch (err) {
    console.warn(`[bloggerImages] Failed to upload asset for ${url}:`, err);
    return null;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Migrates all Blogger-hosted images referenced in a single document's
 * `bodyRaw` HTML to Sanity-hosted assets and patches the document in place.
 */
export async function migrateDocumentImages(
  client: SanityClient,
  doc: BloggerDocument,
  delayMs = 200
): Promise<MigrationResult> {
  const result: MigrationResult = {
    documentId: doc._id,
    title: doc.title || doc._id,
    imagesFound: 0,
    replacedCount: 0,
  };

  if (!doc.bodyRaw) return result;

  const imageUrls = extractBloggerImageUrls(doc.bodyRaw);
  result.imagesFound = imageUrls.length;
  if (imageUrls.length === 0) return result;

  let updatedBody = doc.bodyRaw;

  for (const oldUrl of imageUrls) {
    const newUrl = await uploadImageToSanity(client, oldUrl);
    if (newUrl) {
      updatedBody = updatedBody.split(oldUrl).join(newUrl);
      result.replacedCount += 1;
    }
    await sleep(delayMs);
  }

  if (result.replacedCount > 0) {
    await client.patch(doc._id).set({ bodyRaw: updatedBody }).commit();
  }

  return result;
}

/**
 * Scans all `post` and `page` documents in the dataset and migrates any
 * Blogger-hosted images found in their `bodyRaw` fields to Sanity Assets.
 * Returns a summary of every document that had at least one image replaced.
 */
export async function migrateAllBloggerImages(client: SanityClient): Promise<MigrationResult[]> {
  const docs = await client.fetch<BloggerDocument[]>(
    `*[_type in ["post", "page"]]{ _id, title, bodyRaw }`
  );

  const results: MigrationResult[] = [];

  for (const doc of docs) {
    const result = await migrateDocumentImages(client, doc);
    if (result.replacedCount > 0) {
      results.push(result);
    }
  }

  return results;
}
