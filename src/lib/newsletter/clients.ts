import "server-only";
import { createClient } from "@sanity/client";
import { projectId, dataset, apiVersion } from "@/sanity/client";

function newsletterClient(kind: "READ" | "WRITE") {
  const token = process.env[`SANITY_NEWSLETTER_${kind}_TOKEN`];
  if (!token) throw new Error("Newsletter storage is not configured");
  // No fallback to a general editor/admin token. The owner must provision
  // scoped roles; code cannot narrow privileges of an existing bearer token.
  return createClient({ projectId, dataset, apiVersion, token, useCdn: false,
    perspective: "raw", timeout: 10_000, maxRetries: 0 });
}

export const getNewsletterReadClient = () => newsletterClient("READ");
export const getNewsletterWriteClient = () => newsletterClient("WRITE");
