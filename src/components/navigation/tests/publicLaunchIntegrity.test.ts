import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { generateExecutiveSummary } from "../../../lib/executiveSummary";

const repositoryRoot = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(path.join(repositoryRoot, relativePath), "utf8");

const retiredRoutes = new Map([
  ["src/app/(site)/intelligence/page.tsx", "/markets"],
  ["src/app/(site)/premium/page.tsx", "/pricing"],
  ["src/app/(site)/markets/bitcoin/page.tsx", "/markets"],
  ["src/app/(site)/markets/gold/page.tsx", "/markets"],
  ["src/app/(site)/markets/oil/page.tsx", "/markets"],
  ["src/app/(site)/markets/sp500/page.tsx", "/markets"],
]);

for (const [relativePath, destination] of retiredRoutes) {
  const source = readSource(relativePath);
  assert.match(source, /import \{ permanentRedirect \} from "next\/navigation"/);
  assert.equal(
    source.includes(`permanentRedirect("${destination}")`),
    true,
    `${relativePath} must redirect to ${destination}`,
  );
  assert.doesNotMatch(
    source,
    /LEMON-70|vault\.chronoversecapital\.com|LOCAL_FALLBACK_QUOTES|\bLive\b|\breal-time\b/i,
    `${relativePath} must not retain its obsolete public experience`,
  );
}

const retiredProductsPage = readSource("src/app/(site)/products/page.tsx");
assert.match(retiredProductsPage, /notFound\(\)/);
assert.doesNotMatch(retiredProductsPage, /redirect/i);

for (const retiredApi of [
  "src/app/api/market-data/route.ts",
  "src/app/api/markets/gold/intelligence/route.ts",
  "src/app/api/markets/oil/intelligence/route.ts",
]) {
  const source = readSource(retiredApi);
  assert.match(source, /\{ status: 410 \}/, `${retiredApi} must return Gone`);
  assert.doesNotMatch(
    source,
    /getHistoricalMarketData|getMarketQuotes|getCanonicalLive|unstable_cache/,
    `${retiredApi} must not invoke a legacy provider or engine`,
  );
}

const sitemapSource = readSource("src/app/sitemap.ts");
const reservedSlugsSource = readSource("src/lib/content/reservedSlugs.ts");
const vipPageAccessSource = readSource("src/lib/auth/vipPageAccess.ts");
assert.doesNotMatch(vipPageAccessSource, /"\/premium"/);
assert.match(vipPageAccessSource, /redirectTo\("\/pricing"\)/);
for (const retiredSlug of [
  "intelligence",
  "premium",
  "products",
  "markets/bitcoin",
  "markets/gold",
  "markets/oil",
  "markets/sp500",
]) {
  assert.equal(
    retiredSlug.includes("/")
      ? sitemapSource.includes("ROOT_POST_SLUG_FORMAT.test(post.slug)")
      : reservedSlugsSource.includes(`"${retiredSlug}"`),
    true,
    `shared sitemap policy must exclude retired route ${retiredSlug}`,
  );
  assert.equal(
    sitemapSource.includes(`path: "${retiredSlug}"`),
    false,
    `sitemap must exclude retired route ${retiredSlug}`,
  );
}
assert.match(sitemapSource, /isReservedRootSlug\(post\.slug\)/);

const contentSource = readSource("src/lib/content.ts");
const articleSource = readSource("src/app/(site)/[slug]/page.tsx");
const articleSeoSource = readSource("src/lib/seo/article.ts");
const summaryComponentSource = readSource(
  "src/components/AIExecutiveSummary.tsx",
);
const authorCardSource = readSource("src/components/authorcard.tsx");

assert.doesNotMatch(
  contentSource,
  /deglobalization-impact\/1767774882\.webp|2026-08-01|Ahmed Abdel-Fattah/,
);
assert.match(contentSource, /DEFAULT_CATEGORY = "General"/);
assert.match(contentSource, /DEFAULT_CATEGORY_SLUG = "general"/);
assert.match(contentSource, /coalesce\(tags, keywords, \[\]\)/);
assert.match(contentSource, /relatedPost\?\._isPublic === true/);
assert.doesNotMatch(articleSource, /logo\.png|Visual representation of|autoCaption/);
assert.doesNotMatch(
  articleSeoSource,
  /datePublished:[^\n]*new Date|dateModified:[^\n]*new Date/,
);
assert.match(articleSource, /publishedAt: article\.publishedAt/);
assert.match(articleSource, /modifiedAt: article\.updatedAt/);
assert.match(articleSeoSource, /datePublished: article\.publishedAt/);
assert.match(articleSeoSource, /dateModified: article\.modifiedAt/);
assert.match(articleSeoSource, /buildCanonicalUrl\("\/logo\.svg"\)/);
assert.match(summaryComponentSource, /aria-label="Executive Summary"/);
assert.doesNotMatch(
  summaryComponentSource,
  /aria-label="AI Executive Summary"|auto-generated briefing/,
);
assert.doesNotMatch(authorCardSource, /Ahmed Nasr Hassan|Lead Macro Strategist|https?:\/\//);
assert.match(authorCardSource, /if \(!normalizedName\) return null/);
assert.equal(existsSync(path.join(repositoryRoot, "public/logo.svg")), true);

assert.deepEqual(
  generateExecutiveSummary("Empty", "Research", "", []),
  [],
  "an empty article must not receive fabricated summary points",
);
const oneSentence =
  "The key rate remained stable throughout the recorded observation window.";
assert.deepEqual(
  generateExecutiveSummary("Key rate", "Rates", oneSentence, ["rate"]),
  [oneSentence],
  "a source sentence must remain intact rather than losing ordinary words",
);
const summarySource = [
  "The first recorded observation provides enough context for a sourced passage.",
  "The second recorded observation contains a numerical reference of 42 percent.",
  "The third recorded observation describes the documented analytical boundary.",
  "The fourth recorded observation remains available but should not create padding.",
].join(" ");
const extractedPoints = generateExecutiveSummary(
  "Recorded observations",
  "Research",
  summarySource,
  ["recorded"],
);
assert.equal(extractedPoints.length <= 3, true);
for (const point of extractedPoints) {
  assert.equal(
    summarySource.includes(point.replace(/\.\.\.$/, "")),
    true,
    "every summary point must derive from the article source",
  );
}

const newsletterApiSource = readSource("src/app/api/newsletter/route.ts");
const homepageNewsletterSource = readSource("src/components/NewsLetterForm.tsx");
const newsletterPageSource = readSource("src/app/newsletter/page.tsx");
for (const clientSource of [homepageNewsletterSource, newsletterPageSource]) {
  assert.match(clientSource, /fetch\("\/api\/newsletter"/);
  assert.match(clientSource, /email\.trim\(\)/);
  assert.doesNotMatch(clientSource, /\/api\/amazon|NEXT_PUBLIC_.*(?:SECRET|KEY)/);
}
assert.match(newsletterApiSource, /getSanityWriteClient\(\)/);
assert.match(newsletterApiSource, /\{_id, active\}/);
assert.match(newsletterApiSource, /\.patch\(existing\._id\)/);
assert.match(newsletterApiSource, /existing\.active !== true/);
assert.match(newsletterApiSource, /createIfNotExists/);
assert.match(newsletterApiSource, /createHash\("sha256"\)/);
assert.match(newsletterApiSource, /\{ status: 503 \}/);
assert.match(newsletterApiSource, /message: "Subscription recorded"/);
assert.match(newsletterApiSource, /source: "chronoversecapital\.com\/newsletter"/);
assert.doesNotMatch(newsletterApiSource, /SESClient|SendEmailCommand|\.send\(/);

const layoutSource = readSource("src/app/layout.tsx");
const cookieSource = readSource("src/components/cookiesconsent.tsx");
const cookieWrapperSource = readSource(
  "src/components/CookieConsentWrapper.tsx",
);
const consentDefaultIndex = layoutSource.indexOf("'consent', 'default'");
const analyticsLoaderIndex = layoutSource.indexOf(
  "window.loadChronoverseAnalytics = function",
);
const analyticsConfigIndex = layoutSource.indexOf("window.gtag('config'");
const googleScriptIndex = layoutSource.indexOf("www.googletagmanager.com");

assert.equal(consentDefaultIndex >= 0, true);
assert.equal(consentDefaultIndex < analyticsLoaderIndex, true);
assert.equal(analyticsLoaderIndex < analyticsConfigIndex, true);
assert.equal(analyticsLoaderIndex < googleScriptIndex, true);
assert.match(layoutSource, /parsedConsent\.analytics === true/);
assert.match(
  layoutSource,
  /if \(analyticsAllowed\) window\.loadChronoverseAnalytics\(\)/,
);
assert.doesNotMatch(layoutSource, /requestIdleCallback|loadGtagScript/);
assert.match(cookieSource, /analytics: false/);
assert.match(cookieSource, /window\.loadChronoverseAnalytics\(\)/);
assert.doesNotMatch(
  cookieSource,
  /personalized market insights|sponsor offers|Toggle marketing cookies/,
);
assert.match(cookieWrapperSource, /chrono_cookie_consent/);
assert.match(cookieWrapperSource, /cookie_consent/);

const currentTruthSources = [
  readSource("src/app/(site)/about/page.tsx"),
  readSource("src/app/(site)/faq/page.tsx"),
  readSource("src/app/(site)/pricing/page.tsx"),
  readSource("src/app/(site)/privacy-policy/page.tsx"),
  readSource("src/app/(site)/terms-of-service/page.tsx"),
  readSource("src/app/layout.tsx"),
].join("\n");
const pricingSource = readSource("src/app/(site)/pricing/page.tsx");
assert.match(pricingSource, /\$15\.99 monthly/);
assert.match(pricingSource, /\$150\.99 annually/);
assert.match(pricingSource, /<CheckoutButtons \/>/);
assert.match(pricingSource, /billing-portal controls/i);
assert.doesNotMatch(
  currentTruthSources,
  /LEMON-70|vault\.chronoversecapital\.com|real-time intelligence alerts/i,
);
for (const launchProduct of ["EUR/USD", "EUR/JPY", "EUR/GBP", "EUR/CHF", "€STR"]) {
  assert.equal(currentTruthSources.includes(launchProduct), true);
}

console.log("PASS: public launch route, content, newsletter, and consent integrity");
