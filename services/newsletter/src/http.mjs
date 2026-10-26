import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { CONSENT_TEXT, CONSENT_VERSION, assertConfirmationAllowed, escapeHtml } from "./domain.mjs";

export const securityHeaders = { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex, nofollow",
  "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" };
export function publicOrigin(env) {
  let url; try { url = new URL(env.PUBLIC_ORIGIN); } catch { throw new Error("not_configured"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash ||
      !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(url.hostname) || env.PUBLIC_ORIGIN !== url.origin) throw new Error("not_configured");
  return url.origin;
}
const html = (statusCode, title, body) => ({ statusCode, headers: { ...securityHeaders, "content-type": "text/html; charset=utf-8" },
  body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} | Chronoverse Capital</title></head><body><main><h1>${title}</h1>${body}</main></body></html>` });
const failure = status => html(status, "Request unavailable", "<p>Your request could not be recorded. Please retry or use the subscription preferences link in your email.</p>");
const tokenShape = (token, action) => typeof token === "string" && token.length <= 1024 &&
  (/^v2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token) || (action === "unsubscribe" && /^v1\.[A-Za-z0-9_-]{40,500}$/.test(token)));

// Only this wrapper creates the internal trusted context. Client JSON/headers
// cannot select it. The optional legacy bridge retains its own authentication.
export function createPublicApi(internalApi, deps, env) {
  return async event => {
    const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    if (Object.hasOwn(headers, "x-newsletter-bridge")) return internalApi({ ...event, headers });
    const path = ({ "/api/newsletter/confirm": "/confirm", "/api/newsletter/unsubscribe": "/unsubscribe" })[event.rawPath] || event.rawPath;
    const method = event.requestContext?.http?.method;
    if (!["/register", "/subscribe", "/confirm", "/unsubscribe"].includes(path)) return failure(404);
    if (!["GET", "POST"].includes(method) || (method === "GET" && path === "/subscribe")) return failure(405);
    try {
      const query = new URLSearchParams(event.rawQueryString || "");
      if ((event.rawQueryString || "").length > 2048 || query.getAll("token").length > 1) return failure(400);
      if (method === "GET") {
        if (path === "/register") {
          publicOrigin(env); assertConfirmationAllowed(env, await deps.store.get("CONTROL"));
          return html(200, "Subscribe to weekly research", `<form method="post" action="/register"><p><label>Email address <input type="email" name="email" maxlength="254" autocomplete="email" required></label></p><p><label><input type="checkbox" name="consent" value="yes" required> ${escapeHtml(CONSENT_TEXT)}</label></p><button type="submit">Request confirmation email</button></form>`);
        }
        const action = path.slice(1);
        if (!tokenShape(query.get("token"), action)) return failure(400);
        // No token echo, storage access or state mutation. A POST to the current
        // document retains its query string without embedding it in HTML.
        return html(200, action === "confirm" ? "Confirm subscription" : "Confirm unsubscribe",
          `<p>Your request is recorded only after confirmation succeeds.</p><form method="post"><button type="submit" name="action" value="${action}">${action === "confirm" ? "Confirm subscription" : "Unsubscribe permanently"}</button></form>`);
      }
      if (event.isBase64Encoded || typeof event.body !== "string" || Buffer.byteLength(event.body) > 4096) return failure(400);
      if (headers.origin !== undefined && headers.origin !== publicOrigin(env)) return failure(403);
      const type = String(headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      let body;
      if (type === "application/json") {
        try { body = JSON.parse(event.body); } catch { return failure(400); }
        if (!body || typeof body !== "object" || Array.isArray(body)) return failure(400);
      } else if (type === "application/x-www-form-urlencoded") {
        const form = new URLSearchParams(event.body);
        if ([...form.keys()].some(key => form.getAll(key).length !== 1)) return failure(400);
        body = Object.fromEntries(form);
      } else return failure(415);
      let action = path.slice(1);
      if (["register", "subscribe"].includes(action)) {
        const origin = publicOrigin(env);
        assertConfirmationAllowed(env, await deps.store.get("CONTROL"));
        // HTTP API payload v2 sourceIp is supplied by API Gateway; never use
        // X-Forwarded-For, x-vercel-forwarded-for or a submitted fingerprint.
        const ip = event.requestContext?.http?.sourceIp;
        if (headers.origin !== origin || event.version !== "2.0" || event.routeKey !== `POST ${path}` || !isIP(ip || "")) return failure(403);
        if (type === "application/json" ? body.consent !== true || body.consentVersion !== CONSENT_VERSION || body.consentText !== CONSENT_TEXT : body.consent !== "yes") return failure(400);
        const secret = await deps.secrets();
        if (typeof secret.capabilityKey !== "string" || Buffer.byteLength(secret.capabilityKey) < 32) throw new Error("not_configured");
        const clientFingerprint = createHmac("sha256", secret.capabilityKey).update(`newsletter-public-client-v1\0${ip}`).digest("hex");
        const result = await internalApi({ ...event, rawPath: "/subscribe", body: JSON.stringify({ email: body.email, consent: true,
          consentVersion: CONSENT_VERSION, consentText: CONSENT_TEXT, clientFingerprint }) }, { secret });
        return result.statusCode === 202 ? html(202, "Check your inbox if eligible", "<p>If eligible, check your inbox and confirm your subscription. No subscription is activated by this request.</p>") : failure(result.statusCode);
      }
      const token = query.get("token") || body.token;
      if (query.has("token") && body.token !== undefined) return failure(400);
      if (!tokenShape(token, action)) return failure(400);
      const oneClick = action === "unsubscribe" && type === "application/x-www-form-urlencoded" && body["List-Unsubscribe"] === "One-Click";
      if (type === "application/x-www-form-urlencoded" && !oneClick && body.action !== action) return failure(400);
      const result = await internalApi({ ...event, rawPath: path, body: JSON.stringify({ token }) }, { secret: await deps.secrets() });
      return result.statusCode === 200 ? html(200, action === "confirm" ? "Subscription confirmed" : "Unsubscribe recorded", "<p>Your request has been recorded.</p>") : failure(result.statusCode);
    } catch (error) { deps.metric(error?.message === "sending_paused" ? "Paused" : "ApiFailure"); return failure(503); }
  };
}
