import "server-only";
import { createVerify, X509Certificate, type KeyObject } from "node:crypto";
import { normalizeEmail } from "./config";
import { createNewsletterStore, type NewsletterStore } from "./store";
import { boundedText } from "./body";

interface SnsNotification {
  Type: string; TopicArn: string; Message: string; MessageId: string;
  Timestamp: string; SignatureVersion: string; Signature: string;
  SigningCertURL: string; Subject?: string;
}

async function loadSnsKey(url: string): Promise<KeyObject> {
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("SNS certificate unavailable");
  const pem = await boundedText(response, 32_768);
  if (!pem) throw new Error("Invalid SNS certificate");
  const certificate = new X509Certificate(pem);
  if (Date.parse(certificate.validFrom) > Date.now() || Date.parse(certificate.validTo) < Date.now() ||
      certificate.publicKey.asymmetricKeyType !== "rsa") throw new Error("Invalid SNS certificate");
  return certificate.publicKey;
}

export function snsSigningText(notification: SnsNotification): string {
  const fields = ["Message", "MessageId", ...(notification.Subject === undefined ? [] : ["Subject"]), "Timestamp", "TopicArn", "Type"] as (keyof SnsNotification)[];
  return fields.map(field => `${field}\n${notification[field]}\n`).join("");
}

export async function handleNewsletterFeedback(
  request: Request, store: NewsletterStore = createNewsletterStore(),
  loadKey: (url: string) => Promise<KeyObject> = loadSnsKey,
) {
  const headers = { "Cache-Control": "no-store" };
  const expectedTopic = process.env.NEWSLETTER_SNS_TOPIC_ARN;
  if (!expectedTopic) return new Response("Feedback is not configured", { status: 503, headers });
  try {
    const raw = await boundedText(request, 65_536);
    if (!raw) throw new Error("Invalid notification");
    const notification: SnsNotification = JSON.parse(raw);
    const region = expectedTopic.match(/^arn:aws:sns:([a-z0-9-]+):\d{12}:[A-Za-z0-9_-]+$/)?.[1];
    if (!region || notification.Type !== "Notification" || notification.TopicArn !== expectedTopic ||
        !["1", "2"].includes(notification.SignatureVersion) ||
        ![notification.Message, notification.MessageId, notification.Timestamp, notification.Signature, notification.SigningCertURL].every(value => typeof value === "string" && value.length > 0) ||
        (notification.Subject !== undefined && typeof notification.Subject !== "string")) throw new Error("Invalid notification");
    const certificateUrl = new URL(notification.SigningCertURL);
    if (certificateUrl.protocol !== "https:" || certificateUrl.hostname !== `sns.${region}.amazonaws.com` ||
        certificateUrl.port || certificateUrl.username || certificateUrl.password || certificateUrl.search || certificateUrl.hash ||
        !/^\/SimpleNotificationService-[A-Za-z0-9_-]+\.pem$/.test(certificateUrl.pathname)) throw new Error("Invalid SNS certificate URL");
    const signature = createVerify(notification.SignatureVersion === "2" ? "RSA-SHA256" : "RSA-SHA1");
    signature.update(snsSigningText(notification));
    let key: KeyObject;
    try { key = await loadKey(certificateUrl.href); }
    catch {
      // An unavailable trusted certificate is not evidence of a bad signature.
      // Request a retry without acknowledging or applying the notification.
      return new Response("Feedback verification unavailable", { status: 503, headers });
    }
    if (!signature.verify(key, notification.Signature, "base64")) throw new Error("Invalid signature");
    const event = JSON.parse(notification.Message);
    let recipients: unknown[] = [];
    let reason: "hard-bounce" | "complaint";
    const type = event.notificationType || event.eventType;
    if (type === "Bounce" && event.bounce?.bounceType === "Permanent") {
      recipients = event.bounce.bouncedRecipients; reason = "hard-bounce";
    } else if (type === "Complaint") {
      recipients = event.complaint?.complainedRecipients; reason = "complaint";
    } else return new Response("Notification acknowledged", { headers });
    if (!Array.isArray(recipients) || recipients.length === 0 || recipients.length > 100) throw new Error("Invalid feedback recipients");
    const emails = recipients.map(value => normalizeEmail((value as { emailAddress?: unknown })?.emailAddress));
    if (emails.some(email => !email)) throw new Error("Invalid feedback recipient");
    try {
      for (const email of new Set(emails)) await store.suppress(email!, reason);
    } catch {
      // SNS must retry persistence failures; do not acknowledge lost suppression.
      return new Response("Feedback persistence unavailable", { status: 503, headers });
    }
    return new Response("Notification acknowledged", { headers });
  } catch { return new Response("Invalid feedback notification", { status: 400, headers }); }
}
