import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(process.cwd());
const pricing = readFileSync(
  path.join(repositoryRoot, "src/app/(site)/pricing/page.tsx"),
  "utf8",
);
const buttons = readFileSync(
  path.join(repositoryRoot, "src/app/(site)/pricing/CheckoutButtons.tsx"),
  "utf8",
);

assert.match(pricing, /\$15\.99 monthly/);
assert.match(pricing, /\$150\.99 annually/);
assert.match(pricing, /<CheckoutButtons \/>/);
assert.match(buttons, /plan: "monthly"/);
assert.match(buttons, /plan: "annual"/);
assert.match(buttons, /disabled=\{pendingPlan !== null\}/);
assert.match(buttons, /window\.location\.assign\("\/account"\)/);
assert.doesNotMatch(`${pricing}\n${buttons}`, /free trial|save \d|% off/i);
assert.doesNotMatch(buttons, /variantId|productId|storeId|userId/);

console.log("PASS: Pricing exposes truthful bounded checkout choices");
