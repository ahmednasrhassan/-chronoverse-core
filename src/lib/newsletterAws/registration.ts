import "server-only";
import { NEWSLETTER_AWS_ORIGIN } from "@/config/newsletterAvailability";
import { CONSENT_VERSION, CONSENT_TEXT } from "@/config/newsletterConsent";

export { CONSENT_VERSION, CONSENT_TEXT };
export type Registration = { email: string; consent: true; consentVersion: string; consentText: string };
export type SubmitRegistration = (body: Registration) => Promise<number>;
const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const reply = (status: number, code: string) => Response.json({ code }, { status, headers });

// The transport is injected so another host can supply short-lived credentials
// without changing consent validation or importing platform code into the form.
export function registrationHandler(paused: boolean, submit: SubmitRegistration) {
  return async (request: Request) => {
    if (paused) return reply(503, "registration_paused");
    if (request.headers.get("origin") !== "https://chronoversecapital.com" ||
        request.headers.get("sec-fetch-site") === "cross-site") return reply(403, "invalid_origin");
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return reply(415, "invalid_request");
    try {
      if (Number(request.headers.get("content-length")) > 4096) return reply(400, "invalid_request");
      const reader = request.body?.getReader();
      if (!reader) return reply(400, "invalid_request");
      const chunks: Uint8Array[] = []; let bytes = 0;
      try {
        while (true) {
          const { value, done } = await reader.read(); if (done) break;
          bytes += value.byteLength; if (bytes > 4096) return reply(400, "invalid_request"); chunks.push(value);
        }
      } finally { await reader.cancel().catch(() => {}); }
      const body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
      if (!body || typeof body !== "object" || Array.isArray(body) ||
          Object.keys(body).sort().join(",") !== "consent,consentText,consentVersion,email" ||
          body.consent !== true || body.consentVersion !== CONSENT_VERSION || body.consentText !== CONSENT_TEXT ||
          typeof body.email !== "string") return reply(400, "explicit_consent_required");
      const email = body.email.trim().toLowerCase();
      if (email.length > 254 || !/^[^\s@\x00-\x1f\x7f]+@[^\s@\x00-\x1f\x7f]+\.[^\s@\x00-\x1f\x7f]+$/.test(email)) return reply(400, "invalid_request");
      // Exactly one transport call. A timeout may follow an SES acceptance:
      // neither this handler nor its browser client retries an uncertain result.
      const status = await submit({ email, consent: true, consentVersion: CONSENT_VERSION, consentText: CONSENT_TEXT });
      return status === 202 ? reply(202, "check_inbox_if_eligible") : reply(503, "request_not_confirmed");
    } catch { return reply(503, "request_not_confirmed"); }
  };
}

export const REGISTRATION_TARGET = new URL("/register", NEWSLETTER_AWS_ORIGIN);
