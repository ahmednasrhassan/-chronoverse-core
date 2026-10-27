import { createHash, createHmac, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

// Legacy RSS parsing/reference compatibility only. Neither constant is a
// production content source or the origin of independent subscriber links.
export const ORIGIN = "https://chronoversecapital.com";
export const FEED = `${ORIGIN}/rss.xml`;
export const TOPIC = "weekly-research";
export const CONSENT_VERSION = "weekly-research-v1";
export const CONSENT_TEXT = "I agree to receive the free weekly Chronoverse Capital research newsletter. I can unsubscribe at any time.";
export const ENROLLMENT_POLICY = "aws-fresh-double-opt-in-2026-10-27-v1";
export const SUPPORT_EMAIL = "info@chronoversecapital.com";
export const FORWARD_ONLY_STATUS = "HISTORICAL_RECOVERY_UNRESOLVED";
export function audienceInitializationReady(control) {
  return control?.migrationComplete === true || (control?.forwardOnlyReady === true &&
    control.forwardOnlyPolicy === ENROLLMENT_POLICY && control.historicalRecoveryStatus === FORWARD_ONLY_STATUS &&
    /^[a-f0-9]{64}$/.test(control.forwardOnlyReceipt || ""));
}
export function pendingEnrollment(record) {
  return record?.state === "PENDING" && record.enrollmentPolicy === ENROLLMENT_POLICY &&
    record.consentVersion === CONSENT_VERSION && record.consentText === CONSENT_TEXT &&
    Number.isSafeInteger(record.requestedAt) && record.requestedAt >= 0 && /^[A-Za-z0-9_-]{32}$/.test(record.confirmationNonce || "");
}
export function campaignEligible(record) {
  return record?.state === "CONFIRMED" && record.confirmedPolicy === ENROLLMENT_POLICY &&
    record.awsConsentVersion === CONSENT_VERSION && record.awsConsentText === CONSENT_TEXT &&
    Number.isSafeInteger(record.awsRequestedAt) && record.awsRequestedAt >= 0 && Number.isSafeInteger(record.confirmedAt) && record.confirmedAt >= record.awsRequestedAt &&
    /^[A-Za-z0-9_-]{32}$/.test(record.confirmedRequestNonce || "") && /^[A-Za-z0-9_-]{32}$/.test(record.unsubscribeNonce || "") &&
    record.suppressedAt === undefined && record.suppressionReason === undefined;
}
export const hash = value => createHash("sha256").update(value).digest("hex");
export function emailAddress(value) {
  if (typeof value !== "string") throw new Error("invalid_input");
  const result = value.trim().toLowerCase();
  if (result.length > 254 || !/^[^\s@\x00-\x1f\x7f]+@[^\s@\x00-\x1f\x7f]+\.[^\s@\x00-\x1f\x7f]+$/.test(result)) throw new Error("invalid_input");
  return result;
}
export const subscriberId = email => hash(emailAddress(email));
export const audienceKey = id => `AUDIENCE#${parseInt(id.slice(0, 2), 16) % 16}`;
export const nonce = () => randomBytes(24).toString("base64url");
// Longer than the deployed 60-second Lambda timeout: a timed-out sender must
// have stopped before another invocation can recover its abandoned lease.
export const SEND_LEASE_MS = 120000;
export const SEND_COOLDOWN_MS = 1000;
export class SendCapacityUnavailable extends Error {
  constructor() { super("send_capacity_unavailable"); this.name = "SendCapacityUnavailable"; }
}
export function equalSecret(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length < 32 || right.length < 32) return false;
  return timingSafeEqual(Buffer.from(hash(left)), Buffer.from(hash(right)));
}
function key(secret) {
  if (typeof secret !== "string" || Buffer.byteLength(secret) < 32) throw new Error("not_configured");
  return secret;
}
export function capability(secret, purpose, id, tokenNonce, expiresAt = null) {
  if (!["confirm", "unsubscribe"].includes(purpose) || !/^[a-f0-9]{64}$/.test(id || "") || !/^[A-Za-z0-9_-]{32}$/.test(tokenNonce || "") ||
      (purpose === "confirm" && !Number.isSafeInteger(expiresAt)) || (purpose === "unsubscribe" && expiresAt !== null)) throw new Error("invalid_capability");
  const body = Buffer.from(JSON.stringify({ purpose, id, nonce: tokenNonce, exp: expiresAt })).toString("base64url");
  const signature = createHmac("sha256", key(secret)).update(`v2.${body}`).digest("base64url");
  return `v2.${body}.${signature}`;
}
export function readCapability(secret, token, purpose, now) {
  if (typeof token !== "string" || token.length > 1024 || !/^v2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("invalid_link");
  const [, body, signature] = token.split(".");
  const expected = createHmac("sha256", key(secret)).update(`v2.${body}`).digest("base64url");
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) throw new Error("invalid_link");
  let data;
  try { data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { throw new Error("invalid_link"); }
  if (data.purpose !== purpose || !/^[a-f0-9]{64}$/.test(data.id) || !/^[A-Za-z0-9_-]{32}$/.test(data.nonce) ||
      (purpose === "confirm" && (!Number.isSafeInteger(data.exp) || data.exp <= now)) ||
      (purpose === "unsubscribe" && data.exp !== null)) throw new Error("invalid_link");
  return data;
}
// The sole retained historical crypto format. No Sanity client or old sender.
export function legacyOptout(secret, token) {
  if (!/^v1\.[A-Za-z0-9_-]{40,500}$/.test(token || "")) throw new Error("invalid_link");
  key(secret);
  try {
    const bytes = Buffer.from(token.slice(3), "base64url");
    const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from("chronoverse-newsletter-optout-v1"));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return emailAddress(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8"));
  } catch { throw new Error("invalid_link"); }
}
export function assertConfirmationAllowed(env, control) {
  if (env.REGISTRATION_ENABLED !== "true" || env.CONFIRMATION_ENABLED !== "true" ||
      env.LEGACY_DISPATCH_RETIRED !== "true" || env.COMPLIANCE_APPROVED !== "true" ||
      control?.registrationEnabled !== true || control?.confirmationEnabled !== true ||
      control?.legacyRetired !== true || control?.complianceApproved !== true ||
      !audienceInitializationReady(control)) throw new Error("sending_paused");
}
export function assertMailAllowed(env, control, kind) {
  // A durable confirmation pause also stops new confirmation emails. Require
  // suppression/recovery readiness before inviting any address to enroll.
  if (kind === "confirmation") assertConfirmationAllowed(env, control);
  if (!["digest", "confirmation"].includes(kind) || env.LEGACY_DISPATCH_RETIRED !== "true" || env.COMPLIANCE_APPROVED !== "true" ||
      !control || control.legacyRetired !== true || control.complianceApproved !== true ||
      (kind === "digest" && (env.DELIVERY_ENABLED !== "true" || control.deliveryEnabled !== true || !audienceInitializationReady(control) || control.contentSourceApproved !== true)) ||
      (kind === "confirmation" && (env.REGISTRATION_ENABLED !== "true" || env.CONFIRMATION_ENABLED !== "true" || control.registrationEnabled !== true)) ||
      !env.SENDER_EMAIL || emailAddress(env.SENDER_EMAIL) !== env.SENDER_EMAIL ||
      !env.POSTAL_ADDRESS?.trim() || /[\r\n\x00]/.test(env.POSTAL_ADDRESS) || env.POSTAL_ADDRESS.length > 500 ||
      !env.CONTACT_LIST || !env.CONFIGURATION_SET) throw new Error("sending_paused");
}
export function weeklyWindow(now) {
  // Monday 09:00 UTC. Delayed/retried invocations select the same closed window.
  const date = new Date(now);
  const end = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 9);
  const days = (date.getUTCDay() + 6) % 7;
  let boundary = end - days * 86400000;
  if (boundary > now) boundary -= 7 * 86400000;
  return { id: new Date(boundary).toISOString().slice(0, 10), start: boundary - 7 * 86400000, end: boundary };
}
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
