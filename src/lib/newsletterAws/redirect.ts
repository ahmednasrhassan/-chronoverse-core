import { NEWSLETTER_AWS_ORIGIN } from "@/config/newsletterAvailability";

const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
const invalid = () => new Response("Invalid link", { status: 400, headers });
const unavailable = () => new Response("Request not recorded. Please retry or contact support for opt-out help.", { status: 503, headers });
const shape = (token: string, action: string) => token.length <= 1024 &&
  (/^v2\.[A-Za-z0-9_-]{20,900}\.[A-Za-z0-9_-]{43}$/.test(token) ||
    (action === "unsubscribe" && /^v1\.[A-Za-z0-9_-]{40,500}$/.test(token)));

function tokenFrom(request: Request, action: string, form?: URLSearchParams) {
  const url = new URL(request.url), query = url.searchParams;
  if (url.search.length > 2049 || query.getAll("token").length > 1 || (form?.getAll("token").length || 0) > 1) return "";
  const a = query.get("token"), b = form?.get("token");
  if (a !== null && b != null && a !== b) return "";
  const token = a ?? b ?? "";
  return shape(token, action) ? token : "";
}
function redirect(action: string, token: string, status: number) {
  // POST keeps the original form body/method for historical browser and
  // one-click clients. Only AWS validates the capability and records consent.
  const target = new URL(`/api/newsletter/${action}`, NEWSLETTER_AWS_ORIGIN);
  target.searchParams.set("token", token);
  return new Response(null, { status, headers: { ...headers, Location: target.href } });
}
export function managementGet(request: Request, action: "confirm" | "unsubscribe") {
  const token = tokenFrom(request, action);
  return token ? redirect(action, token, 303) : invalid();
}
export async function managementPost(request: Request, action: "confirm" | "unsubscribe") {
  try {
    if (Number(request.headers.get("content-length")) > 4096) return invalid();
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = []; let bytes = 0;
    if (reader) {
      try {
        while (true) {
          const { value, done } = await reader.read(); if (done) break;
          bytes += value.byteLength; if (bytes > 4096) return invalid(); chunks.push(value);
        }
      } finally { await reader.cancel().catch(() => {}); }
    }
    const body = Buffer.concat(chunks).toString("utf8");
    const type = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (body && type !== "application/x-www-form-urlencoded") return invalid();
    const token = tokenFrom(request, action, new URLSearchParams(body));
    return token ? redirect(action, token, 307) : invalid();
  } catch { return unavailable(); }
}
