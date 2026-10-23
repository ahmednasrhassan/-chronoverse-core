import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const homepage = read("src/app/(site)/page.tsx") + "\n" + read("src/components/home/FreeHomePageContent.tsx");
const navigation = read("src/config/institutionalNavigation.ts");

assert.match(homepage, /getLatestSanityArticles\(3\)/);
assert.match(homepage, /href="\/reports"/);
assert.match(homepage, /FeaturedArticle article=\{featuredArticle\}/);
assert.match(homepage, /secondaryArticles\.map/);
assert.doesNotMatch(homepage, /MarketToolsPreview|LatestMarketTools|getFiveProductFreeLiteProjectionMapV1|href="\/markets"|Five free market tools|Explore Free Market Tools/);
assert.doesNotMatch(navigation, /href: "\/markets"/);
assert.equal(existsSync(path.join(root, "src/app/(site)/markets/page.tsx")), false);
assert.match(homepage, /Newsletter/);
console.log("PASS: research-first homepage with legacy five-market tools retired");
