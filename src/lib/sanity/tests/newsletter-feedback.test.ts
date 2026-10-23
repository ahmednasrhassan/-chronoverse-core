import assert from "node:assert/strict";
import { createSign, generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import { handleNewsletterFeedback, snsSigningText } from "../../newsletter/feedback";
import { createNewsletterStore } from "../../newsletter/store";
import { newsletterFixture } from "./newsletter-fixture";

const topic = "arn:aws:sns:us-east-1:000000000000:synthetic-feedback";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

function notification(kind: string, changes: Record<string, string> = {}) {
  const envelope = { Type: "Notification", TopicArn: topic, MessageId: "synthetic-message", Timestamp: new Date().toISOString(),
    SignatureVersion: "2", Signature: "", SigningCertURL: "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-synthetic.pem",
    Message: JSON.stringify(kind === "Complaint" ? { notificationType: kind, complaint: { complainedRecipients: [{ emailAddress: "reader@example.test" }] } }
      : { notificationType: "Bounce", bounce: { bounceType: kind, bouncedRecipients: [{ emailAddress: "reader@example.test" }] } }), ...changes };
  const signer = createSign("RSA-SHA256"); signer.update(snsSigningText(envelope)); envelope.Signature = signer.sign(privateKey, "base64");
  return new Request("https://chronoversecapital.com/api/newsletter/feedback", { method: "POST", body: JSON.stringify(envelope) });
}

for (const kind of ["Permanent", "Complaint", "Transient"]) test(`verified synthetic SNS ${kind} handling is durable and idempotent`, async () => {
  const fixture = newsletterFixture(); const old = process.env.NEWSLETTER_SNS_TOPIC_ARN; process.env.NEWSLETTER_SNS_TOPIC_ARN = topic;
  try {
    fixture.put({ _id: "subscriber.synthetic", _type: "subscriber", email: "reader@example.test", active: true });
    const store = createNewsletterStore();
    for (let i = 0; i < 2; i++) assert.equal((await handleNewsletterFeedback(notification(kind), store, async () => publicKey)).status, 200);
    assert.equal(await store.isSuppressed("reader@example.test"), kind !== "Transient");
    if (kind !== "Transient") {
      fixture.failures.add("transaction");
      assert.equal((await handleNewsletterFeedback(notification(kind), store, async () => publicKey)).status, 503);
    }
  } finally { fixture.close(); if (old === undefined) delete process.env.NEWSLETTER_SNS_TOPIC_ARN; else process.env.NEWSLETTER_SNS_TOPIC_ARN = old; }
});

test("forged SNS, untrusted certificate URLs and wrong topics cannot change subscriber state", async () => {
  const fixture = newsletterFixture(); const old = process.env.NEWSLETTER_SNS_TOPIC_ARN; process.env.NEWSLETTER_SNS_TOPIC_ARN = topic;
  try {
    for (const changes of [{ SigningCertURL: "https://attacker.test/cert.pem" }, { TopicArn: topic + "-other" }, { Type: "SubscriptionConfirmation" }, { SignatureVersion: "9" }] as Record<string, string>[]) {
      const response = await handleNewsletterFeedback(notification("Permanent", changes), createNewsletterStore(), async () => { throw new Error("Untrusted certificate must never be fetched"); });
      assert.equal(response.status, 400);
    }
    const signed = notification("Permanent");
    const body = JSON.parse(await signed.text()); body.Message += " ";
    assert.equal((await handleNewsletterFeedback(new Request(signed.url, { method: "POST", body: JSON.stringify(body) }), createNewsletterStore(), async () => publicKey)).status, 400);
    assert.equal(fixture.documents.size, 0);
  } finally { fixture.close(); if (old === undefined) delete process.env.NEWSLETTER_SNS_TOPIC_ARN; else process.env.NEWSLETTER_SNS_TOPIC_ARN = old; }
});

test("trusted certificate outages request retry without losing suppression feedback", async () => {
  const fixture = newsletterFixture(); const old = process.env.NEWSLETTER_SNS_TOPIC_ARN; process.env.NEWSLETTER_SNS_TOPIC_ARN = topic;
  try {
    const response = await handleNewsletterFeedback(notification("Permanent"), createNewsletterStore(), async () => { throw new Error("Synthetic certificate outage"); });
    assert.equal(response.status, 503);
    assert.equal(fixture.documents.size, 0);
    assert.equal((await handleNewsletterFeedback(notification("Permanent"), createNewsletterStore(), async () => publicKey)).status, 200);
    assert.equal(await createNewsletterStore().isSuppressed("reader@example.test"), true);
  } finally { fixture.close(); if (old === undefined) delete process.env.NEWSLETTER_SNS_TOPIC_ARN; else process.env.NEWSLETTER_SNS_TOPIC_ARN = old; }
});
