import "server-only";
import { getNewsletterConfig, normalizeEmail, NEWSLETTER_ORIGIN } from "./config";
import { type NewsletterMessage, RejectedNewsletterSend } from "./delivery";

function encodedSubject(subject: string): string {
  const chunks: string[] = [];
  let chunk = "";
  for (const character of subject.replace(/[\r\n]/g, " ")) {
    if (Buffer.byteLength(chunk + character) > 36) { chunks.push(chunk); chunk = ""; }
    chunk += character;
  }
  if (chunk) chunks.push(chunk);
  return chunks.map(s => `=?UTF-8?B?${Buffer.from(s).toString("base64")}?=`).join("\r\n ");
}
const base64Body = (text: string) => Buffer.from(text).toString("base64").match(/.{1,76}/g)?.join("\r\n") || "";

export function rawNewsletter(message: NewsletterMessage, sender: string): Uint8Array {
  const boundary = "chronoverse-newsletter-alternative";
  return Buffer.from([
    `From: Chronoverse Capital <${sender}>`, `To: ${message.recipient}`,
    `Subject: ${encodedSubject(message.subject)}`, "MIME-Version: 1.0",
    `List-Unsubscribe: <${message.unsubscribeUrl}>`, "List-Unsubscribe-Post: List-Unsubscribe=One-Click",
    `Content-Type: multipart/alternative; boundary="${boundary}"`, "",
    `--${boundary}`, 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", base64Body(message.text),
    `--${boundary}`, 'Content-Type: text/html; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", base64Body(message.html),
    `--${boundary}--`, "",
  ].join("\r\n"));
}

export async function sendNewsletter(message: NewsletterMessage): Promise<{ messageId: string }> {
  // Recheck the send gate at the transport boundary, before SDK construction.
  const config = getNewsletterConfig();
  const unsubscribe = new URL(message.unsubscribeUrl);
  if (normalizeEmail(message.recipient) !== message.recipient || unsubscribe.origin !== NEWSLETTER_ORIGIN ||
      unsubscribe.pathname !== "/api/newsletter/unsubscribe") throw new Error("Invalid newsletter message");
  const { SESClient, SendRawEmailCommand } = await import("@aws-sdk/client-ses");
  const client = new SESClient({ region: config.region, maxAttempts: 1 });
  try {
    const result = await client.send(new SendRawEmailCommand({ Source: config.sender,
      Destinations: [message.recipient], RawMessage: { Data: rawNewsletter(message, config.sender) } }));
    if (!result.MessageId) throw new Error("SES acknowledgement unavailable");
    return { messageId: result.MessageId };
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status && status >= 400 && status < 500 && status !== 408) throw new RejectedNewsletterSend("SES rejected the request");
    throw new Error("SES outcome requires reconciliation");
  } finally { client.destroy(); }
}
