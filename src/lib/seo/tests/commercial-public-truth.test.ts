import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (route: string) => readFileSync(path.join(process.cwd(), `src/app/(site)/${route}/page.tsx`), "utf8").replace(/\s+/g, " ");
for (const route of ["pricing", "faq", "privacy-policy", "terms-of-service", "billing"]) {
  const source = read(route);
  assert.doesNotMatch(source, /(?:subscription-management|billing-portal)[^.]{0,100}(?:not (?:yet |currently )?available|unavailable)/i, `${route} must not claim universal unavailability`);
  if (route === "billing") {
    assert.match(source, /state\.portalAvailable \? <ManageSubscriptionButton/);
    assert.match(source, /Opening or returning from the billing portal does not change access/);
    assert.match(source, /trusted role and persisted subscription facts/);
  } else if (route === "pricing") {
    assert.match(source, /Checkout requires a verified Chronoverse account/);
    assert.match(source, /eligible subscriptions through Billing/);
    assert.match(source, /available when a trusted customer mapping exists/);
    assert.match(source, /VIP access begins only after trusted payment confirmation/);
  } else {
    assert.match(source, /after (?:you authenticate|authentication)/);
    assert.match(source, /Eligible authenticated customers with a trusted persisted customer mapping/i);
    assert.match(source, /Portal availability is conditional/);
    assert.match(source, /Opening or returning from the portal does not grant VIP access/);
    assert.match(source, /trusted persisted subscription facts/);
    assert.match(source, /href="\/billing"/);
  }
}
console.log("PASS: conditional subscription management and commercial public truth");
