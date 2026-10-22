import assert from "node:assert/strict";
import PricingPage, { metadata } from "../../../app/(site)/pricing/page";
import PremiumPage from "../../../app/(site)/premium/page";
for (const page of [PricingPage, PremiumPage]) {
  assert.throws(() => page(), (error: unknown) => (error as { digest?: string }).digest === "NEXT_HTTP_ERROR_FALLBACK;404");
}
assert.equal(metadata.title, "Page not found");
assert.deepEqual(metadata.robots, { index: false, follow: false });
assert.equal(metadata.alternates, undefined);
assert.doesNotMatch(JSON.stringify(metadata), /pricing|VIP|checkout|15\.99|150\.99/i);
console.log("PASS: pricing and premium fail with Next 404 interrupts and retired metadata");
