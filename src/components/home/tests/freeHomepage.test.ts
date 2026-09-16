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
const headerSource = readSource("src/components/navigation/Header.tsx");
const footerSource = readSource("src/components/navigation/Footer.tsx");
const globalStylesSource = readSource("src/app/globals.css");
const projectionServiceSource = readSource(
  "src/lib/markets/services/canonicalProductResults.ts",
);
const canonicalSnapshotSource = readSource(
  "src/lib/markets/services/canonicalMarketSnapshot.ts",
);
const combinedHomepageSource = `${homepageSource}\n${marketSurfaceSource}`;
const combinedPresentationSource = [
  combinedHomepageSource,
  newsletterSource,
  headerSource,
  footerSource,
].join("\n");

assert.deepEqual(
  LAUNCH_MARKETS_V1.map((market) => market.label),
  ["EUR/USD", "EUR/JPY", "EUR/GBP", "EUR/CHF", "€STR"],
  "homepage scope must contain exactly the five launch labels in shared order",
);
assert.match(marketSurfaceSource, /LAUNCH_MARKETS_V1\.map/);
assert.match(
  homepageSource,
  /getFiveProductFreeLiteProjectionMapV1\(\)/,
  "homepage must load the server-owned Free Lite projection map",
);
assert.equal(
  homepageSource.match(/getFiveProductFreeLiteProjectionMapV1\(\)/g)?.length,
  1,
  "hero and market surface must share exactly one projection-map read",
);
assert.match(
  homepageSource,
  /export default async function HomePage\(\)[\s\S]{0,180}await getFiveProductFreeLiteProjectionMapV1\(\)/,
  "the complete above-the-fold market experience must resolve before composition",
);
assert.doesNotMatch(
  homepageSource,
  /MarketExperienceFallback|<Suspense[^>]*>[\s\S]*?<FreeMarketExperience/,
  "a short streaming fallback must not displace the downstream VIP section",
);
assert.match(projectionServiceSource, /Promise\.allSettled/);
assert.match(projectionServiceSource, /getCachedCanonicalFxResultBundleV1\(\)/);
assert.match(projectionServiceSource, /getCanonicalEstrResultV1\(\)/);
assert.match(projectionServiceSource, /import "server-only"/);
assert.doesNotMatch(marketSurfaceSource, /^"use client"/);
assert.doesNotMatch(marketSurfaceSource, /fetch\(|\/api\/markets?\//);
assert.doesNotMatch(
  canonicalSnapshotSource,
  /import\s*\{[\s\S]*?getHistoricalMarketData[\s\S]*?\}\s*from\s*["']\.\/historicalMarketData["']/,
  "Free's injected ECB path must not eagerly load the generic provider stack",
);
assert.match(
  canonicalSnapshotSource,
  /async function defaultHistoricalLoader[\s\S]{0,320}await import\("\.\/historicalMarketData"\)/,
  "the generic historical provider must load only when the default loader is invoked",
);

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
assert.match(
  homepageSource,
  /<Link href="\/pricing" className=\{PRIMARY_CTA_CLASS\}>[\s\S]{0,120}Explore VIP/,
  "homepage VIP exploration CTA must use the public Pricing surface",
);
assert.match(
  homepageSource,
  /title="Chronoverse VIP"[\s\S]{0,320}href="\/pricing"[\s\S]{0,120}cta="Explore VIP"/,
  "homepage VIP membership card must use the public Pricing surface",
);
assert.doesNotMatch(
  homepageSource,
  /href="\/vip"/,
  "homepage acquisition links must not send anonymous visitors into VIP auth",
);
assert.equal(existsSync(path.join(repositoryRoot, "src/app/(site)/markets/page.tsx")), true);
assert.equal(existsSync(path.join(repositoryRoot, "src/app/(vip)/vip/page.tsx")), true);
assert.equal(existsSync(path.join(repositoryRoot, "src/app/(site)/pricing/page.tsx")), true);

assert.match(
  homepageSource,
  /getLatestSanityArticles\(3\)/,
  "research preview must use exactly three real Sanity articles",
);
assert.match(homepageSource, /FeaturedArticle article=\{featuredArticle\}/);
assert.match(homepageSource, /secondaryArticles\.map/);
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
assert.doesNotMatch(
  combinedHomepageSource,
  /<canvas|<svg|sparkline|historicalSeries|priceHistory/i,
  "homepage must not imply or fabricate a historical chart series",
);

assert.match(
  homepageSource,
  /const PRIMARY_CTA_CLASS[\s\S]{0,300}chronoverse-primary-cta/,
  "homepage primary actions must use the scoped CTA color contract",
);
assert.equal(
  headerSource.match(/chronoverse-primary-cta/g)?.length,
  2,
  "desktop and mobile sign-in actions must use the scoped CTA color contract",
);
const primaryCtaRule = globalStylesSource.match(
  /a\.chronoverse-primary-cta\s*\{([\s\S]*?)\}/,
)?.[1];
const primaryCtaHoverRule = globalStylesSource.match(
  /a\.chronoverse-primary-cta:hover\s*\{([\s\S]*?)\}/,
)?.[1];
assert.ok(primaryCtaRule, "primary CTA base color rule must exist");
assert.ok(primaryCtaHoverRule, "primary CTA hover color rule must exist");
assert.match(primaryCtaRule, /background-color:\s*#a77bd8/i);
assert.match(primaryCtaRule, /color:\s*#050506/i);
assert.match(primaryCtaHoverRule, /background-color:\s*#c8a7e8/i);
assert.match(primaryCtaHoverRule, /color:\s*#050506/i);
assert.doesNotMatch(
  `${primaryCtaRule}\n${primaryCtaHoverRule}`,
  /background-color:\s*(?:white|#fff(?:fff)?|#f3ebdd)/i,
  "primary CTA must not use a white or cream background",
);
assert.match(
  homepageSource,
  /const SECONDARY_CTA_CLASS[\s\S]{0,500}border-\[#6F4C91\][\s\S]{0,500}text-\[#F3EBDD\]/,
  "secondary CTA contract must explicitly retain cream text contrast",
);
assert.match(newsletterSource, /bg-\[#A77BD8\]/);
assert.match(newsletterSource, /text-\[#050506\]/);
assert.match(
  homepageSource,
  /text-\[clamp\(2\.85rem,5\.5vw,4\.75rem\)\]/,
  "hero heading must scale fluidly across laptop and mobile viewports",
);
assert.match(
  homepageSource,
  /xl:grid-cols-\[minmax\(0,1\.48fr\)_minmax\(23rem,0\.82fr\)\]/,
  "hero must remain stacked through 1024 and become asymmetric at desktop width",
);
assert.match(marketSurfaceSource, /lg:grid-cols-6 xl:grid-cols-5/);
assert.match(marketSurfaceSource, /lg:col-start-2 xl:col-start-auto/);
assert.match(
  marketSurfaceSource,
  /xl:grid-cols-\[minmax\(0,1\.72fr\)_minmax\(20rem,0\.78fr\)\]/,
  "EUR/USD canvas must stack at tablet widths and split at desktop width",
);
assert.doesNotMatch(
  homepageSource,
  /min-h-screen|min-h-\[100vh\]|h-screen/,
  "homepage must not force a viewport-height hero",
);
assert.match(homepageSource, /max-w-\[88rem\]/);
assert.match(marketSurfaceSource, /max-w-\[88rem\]/);
assert.match(headerSource, /max-w-\[88rem\]/);
assert.match(footerSource, /max-w-\[88rem\]/);

for (const approvedColor of [
  "#050506",
  "#0D0D11",
  "#15131A",
  "#F3EBDD",
  "#CFC5B8",
  "#91889A",
  "#C8A7E8",
  "#A77BD8",
  "#6F4C91",
]) {
  assert.equal(
    combinedPresentationSource.includes(approvedColor),
    true,
    `presentation must retain approved color ${approvedColor}`,
  );
}

assert.doesNotMatch(
  combinedPresentationSource,
  /swiper|carousel|overflow-x-auto|snap-mandatory|snap-x/i,
  "homepage must not add a horizontal-carousel dependency",
);
assert.doesNotMatch(
  combinedPresentationSource,
  /framer-motion|motion\/react|@react-spring|lottie|gsap/i,
  "homepage must not add an animation framework",
);
assert.doesNotMatch(
  combinedHomepageSource,
  /text-\[#6F4C91\]/,
  "homepage foreground text must not use the low-contrast decorative purple",
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
