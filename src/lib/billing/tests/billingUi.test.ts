import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import Billing, { metadata } from "../../../app/(site)/billing/page";
import { readFileSync } from "node:fs";

async function main(): Promise<void> {
  const html = renderToStaticMarkup(await Billing());
  assert.match(html, /Purchase support/);
  assert.match(html, /Lemon Squeezy and Gumroad/);
  assert.match(html, /one-time books/);
  assert.match(html, /refund|dispute/);
  assert.match(html, /href="\/contact"/);
  assert.doesNotMatch(html, /VIP|\/pricing|Manage subscription|\$15\.99|customerId|subscriptionId/);
  assert.deepEqual(metadata.robots, { index: false, follow: false, googleBot: { index: false, follow: false } });
  const account = readFileSync("src/app/(site)/account/page.tsx", "utf8");
  assert.match(account, /href="\/billing"/);
  assert.match(account, /Purchase support/);
  assert.doesNotMatch(account, /provider-hosted subscription|\/pricing|LEMON_SQUEEZY_API_KEY/);
  console.log("PASS: Billing renders historical purchase support without billing lookups or upsells");
}

void main();
