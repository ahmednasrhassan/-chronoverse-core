import "server-only";

export const NEWSLETTER_BRAND = "Chronoverse Capital";
export const NEWSLETTER_ORIGIN = "https://chronoversecapital.com";
export const EMAIL_PATTERN = /^[^\s@\x00-\x1f\x7f]+@[^\s@\x00-\x1f\x7f]+\.[^\s@\x00-\x1f\x7f]+$/;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

export interface NewsletterConfig {
  sender: string;
  postalAddress: string;
  region: string;
  mode: "digest" | "publication";
  unsubscribeSecret: string;
}

export function unsubscribeSecret(): string {
  const secret = process.env.NEWSLETTER_UNSUBSCRIBE_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error("Newsletter unsubscribe is not configured");
  return secret;
}

export function getNewsletterConfig(): NewsletterConfig {
  const sender = normalizeEmail(process.env.NEWSLETTER_SENDER_EMAIL);
  const postalAddress = process.env.NEWSLETTER_VERIFIED_POSTAL_ADDRESS?.trim();
  const region = process.env.AWS_REGION?.trim();
  const mode = process.env.NEWSLETTER_DELIVERY_MODE;
  // No default legal identity, address, sender or permission to send.
  if (process.env.NEWSLETTER_SENDING_ENABLED !== "true" ||
      process.env.NEWSLETTER_IDENTITY_CONFIRMED !== "true" ||
      process.env.NEWSLETTER_SENDER_CONFIRMED !== "true" ||
      process.env.NEWSLETTER_FEEDBACK_CONFIRMED !== "true" ||
      !/^arn:aws:sns:[a-z0-9-]+:\d{12}:[A-Za-z0-9_-]+$/.test(process.env.NEWSLETTER_SNS_TOPIC_ARN || "") ||
      process.env.NEWSLETTER_SNS_TOPIC_ARN?.split(":")[3] !== region ||
      !sender || !postalAddress || postalAddress.length > 500 || /[\r\n\x00]/.test(postalAddress) ||
      !region || !/^[a-z]{2}-[a-z]+-\d$/.test(region) ||
      (mode !== "digest" && mode !== "publication")) {
    throw new Error("Newsletter sending is blocked pending owner confirmation and configuration");
  }
  return { sender, postalAddress, region, mode, unsubscribeSecret: unsubscribeSecret() };
}
