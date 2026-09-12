import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { LAUNCH_MARKETS_V1 } from "../../../config/institutionalNavigation";
import { siteConfig } from "../../../config/siteConfig";

const repositoryRoot = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(path.join(repositoryRoot, relativePath), "utf8");

const homepageSource = readSource("src/app/(site)/page.tsx");
const marketSurfaceSource = readSource(
  "src/components/home/FreeMarketSurface.tsx",
);
const newsletterSource = readSource("src/components/NewsLetterForm.tsx");
const projectionServiceSource = readSource(
  "src/lib/markets/services/canonicalProductResults.ts",
);
const combinedHomepageSource = `${homepageSource}\n${marketSurfaceSource}`;

assert.deepEqual(
  LAUNCH_MARKETS_V1.map((market) => market.label),
  ["EUR/USD", "EUR/JPY", "EUR/GBP", "EUR/CHF", "€STR"],
  "homepage scope must contain exactly the five launch labels in shared order",
);
assert.match(homepageSource, /LAUNCH_MARKETS_V1\.map/);
assert.match(marketSurfaceSource, /LAUNCH_MARKETS_V1\.map/);
assert.match(
  homepageSource,
  /getFiveProductFreeLiteProjectionMapV1\(\)/,
  "homepage must load the server-owned Free Lite projection map",
);
assert.match(projectionServiceSource, /Promise\.allSettled/);
assert.match(projectionServiceSource, /getCachedCanonicalFxResultBundleV1\(\)/);
assert.match(projectionServiceSource, /getCanonicalEstrResultV1\(\)/);

for (const forbiddenProduct of ["Gold", "Bitcoin", "S&P 500", "Nasdaq", "Oil"]) {
  assert.doesNotMatch(
    combinedHomepageSource,
    new RegExp(`\\b${forbiddenProduct.replace("&", "&")}\\b`, "i"),
    `${forbiddenProduct} must not appear as a homepage product`,
  );
}

for (const forbiddenLegacyValue of [
  "/intelligence",
  "LEMON-70",
  "checkout/buy/6bfbf7ab-53c3-4d6e-aad8-44f9835a7160",
  "affs.click",
  "sponsor",
  "affiliate",
  "LOCAL_FALLBACK_QUOTES",
]) {
  assert.equal(
    combinedHomepageSource.includes(forbiddenLegacyValue),
    false,
    `homepage must exclude ${forbiddenLegacyValue}`,
  );
}

assert.match(homepageSource, /href="\/markets"/);
assert.match(homepageSource, /href="\/vip"/);
assert.match(homepageSource, /href="\/pricing"/);
assert.equal(existsSync(path.join(repositoryRoot, "src/app/(site)/markets/page.tsx")), true);
assert.equal(existsSync(path.join(repositoryRoot, "src/app/(vip)/vip/page.tsx")), true);
assert.equal(existsSync(path.join(repositoryRoot, "src/app/(site)/pricing/page.tsx")), true);

assert.match(
  homepageSource,
  /getLatestSanityArticles\(3\)/,
  "research preview must use exactly three real Sanity articles",
);
assert.doesNotMatch(
  marketSurfaceSource,
  /details\.(macro|crossAsset|positioning|conviction|scenario|invalidation|historical|recommendation|engine)/,
  "Free market UI must not read VIP-only projection details",
);
assert.doesNotMatch(
  marketSurfaceSource.toLowerCase(),
  /€str[\s\S]{0,120}\b(bullish|bearish)\b|\b(bullish|bearish)\b[\s\S]{0,120}€str/,
  "€STR presentation must not use FX directional terminology",
);

assert.equal(
  siteConfig.commerce.gumroadResearchUrl,
  "https://shop.chronoversecapital.com",
  "standalone research must use the existing verified first-party storefront",
);
assert.match(newsletterSource, /fetch\("\/api\/newsletter"/);
assert.doesNotMatch(newsletterSource, /\/api\/amazon|https?:\/\//);
assert.doesNotMatch(combinedHomepageSource, /NEXT_PUBLIC_.*(SECRET|KEY|LEMON)/);
assert.doesNotMatch(combinedHomepageSource, /ecb\.europa\.eu|api\.yahoo|query\d*\.finance/);
assert.doesNotMatch(combinedHomepageSource, /no-store|setInterval|setTimeout/);

console.log("PASS: Free homepage contract and five-market Lite boundary");
