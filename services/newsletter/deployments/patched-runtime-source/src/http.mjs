import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { CONSENT_TEXT, CONSENT_VERSION, SUPPORT_EMAIL, assertConfirmationAllowed, escapeHtml } from "./domain.mjs";

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
const help = `<p>For historical unsubscribe links, email <a href="mailto:${SUPPORT_EMAIL}?subject=Newsletter%20unsubscribe%20help">${SUPPORT_EMAIL}</a> from the subscribed mailbox. Support verifies mailbox ownership before recording an opt-out. Sending a support request does not itself confirm an unsubscribe.</p>`;
const failure = status => html(status, "Request unavailable", "<p>Your request could not be recorded. Please retry or use the subscription preferences link in your email.</p>" + help);
const tokenShape = (token, action) => typeof token === "string" && token.length <= 1024 &&
  (/^v2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token) || (action === "unsubscribe" && /^v1\.[A-Za-z0-9_-]{40,500}$/.test(token)));

export function publicRequestBody(event) {
  if (typeof event.body !== "string" || ![undefined, false, true].includes(event.isBase64Encoded)) throw new Error("invalid_input");
  if (event.isBase64Encoded !== true) {
    if (Buffer.byteLength(event.body) > 4096) throw new Error("invalid_input");
    return event.body;
  }
  if (event.body.length > 5464 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(event.body)) throw new Error("invalid_input");
  const bytes = Buffer.from(event.body, "base64");
  if (bytes.length > 4096 || bytes.toString("base64") !== event.body) throw new Error("invalid_input");
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new Error("invalid_input"); }
}

// Never copy error messages, response bodies or request fields into diagnostics.
export function diagnosticFault(error) {
  if (["AccessDenied", "AccessDeniedException", "UnauthorizedException"].includes(error?.name)) return "permission_denied";
  if (error?.name === "ValidationException") return "dependency_validation";
  if (["ThrottlingException", "TooManyRequestsException", "ProvisionedThroughputExceededException"].includes(error?.name)) return "dependency_throttled";
  if (["MessageRejected", "MessageRejectedException", "MailFromDomainNotVerifiedException"].includes(error?.name)) return "provider_rejected";
  if (["invalid_input", "invalid_link"].includes(error?.message)) return "bad_request";
  if (error?.message === "sending_paused") return "gate_closed";
  if (error?.message === "not_configured") return "configuration";
  if (["confirmation_acknowledgement_uncertain", "unknown_send_outcome", "send_gate_release_uncertain"].includes(error?.message) ||
      ["TimeoutError", "RequestTimeout", "RequestTimeoutException"].includes(error?.name)) return "outcome_uncertain";
  return "dependency_failure";
}

// Only this wrapper creates the internal trusted context. Client JSON/headers
// cannot select it. The optional legacy bridge retains its own authentication.
export function createPublicApi(internalApi, deps, env) {
  return async (event, context = {}) => {
    let phase = "request";
    let internalFailure;
    const diagnostic = (status, reason, detailPhase = phase) => {
      if (status >= 400) internalFailure = { status, reason, phase: detailPhase };
      deps.diagnostic?.({ status, phase: detailPhase, reason,
        requestId: context.awsRequestId, encoded: event.isBase64Encoded === true });
    };
    const fail = (status, reason) => {
      diagnostic(status, reason);
      const response = failure(status);
      if (["/confirm", "/api/newsletter/confirm"].includes(event.rawPath)) {
        response.body = response.body.replace("</main>", `<p>HTTP ${status}. Reference: ${escapeHtml(phase)} / ${escapeHtml(reason)}.</p></main>`);
        response.headers["x-newsletter-phase"] = phase;
      }
      return { ...response, headers: { ...response.headers, "x-newsletter-result": reason } };
    };
    const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    if (Object.hasOwn(headers, "x-newsletter-bridge")) {
      const result = await internalApi({ ...event, headers });
      diagnostic(result.statusCode, result.statusCode === 401 ? "unauthorized" : "bridge_result", "bridge");
      return result;
    }
    const aliases = { "/api/newsletter/confirm": "/confirm", "/api/newsletter/unsubscribe": "/unsubscribe" };
    const legacyAlias = Object.hasOwn(aliases, event.rawPath);
    const path = aliases[event.rawPath] || event.rawPath;
    const method = event.requestContext?.http?.method;
    if (!["/register", "/subscribe", "/confirm", "/unsubscribe"].includes(path)) return fail(404, "not_found");
    if (!["GET", "POST"].includes(method) || (method === "GET" && path === "/subscribe")) return fail(405, "method_not_allowed");
    try {
      const query = new URLSearchParams(event.rawQueryString || "");
      phase = "query";
      if ((event.rawQueryString || "").length > 2048 || query.getAll("token").length > 1) return fail(400, "bad_request");
      if (method === "GET") {
        if (path === "/register") {
          phase = "control";
          publicOrigin(env); assertConfirmationAllowed(env, await deps.store.get("CONTROL"));
          diagnostic(200, "page_ready");
          return html(200, "Subscribe to weekly research", `<form method="post" action="/register"><p><label>Email address <input type="email" name="email" maxlength="254" autocomplete="email" required></label></p><p><label><input type="checkbox" name="consent" value="yes" required> ${escapeHtml(CONSENT_TEXT)}</label></p><button type="submit">Request confirmation email</button></form>`);
        }
        const action = path.slice(1);
        if (!tokenShape(query.get("token"), action)) return fail(400, "bad_request");
        // No token echo, storage access or state mutation. A POST to the current
        // document retains its query string without embedding it in HTML.
        const page = html(200, action === "confirm" ? "Confirm subscription" : "Confirm unsubscribe",
          `<p>Your request is recorded only after confirmation succeeds.</p><form method="post"><button type="submit" name="action" value="${action}">${action === "confirm" ? "Confirm subscription" : "Unsubscribe permanently"}</button></form>${action === "unsubscribe" ? help : ""}`);
        // Native form navigations under no-referrer serialize Origin as null.
        // strict-origin retains the HTTPS origin while omitting every path/query.
        if (action === "confirm") page.headers["referrer-policy"] = "strict-origin";
        return page;
      }
      phase = "body_decode";
      const decodedBody = publicRequestBody(event);
      // Historical website POSTs are redirected by the client, never proxied.
      // Cross-origin redirects may serialize Origin as null. Only these two
      // aliases accept it; a valid purpose/nonce-bound capability is still mandatory.
      const redirectedOrigin = legacyAlias && ["https://chronoversecapital.com", "null"].includes(headers.origin);
      phase = "origin";
      if (headers.origin !== undefined && headers.origin !== publicOrigin(env) && !redirectedOrigin) return fail(403, "origin_denied");
      const type = String(headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      let body;
      phase = "body_parse";
      if (type === "application/json") {
        try { body = JSON.parse(decodedBody); } catch { return fail(400, "bad_request"); }
        if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400, "bad_request");
      } else if (type === "application/x-www-form-urlencoded") {
        const form = new URLSearchParams(decodedBody);
        if ([...form.keys()].some(key => form.getAll(key).length !== 1)) return fail(400, "bad_request");
        body = Object.fromEntries(form);
      } else return fail(415, "unsupported_media");
      let action = path.slice(1);
      if (["register", "subscribe"].includes(action)) {
        const origin = publicOrigin(env);
        phase = "control";
        assertConfirmationAllowed(env, await deps.store.get("CONTROL"));
        // HTTP API payload v2 sourceIp is supplied by API Gateway; never use
        // X-Forwarded-For, x-vercel-forwarded-for or a submitted fingerprint.
        const ip = event.requestContext?.http?.sourceIp;
        phase = "context";
        if (headers.origin !== origin) return fail(403, "origin_denied");
        if (event.version !== "2.0" || event.routeKey !== `POST ${path}` || !isIP(ip || "")) return fail(403, "context_denied");
        phase = "consent";
        if (type === "application/json" ? body.consent !== true || body.consentVersion !== CONSENT_VERSION || body.consentText !== CONSENT_TEXT : body.consent !== "yes") return fail(400, "bad_request");
        phase = "secrets";
        const secret = await deps.secrets();
        if (typeof secret.capabilityKey !== "string" || Buffer.byteLength(secret.capabilityKey) < 32) throw new Error("not_configured");
        const clientFingerprint = createHmac("sha256", secret.capabilityKey).update(`newsletter-public-client-v1\0${ip}`).digest("hex");
        const result = await internalApi({ ...event, isBase64Encoded: false, rawPath: "/subscribe", body: JSON.stringify({ email: body.email, consent: true,
          consentVersion: CONSENT_VERSION, consentText: CONSENT_TEXT, clientFingerprint }) }, { secret, diagnostic });
        if (result.statusCode !== 202) {
          phase = internalFailure?.phase || "internal";
          return fail(result.statusCode, internalFailure?.reason || "internal_failure");
        }
        diagnostic(202, "accepted_or_ineligible", "internal");
        return html(202, "Check your inbox if eligible", "<p>If eligible, check your inbox and confirm your subscription. No subscription is activated by this request.</p>");
      }
      if (action === "confirm") phase = "confirm_token";
      const token = query.get("token") || body.token;
      if (query.has("token") && body.token !== undefined && (!legacyAlias || query.get("token") !== body.token)) return fail(400, "bad_request");
      if (!tokenShape(token, action)) return fail(400, "bad_request");
      const oneClick = action === "unsubscribe" && type === "application/x-www-form-urlencoded" && body["List-Unsubscribe"] === "One-Click";
      if (action === "confirm") phase = "confirm_action";
      if (type === "application/x-www-form-urlencoded" && !oneClick && body.action !== action && !(legacyAlias && body.action === undefined)) return fail(400, "bad_request");
      phase = "secrets";
      const result = await internalApi({ ...event, isBase64Encoded: false, rawPath: path, body: JSON.stringify({ token }) }, { secret: await deps.secrets(), diagnostic });
      if (result.statusCode === 410) return html(410, "Historical unsubscribe link unavailable", "<p>The signing key for this historical link is unavailable. We cannot decrypt it and have not recorded an unsubscribe.</p>" + help);
      if (result.statusCode === 200) {
        if (action === "confirm") diagnostic(200, "confirmation_recorded", "confirm_transaction");
        return html(200, action === "confirm" ? "Subscription confirmed" : "Unsubscribe recorded", "<p>Your request has been recorded.</p>");
      }
      phase = internalFailure?.phase || "internal";
      return fail(result.statusCode, internalFailure?.reason || "internal_failure");
    } catch (error) {
      deps.metric(error?.message === "sending_paused" ? "Paused" : "ApiFailure");
      return fail(error?.message === "invalid_input" ? 400 : 503, diagnosticFault(error));
    }
  };
}
