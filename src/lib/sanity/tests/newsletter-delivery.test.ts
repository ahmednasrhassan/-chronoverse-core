import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { SESClient } from "@aws-sdk/client-ses";
import { createNewsletterStore, campaignId } from "../../newsletter/store";
import { buildNewsletterMessage, deliverCampaign, digestWindow, RejectedNewsletterSend, type NewsletterMessage } from "../../newsletter/delivery";
import { getNewsletterConfig } from "../../newsletter/config";
import { rawNewsletter, sendNewsletter } from "../../newsletter/transport";
import { newsletterFixture, syntheticConfig } from "./newsletter-fixture";

const email = "reader@example.test";
const articles = [{ id: "synthetic-post", revision: "r1", slug: "synthetic-post", title: '<Research & "context">', description: "Synthetic evidence <script>unsafe()</script>" }];
const input = { key: "synthetic-campaign", subject: "Synthetic dispatch", loadArticles: async () => articles };

function audience(fixture: ReturnType<typeof newsletterFixture>, addresses = [email]) {
  for (const [i, address] of addresses.entries()) fixture.put({ _id: `subscriber.synthetic-${i}`, _type: "subscriber", email: address, active: true });
}

test("authenticated private read-back flows through snapshot, mocked SES and durable acknowledgement", async () => {
  const fixture = newsletterFixture();
  try {
    audience(fixture);
    const sent: NewsletterMessage[] = [];
    const send = async (message: NewsletterMessage) => { sent.push(message); return { messageId: "synthetic-ses-id" }; };
    const store = createNewsletterStore();
    const result = await deliverCampaign(store, syntheticConfig, input, send);
    assert.equal(result.complete, true); assert.equal(result.accepted, 1);
    assert.equal((await store.campaign(campaignId(input.key)))?.complete, true);
    assert.equal((await store.delivery(campaignId(input.key), email))?.messageId, "synthetic-ses-id");
    await deliverCampaign(store, syntheticConfig, { ...input, loadArticles: async () => { throw new Error("Completed retries must use frozen content"); } }, send);
    assert.equal(sent.length, 1);
    assert.match(sent[0].html, /&lt;Research &amp; &quot;context&quot;&gt;/);
    assert.doesNotMatch(sent[0].html, /<script>|\bLLC\b|Wilmington|Delaware/);
    assert.match(sent[0].html, /Unsubscribe/);
    assert.ok(fixture.calls.every(call => call.authenticated));
  } finally { fixture.close(); }
});

test("concurrent triggers and duplicate recipient records cannot send twice", async () => {
  const fixture = newsletterFixture();
  try {
    audience(fixture, [email, email.toUpperCase()]);
    let count = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const send = async () => { count++; await gate; return { messageId: "once" }; };
    const store = createNewsletterStore();
    const first = deliverCampaign(store, syntheticConfig, input, send);
    const second = deliverCampaign(store, syntheticConfig, input, send);
    await new Promise(resolve => setImmediate(resolve));
    release(); await Promise.all([first, second]);
    assert.equal(count, 1);
  } finally { fixture.close(); }
});

test("partial failure retries only explicit rejections and never completes prematurely", async () => {
  const fixture = newsletterFixture();
  try {
    audience(fixture, [email, "second@example.test"]);
    const delivered: string[] = [];
    let reject = true;
    const send = async (message: NewsletterMessage) => {
      if (reject && message.recipient === "second@example.test") throw new RejectedNewsletterSend("Synthetic provider rejection");
      delivered.push(message.recipient); return { messageId: `ack-${delivered.length}` };
    };
    const store = createNewsletterStore();
    const first = await deliverCampaign(store, syntheticConfig, input, send);
    assert.equal(first.complete, false); assert.equal(first.status, "incomplete"); assert.equal(first.failed, 1);
    assert.equal((await store.campaign(campaignId(input.key)))?.complete, false);
    reject = false;
    assert.equal((await deliverCampaign(store, syntheticConfig, input, send)).complete, true);
    assert.deepEqual(delivered, [email, "second@example.test"]);
  } finally { fixture.close(); }
});

test("ambiguous transport outcome is held for reconciliation and is never automatically resent", async () => {
  const fixture = newsletterFixture();
  try {
    audience(fixture); let count = 0;
    const send = async () => { count++; throw new Error("Synthetic timeout after possible acceptance"); };
    const store = createNewsletterStore();
    for (let i = 0; i < 2; i++) {
      const result = await deliverCampaign(store, syntheticConfig, input, send);
      assert.equal(result.complete, false); assert.equal(result.unknown, 1);
    }
    assert.equal(count, 1);
    assert.equal((await store.campaign(campaignId(input.key)))?.complete, false);
  } finally { fixture.close(); }
});

test("lost acknowledgement write cannot cause an automatic duplicate or false completion", async () => {
  const fixture = newsletterFixture();
  try {
    audience(fixture); let count = 0;
    const send = async () => { count++; fixture.failures.add("patch"); return { messageId: "accepted-but-write-lost" }; };
    const store = createNewsletterStore();
    await assert.rejects(deliverCampaign(store, syntheticConfig, input, send));
    const retry = await deliverCampaign(store, syntheticConfig, input, send);
    assert.equal(retry.complete, false); assert.equal(retry.pending, 1); assert.equal(count, 1);
  } finally { fixture.close(); }
});

test("suppression after audience snapshot prevents sending; audience/read failures do not become success", async () => {
  const fixture = newsletterFixture();
  try {
    audience(fixture);
    const store = createNewsletterStore();
    await store.createCampaign(campaignId(input.key), articles, [email], input.subject);
    await store.suppress(email, "complaint");
    let calls = 0;
    const result = await deliverCampaign(store, syntheticConfig, input, async () => { calls++; return { messageId: "never" }; });
    assert.equal(result.suppressed, 1); assert.equal(result.complete, true); assert.equal(calls, 0);
    fixture.failures.add("read");
    await assert.rejects(deliverCampaign(store, syntheticConfig, { ...input, key: "unavailable" }, async () => { throw new Error("No send allowed"); }));
  } finally { fixture.close(); }
});

test("explicit rejection retries are bounded", async () => {
  const fixture = newsletterFixture();
  try {
    audience(fixture); let calls = 0;
    for (let i = 0; i < 5; i++) {
      const result = await deliverCampaign(createNewsletterStore(), syntheticConfig, input, async () => { calls++; throw new RejectedNewsletterSend("Synthetic rejection"); });
      assert.equal(result.complete, false);
    }
    assert.equal(calls, 3);
  } finally { fixture.close(); }
});

test("daily windows are fixed, non-overlapping and stable across delayed triggers", () => {
  const first = digestWindow(new Date("2026-10-23T09:00:00Z"));
  assert.deepEqual(digestWindow(new Date("2026-10-23T23:00:00Z")), first);
  const next = digestWindow(new Date("2026-10-24T09:00:00Z"));
  assert.equal(first.end, next.start);
});

test("raw SES MIME includes opaque one-click headers and no forged identity; disabled transport cannot send", async () => {
  const message = buildNewsletterMessage(articles, email, "Unicode research — synthetic", syntheticConfig);
  const mime = Buffer.from(rawNewsletter(message, syntheticConfig.sender)).toString("utf8");
  assert.match(mime, /List-Unsubscribe: <https:\/\/chronoversecapital.com\/api\/newsletter\/unsubscribe\?token=v1\./);
  assert.match(mime, /List-Unsubscribe-Post: List-Unsubscribe=One-Click/);
  assert.doesNotMatch(mime, /\bLLC\b|Wilmington/);
  const send = mock.method(SESClient.prototype, "send", (() => { throw new Error("Real SES transport must not be invoked"); }) as unknown as SESClient["send"]);
  try {
    await assert.rejects(sendNewsletter(message), /blocked/);
    assert.equal(send.mock.callCount(), 0);
    assert.throws(getNewsletterConfig, /blocked/);
  } finally { mock.restoreAll(); }
});
