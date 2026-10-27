import { createRssResponse } from "@/lib/seo/rss-response";

// Successful public responses have a bounded cache; source failures are no-store.
export const dynamic = "force-dynamic";

export async function GET() {
  return createRssResponse();
}
