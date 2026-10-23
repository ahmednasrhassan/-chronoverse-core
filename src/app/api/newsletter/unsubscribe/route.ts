import { unsubscribeSecret } from "@/lib/newsletter/config";
import { createNewsletterStore } from "@/lib/newsletter/store";
import { readUnsubscribeToken } from "@/lib/newsletter/tokens";
import { boundedText } from "@/lib/newsletter/body";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow",
  "Content-Security-Policy": "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" };

// GET never changes data: email scanners/prefetchers cannot opt someone out.
export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token") || "";
    if (!readUnsubscribeToken(token, unsubscribeSecret())) return new Response("Invalid unsubscribe link", { status: 400, headers });
    return new Response(`<!doctype html><html lang="en"><title>Unsubscribe | Chronoverse Capital</title><meta name="referrer" content="no-referrer"><body><h1>Unsubscribe</h1><form method="post"><input type="hidden" name="token" value="${token}"><button type="submit">Confirm unsubscribe</button></form></body></html>`,
      { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
  } catch { return new Response("Unsubscribe is temporarily unavailable", { status: 503, headers }); }
}

export async function POST(request: Request) {
  try {
    const body = await boundedText(request, 4096);
    if (body === null) return new Response("Invalid request", { status: 400, headers });
    const token = new URL(request.url).searchParams.get("token") || new URLSearchParams(body).get("token") || "";
    const email = readUnsubscribeToken(token, unsubscribeSecret());
    if (!email) return new Response("Invalid unsubscribe link", { status: 400, headers });
    await createNewsletterStore().suppress(email, "unsubscribe");
    return new Response("Unsubscribe recorded", { headers });
  } catch { return new Response("Unsubscribe could not be completed. Please try again.", { status: 503, headers }); }
}
