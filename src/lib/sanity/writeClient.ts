import "server-only";

import { createClient } from "@sanity/client";
import { projectId, dataset, apiVersion } from "@/sanity/client";

export function assertWriteTokenConfigured(): void {
  const token = process.env.SANITY_API_WRITE_TOKEN || process.env.SANITY_API_TOKEN;

  if (!token) {
    throw new Error(
      "Missing SANITY_API_WRITE_TOKEN (or SANITY_API_TOKEN) environment variable required for write operations."
    );
  }
}

/**
 * Returns a server-only Sanity client after validating every piece of
 * configuration needed for a mutation. Keeping construction behind this
 * function prevents a route from accidentally using an unauthenticated
 * client when a token assertion is forgotten.
 */
export function getSanityWriteClient() {
  assertWriteTokenConfigured();

  const token = process.env.SANITY_API_WRITE_TOKEN || process.env.SANITY_API_TOKEN;
  return createClient({
    projectId,
    dataset,
    apiVersion,
    token,
    useCdn: false,
  });
}
