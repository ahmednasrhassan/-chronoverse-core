/**
 * publish-article.js
 *
 * Write an article as plain Markdown (with a small frontmatter header),
 * and this script converts it to the correct HTML for the `bodyRaw`
 * (Legacy Body) field AND uploads it straight to Sanity — no manual HTML
 * conversion needed per article.
 *
 * Heading rules (matches the site's SEO setup — see the `post` schema):
 *   - Never produces <h1>. A stray single "#" in your Markdown is
 *     automatically treated as "##" (H2) instead, since the article's
 *     only H1 is always the post title itself.
 *   - "##" -> <h2>, "###" -> <h3>, "####" -> <h4>, and so on up to H6.
 *   - "**bold**", "*italic*", "> blockquote" are converted automatically.
 *   - "$$...$$" display-math blocks are protected during conversion so
 *     Markdown doesn't mangle underscores/asterisks inside LaTeX, then
 *     restored exactly as written (still readable by the site's
 *     MathContent/KaTeX renderer).
 *
 * ---------------------------------------------------------------------
 * SETUP (one-time):
 *   npm install marked gray-matter @sanity/client dotenv
 *
 * Create a .env file in the same folder:
 *   SANITY_PROJECT_ID=xxxxx
 *   SANITY_DATASET=production
 *   SANITY_TOKEN=sk...        <- needs Write/Editor access
 *
 * ---------------------------------------------------------------------
 * WRITING AN ARTICLE (article.md):
 *
 *   ---
 *   title: Why Central Banks Are Buying Gold Again
 *   slug: why-central-banks-are-buying-gold-again   (optional — auto-generated from title if omitted)
 *   category: macro-echoes                          (category slug OR title — optional, falls back to "General")
 *   seoDescription: A look at central-bank gold demand and what it means for reserve diversification.
 *   tags: gold, central-banks, reserves, macro       (optional, comma-separated)
 *   publishedAt: 2026-08-20T09:00:00Z                (optional — omit to publish immediately)
 *   ---
 *
 *   There is a peculiar contradiction unfolding in global finance.
 *
 *   ## The Asset That Has No Issuer
 *
 *   Modern finance is built around claims...
 *
 *   $$
 *   \sigma_p^2 = \sum_i w_i^2\sigma_i^2
 *   $$
 *
 * ---------------------------------------------------------------------
 * USAGE:
 *
 *   Preview only (no upload, just shows what would be sent):
 *     node publish-article.js article.md --dry-run
 *
 *   Publish as a NEW post:
 *     node publish-article.js article.md
 *
 *   Update an EXISTING post that has the same slug, instead of erroring:
 *     node publish-article.js article.md --update
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const { marked } = require("marked");
const { createClient } = require("@sanity/client");

const client = createClient({
  projectId: process.env.SANITY_PROJECT_ID,
  dataset: process.env.SANITY_DATASET || "production",
  token: process.env.SANITY_TOKEN,
  apiVersion: "2024-01-01",
  useCdn: false,
});

const DRY_RUN = process.argv.includes("--dry-run");
const UPDATE_EXISTING = process.argv.includes("--update");
const filePath = process.argv[2];

if (!filePath || filePath.startsWith("--")) {
  console.error("Usage: node publish-article.js <article.md> [--dry-run] [--update]");
  process.exit(1);
}

/**
 * Protects $$...$$ display-math blocks from Markdown's own formatting
 * rules (e.g. underscores inside LaTeX like `w_i` being misread as
 * emphasis) by swapping them for placeholders before conversion, then
 * restoring the exact original text afterward.
 */
function protectMathBlocks(markdown) {
  const blocks = [];
  const protectedMarkdown = markdown.replace(/\$\$[\s\S]*?\$\$/g, (match) => {
    blocks.push(match);
    return `@@MATH_BLOCK_${blocks.length - 1}@@`;
  });
  return { protectedMarkdown, blocks };
}

function restoreMathBlocks(html, blocks) {
  return html.replace(/@@MATH_BLOCK_(\d+)@@/g, (_, idx) => blocks[Number(idx)]);
}

/**
 * Converts a slug-ish or Title Case string into a clean, URL-safe slug:
 * lowercase, hyphen-separated, matching the format every route/query in
 * the app expects.
 */
function slugify(input) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

async function resolveCategoryId(categoryInput) {
  if (!categoryInput) return null;

  const query = `*[_type == "category" && (slug.current == $val || lower(title) == lower($val))][0]{ _id }`;
  const result = await client.fetch(query, { val: categoryInput.trim() });

  if (!result?._id) {
    console.warn(
      `⚠️  No category found matching "${categoryInput}" (checked both slug and title). ` +
      `The post will be created WITHOUT a category and will fall back to "General" on the live site.`
    );
    return null;
  }
  return result._id;
}

async function main() {
  const raw = fs.readFileSync(path.resolve(filePath), "utf8");
  const { data: frontmatter, content: markdownBody } = matter(raw);

  if (!frontmatter.title) {
    console.error('❌ Missing required frontmatter field: "title"');
    process.exit(1);
  }

  const title = frontmatter.title.trim();
  const slug = frontmatter.slug ? slugify(frontmatter.slug) : slugify(title);
  const tags = frontmatter.tags
    ? String(frontmatter.tags).split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  // --- Markdown -> HTML conversion ---
  const { protectedMarkdown, blocks } = protectMathBlocks(markdownBody);

  const renderer = new marked.Renderer();
  renderer.heading = (text, level) => {
    // Never emit <h1> — the page's only H1 is the post title. A stray
    // single "#" (level 1) in the source Markdown is bumped to H2;
    // levels 2-6 pass through unchanged.
    const safeLevel = Math.max(level, 2);
    return `<h${safeLevel}>${text}</h${safeLevel}>\n`;
  };

  marked.setOptions({ renderer, gfm: true, breaks: false });

  let html = marked.parse(protectedMarkdown);
  html = restoreMathBlocks(html, blocks);

  // --- Resolve category reference ---
  const categoryId = await resolveCategoryId(frontmatter.category);

  const doc = {
    _type: "post",
    title,
    slug: { _type: "slug", current: slug },
    publishedAt: frontmatter.publishedAt || new Date().toISOString(),
    seoDescription: frontmatter.seoDescription || undefined,
    keywords: tags.length > 0 ? tags : undefined,
    bodyRaw: html,
    ...(categoryId ? { category: { _type: "reference", _ref: categoryId } } : {}),
  };

  console.log("\n--- Generated document ---");
  console.log(JSON.stringify({ ...doc, bodyRaw: `[${html.length} chars of HTML]` }, null, 2));
  console.log("\n--- HTML preview (first 500 chars) ---");
  console.log(html.slice(0, 500) + (html.length > 500 ? "..." : ""));

  if (DRY_RUN) {
    console.log("\n(dry-run — nothing was uploaded to Sanity)");
    return;
  }

  // Check whether a post with this slug already exists
  const existing = await client.fetch(
    `*[_type == "post" && slug.current == $slug][0]{ _id }`,
    { slug }
  );

  if (existing?._id && !UPDATE_EXISTING) {
    console.error(
      `\n❌ A post with slug "${slug}" already exists (id: ${existing._id}). ` +
      `Re-run with --update if you meant to overwrite it.`
    );
    process.exit(1);
  }

  if (existing?._id && UPDATE_EXISTING) {
    await client.patch(existing._id).set(doc).commit();
    console.log(`\n✅ Updated existing post: ${existing._id}`);
  } else {
    const created = await client.create(doc);
    console.log(`\n✅ Created new post: ${created._id}`);
  }
}

main().catch((err) => {
  console.error("\n❌ Failed:", err);
  process.exit(1);
});