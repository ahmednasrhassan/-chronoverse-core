/**
 * Server-side Sanity client authenticated with a write token.
 * Used by API route handlers (SEO generation, Blogger image migration)
 * that need to mutate documents/assets. Must never be imported into
 * client-side ("use client") code.
 */
import { createClient } from "@sanity/client";
import { projectId, dataset, apiVersion } from "@/sanity/client";

const token = process.env.SANITY_API_WRITE_TOKEN || process.env.SANITY_API_TOKEN;

export const sanityWriteClient = createClient({
  projectId,
  dataset,
  apiVersion,
  token,
  useCdn: false,
});

export function assertWriteTokenConfigured(): void {
  if (!token) {
    throw new Error(
      "Missing SANITY_API_WRITE_TOKEN (or SANITY_API_TOKEN) environment variable required for write operations."
    );
  }
}
