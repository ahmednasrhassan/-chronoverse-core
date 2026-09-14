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

const HTTPS_URL_REGEX = /https:\/\/[^\s"'<>)]+/gi;
const MAX_IMAGES_PER_DOCUMENT = 20;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

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
  const matches = html.match(HTTPS_URL_REGEX) || [];
  return Array.from(new Set(matches)).filter(isAllowedBloggerImageUrl);
}

export function isAllowedBloggerImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      (hostname === "blogspot.com" ||
        hostname.endsWith(".blogspot.com") ||
        hostname === "googleusercontent.com" ||
        hostname.endsWith(".googleusercontent.com"))
    );
  } catch {
    return false;
  }
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
      redirect: "error",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ChronoverseImageBot/1.0",
      },
    });

    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "";
    const contentLength = Number(response.headers.get("content-length") || "0");
    if (!contentType.toLowerCase().startsWith("image/")) return null;
    if (contentLength > MAX_IMAGE_BYTES) return null;

    if (!response.body) return null;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > MAX_IMAGE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }

    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), receivedBytes);
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

  const rawFilename = url.split("/").pop()?.split("?")[0] || "blogger-image.jpg";
  const filename = rawFilename.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 120);

  try {
    const asset = await client.assets.upload("image", buffer, { filename });
    return `${asset.url}?auto=format`;
  } catch (err) {
    console.warn(
      "[bloggerImages] Failed to upload a validated Blogger image asset:",
      err instanceof Error ? err.message : "unknown upload error",
    );
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

  const imageUrls = extractBloggerImageUrls(doc.bodyRaw).slice(0, MAX_IMAGES_PER_DOCUMENT);
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
