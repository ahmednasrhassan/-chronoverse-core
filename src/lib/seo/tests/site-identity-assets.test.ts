import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { XMLParser } from "fast-xml-parser";

const repositoryRoot = process.cwd();
const resolveRepositoryPath = (relativePath: string) =>
  path.join(repositoryRoot, relativePath);
const readSource = (relativePath: string) =>
  readFileSync(resolveRepositoryPath(relativePath), "utf8");

const publicLogoPath = resolveRepositoryPath("public/logo.svg");
const publicSocialImagePath = resolveRepositoryPath(
  "public/chronoverse-social.png",
);
const appIconPath = resolveRepositoryPath("src/app/icon.svg");
const publicLogo = readFileSync(publicLogoPath);
const publicSocialImage = readFileSync(publicSocialImagePath);
const appIcon = readFileSync(appIconPath);
const appIconSource = appIcon.toString("utf8");

assert.equal(existsSync(publicLogoPath), true);
assert.equal(existsSync(publicSocialImagePath), true);
assert.equal(existsSync(appIconPath), true);
assert.equal(
  appIcon.equals(publicLogo),
  true,
  "the app icon must reuse the verified public Chronoverse logo unchanged",
);
assert.match(appIconSource, /^<svg\b/);
assert.equal(
  new XMLParser({ ignoreAttributes: false }).parse(appIconSource).svg?.["@_viewBox"],
  "0 0 512 512",
  "the selected icon must remain a parseable square SVG",
);
assert.equal(
  publicSocialImage.subarray(1, 4).toString("ascii"),
  "PNG",
  "the public social image must be a PNG",
);
assert.equal(publicSocialImage.readUInt32BE(16), 1200);
assert.equal(publicSocialImage.readUInt32BE(20), 630);

for (const invalidLegacyAsset of [
  "src/app/favicon.jpeg",
  "src/app/favicon-new.png",
]) {
  assert.equal(
    existsSync(resolveRepositoryPath(invalidLegacyAsset)),
    false,
    `${invalidLegacyAsset} must remain absent`,
  );
}

const layoutSource = readSource("src/app/layout.tsx");
const metadataSource = readSource("src/lib/seo/metadata.ts");
const articleSeoSource = readSource("src/lib/seo/article.ts");
const ogSource = readSource("src/app/api/og/route.tsx");
const genericIdentitySources = [layoutSource, metadataSource, articleSeoSource, ogSource].join("\n");
const personalPortraitId = "a03a88e45b450a8f347633edf76d251bd9881fea";

assert.doesNotMatch(layoutSource, /\bicons\s*:/);
assert.doesNotMatch(metadataSource, /\bicons\s*:/);
assert.equal(genericIdentitySources.includes(personalPortraitId), false);
assert.match(articleSeoSource, /buildCanonicalUrl\("\/logo\.svg"\)/);
assert.match(ogSource, /Chronoverse Capital/);
assert.doesNotMatch(ogSource, /\bAfrico\b|strategic partner/i);
assert.doesNotMatch(ogSource, /\bVIP\b|checkout|billing|entitlement/i);
assert.doesNotMatch(ogSource, /\bGold\b|Bitcoin|S&P|Nasdaq|\bOil\b|\bDXY\b/i);

console.log("PASS: SEO-B10 site identity asset integrity");
