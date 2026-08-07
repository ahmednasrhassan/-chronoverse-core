import { client } from "../sanity/client";
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { getReadingTime } from "./readingTime";
import {
  generateExcerpt,
  generateFallbackTags,
  resolveFallbackCategory,
  slugifyCategory,
} from "./metadataFallback";





declare const process: {
  cwd(): string;
};

// Default/fallback category applied whenever a post has no category
// assigned in Sanity. This prevents "uncategorized" posts from breaking
// /category/[slug] links, SEO breadcrumbs, or UI badges.
export const DEFAULT_CATEGORY = "General";
export const DEFAULT_CATEGORY_SLUG = "general";

export interface ContentItem {
  slug: string;
  title: string;
  date: string;
  category: string;
  categorySlug?: string;
  keywords: string[];
  content: string;
  legacyBody?: string;
  imageUrl?: string;
  author?: string;
  seoDescription?: string;
  bodyContent?: string;
  /**
   * Optional manually-curated internal links, set explicitly by an editor
   * in Sanity (`manualRelatedLinks` field on the `post` schema). When
   * present, these take priority over the automated relevance-scoring
   * engine (see `src/lib/relatedArticles.ts`) for the "Related
   * Intelligence" block on the post page.
   */
  manualRelatedLinks?: ContentItem[];
}

interface SanityRawPost {
  slug: string | null;
  title: string | null;
  date: string | null;
  category: string | null;
  categorySlug: string | null;
  keywords: string[] | null;
  content: string | unknown;
  legacyBody: string | null;
  imageUrl: string | null;
  author: string | null;
  seoDescription?: string | null;
  bodyPlainText?: string | null;
  manualRelatedLinks?: SanityRawPost[] | null;
}




/**
 * Strips HTML tags safely from a string.
 */
export function stripHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>?/gm, "");
}

/**
 * Automated Featured Image Fallback.
 *
 * Legacy (Blogger-imported) posts often embed their lead image directly as
 * the first `<img>` tag inside the raw `legacyBody`/`legacyHtml` content,
 * rather than having a `mainImage` asset configured in Sanity. This helper
 * scans the raw HTML and extracts the `src` of the first `<img>` tag found,
 * so it can be used as a deterministic fallback for both the on-page hero
 * image and the `og:image`/Twitter card metadata when `mainImage` is empty.
 */
export function extractFirstImageSrc(html: string): string | undefined {
  if (!html) return undefined;
  const match = html.match(/<img[^>]*\ssrc\s*=\s*["']([^"']+)["']/i);
  return match ? match[1] : undefined;
}

/**
 * Sanitizes HTML to prevent XSS (Cross-Site Scripting) attacks by removing dangerous tags and attributes.
 */
export function sanitizeHtml(html: string): string {

  if (!html) return "";
  
  // Remove script tags and their content
  let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  
  // Remove iframe tags and their content
  clean = clean.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "");
  
  // Remove inline event handlers (e.g., onload, onerror, onclick, etc.)
  clean = clean.replace(/\s+on\w+\s*=\s*(['"][^'"]*['"]|[^\s>]+)/gi, "");
  
  // Sanitize javascript: URIs in href and src attributes
  clean = clean.replace(/href\s*=\s*['"]javascript:[^'"]*['"]/gi, 'href="#"');
  clean = clean.replace(/src\s*=\s*['"]javascript:[^'"]*['"]/gi, 'src=""');
  
  return clean;
}

/**
 * Calculates the estimated read time in minutes.
 * Ensures accurate calculation by ignoring empty strings and spaces.
 */
export function calculateReadTime(text: string): number {
  return getReadingTime(text);
}


// Shared GROQ projection for post -> ContentItem mapping. Includes
// `seoDescription` and a flattened `bodyPlainText` (via Sanity's `pt::text`)
// so the front-end can build automated meta descriptions and internal-link
// queries without re-fetching full Portable Text blocks.
const POST_PROJECTION = `{
    "slug": slug.current,
    title,
    "date": publishedAt,
    "category": category->title,
    "categorySlug": category->slug.current,
    keywords,
    "content": body,
    legacyBody,
    "imageUrl": mainImage.asset->url,
    "author": author->name,
    seoDescription,
    "bodyPlainText": pt::text(body),
    "manualRelatedLinks": manualRelatedLinks[]->{
      "slug": slug.current,
      title,
      "date": publishedAt,
      "category": category->title,
      "categorySlug": category->slug.current,
      keywords,
      "content": body,
      legacyBody,
      "imageUrl": mainImage.asset->url,
      "author": author->name,
      seoDescription,
      "bodyPlainText": pt::text(body)
    }
  }`;

function mapSanityPost(post: SanityRawPost): ContentItem {
  // Extract plain text from the structured `body` (via `pt::text`) or the
  // raw `legacyBody` HTML (Blogger imports) — stripping all HTML tags so
  // every downstream fallback (description, tags, category) operates on
  // clean text only.
  const bodyContent =
    post.bodyPlainText || stripHtml(post.legacyBody || "") || "";

  const title = post.title || "Untitled";

  // --- Automated Featured Image Fallback ---
  // If no `mainImage` asset is configured in Sanity (common for legacy
  // Blogger-imported posts), fall back to the first `<img>` tag found
  // inside the raw `legacyBody` HTML content, then finally to a generic
  // placeholder image so the UI/SEO metadata never ship without an image.
  const resolvedImageUrl =
    post.imageUrl ||
    extractFirstImageSrc(post.legacyBody || "") ||
    "/images/articles/deglobalization-impact/1767774882.webp";


  // --- Automated SEO Description / Excerpt Fallback ---
  // If no `seoDescription` was authored in Sanity, dynamically generate a
  // clean 150–160 character excerpt from the first paragraph of the plain
  // text so no post ever ships without a meta description.
  const resolvedSeoDescription =
    post.seoDescription && post.seoDescription.trim().length > 0
      ? post.seoDescription.trim()
      : generateExcerpt(bodyContent);

  // --- Automated Tags Fallback ---
  // If no tags/keywords were defined in Sanity, dynamically extract the top
  // key terms/phrases from the title and content body to serve as fallback
  // tags for internal-linking relevance scoring and UI display.
  const resolvedKeywords =
    post.keywords && post.keywords.length > 0
      ? post.keywords
      : generateFallbackTags(title, bodyContent);

  // --- Automated Category Fallback ---
  // If no category was assigned in Sanity, dynamically assign a default
  // category based on keyword matching against the title + body text
  // (e.g. "macro"/"fed"/"inflation" -> Macroeconomics), otherwise defaulting
  // to "General Analysis".
  const resolvedCategory =
    post.category || resolveFallbackCategory(`${title} ${bodyContent}`);
  const resolvedCategorySlug =
    post.categorySlug || slugifyCategory(resolvedCategory);

  return {
    slug: post.slug || "",
    title,
    date: post.date ? new Date(post.date).toISOString().split("T")[0] : "2026-08-01",
    category: resolvedCategory,
    categorySlug: resolvedCategorySlug,
    keywords: resolvedKeywords,
    content: typeof post.content === "string" ? post.content : "Article content from Sanity...",
    legacyBody: post.legacyBody || "",
    imageUrl: resolvedImageUrl,
    author: post.author || "Ahmed Abdel-Fattah",

    seoDescription: resolvedSeoDescription || undefined,
    bodyContent,
    manualRelatedLinks:
      post.manualRelatedLinks && post.manualRelatedLinks.length > 0
        ? post.manualRelatedLinks.filter(Boolean).map(mapSanityPost)
        : undefined,
  };
}



// 1. Fetch a single article by its slug with fallback to local content
export async function getSanityArticleBySlug(slug: string): Promise<ContentItem | null> {
  const query = `*[_type == "post" && slug.current == $slug][0] ${POST_PROJECTION}`;

  try {
    const post = await client.fetch<SanityRawPost | null>(query, { slug });
    if (post) {
      return mapSanityPost(post);
    }
  } catch (error) {
    console.warn(`Sanity fetch for slug "${slug}" failed, falling back to local content:`, error);
  }


  // Fallback to local content search
  const localArticles = getLocalContent();
  return localArticles.find((item) => item.slug === slug) || null;
}

// 2. Fetch articles directly from Sanity CMS
export async function getSanityArticles(): Promise<ContentItem[]> {
  const query = `*[_type == "post"] | order(publishedAt desc) ${POST_PROJECTION}`;

  try {
    const posts = await client.fetch<SanityRawPost[]>(query);
    if (posts && posts.length > 0) {
      return posts.map(mapSanityPost);
    }
  } catch (error) {
    console.warn("Sanity fetch failed, falling back to local content:", error);
  }

  return getLocalContent();
}

/**
 * Fetch all articles belonging to a specific category, matched by the
 * category document's slug (which should mirror the imported Blogger
 * label). Falls back to filtering local content by category name if the
 * Sanity query fails or returns nothing.
 */
export async function getSanityArticlesByCategorySlug(categorySlug: string): Promise<ContentItem[]> {
  const query = `*[_type == "post" && category->slug.current == $categorySlug] | order(publishedAt desc) ${POST_PROJECTION}`;

  try {
    const posts = await client.fetch<SanityRawPost[]>(query, { categorySlug });
    if (posts && posts.length > 0) {
      return posts.map(mapSanityPost);
    }
  } catch (error) {
    console.warn(`Sanity fetch for category "${categorySlug}" failed, falling back to local content:`, error);
  }

  // Fallback: filter local content by matching category name (slugified)
  return getLocalContent().filter(
    (item) => item.category.toLowerCase().replace(/\s+/g, "-") === categorySlug.toLowerCase()
  );
}

/**
 * Automated Internal Linking Engine.
 *
 * Fetches 6–8 related `post` documents that share either the current
 * post's category or at least one overlapping keyword/tag. Excludes the
 * current post itself. Falls back to the most recent posts (excluding the
 * current one) if no category/keyword overlap is found, so the
 * InternalLinksBox component always has content to render.
 */
export async function getRelatedArticles(
  currentSlug: string,
  categorySlug?: string,
  keywords: string[] = [],
  limit: number = 8
): Promise<ContentItem[]> {
  const query = `*[
      _type == "post" &&
      slug.current != $currentSlug &&
      (
        ($categorySlug != null && category->slug.current == $categorySlug) ||
        count((keywords[])[@ in $keywords]) > 0
      )
    ] | order(publishedAt desc) [0...$limit] ${POST_PROJECTION}`;

  try {
    const posts = await client.fetch<SanityRawPost[]>(query, {
      currentSlug,
      categorySlug: categorySlug || null,
      keywords,
      limit,
    });

    if (posts && posts.length > 0) {
      return posts.map(mapSanityPost);
    }
  } catch (error) {
    console.warn(`Sanity fetch for related articles to "${currentSlug}" failed:`, error);
  }

  // Fallback: most recent posts excluding the current slug, capped to a
  // minimum of 6 items where possible.
  try {
    const fallbackQuery = `*[_type == "post" && slug.current != $currentSlug] | order(publishedAt desc) [0...$limit] ${POST_PROJECTION}`;
    const fallbackPosts = await client.fetch<SanityRawPost[]>(fallbackQuery, {
      currentSlug,
      limit,
    });
    return (fallbackPosts || []).map(mapSanityPost);
  } catch (error) {
    console.warn("Sanity fallback fetch for related articles failed:", error);
    return [];
  }
}


// ---------------------------------------------------------------------------
// Administrative Pages (`_type == "page"`) — kept intentionally separate
// from the `post` fetchers above. These are static/administrative documents
// (About, Privacy Policy, etc.) authored under the "Pages" section of the
// Studio sidebar, and never appear in `getSanityArticles` /
// `getRelatedArticles` / the InternalLinksBox.
// ---------------------------------------------------------------------------
export interface PageContentItem {
  slug: string;
  title: string;
  seoDescription?: string;
  bodyContent?: string;
  imageUrl?: string;
  /**
   * Raw legacy HTML/CSS/JS pasted directly into the Studio (see the
   * `legacyHtml` field on the `page` schema). When present, this takes
   * priority over `bodyContent` on the front-end and is rendered via
   * `dangerouslySetInnerHTML` (after sanitization) — used for imported
   * Blogger templates or standalone legacy microsites.
   */
  legacyHtml?: string;
}

interface SanityRawPage {
  slug: string | null;
  title: string | null;
  seoDescription?: string | null;
  bodyPlainText?: string | null;
  imageUrl?: string | null;
  legacyHtml?: string | null;
}

/**
 * Fetch a single administrative `page` document by slug. Returns `null` if
 * no matching page exists (callers should then 404, distinct from the
 * `post` 404/fallback flow).
 */
export async function getSanityPageBySlug(slug: string): Promise<PageContentItem | null> {
  const query = `*[_type == "page" && slug.current == $slug][0] {
    "slug": slug.current,
    title,
    seoDescription,
    "bodyPlainText": pt::text(content),
    "imageUrl": mainImage.asset->url,
    legacyHtml
  }`;

  try {
    const page = await client.fetch<SanityRawPage | null>(query, { slug });
    if (!page) return null;
    return {
      slug: page.slug || "",
      title: page.title || "Untitled Page",
      seoDescription: page.seoDescription || undefined,
      bodyContent: page.bodyPlainText || undefined,
      imageUrl: page.imageUrl || undefined,
      legacyHtml: page.legacyHtml || undefined,
    };
  } catch (error) {
    console.warn(`Sanity fetch for page "${slug}" failed:`, error);
    return null;
  }
}

/**
 * Fetch all distinct categories (title + slug) currently defined in Sanity.

 * Used to build static params for the /category/[slug] route and to
 * populate category filter UI.
 */
export async function getAllCategories(): Promise<{ title: string; slug: string }[]> {
  const query = `*[_type == "category" && defined(slug.current)] | order(title asc) {
    title,
    "slug": slug.current
  }`;

  try {
    const categories = await client.fetch<{ title: string; slug: string }[]>(query);
    return categories || [];
  } catch (error) {
    console.warn("Sanity fetch for categories failed:", error);
    return [];
  }
}


// 3. Fallback local content reader
export function getLocalContent(): ContentItem[] {
  const contentDirectory = path.join(process.cwd(), "content");
  const categories = ["articles", "books", "guides", "premium"];
  const allItems: ContentItem[] = [];

  try {
    categories.forEach((cat) => {
      const catDir = path.join(contentDirectory, cat);
      if (fs.existsSync(catDir)) {
        const files = fs.readdirSync(catDir);
        files.forEach((file: string) => {
          if (file.endsWith(".mdx") || file.endsWith(".md")) {
            const filePath = path.join(catDir, file);
            const fileContent = fs.readFileSync(filePath, "utf8");
            const { data, content } = matter(fileContent) as {
              data: {
                title?: string;
                date?: string;
                keywords?: string[];
                imageUrl?: string;
                author?: string;
              };
              content: string;
            };

            allItems.push({
              slug: file.replace(/\.mdx?$/, ""),
              title: data.title || file.replace(/\.mdx?$/, "").replace(/-/g, " "),
              date: data.date || "2026-08-01",
              category: cat.toUpperCase(),
              keywords: data.keywords || [cat, "macro", "finance"],
              content: content,
              legacyBody: "",
              imageUrl: data.imageUrl || "/images/articles/deglobalization-impact/1767774882.webp",
              author: data.author || "Ahmed Abdel-Fattah",
            });
          }
        });
      }
    });
  } catch (e) {
    console.warn("Failed to read local files:", e);
  }

  return allItems.sort((a, b) => (a.date < b.date ? 1 : -1));
}
