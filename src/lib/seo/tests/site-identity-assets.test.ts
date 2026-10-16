import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const repositoryRoot = process.cwd();
const resolveRepositoryPath = (relativePath: string) =>
  path.join(repositoryRoot, relativePath);
const readSource = (relativePath: string) =>
  readFileSync(resolveRepositoryPath(relativePath), "utf8");

const publicLogoPath = resolveRepositoryPath("public/chronoverse-capital-official-logo.png");
const publicSocialImagePath = resolveRepositoryPath(
  "public/chronoverse-social.png",
);
const appIconPath = resolveRepositoryPath("src/app/icon.png");
const publicLogo = readFileSync(publicLogoPath);
const publicSocialImage = readFileSync(publicSocialImagePath);
const appIcon = readFileSync(appIconPath);

assert.equal(existsSync(publicLogoPath), true);
assert.equal(existsSync(publicSocialImagePath), true);
assert.equal(existsSync(appIconPath), true);
assert.equal(publicLogo.subarray(1, 4).toString("ascii"), "PNG");
assert.equal(appIcon.subarray(1, 4).toString("ascii"), "PNG");
assert.equal(appIcon.readUInt32BE(16), 192);
assert.equal(appIcon.readUInt32BE(20), 192);
const appleIcon = readFileSync(resolveRepositoryPath("src/app/apple-icon.png"));
assert.equal(appleIcon.subarray(1, 4).toString("ascii"), "PNG");
assert.equal(appleIcon.readUInt32BE(16), 180);
assert.equal(appleIcon.readUInt32BE(20), 180);
assert.equal(existsSync(resolveRepositoryPath("src/app/favicon.ico")), true);
assert.equal(existsSync(resolveRepositoryPath("src/app/icon.svg")), false);
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
assert.match(articleSeoSource, /buildCanonicalUrl\("\/chronoverse-capital-official-logo\.png"\)/);
assert.match(ogSource, /Chronoverse Capital/);
assert.doesNotMatch(ogSource, /\bAfrico\b|strategic partner/i);
assert.doesNotMatch(ogSource, /\bVIP\b|checkout|billing|entitlement/i);
assert.doesNotMatch(ogSource, /\bGold\b|Bitcoin|S&P|Nasdaq|\bOil\b|\bDXY\b/i);

console.log("PASS: SEO-B10 site identity asset integrity");
