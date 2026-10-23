import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";
import { encodeSignatureHeader } from "@sanity/webhook";
import { GET as cron } from "../../../app/api/cron/send-newsletter/route";
import { POST as publication } from "../../../app/api/webhook/sanity/route";
import { dataset, projectId } from "../../../sanity/client";
import { newsletterFixture, syntheticConfig } from "./newsletter-fixture";

function syntheticSettings(mode: "digest" | "publication") {
  const settings = {
    CRON_SECRET: "synthetic-cron-secret", SANITY_WEBHOOK_SECRET: "synthetic-webhook-secret",
    NEWSLETTER_SENDING_ENABLED: "true", NEWSLETTER_IDENTITY_CONFIRMED: "true",
    NEWSLETTER_SENDER_CONFIRMED: "true", NEWSLETTER_FEEDBACK_CONFIRMED: "true",
    NEWSLETTER_SNS_TOPIC_ARN: "arn:aws:sns:us-east-1:000000000000:synthetic-feedback",
    NEWSLETTER_VERIFIED_POSTAL_ADDRESS: syntheticConfig.postalAddress,
    NEWSLETTER_SENDER_EMAIL: syntheticConfig.sender, AWS_REGION: syntheticConfig.region,
    NEWSLETTER_DELIVERY_MODE: mode,
  };
  const old = new Map(Object.keys(settings).map(key => [key, process.env[key]]));
  Object.assign(process.env, settings);
  return () => { for (const [key, value] of old) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } };
}

function cronRequest() {
  return new Request("https://chronoversecapital.com/api/cron/send-newsletter", { headers: { authorization: "Bearer synthetic-cron-secret" } });
}
async function signedPublication(deliveryId: string) {
  const body = JSON.stringify({ documentId: "synthetic-post", documentType: "post", revision: "r1", becamePublished: true });
  return new Request("https://chronoversecapital.com/api/webhook/sanity", { method: "POST", body,
    headers: { "sanity-webhook-signature": await encodeSignatureHeader(body, Date.now(), "synthetic-webhook-secret"),
      "sanity-project-id": projectId, "sanity-dataset": dataset, "sanity-document-id": "synthetic-post",
      "sanity-operation": "create", "idempotency-key": deliveryId } });
}

test("both dispatch routes remain blocked before storage or SES when any send confirmation is false", async () => {
  const fixture = newsletterFixture(), restore = syntheticSettings("digest");
  try {
    let sends = 0;
    mock.method(SESClient.prototype, "send", (async () => { sends++; throw new Error("No transport permitted"); }) as unknown as SESClient["send"]);
    for (const key of ["NEWSLETTER_SENDING_ENABLED", "NEWSLETTER_IDENTITY_CONFIRMED", "NEWSLETTER_SENDER_CONFIRMED", "NEWSLETTER_FEEDBACK_CONFIRMED"]) {
      process.env[key] = "false";
      assert.equal((await cron(cronRequest())).status, 503);
      assert.equal((await publication(await signedPublication("paused-" + key))).status, 503);
      process.env[key] = "true";
    }
    assert.equal(sends, 0);
    assert.deepEqual(fixture.calls, []);
    assert.equal(fixture.documents.size, 0);
  } finally { restore(); fixture.close(); }
});

test("actual digest route, SDK store and mocked SES persist partial progress and retry without duplicates", async () => {
  const fixture = newsletterFixture(), restore = syntheticSettings("digest");
  try {
    fixture.put({ _id: "subscriber.one", _type: "subscriber", email: "one@example.test", active: true });
    fixture.put({ _id: "subscriber.two", _type: "subscriber", email: "two@example.test", active: true });
    fixture.publishedArticles.push({ id: "synthetic-post", revision: "r1", slug: "synthetic-post", title: "Synthetic research", description: "Synthetic context" });
    let reject = true;
    const sent: string[] = [];
    mock.method(SESClient.prototype, "send", (async (command: SendRawEmailCommand) => {
      const recipient = command.input.Destinations![0];
      if (reject && recipient === "two@example.test") throw { $metadata: { httpStatusCode: 429 } };
      sent.push(recipient); return { MessageId: "synthetic-ack-" + sent.length };
    }) as unknown as SESClient["send"]);
    const first = await cron(cronRequest()); assert.equal(first.status, 503); assert.equal((await first.json()).status, "incomplete");
    reject = false;
    assert.equal((await cron(cronRequest())).status, 200);
    assert.equal((await cron(cronRequest())).status, 200);
    assert.deepEqual(sent, ["one@example.test", "two@example.test"]);
    fixture.failures.add("read");
    assert.equal((await cron(cronRequest())).status, 503, "read failure is not a successful empty audience");
  } finally { restore(); fixture.close(); }
});

test("actual signed publication route deduplicates changed webhook IDs by article and blocks the alternate mode", async () => {
  const fixture = newsletterFixture(), restore = syntheticSettings("publication");
  try {
    fixture.put({ _id: "subscriber.synthetic", _type: "subscriber", email: "reader@example.test", active: true });
    fixture.publishedArticles.push({ id: "synthetic-post", revision: "r1", slug: "synthetic-post", title: "Synthetic research", description: "Synthetic context" });
    let sends = 0;
    mock.method(SESClient.prototype, "send", (async () => { sends++; return { MessageId: "synthetic-ack" }; }) as unknown as SESClient["send"]);
    for (const id of ["delivery-1", "delivery-2"]) assert.equal((await publication(await signedPublication(id))).status, 200);
    const skipped = await cron(cronRequest()); assert.equal((await skipped.json()).status, "skipped");
    assert.equal(sends, 1);
    delete process.env.NEWSLETTER_IDENTITY_CONFIRMED;
    assert.equal((await publication(await signedPublication("delivery-3"))).status, 503);
    assert.equal(sends, 1);
  } finally { restore(); fixture.close(); }
});
