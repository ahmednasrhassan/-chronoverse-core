import Breadcrumbs from "@/components/Breadcrumbs";
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
import MathContent from "@/components/MathContent";
import { detectMarketSymbol } from "@/lib/detectMarketSymbol";
import { siteConfig } from "@/config/siteConfig";
import { SHIMMER_BLUR_DATA_URL } from "@/lib/blurPlaceholder";

// The proprietary "Symbol Overview" chart pulls in `lightweight-charts`
// and is only rendered conditionally (when a market symbol is detected
// in the article). `SymbolOverviewLazy` wraps it in a
// `next/dynamic(..., { ssr: false })` import inside its own Client
// Component, keeping it completely out of the server-rendered HTML /
// initial JS bundle so it never blocks first paint or LCP on articles
// that don't need it.

import SymbolOverview from "@/components/charts/SymbolOverviewLazy";

import { 
  getSanityArticleBySlug, 
  getSanityArticles, 
  getSanityPageBySlug,
  stripHtml, 
  sanitizeHtml, 
  calculateReadTime, 
  ContentItem,
  DEFAULT_CATEGORY_SLUG,
} from "@/lib/content";

import { computeTopRelatedArticles } from "@/lib/relatedArticles";
import { generateExecutiveSummary } from "@/lib/executiveSummary";

import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Incremental Static Regeneration: serve cached HTML instantly while
// revalidating in the background at most once every 60 seconds, instead of
// forcing a zero-cache dynamic render on every single request.
export const revalidate = 86400;

export async function generateStaticParams() {
  const articles = await getSanityArticles();
  return articles.map((article) => ({
    slug: article.slug,
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const currentPost = await getSanityArticleBySlug(slug);

  // Helper function to safely truncate strings to a specific max length for SEO
  const truncateForSEO = (text: string, maxLength: number) => {
    if (!text) return "";
    const cleanText = text.trim();
    if (cleanText.length <= maxLength) return cleanText;
    return cleanText.substring(0, maxLength - 3).trim() + "...";
  };

  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://chronoversecapital.com";
  const BRAND_SUFFIX = "";
  const canonicalUrl = `${SITE_URL}/${slug}`;

  if (currentPost) {
    // 1. Optimize Title (Max ~60 characters total including suffix)
    const maxTitleLength = 40;
    const optimizedTitle = truncateForSEO(currentPost.title || "", maxTitleLength);

    // 2. Optimize Meta Description (Ideal length 120 - 155 characters)
    let rawDescription = currentPost.seoDescription || "";
    if (!rawDescription) {
     rawDescription = stripHtml(currentPost.legacyBody || currentPost.content || "");
    }

    // Ensure minimum description length for SEO
    const fullDescription = rawDescription.length < 110 
      ? `${rawDescription} Read the full institutional macroeconomic analysis on Chronoverse Capital.`
      : rawDescription;

    const optimizedDescription = truncateForSEO(fullDescription, 155);

    // 3. Resolve Image for Open Graph and Twitter
    const dynamicOgImage = `${SITE_URL}/api/og?title=${encodeURIComponent(
      truncateForSEO(currentPost.title || "Chronoverse Capital", 50)
    )}&category=${encodeURIComponent(currentPost.category || "Intelligence")}`;
    const resolvedOgImage = currentPost.imageUrl || dynamicOgImage;

    return {
      title: optimizedTitle,
      description: optimizedDescription,
      keywords: currentPost.keywords,
      alternates: {
        canonical: canonicalUrl, // Fixes: Open Graph URL not matching canonical
      },
      openGraph: {
        title: optimizedTitle,
        description: optimizedDescription,
        url: canonicalUrl,
        type: "article",
        images: resolvedOgImage ? [{ url: resolvedOgImage }] : [],
      },
      twitter: {
        card: "summary_large_image",
        title: optimizedTitle,
        description: optimizedDescription,
        images: resolvedOgImage ? [resolvedOgImage] : [],
      },
      category: currentPost.category,
    };
  }

  // Fallback: administrative `page` document (About, Privacy Policy, etc.)
  const currentPage = await getSanityPageBySlug(slug);
  if (!currentPage) {
    return {
      alternates: {
        canonical: canonicalUrl,
      },
    };
  }

  const rawPageText = stripHtml(currentPage.legacyHtml || currentPage.bodyContent || "");
  
  // Optimize Administrative Page Title & Description
  const maxTitleLength = 45;
  const optimizedPageTitle = `${truncateForSEO(currentPage.title || slug, maxTitleLength)}${BRAND_SUFFIX}`;
  const optimizedPageDesc = truncateForSEO(
    currentPage.seoDescription || rawPageText || "Institutional Macroeconomic Research and Financial Intelligence.",
    155
  );

  return {
    title: optimizedPageTitle,
    description: optimizedPageDesc,
    alternates: {
      canonical: canonicalUrl, // SEO FIX: Explicitly enforce canonical URL for all administrative pages
    },
    openGraph: {
      title: optimizedPageTitle,
      description: optimizedPageDesc,
      url: canonicalUrl,
      type: "website",
      images: currentPage.imageUrl ? [{ url: currentPage.imageUrl }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title: optimizedPageTitle,
      description: optimizedPageDesc,
      images: currentPage.imageUrl ? [currentPage.imageUrl] : [],
    },
  };
}

export default async function UniversalArticlePage({ params }: PageProps) {
  const { slug } = await params;

  // Retrieve the current article directly matching the URL slug
  const currentPost = await getSanityArticleBySlug(slug);

  // ---------------------------------------------------------------------
  // Administrative Page fallback: if no `post` matches this slug, check
  // for an administrative `page` document (About, Privacy Policy, etc.).
  // These documents support an optional `legacyHtml` field for pasting raw
  // legacy HTML/CSS/JS (e.g. imported Blogger templates or standalone
  // microsites) — when present it is sanitized and rendered directly via
  // `dangerouslySetInnerHTML`, taking priority over the structured
  // Portable Text `bodyContent`.
  // ---------------------------------------------------------------------
  if (!currentPost) {
    const currentPage = await getSanityPageBySlug(slug);

    if (!currentPage) {
      notFound();
    }

    const sanitizedLegacyHtml = currentPage.legacyHtml
      ? sanitizeHtml(currentPage.legacyHtml)
      : "";

    return (
      <main className="max-w-4xl mx-auto px-4 py-12 print:px-0 print:py-4 selection:bg-[#c87d55]/30 selection:text-[#c87d55]">
        <div className="fixed top-0 left-0 w-full h-1 bg-[linear-gradient(to_right,#c87d55,#d97706,#c87d55)] z-50 opacity-80 print:hidden" />

        <div className="mb-10 border-b border-zinc-800/80 pb-8 print:border-none print:pb-2">
          <h1 className="text-3xl md:text-5xl font-extrabold text-zinc-100 mt-3 mb-6 leading-[1.2] tracking-tight print:text-black">
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
            <div className="relative w-full h-96 md:h-96 rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl print:border-none print:h-auto print:max-h-80">
              <Image
                src={currentPage.imageUrl}
                alt={currentPage.title}
                title={currentPage.title}
                fill
                sizes="(max-width: 768px) 100vw, 768px"
                priority
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
        <article className="prose prose-invert lg:prose-lg mt-8 max-w-none text-zinc-300 leading-relaxed prose-headings:text-zinc-100 prose-headings:font-bold prose-a:text-[#c87d55] hover:prose-a:text-[#e09870] prose-strong:text-zinc-100 print:prose-stone print:text-black print:prose-a:text-black [&_img]:rounded-2xl [&_img]:border [&_img]:border-zinc-800 [&_img]:w-full [&_img]:my-8">
          {sanitizedLegacyHtml ? (
            <div dangerouslySetInnerHTML={{ __html: sanitizedLegacyHtml }} />
          ) : (
            <p>{currentPage.bodyContent}</p>
          )}
        </article>
      </main>
    );
  }

  // Retrieve articles for generating related posts recommendations
  const allArticles = await getSanityArticles();

  // --- Automated "Related Intelligence / Internal Links" Engine ---
  // Priority order:
  //   1. Explicit manual links curated by an editor in Sanity
  //      (`manualRelatedLinks` field on the `post` schema).
  //   2. Otherwise, automatically compute the TOP 8 most relevant articles
  //      using a keyword/category/title relevance-scoring algorithm that
  //      compares the plain text extracted from `legacyBody` (HTML tags
  //      stripped) against every other fetched Sanity article.
  const hasManualLinks =
    currentPost.manualRelatedLinks && currentPost.manualRelatedLinks.length > 0;

  const relatedArticles = hasManualLinks
    ? currentPost.manualRelatedLinks!.slice(0, 8)
    : computeTopRelatedArticles(currentPost, allArticles, 8);

  const relatedArticlesTitle = hasManualLinks
    ? "Related Intelligence"
    : "Related Intelligence (Auto-Curated)";

  // Extract raw text for clean processing
  // Extract and clean raw content from 
  const cleanBodyContent = (typeof currentPost.body === 'string' ? currentPost.body : currentPost.legacyBody || JSON.stringify(currentPost.body || "") || "")
    .replace(/["']?SYSTEM ENTROPY CHECK[\s\S]*?\[Gear \d+\/\d+\][^<]*/gi, '')
    .replace(/SYSTEM ENTROPY CHECK[\s\S]*?(Table of Contents|01\.)/gi, '$1')
    .trim();

  // Extract raw text for clean processing (Read Time & AI Summary)
  const rawText = stripHtml(cleanBodyContent);

  // Calculate estimated read time dynamically (approx. 200 words per minute)
  const readTimeMinutes = calculateReadTime(rawText);

  // Auto-generate Smart Image SEO Data
  const autoAltText = `Illustration for ${currentPost.category} covering ${currentPost.title}`;
  const autoCaption = `Figure 1: Visual representation of ${currentPost.title?.toLowerCase()} concepts.`;

  // Auto-generated summary snippet displayed in the UI — reuses the same
  // dynamically-generated 150-160 character excerpt/SEO description that
  // was resolved in `mapSanityPost` (src/lib/content.ts), keeping the
  // on-page summary and the SEO meta description perfectly in sync.
  const autoSummary = currentPost.seoDescription || rawText.substring(0, 140);

  // AI Executive Summary — 3 concise, auto-generated key takeaways derived
  // from the article's plain text, title, category, and keywords (see
  // `generateExecutiveSummary` in src/lib/executiveSummary.ts). Never
  // throws and always returns exactly 3 usable points.
  const executiveSummaryPoints = generateExecutiveSummary(
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
  // --- Dynamic Market Chart Detection ---
  // Scans the title + plain-text body for explicit chart tags
  // (`[[chart:SYMBOL]]`) or common market terms/tickers (Bitcoin, Gold,
  // S&P 500, DXY, etc.) and, when found, automatically renders an
  // interactive proprietary "Symbol Overview" chart directly within the
  // article — no manual embedding required by editors.
  const detectedMarket = detectMarketSymbol(currentPost.title, rawText, currentPost.category);

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://chronoversecapital.com";

  const breadcrumbItems = [
    { name: "Home", url: baseUrl },
    { 
      name: currentPost.category || "Research", 
      url: `${baseUrl}/category/${currentPost.category || "general"}` 
    },
    { 
      name: currentPost.title, 
      url: `${baseUrl}/${currentPost.slug}` 
    },
  ];
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: currentPost.title,
    description: currentPost.seoDescription || currentPost.title,
    datePublished: (currentPost as Record<string, any>).publishedAt || (currentPost as Record<string, any>).publishDate || new Date().toISOString(),
    dateModified: (currentPost as Record<string, any>)._updatedAt || (currentPost as Record<string, any>).publishedAt || new Date().toISOString(),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${baseUrl}/${currentPost.slug}`,
    },
    author: {
      "@type": "Person",
      name: typeof currentPost.author === "string" ? currentPost.author : "ChronoVerse Research",
    },
    publisher: {
      "@type": "Organization",
      name: "ChronoVerse",
      logo: {
        "@type": "ImageObject",
        url: `${baseUrl}/logo.png`,
      },
    },
  };
  // --- Automatic Internal Links & Related Articles Engine ---
  // Filter related posts based on shared keywords or identical categories
  let relatedPosts = allArticles
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
    relatedPosts = allArticles
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
    <main className="max-w-4xl mx-auto px-4 py-12 print:px-0 print:py-4 selection:bg-[#c87d55]/30 selection:text-[#c87d55]">
      
      {/* Premium Top Reading Progress Bar (dynamically tracks scroll position) */}
      <ReadingProgressBar />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
     <Breadcrumbs items={breadcrumbItems} />
      {/* Article Header & Admin Controls */}
      <div className="mb-10 border-b border-zinc-800/80 pb-8 print:border-none print:pb-2">
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
            {currentPost.category ? (
              <Link
                href={`/category/${currentPost.categorySlug || DEFAULT_CATEGORY_SLUG}`}
                className="text-xs font-bold uppercase tracking-widest text-[#c87d55] bg-[#c87d55]/10 px-3 py-1.5 rounded-full border border-[#c87d55]/20 hover:bg-[#c87d55]/20 transition-colors print:bg-transparent print:border-none print:px-0"
              >
                {currentPost.category}
              </Link>
            ) : null}
            <span className="text-zinc-400 text-xs print:hidden">•</span>
            {/* Displaying Auto-Calculated Read Time */}
            <span className="text-xs text-zinc-400 font-medium print:hidden flex items-center gap-1.5">
              <span>⏱️</span> {readTimeMinutes} min read
            </span>
          </div>
          
          {/* Action Buttons */}
          <div className="flex items-center gap-2 print:hidden">
            <ArticleShareButtons
              title={currentPost.title}
              url={`${siteConfig.url}/${currentPost.slug}`}
            />

            <PrintButton />

            {/* SECURITY NOTE: this "Edit" link to Sanity Studio is currently
                rendered for EVERY visitor, not just logged-in admins/editors.
                Studio itself may be login-protected, but exposing the exact
                edit URL and confirming a CMS backend exists to anonymous
                visitors is unnecessary information disclosure. Left
                functional here since no auth/session check is wired into
                this server component yet — wrap this in a real
                admin/session check (e.g. via middleware, a cookie, or your
                auth provider) before shipping, rather than showing it to
                everyone. */}
            <Link
              href={`/studio/structure/intent/edit/id=${currentPost.slug}`}
              target="_blank"
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-900 hover:bg-zinc-800 hover:text-white rounded-lg transition-all border border-zinc-800 hover:border-zinc-700 shadow-sm"
              title="Edit this article in Sanity CMS"
            >
              <span>✏️</span> Edit
            </Link>
          </div>
        </div>

        
        <h1 className="text-3xl md:text-5xl font-extrabold text-zinc-100 mt-3 mb-6 leading-[1.2] tracking-tight print:text-black">
          {currentPost.title}
        </h1>
        
        <div className="flex items-center justify-between text-xs text-zinc-300 pt-2 print:text-gray-500">
          <span>Published on {currentPost.date}</span>
          <span className="uppercase tracking-wider font-semibold text-zinc-400 print:hidden">Chronoverse Intelligence</span>
        </div>

        {/* Auto-Generated / Editor-Curated Tags */}
        {displayTags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-5 print:hidden">
            {displayTags.map((tag) => (
              <span
                key={tag}
                className="text-[11px] font-medium text-zinc-400 bg-zinc-900/60 border border-zinc-800 px-2.5 py-1 rounded-full"
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
          {/* CLS fix: same fixed-height (`h-96`) + `fill` + blur
              placeholder pattern as above — the hero image's box is
              reserved immediately, so the network image swapping in
              (or `priority`-preloading) never shifts the article title,
              TOC, or body content that follows. */}
          <div className="relative w-full h-96 md:h-96 rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl print:border-none print:h-auto print:max-h-80">
            <Image 
              src={currentPost.imageUrl} 
              alt={autoAltText} 
              title={currentPost.title}
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              priority
              className="w-full h-full object-cover transition-transform duration-700 hover:scale-105 print:object-contain print:scale-100"
              placeholder="blur"
              blurDataURL={SHIMMER_BLUR_DATA_URL}
            />
          </div>
          <figcaption className="text-center text-xs text-zinc-500 mt-3 italic print:text-gray-500">
            {autoCaption}
          </figcaption>
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

      {/* AI Executive Summary — rendered at the very top of the article
          body, before the main content. See src/components/AIExecutiveSummary.tsx */}
      <AIExecutiveSummary points={executiveSummaryPoints} />

      {/* Enhanced Article Content Area: Seamlessly supports legacy Blogger HTML and new Sanity Portable Text.
          Priority order: `legacyBody` raw HTML (Blogger imports) takes priority when populated, otherwise the
          structured Portable Text `body` blocks are rendered via `PortableTextContent` (headings, paragraphs,
          embedded images with hotspot-aware URLs, links, lists, etc.). Wrapped in `MathContent` so any
          `$$...$$` / `$...$` LaTeX expressions in the article render as clean KaTeX-formatted equations. */}
      <article className="prose prose-invert lg:prose-lg mt-8 max-w-none text-zinc-300 leading-[1.85] prose-headings:text-zinc-100 prose-headings:font-bold prose-a:text-[#c87d55] hover:prose-a:text-[#e09870] prose-strong:text-zinc-100 prose-p:mb-6 prose-p:leading-[1.85] first-letter:float-left first-letter:text-6xl first-letter:font-black first-letter:text-[#c87d55] first-letter:mr-3 first-letter:mt-1 first-letter:leading-none print:prose-stone print:text-black print:prose-a:text-black [&_img]:rounded-2xl [&_img]:border [&_img]:border-zinc-800 [&_img]:w-full [&_img]:my-8">
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

      {/* Article Discussion & Comments Section */}
      <section className="mt-14 pt-8 border-t border-zinc-800 print:hidden">
        <h2 className="text-xl font-semibold text-zinc-100 mb-6 flex items-center gap-2">
          <span className="text-[#c87d55]">💬</span> Executive Discussion
        </h2>
        <div className="p-8 rounded-2xl border border-zinc-800 bg-[#181310] text-center text-zinc-400 text-sm shadow-inner">
          Discussion thread initialized for: <span className="text-[#c87d55] font-mono">{currentPost.slug}</span>
        </div>
      </section>
      
    </main>
  );
}
