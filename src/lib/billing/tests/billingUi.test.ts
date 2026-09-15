import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const page = readFileSync(
  path.join(root, "src/app/(site)/billing/page.tsx"),
  "utf8",
);
const button = readFileSync(
  path.join(root, "src/app/(site)/billing/ManageSubscriptionButton.tsx"),
  "utf8",
);
const account = readFileSync(
  path.join(root, "src/app/(site)/account/page.tsx"),
  "utf8",
);

assert.match(page, /index: false/);
assert.match(page, /follow: false/);
assert.match(page, /Subscription facts are private/);
assert.match(page, /href="\/account"/);
assert.match(page, /No active paid subscription is recorded/);
assert.match(page, /href="\/pricing"/);
assert.match(page, /Owner VIP/);
assert.match(page, /Admin VIP/);
assert.match(page, /Commercial subscription/);
assert.match(page, /subscription === null \? "None" : "Recorded"/);
assert.match(page, /ManageSubscriptionButton/);
assert.match(page, /Unknown \/ unsupported|subscription\.plan/);
assert.match(page, /subscription\.paymentIssue/);
assert.match(page, /label="Payment" value="Issue"/);
assert.doesNotMatch(page, /lemon_customer_id|lemon_subscription_id|userId/);

assert.match(button, /method: "POST"/);
assert.doesNotMatch(button, /body:|customerId|subscriptionId|userId|storeId/);
assert.match(button, /disabled=\{pending\}/);
assert.match(button, /if \(pending\) return/);
assert.match(button, /aria-live="polite"/);
assert.match(button, /window\.location\.assign\(payload\.url\)/);

assert.match(account, /href="\/billing"/);
assert.doesNotMatch(account, /createLemonCustomerPortal|LEMON_SQUEEZY_API_KEY/);

console.log("PASS: Billing and Account render only safe commercial UI contracts");
