import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import AutoTOC from "@/components/autotoc";
import RelatedDropdown from "@/components/relateddropdown";
import PrintButton from "@/components/printbutton";
import AuthorCard from "@/components/authorcard";
import InternalLinksBox from "@/components/InternalLinksBox";
import PortableTextContent from "@/components/PortableTextContent";
import AIExecutiveSummary from "@/components/AIExecutiveSummary";
import ReadingProgressBar from "@/components/ReadingProgressBar";
import ArticleShareButtons from "@/components/ArticleShareButtons";
import AudioReader from "@/components/AudioReader";
import MathContent from "@/components/MathContent";
import { SHIMMER_BLUR_DATA_URL } from "@/lib/blurPlaceholder";
import { isReservedRootSlug } from "@/lib/content/reservedSlugs";

import {
  getSanityArticles,
  getRelatedArticleCandidates,
  stripHtml,
  sanitizeHtml,
  calculateReadTime,
  ContentItem,
  DEFAULT_CATEGORY_SLUG,
} from "@/lib/content";

import { selectRelatedArticles } from "@/lib/relatedArticles";
import { generateExecutiveSummary } from "@/lib/executiveSummary";
import {
  buildArticleJsonLd,
  buildArticleMetadata,
  normalizeArticleSeo,
  serializeJsonForHtml,
} from "@/lib/seo/article";
import {
  getArticleForRoute,
  getPageForRoute,
  requireRootContent,
  resolveRootContent,
  rootContentExistsForLegacyRedirect,
} from "@/lib/seo/article-data";
import { buildCmsPageMetadata } from "@/lib/seo/cms-page";
import {
  getRootHtmlCandidate,
  resolveLegacyContentRedirect,
} from "@/lib/seo/legacy-routes";

import { notFound, permanentRedirect } from "next/navigation";

interface PageProps {
  params: Promise<{ slug: string }>;
}

function getArticleSeo(article: ContentItem) {
  return normalizeArticleSeo({
    slug: article.slug,
    title: article.title,
    seoDescription: article.authoredSeoDescription,
    excerpt: article.excerpt,
    bodyText: article.bodyContent,
    publishedAt: article.publishedAt,
    modifiedAt: article.updatedAt,
    author: article.author,
    category: article.authoredCategory,
    keywords: article.keywords,
    featuredImageUrl: article.featuredImageUrl,
    imageAlt: article.imageAlt,
    imageCaption: article.imageCaption,
    socialImageUrl: article.imageUrl,
  });
}

// Article and administrative-page content is refreshed on-demand when
// Sanity publishes, updates, or deletes a post through `/api/revalidate`.

export async function generateStaticParams() {
  const articles = await getSanityArticles();
  return articles
    .filter((article) => !isReservedRootSlug(article.slug))
    .map((article) => ({
      slug: article.slug,
    }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;

  if (slug.endsWith(".html")) {
    const legacyTarget = await resolveLegacyContentRedirect(
      getRootHtmlCandidate(slug),
      rootContentExistsForLegacyRedirect,
    );
    if (!legacyTarget) notFound();
    permanentRedirect(legacyTarget);
  }

  if (isReservedRootSlug(slug)) notFound();
  const content = requireRootContent(
    await resolveRootContent(
      getArticleForRoute(slug),
      () => getPageForRoute(slug),
    ),
  );

  if (content.kind === "post") {
    return buildArticleMetadata(getArticleSeo(content.post));
  }

  return buildCmsPageMetadata(content.page);
}

export default async function UniversalArticlePage({ params }: PageProps) {
  const { slug } = await params;

  if (slug.endsWith(".html")) {
    const legacyTarget = await resolveLegacyContentRedirect(
      getRootHtmlCandidate(slug),
      rootContentExistsForLegacyRedirect,
    );
    if (!legacyTarget) notFound();
    permanentRedirect(legacyTarget);
  }

  if (isReservedRootSlug(slug)) notFound();

  const content = requireRootContent(
    await resolveRootContent(
      getArticleForRoute(slug),
      () => getPageForRoute(slug),
    ),
  );

  // ---------------------------------------------------------------------
  // Administrative Page fallback: if no `post` matches this slug, check
  // for an administrative `page` document (About, Privacy Policy, etc.).
  // These documents support an optional `legacyHtml` field for pasting raw
  // legacy HTML (e.g. imported Blogger pages) — when present it is sanitized
  // and rendered directly via
  // `dangerouslySetInnerHTML`, taking priority over the structured
  // Portable Text `bodyContent`.
  // ---------------------------------------------------------------------
  if (content.kind === "page") {
    const currentPage = content.page;

    const sanitizedLegacyHtml = currentPage.legacyHtml
      ? sanitizeHtml(currentPage.legacyHtml)
      : "";

    return (
      <main className="max-w-4xl mx-auto px-4 py-12 print:px-0 print:py-4 selection:bg-[#C8A7E8]/30 selection:text-[#C8A7E8]">
        <div className="fixed top-0 left-0 w-full h-1 bg-[linear-gradient(to_right,#C8A7E8,#d97706,#C8A7E8)] z-50 opacity-80 print:hidden" />

        <div className="mb-10 border-b border-border/80 pb-8 print:border-none print:pb-2">
          <h1 className="text-3xl md:text-5xl font-extrabold text-mauve mt-3 mb-6 leading-[1.2] tracking-tight print:text-black">
            {currentPage.title}
          </h1>
        </div>

        {currentPage.imageUrl && (
          <figure className="mb-12 w-full print:mb-6">
            {/* CLS fix: fixed `h-96` wrapper + `fill` reserves the hero
                image's box from first paint regardless of the image's
                real intrinsic size; `placeholder="blur"` fills that
                locked box with a low-fidelity preview instead of a blank
                gap while the network image downloads. */}
            <div className="relative w-full h-96 md:h-96 rounded-2xl overflow-hidden border border-border shadow-2xl print:border-none print:h-auto print:max-h-80">
              <Image
                src={currentPage.imageUrl}
                alt=""
                fill
                sizes="(max-width: 768px) 100vw, 768px"
                loading="eager"
                decoding="async"
                className="w-full h-full object-cover print:object-contain print:scale-100"
                placeholder="blur"
                blurDataURL={SHIMMER_BLUR_DATA_URL}
              />
            </div>
          </figure>
        )}
        {/* Enhanced Page Content Area: `legacyHtml` (raw pasted HTML/CSS/JS)
            takes priority over the structured Portable Text `bodyContent`
            whenever it's populated. Sanitized before rendering. */}
        <article className="prose prose-invert lg:prose-lg mt-8 max-w-none text-secondary leading-relaxed prose-headings:text-mauve prose-headings:font-bold prose-a:text-[#C8A7E8] hover:prose-a:text-[#A77BD8] prose-strong:text-primary print:prose-stone print:text-black print:prose-a:text-black [&_img]:rounded-2xl [&_img]:border [&_img]:border-border [&_img]:w-full [&_img]:my-8">
          {sanitizedLegacyHtml ? (
            <div dangerouslySetInnerHTML={{ __html: sanitizedLegacyHtml }} />
          ) : (
            <p>{currentPage.bodyContent}</p>
          )}
        </article>
      </main>
    );
  }

  const currentPost = content.post;

  // One bounded, lean candidate query serves both related-article widgets.
  const relatedCandidates = await getRelatedArticleCandidates(currentPost.slug);

  // --- Automated "Related Intelligence / Internal Links" Engine ---
  // Priority order:
  //   1. Explicit manual links curated by an editor in Sanity
  //      (`manualRelatedLinks` field on the `post` schema).
  //   2. Otherwise, automatically compute the TOP 8 most relevant articles
  //      using a keyword/category/title relevance-scoring algorithm that
  //      compares the current article against a bounded recent candidate
  //      pool using category, keywords, title, and authored excerpt signals.
  const hasManualLinks =
    currentPost.manualRelatedLinks && currentPost.manualRelatedLinks.length > 0;

  const relatedArticles = selectRelatedArticles(currentPost, relatedCandidates);

  const relatedArticlesTitle = hasManualLinks
    ? "Related Intelligence"
    : "Related Intelligence (Auto-Curated)";

  // Extract pure human-readable text safely from Sanity blocks or legacy HTML
  const rawText = Array.isArray(currentPost?.body) && currentPost.body.length > 0
    ? currentPost.body
        .filter((block: any) => block._type === "block" && Array.isArray(block.children))
        .map((block: any) => block.children.map((c: any) => c.text || "").join(" "))
        .join("\n\n")
    : stripHtml(currentPost?.legacyBody || currentPost?.content || "");

  // Calculate estimated read time dynamically (approx. 200 words per minute)
  const readTimeMinutes = calculateReadTime(rawText);

  const imageAltText = currentPost.imageAlt || "Article featured image";

  // Extract top 3 natural analytical paragraphs directly for the Executive Summary
  const naturalParagraphs = rawText
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(
      (p) =>
        p.length > 60 &&
        !p.startsWith("Figure") &&
        !p.startsWith("::") &&
        !p.toLowerCase().startsWith("classification:") &&
        !p.toLowerCase().startsWith("focus:") &&
        !p.toLowerCase().startsWith("intel protocol")
    );
  const executiveSummaryPoints =
    naturalParagraphs.length >= 3
      ? naturalParagraphs.slice(0, 3)
      : generateExecutiveSummary(
          currentPost.title,
          currentPost.category,
          rawText,
          currentPost.keywords
        );

  // Tags rendered in the UI — either editor-authored in Sanity or the
  // dynamically extracted fallback key terms (see `generateFallbackTags`
  // in src/lib/metadataFallback.ts), both surfaced via `currentPost.keywords`.
  const displayTags = (currentPost.keywords || []).slice(0, 8);

  // Sanitize HTML body to prevent any XSS vulnerabilities
  // Sanitize HTML body and strip entropy artifacts
  //
  // NOTE: this regex is a *runtime safety net*, not the fix. The
  // "SYSTEM ENTROPY CHECK" placeholder blocks should be removed at the
  // source in Sanity (see clean-sanity-articles.js). The `g` flag below
  // was missing previously, which meant only the FIRST occurrence in a
  // given article was stripped — any repeated occurrence in the same
  // legacyBody stayed visible on the live page.
  let strippedLegacyBody = currentPost.legacyBody || "";
  if (strippedLegacyBody.includes("SYSTEM ENTROPY CHECK")) {
    strippedLegacyBody = strippedLegacyBody
      .replace(/["']?SYSTEM ENTROPY CHECK[\s\S]*?(Table of Contents|01\.|\n\n)/gi, "$1")
      .trim();
  }

  const transformedLegacyBody = strippedLegacyBody;
  const sanitizedLegacyBody = transformedLegacyBody ? sanitizeHtml(transformedLegacyBody) : "";
  const articleSeo = getArticleSeo(currentPost);
  const articleSchema = buildArticleJsonLd(articleSeo);
  // --- Automatic Internal Links & Related Articles Engine ---
  // Filter related posts based on shared keywords or identical categories
  let relatedPosts = relatedCandidates
    .filter((item: ContentItem) => item.slug !== currentPost.slug)
    .filter((item: ContentItem) => {
      const sameCategory = item.category === currentPost.category;
      const sharedKeywords = item.keywords?.some((kw: string) =>

        currentPost.keywords?.includes(kw)
      );
      return sameCategory || sharedKeywords;
    });

  // Fallback: Return the latest published posts if no exact match is found.
  // Previously this fallback returned whatever order Sanity happened to
  // return (not necessarily newest-first) despite the comment saying
  // "latest" — now explicitly sorted by date, newest first, before slicing.
  if (relatedPosts.length === 0) {
    relatedPosts = relatedCandidates
      .filter((item: ContentItem) => item.slug !== currentPost.slug)
      .sort((a: ContentItem, b: ContentItem) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        return dateB - dateA;
      });
  }

  // Limit the output to 8 related articles for optimal UI layout
  const finalRelatedPosts = relatedPosts.slice(0, 8);

  // Format the data structure for the automatic internal links dropdown
  const formattedRelated = finalRelatedPosts.map((post: ContentItem) => ({
    _id: post.slug,
    title: post.title,
    slug: { current: post.slug },
  }));

  return (
    <main className="max-w-4xl mx-auto px-4 py-12 print:px-0 print:py-4 selection:bg-[#C8A7E8]/30 selection:text-[#C8A7E8]">

      {/* Premium Top Reading Progress Bar (dynamically tracks scroll position) */}
      <ReadingProgressBar />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonForHtml(articleSchema) }}
      />
      {/* Article Header & Admin Controls */}
      <div className="mb-10 border-b border-border/80 pb-8 print:border-none print:pb-2">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            {/* Category badge is now a real link to /category/[slug] instead
                of a plain <span>. This is what actually makes category pages
                discoverable via internal linking — previously no article
                linked to its own category page at all, which is a likely
                cause of the "orphan page" signal Ahrefs reported.
                
                Uses `currentPost.categorySlug` — already resolved in
                src/lib/content.ts (mapSanityPost) from Sanity's real
                `category->slug.current` reference field, with the same
                DEFAULT_CATEGORY_SLUG ("general") fallback used everywhere
                else in the app (getSanityArticlesByCategorySlug, sitemap).
                This guarantees the link always matches an actual, resolvable
                /category/[slug] route — no separate slug logic to keep in
                sync and risk drifting out of alignment. */}
            {currentPost.authoredCategory && currentPost.categorySlug ? (
              <Link
                href={`/category/${currentPost.categorySlug || DEFAULT_CATEGORY_SLUG}`}
                className="text-xs font-bold uppercase tracking-widest text-[#C8A7E8] bg-[#C8A7E8]/10 px-3 py-1.5 rounded-full border border-[#C8A7E8]/20 hover:bg-[#C8A7E8]/20 transition-colors print:bg-transparent print:border-none print:px-0"
              >
                {currentPost.category}
              </Link>
            ) : null}
            <span className="text-muted text-xs print:hidden">•</span>
            {/* Displaying Auto-Calculated Read Time */}
            <span className="text-xs text-muted font-medium print:hidden flex items-center gap-1.5">
              <span>⏱️</span> {readTimeMinutes} min read
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 print:hidden">
            <ArticleShareButtons
              title={currentPost.title}
              url={articleSeo.canonicalUrl}
            />

            <PrintButton />


          </div>
        </div>


        <h1 className="text-3xl md:text-5xl font-extrabold text-mauve mt-3 mb-6 leading-[1.2] tracking-tight print:text-black">
          {currentPost.title}
        </h1>

        <div className="flex items-center justify-between text-xs text-secondary pt-2 print:text-gray-500">
          <span>Published on {currentPost.date}</span>
          <span className="uppercase tracking-wider font-semibold text-muted print:hidden">Chronoverse Intelligence</span>
        </div>

        {/* Auto-Generated / Editor-Curated Tags */}
        {displayTags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-5 print:hidden">
            {displayTags.map((tag) => (
              <span
                key={tag}
                className="text-[11px] font-medium text-muted bg-raised/60 border border-border px-2.5 py-1 rounded-full"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

      </div>

      {/* Dynamic Hero Image Section (Falls back gracefully if null) */}
      {currentPost.imageUrl && (
        <figure className="mb-12 w-full print:mb-6">
          {currentPost.featuredImageUrl ? (
            <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-border shadow-2xl">
              <Image
                src={currentPost.featuredImageUrl}
                alt={imageAltText}
                title={currentPost.title}
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 90vw, 1200px"
                preload
                className="w-full h-full object-cover transition-transform duration-700 hover:scale-105 print:object-contain"
                placeholder="blur"
                blurDataURL={SHIMMER_BLUR_DATA_URL}
              />
            </div>
          ) : (
            <img
              src={currentPost.imageUrl}
              alt={imageAltText}
              title={currentPost.title}
              loading="eager"
              decoding="async"
              fetchPriority="high"
              className="block h-auto w-full rounded-2xl border border-border shadow-2xl"
            />
          )}
          {currentPost.imageCaption ? (
            <figcaption className="mt-3 text-sm text-muted text-center">
              {currentPost.imageCaption}
            </figcaption>
          ) : null}
        </figure>
      )}

      {/* Automatic Table of Contents */}
      <div className="print:hidden">
        <AutoTOC />
      </div>

      {/* Automatic Internal Links Dropdown (Generated from Keywords/Category) */}
      <div className="my-8 print:hidden">
        <RelatedDropdown articles={formattedRelated} />
      </div>

      {/* Source-derived executive summary, rendered before the article body. */}
      <AIExecutiveSummary points={executiveSummaryPoints} />
      {/* Browser text-to-speech reader */}
      <AudioReader textToRead={`${currentPost?.title || ""}. ${sanitizedLegacyBody || currentPost?.content || ""}`} />

      {/* Enhanced Article Content Area: Seamlessly supports legacy Blogger HTML and new Sanity Portable Text.
          Priority order: `legacyBody` raw HTML (Blogger imports) takes priority when populated, otherwise the
          structured Portable Text `body` blocks are rendered via `PortableTextContent` (headings, paragraphs,
          embedded images with hotspot-aware URLs, links, lists, etc.). Wrapped in `MathContent` so any
          `$$...$$` / `$...$` LaTeX expressions in the article render as clean KaTeX-formatted equations. */}
      <article className="prose prose-invert lg:prose-lg mt-8 max-w-none text-secondary leading-[1.85] prose-headings:text-mauve prose-headings:font-bold prose-a:text-[#C8A7E8] hover:prose-a:text-[#A77BD8] prose-strong:text-primary prose-p:mb-6 prose-p:leading-[1.85] first-letter:float-left first-letter:text-6xl first-letter:font-black first-letter:text-[#C8A7E8] first-letter:mr-3 first-letter:mt-1 first-letter:leading-none print:prose-stone print:text-black print:prose-a:text-black [&_img]:rounded-2xl [&_img]:border [&_img]:border-border [&_img]:w-full [&_img]:my-8">
        <MathContent>
          {sanitizedLegacyBody ? (
            <div dangerouslySetInnerHTML={{ __html: sanitizedLegacyBody }} />
          ) : currentPost.body && currentPost.body.length > 0 ? (
            <PortableTextContent value={currentPost.body} />
          ) : (
            <p>{currentPost.content}</p>
          )}
        </MathContent>
      </article>

      {/* Related Intelligence / Internal Links Block — rendered directly
          below the legacyBody HTML section. Prioritizes explicit manual
          links curated in Sanity (`manualRelatedLinks`); otherwise falls
          back to the automated TOP 8 relevance-scored articles computed
          in `computeTopRelatedArticles` (src/lib/relatedArticles.ts). */}
      <InternalLinksBox articles={relatedArticles} title={relatedArticlesTitle} />

      {/* Author Card Component */}
      <AuthorCard authorName={currentPost.author} />

    </main>
  );
}
