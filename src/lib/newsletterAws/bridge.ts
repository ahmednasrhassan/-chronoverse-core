import "server-only";
import { createHash } from "node:crypto";
import { siteConfig } from "@/config/siteConfig";
import { NEWSLETTER_SIGNUPS_PAUSED } from "@/config/newsletterAvailability";

const origin = "https://chronoversecapital.com";
export const managementHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow",
  "Content-Security-Policy": "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" };
export const unavailable = () => new Response(`We could not confirm that your request was recorded. Please try again or contact ${siteConfig.contactEmail} for opt-out help.`, { status: 503, headers: managementHeaders });
const tokenFormat = (token: string) => /^v1\.[A-Za-z0-9_-]{40,500}$/.test(token) || /^v2\.[A-Za-z0-9_-]{20,900}\.[A-Za-z0-9_-]{43}$/.test(token);
function managementToken(request: Request, form?: URLSearchParams): string {
  const url = new URL(request.url), query = url.searchParams;
  if (url.search.length > 2049 || query.getAll("token").length > 1 || (form?.getAll("token").length || 0) > 1) return "";
  const queryToken = query.get("token"), formToken = form?.get("token");
  // Original browser forms repeat the same capability in the URL and body.
  // Preserve that format, but never choose between conflicting identities.
  if (queryToken !== null && formToken != null && queryToken !== formToken) return "";
  return queryToken ?? formToken ?? "";
}

async function boundedBody(request: Pick<Request, "headers" | "body">): Promise<string> {
  if (Number(request.headers.get("content-length")) > 4096) throw new Error("invalid_request");
  if (!request.body) return "";
  const reader = request.body.getReader(); const decoder = new TextDecoder(); let result = ""; let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength; if (bytes > 4096) throw new Error("invalid_request"); result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally { await reader.cancel().catch(() => {}); }
}
async function forward(action: string, body: object) {
  const url = new URL(process.env.NEWSLETTER_AWS_API_URL || "");
  const bridgeKey = process.env.NEWSLETTER_AWS_BRIDGE_KEY;
  if (url.protocol !== "https:" || !/^[a-z0-9]+\.execute-api\.[a-z0-9-]+\.amazonaws\.com$/.test(url.hostname) ||
      url.username || url.password || url.port || !["", "/"].includes(url.pathname) || url.search || url.hash || !bridgeKey || Buffer.byteLength(bridgeKey) < 32) throw new Error("not_configured");
  url.pathname = `/${action}`;
  const response = await fetch(url, { method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12000),
    headers: { "content-type": "application/json", "x-newsletter-bridge": bridgeKey }, body: JSON.stringify(body) });
  if (response.status === 400) return new Response("Invalid or expired link/request. Contact support for opt-out help.", { status: 400, headers: managementHeaders });
  if (!response.ok) return unavailable();
  const result = JSON.parse(await boundedBody(response)) as { code?: unknown };
  const expected = { subscribe: "check_inbox_if_eligible", confirm: "subscription_confirmed", unsubscribe: "unsubscribe_recorded" }[action];
  if (result.code !== expected) return unavailable();
  if (action === "subscribe") return Response.json({ status: "pending", message: "If eligible, check your inbox and confirm your subscription." }, { status: 202, headers: managementHeaders });
  return new Response(action === "unsubscribe" ? "Unsubscribe recorded" : "Subscription confirmed", { headers: managementHeaders });
}
export function managementGet(request: Request, action: "confirm" | "unsubscribe") {
  const token = managementToken(request);
  if (!tokenFormat(token) || (action === "confirm" && !token.startsWith("v2."))) return new Response(`Invalid link. Contact ${siteConfig.contactEmail} for opt-out help.`, { status: 400, headers: managementHeaders });
  // GET never contacts storage, consumes a capability, or changes subscription state.
  const label = action === "confirm" ? "Confirm subscription" : "Confirm unsubscribe";
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${label} | Chronoverse Capital</title></head><body><main><h1>${label}</h1><p>Your request is recorded only after confirmation succeeds.</p><form method="post"><input type="hidden" name="token" value="${token}"><button type="submit">${label}</button></form><p>For opt-out help: <a href="mailto:${siteConfig.contactEmail}">${siteConfig.contactEmail}</a>.</p></main></body></html>`, { headers: { ...managementHeaders, "Content-Type": "text/html; charset=utf-8" } });
}
export async function managementPost(request: Request, action: "confirm" | "unsubscribe") {
  try {
    const raw = await boundedBody(request);
    const token = managementToken(request, new URLSearchParams(raw));
    if (!tokenFormat(token) || (action === "confirm" && !token.startsWith("v2."))) return new Response("Invalid link", { status: 400, headers: managementHeaders });
    return await forward(action, { token });
  } catch { return unavailable(); }
}
export async function subscribe(request: Request) {
  if (NEWSLETTER_SIGNUPS_PAUSED) return Response.json({ status: "paused", code: "newsletter_signups_paused", message: "Newsletter signups are temporarily paused." }, { status: 503, headers: managementHeaders });
  if (request.headers.get("origin") !== origin || !request.headers.get("content-type")?.startsWith("application/json")) return new Response("Invalid request", { status: 400, headers: managementHeaders });
  try {
    const body = JSON.parse(await boundedBody(request)) as { email?: unknown; consent?: unknown };
    if (typeof body.email !== "string" || body.consent !== true) return new Response("Explicit consent is required", { status: 400, headers: managementHeaders });
    const ip = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
    const key = process.env.NEWSLETTER_AWS_BRIDGE_KEY;
    if (!ip || !key) return unavailable();
    return await forward("subscribe", { email: body.email, consent: true, consentVersion: "weekly-research-v1",
      consentText: "I agree to receive the free weekly Chronoverse Capital research newsletter. I can unsubscribe at any time.",
      clientFingerprint: createHash("sha256").update(`${key}:${ip}`).digest("hex") });
  } catch { return unavailable(); }
}
