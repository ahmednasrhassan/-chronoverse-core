import { client, freshClient } from "../sanity/client";
import { urlForOptimized } from "../sanity/image";
import { getReadingTime } from "./readingTime";
import {
  generateExcerpt,
  generateFallbackTags,
} from "./metadataFallback";
import type { PortableTextBlock } from "@portabletext/types";
import DOMPurify from "isomorphic-dompurify";


// Default/fallback category applied whenever a post has no category
// assigned in Sanity. This prevents "uncategorized" posts from breaking
// /category/[slug] links, SEO breadcrumbs, or UI badges.
export const DEFAULT_CATEGORY = "General";
export const DEFAULT_CATEGORY_SLUG = "general";

export interface ContentItem {
  slug: string;
  title: string;
  date: string;
  publishedAt?: string;
  updatedAt?: string;
  category: string;
  authoredCategory?: string;
  categorySlug?: string;
  keywords: string[];
  content: string;
  legacyBody?: string;
  imageUrl?: string;
  featuredImageUrl?: string;
  imageAlt?: string;
  imageCaption?: string;
  author?: string;
  authoredSeoDescription?: string;
  seoDescription?: string;
  excerpt?: string;
  bodyContent?: string;
  /**
   * Structured Sanity Portable Text `body` blocks (headings, paragraphs,
   * embedded images, etc.), used by `PortableTextContent` to render the
   * primary article body for posts authored directly in the Studio. Falls
   * back to `legacyBody` (raw Blogger-imported HTML) when this is empty.
   */
  body?: PortableTextBlock[];
  /**
   * Optional manually-curated internal links, set explicitly by an editor
   * in Sanity (`manualRelatedLinks` field on the `post` schema). When
   * present, these take priority over the automated relevance-scoring
   * engine (see `src/lib/relatedArticles.ts`) for the "Related
   * Intelligence" block on the post page.
   */
  manualRelatedLinks?: ContentItem[];
}

interface SanityImageAssetRef {
  asset?: {
    _ref?: string;
    _id?: string;
    url?: string;
  };
  hotspot?: unknown;
  crop?: unknown;
  alt?: string | null;
  caption?: string | null;
}

interface SanityRawPost {
  slug: string | null;
  title: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  category: string | null;
  categorySlug: string | null;
  keywords: string[] | null;
  content: string | unknown;
  legacyBody: string | null;
  imageUrl: string | null;
  mainImage?: SanityImageAssetRef | null;
  author: string | null;
  seoDescription?: string | null;
  excerpt?: string | null;
  bodyPlainText?: string | null;
  body?: PortableTextBlock[] | null;
  manualRelatedLinks?: SanityRawPost[] | null;
  _isPublic?: boolean;
}

interface SanityRelatedArticleCandidate {
  slug: string | null;
  title: string | null;
  publishedAt: string | null;
  category: string | null;
  categorySlug: string | null;
  keywords: string[] | null;
  excerpt: string | null;
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
 * Sanitizes trusted legacy HTML before raw rendering. DOMPurify removes
 * executable elements, event handlers, unsafe URL protocols, SVG/MathML,
 * form controls, and embedding surfaces while retaining ordinary article
 * markup and legacy inline presentation.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: [
      "base",
      "button",
      "embed",
      "form",
      "iframe",
      "input",
      "link",
      "meta",
      "object",
      "option",
      "script",
      "select",
      "textarea",
    ],
    FORBID_ATTR: ["srcdoc"],
  });
}

/**
 * Downgrades any <h1> tags found inside raw legacy HTML (Blogger imports,
 * or any `legacyHtml`/`legacyBody` content rendered via
 * dangerouslySetInnerHTML) down to <h2>.
 *
 * Every article/page template renders exactly one page-level <h1> itself
 * (the post title or page title — see UniversalArticlePage in
 * app/(site)/[slug]/page.tsx). If the raw HTML body also contains its own
 * <h1> tag(s), the page ends up with two or more H1s, which is bad for SEO
 * and accessibility (a page should have exactly one H1, with all other
 * headings nested under it as H2–H6).
 *
 * This is a *content-level* safety net specifically for legacy/raw HTML.
 * For new content authored directly in Sanity's Portable Text editor, the
 * `body` field's block styles no longer offer "H1" as an option at all
 * (see the `post` schema) — so this function mainly protects older,
 * already-migrated Blogger content that may still contain raw <h1> tags.
 */
export function downgradeHeadings(html: string): string {
  if (!html) return html;
  return html
    .replace(/<h1(\s[^>]*)?>/gi, "<h2$1>")
    .replace(/<\/h1>/gi, "</h2>");
}

/**
 * Calculates the estimated read time in minutes.
 * Ensures accurate calculation by ignoring empty strings and spaces.
 */
export function calculateReadTime(text: string): number {
  return getReadingTime(text);
}

/**
 * Shared GROQ filter fragment enforcing "published" status for a `post`
 * document. Used by every function below that fetches posts for public
 * display.
 *
 * This is what actually makes the `publishedAt` field's documented
 * behavior ("Set a future date to schedule publishing" — see the `post`
 * schema) work correctly:
 *   - `defined(publishedAt) && publishedAt <= now()` — a post with a
 *     future `publishedAt` date is excluded until that moment arrives.
 *     Previously NONE of the queries in this file checked this, so a
 *     "scheduled" post was actually publicly visible immediately,
 *     regardless of its publish date — the schedule field was purely
 *     cosmetic.
 *   - `!(_id in path('drafts.**'))` — excludes Studio drafts that haven't
 *     been published at all.
 */
const PUBLISHED_POST_FILTER = `_type == "post" && defined(slug.current) && defined(publishedAt) && publishedAt <= now() && !(_id in path('drafts.**'))`;

// Shared GROQ projection for post -> ContentItem mapping. Includes
// `seoDescription` and a flattened `bodyPlainText` (via Sanity's `pt::text`)
// so the front-end can build automated meta descriptions and internal-link
// queries without re-fetching full Portable Text blocks.
const POST_PROJECTION = `{
    "slug": slug.current,
    title,
    publishedAt,
    "updatedAt": _updatedAt,
    "category": category->title,
    "categorySlug": category->slug.current,
    "keywords": coalesce(tags, keywords, []),
    "content": body,
    body,
    "legacyBody": bodyRaw,
    "imageUrl": mainImage.asset->url,
    "mainImage": mainImage { ..., alt, caption, asset-> },
    "author": author->name,
    seoDescription,
    excerpt,
    "bodyPlainText": pt::text(body),
    "manualRelatedLinks": manualRelatedLinks[]->{
      "_isPublic": defined(slug.current) && defined(publishedAt) && publishedAt <= now() && !(_id in path('drafts.**')),
      "slug": slug.current,
      title,
      publishedAt,
      "updatedAt": _updatedAt,
      "category": category->title,
      "categorySlug": category->slug.current,
      "keywords": coalesce(tags, keywords, []),
      "content": body,
      body,
      "legacyBody": bodyRaw,
      "imageUrl": mainImage.asset->url,
      "mainImage": mainImage { ..., alt, caption, asset-> },
      "author": author->name,
      seoDescription,
      excerpt,
      "bodyPlainText": pt::text(body)
    }
  }`;

function mapSanityPost(post: SanityRawPost): ContentItem {
  // Extract plain text from the structured `body` (via `pt::text`) or the
  // raw `legacyBody` HTML (Blogger imports) — stripping all HTML tags so
  // every downstream fallback (description, tags, category) operates on
  // clean text only.
  const bodyContent =
    post.bodyPlainText ||
    stripHtml(sanitizeHtml(post.legacyBody || "")) ||
    "";

  const title = post.title || "Untitled";

  // --- Automated Featured Image Fallback ---
  let resolvedImageUrl: string | undefined;
  if (post.mainImage?.asset) {
    try {
      resolvedImageUrl = urlForOptimized(post.mainImage as never)
        .width(1600)
        .height(900)
        .fit("crop")
        .url();
    } catch {
      resolvedImageUrl = post.imageUrl || undefined;
    }
  } else {
    resolvedImageUrl = post.imageUrl || undefined;
  }

  resolvedImageUrl =
    resolvedImageUrl || extractFirstImageSrc(post.legacyBody || "");

  // --- Automated SEO Description / Excerpt Fallback ---
  const authoredSeoDescription = post.seoDescription?.trim() || undefined;
  const authoredExcerpt = post.excerpt?.trim() || undefined;
  const resolvedSeoDescription =
    authoredSeoDescription
      ? authoredSeoDescription
      : authoredExcerpt
        ? authoredExcerpt
        : generateExcerpt(bodyContent);

  // --- Automated Tags Fallback ---
  const resolvedKeywords =
    post.keywords && post.keywords.length > 0
      ? post.keywords
      : generateFallbackTags(title, bodyContent);

  // --- Automated Category Fallback ---
  const resolvedCategory = post.category || DEFAULT_CATEGORY;
  const resolvedCategorySlug = post.categorySlug || DEFAULT_CATEGORY_SLUG;

  return {
    slug: post.slug || "",
    title,
    date: post.publishedAt ? post.publishedAt.split("T")[0] : "",
    publishedAt: post.publishedAt || undefined,
    updatedAt: post.updatedAt || undefined,
    category: resolvedCategory,
    authoredCategory: post.category?.trim() || undefined,
    categorySlug: resolvedCategorySlug,
    keywords: resolvedKeywords,
    content: typeof post.content === "string" ? post.content : "",
    // `downgradeHeadings` runs BEFORE `sanitizeHtml` so any raw <h1> tags
    // from Blogger-imported content are demoted to <h2> and never collide
    // with the page-level <h1> (the post title) rendered by the template.
    legacyBody: sanitizeHtml(downgradeHeadings(post.legacyBody || "")),
    imageUrl: resolvedImageUrl,
    featuredImageUrl: post.mainImage?.asset ? resolvedImageUrl : undefined,
    imageAlt: post.mainImage?.alt?.trim() || undefined,
    imageCaption: post.mainImage?.caption?.trim() || undefined,
    author: post.author || undefined,
    authoredSeoDescription,
    seoDescription: resolvedSeoDescription || undefined,
    excerpt: authoredExcerpt,
    bodyContent,
    body: post.body && post.body.length > 0 ? post.body : undefined,
    manualRelatedLinks:
      post.manualRelatedLinks && post.manualRelatedLinks.length > 0
        ? post.manualRelatedLinks
            .filter((relatedPost) => relatedPost?._isPublic === true)
            .map(mapSanityPost)
        : undefined,
  };
}

// 1. Fetch a single article by slug; a successful miss resolves to null.
export async function getSanityArticleBySlug(slug: string): Promise<ContentItem | null> {
  const query = `*[${PUBLISHED_POST_FILTER} && slug.current == $slug][0] ${POST_PROJECTION}`;
  const post = await client.fetch<SanityRawPost | null>(query, { slug });
  return post ? mapSanityPost(post) : null;
}

type SanityArticleCollectionLoader = () => Promise<
  SanityRawPost[] | null | undefined
>;

// 2. Fetch articles directly from Sanity CMS
export async function getSanityArticles(
  loadPosts: SanityArticleCollectionLoader = () =>
    client.fetch<SanityRawPost[]>(
      `*[${PUBLISHED_POST_FILTER}] | order(publishedAt desc) ${POST_PROJECTION}`,
    ),
): Promise<ContentItem[]> {
  const posts = await loadPosts();
  return (posts || []).map(mapSanityPost);
}

/**
 * Homepage "Latest Articles" fetcher.
 */
export async function getLatestSanityArticles(limit: number = 4): Promise<ContentItem[]> {
  const query = `*[${PUBLISHED_POST_FILTER}] | order(publishedAt desc)[0...${limit}] ${POST_PROJECTION}`;
  const posts = await freshClient.fetch<SanityRawPost[]>(query);
  return (posts || []).map(mapSanityPost);
}

/**
 * Fetch all articles belonging to a specific category.
 */
export async function getSanityArticlesByCategorySlug(slug: string): Promise<ContentItem[]> {
  const query = `*[${PUBLISHED_POST_FILTER} && (
    category->slug.current == $slug ||
    lower(category->title) == lower($slug) ||
    ($slug == "general" && (!defined(category) || category->slug.current == null || category->title == null))
  )] | order(publishedAt desc) ${POST_PROJECTION}`;

  try {
    const posts = await client.fetch<SanityRawPost[]>(query, { slug });
    if (posts && posts.length > 0) {
      return posts.map(mapSanityPost);
    }
  } catch (error) {
    console.warn(`Sanity fetch for category slug "${slug}" failed:`, error);
  }

  return [];

}

export interface CategoryPageContentV1 {
  readonly title: string;
  readonly slug: string;
  readonly description?: string;
  readonly articles: readonly ContentItem[];
}

interface SanityCategoryPageResultV1 {
  readonly category: {
    readonly title: string | null;
    readonly slug: string | null;
    readonly description: string | null;
  } | null;
  readonly articles: readonly SanityRawPost[] | null;
}

/**
 * Loads the authored category identity and its published articles together.
 * Unlike the legacy list helpers, this narrow route query intentionally lets
 * provider failures propagate so an outage cannot be mislabeled as a 404.
 */
export async function getSanityCategoryPageBySlugV1(
  slug: string,
): Promise<CategoryPageContentV1 | null> {
  const query = `{
    "category": *[
      _type == "category" &&
      slug.current == $slug &&
      !(_id in path('drafts.**'))
    ][0] {
      title,
      "slug": slug.current,
      description
    },
    "articles": *[${PUBLISHED_POST_FILTER} && (
      category->slug.current == $slug ||
      lower(category->title) == lower($slug) ||
      ($slug == "general" && (!defined(category) || category->slug.current == null || category->title == null))
    )] | order(publishedAt desc) ${POST_PROJECTION}
  }`;
  const result = await client.fetch<SanityCategoryPageResultV1>(query, {
    slug,
  });
  const category = result.category;

  if (!category?.title || !category.slug) {
    return null;
  }

  const description = category.description?.trim();

  return {
    title: category.title,
    slug: category.slug,
    description: description || undefined,
    articles: (result.articles || []).map(mapSanityPost),
  };
}

export const RELATED_ARTICLE_CANDIDATE_LIMIT = 24;

type RelatedArticleCandidateLoader = (
  query: string,
  params: { currentSlug: string; limit: number },
) => Promise<SanityRelatedArticleCandidate[] | null | undefined>;

/**
 * Automated Internal Linking Engine.
 *
 * Fetches one modest, recent candidate pool for both related-article widgets.
 * Twenty-four candidates give the relevance scorer three choices per visible
 * slot while keeping body, image, author, SEO, and manual-link payloads out of
 * this request. Provider failures intentionally propagate to the route.
 */
export async function getRelatedArticleCandidates(
  currentSlug: string,
  loadCandidates: RelatedArticleCandidateLoader = (query, params) =>
    client.fetch<SanityRelatedArticleCandidate[]>(query, params),
): Promise<ContentItem[]> {
  const query = `*[
    ${PUBLISHED_POST_FILTER} &&
    slug.current != $currentSlug
  ] | order(publishedAt desc) [0...$limit] {
    "slug": slug.current,
    title,
    publishedAt,
    "category": category->title,
    "categorySlug": category->slug.current,
    "keywords": coalesce(tags, keywords, []),
    excerpt
  }`;
  const posts = await loadCandidates(query, {
    currentSlug,
    limit: RELATED_ARTICLE_CANDIDATE_LIMIT,
  });

  return (posts || [])
    .slice(0, RELATED_ARTICLE_CANDIDATE_LIMIT)
    .map((post) => {
      const excerpt = post.excerpt?.trim() || undefined;

      return {
        slug: post.slug || "",
        title: post.title || "Untitled",
        date: post.publishedAt ? post.publishedAt.split("T")[0] : "",
        publishedAt: post.publishedAt || undefined,
        category: post.category || DEFAULT_CATEGORY,
        authoredCategory: post.category?.trim() || undefined,
        categorySlug: post.categorySlug || DEFAULT_CATEGORY_SLUG,
        keywords: post.keywords || [],
        content: "",
        excerpt,
        bodyContent: excerpt || "",
      };
    });
}

// ---------------------------------------------------------------------------
// Administrative Pages (`_type == "page"`)
// ---------------------------------------------------------------------------
export interface PageContentItem {
  slug: string;
  title: string;
  seoDescription?: string;
  bodyContent?: string;
  imageUrl?: string;
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

export async function getSanityPageBySlug(slug: string): Promise<PageContentItem | null> {
  const query = `*[_type == "page" && slug.current == $slug][0] {
    "slug": slug.current,
    title,
    seoDescription,
    "bodyPlainText": pt::text(content),
    "imageUrl": mainImage.asset->url,
    legacyHtml
  }`;

  const page = await client.fetch<SanityRawPage | null>(query, { slug });
  if (!page) return null;
  return {
    slug: page.slug || "",
    title: page.title || "Untitled Page",
    seoDescription: page.seoDescription || undefined,
    bodyContent: page.bodyPlainText || undefined,
    imageUrl: page.imageUrl || undefined,
    // Same H1-collision protection as posts: downgrade any raw <h1> in
    // the administrative page's legacy HTML to <h2> before it's ever
    // rendered, since the page template already renders its own <h1>
    // from `currentPage.title`.
    legacyHtml: page.legacyHtml
      ? sanitizeHtml(downgradeHeadings(page.legacyHtml))
      : undefined,
  };
}

export async function getAllCategories(): Promise<{ title: string; slug: string }[]> {
  const query = `*[_type == "category" && defined(slug.current)] | order(title asc) {
    title,
    "slug": slug.current
  }`;

  const categories = await client.fetch<{ title: string; slug: string }[]>(query);
  return categories || [];
}
