import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import AutoTOC from "@/components/autotoc";
import RelatedDropdown from "@/components/relateddropdown";
import PrintButton from "@/components/printbutton";
import AuthorCard from "@/components/authorcard";
import { 
  getSanityArticleBySlug, 
  getSanityArticles, 
  stripHtml, 
  sanitizeHtml, 
  calculateReadTime, 
  ContentItem 
} from "@/lib/content";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const articles = await getSanityArticles();
  return articles.map((article) => ({
    slug: article.slug,
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const currentPost = await getSanityArticleBySlug(slug);

  if (!currentPost) {
    return {};
  }

  const rawText = stripHtml(currentPost.legacyBody || currentPost.content || "");
  const autoSummary = rawText.length > 140 
    ? rawText.substring(0, 140) + "..." 
    : rawText;

  return {
    title: `${currentPost.title} | Chronoverse Intelligence`,
    description: autoSummary,
    openGraph: {
      title: currentPost.title,
      description: autoSummary,
      images: currentPost.imageUrl ? [{ url: currentPost.imageUrl }] : [],
    },
  };
}

export default async function UniversalArticlePage({ params }: PageProps) {
  const { slug } = await params;

  // Retrieve the current article directly matching the URL slug
  const currentPost = await getSanityArticleBySlug(slug);

  if (!currentPost) {
    notFound();
  }

  // Retrieve articles for generating related posts recommendations
  const allArticles = await getSanityArticles();

  // Extract raw text for clean processing
  const rawText = stripHtml(currentPost.legacyBody || currentPost.content || "");

  // Calculate estimated read time dynamically (approx. 200 words per minute)
  const readTimeMinutes = calculateReadTime(rawText);

  // Auto-generate Smart Image SEO Data
  const autoAltText = `Illustration for ${currentPost.category} covering ${currentPost.title}`;
  const autoCaption = `Figure 1: Visual representation of ${currentPost.title?.toLowerCase()} concepts.`;

  // Auto-generate a clean meta summary snippet (First 140 chars of pure text)
  const autoSummary = rawText.length > 140 
    ? rawText.substring(0, 140) + "..." 
    : rawText;

  // Sanitize HTML body to prevent any XSS vulnerabilities
  const sanitizedLegacyBody = currentPost.legacyBody ? sanitizeHtml(currentPost.legacyBody) : "";

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

  // Fallback: Return the latest published posts if no exact match is found
  if (relatedPosts.length === 0) {
    relatedPosts = allArticles.filter((item: ContentItem) => item.slug !== currentPost.slug);
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
      
      {/* Premium Top Reading Indicator Line */}
      <div className="fixed top-0 left-0 w-full h-1 bg-[linear-gradient(to_right,#c87d55,#d97706,#c87d55)] z-50 opacity-80 print:hidden" />

      {/* Article Header & Admin Controls */}
      <div className="mb-10 border-b border-zinc-800/80 pb-8 print:border-none print:pb-2">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-widest text-[#c87d55] bg-[#c87d55]/10 px-3 py-1.5 rounded-full border border-[#c87d55]/20 print:bg-transparent print:border-none print:px-0">
              {currentPost.category}
            </span>
            <span className="text-zinc-600 text-xs print:hidden">•</span>
            {/* Displaying Auto-Calculated Read Time */}
            <span className="text-xs text-zinc-400 font-medium print:hidden flex items-center gap-1.5">
              <span>⏱️</span> {readTimeMinutes} min read
            </span>
          </div>
          
          {/* Action Buttons */}
          <div className="flex items-center gap-2 print:hidden">
            <PrintButton />

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
        
        {/* Auto-Generated Summary Block */}
        <div className="relative p-5 rounded-xl bg-zinc-900/40 border-l-4 border-[#c87d55] my-6 shadow-md print:border-gray-400 print:bg-transparent">
          <p className="text-base md:text-lg text-zinc-300 font-normal italic leading-relaxed">
            "{autoSummary}"
          </p>
        </div>
        
        <div className="flex items-center justify-between text-xs text-zinc-500 pt-2 print:text-gray-500">
          <span>Published on {currentPost.date}</span>
          <span className="uppercase tracking-wider font-semibold text-zinc-600 print:hidden">Chronoverse Intelligence</span>
        </div>
      </div>

      {/* Dynamic Hero Image Section (Falls back gracefully if null) */}
      {currentPost.imageUrl && (
        <figure className="mb-12 w-full print:mb-6">
          <div className="relative w-full h-96 md:h-96 rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl print:border-none print:h-auto print:max-h-80">
            <Image 
              src={currentPost.imageUrl} 
              alt={autoAltText} 
              title={currentPost.title}
              fill
              sizes="(max-w-768px) 100vw, 768px"
              priority
              className="w-full h-full object-cover transition-transform duration-700 hover:scale-105 print:object-contain print:scale-100"
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

      {/* Enhanced Article Content Area: Seamlessly supports legacy Blogger HTML and new Sanity Markdown */}
      <article className="prose prose-invert lg:prose-lg mt-8 max-w-none text-zinc-300 leading-relaxed prose-headings:text-zinc-100 prose-headings:font-bold prose-a:text-[#c87d55] hover:prose-a:text-[#e09870] prose-strong:text-zinc-100 first-letter:float-left first-letter:text-6xl first-letter:font-black first-letter:text-[#c87d55] first-letter:mr-3 first-letter:mt-1 first-letter:leading-none print:prose-stone print:text-black print:prose-a:text-black [&_img]:rounded-2xl [&_img]:border [&_img]:border-zinc-800 [&_img]:w-full [&_img]:my-8">
        {sanitizedLegacyBody ? (
          <div dangerouslySetInnerHTML={{ __html: sanitizedLegacyBody }} />
        ) : (
          <p>{currentPost.content}</p>
        )}
      </article>

      {/* Author Card Component */}
      <AuthorCard authorName={currentPost.author} />

      {/* Deep Dive / Further Reading Grid */}
      <section className="mt-16 pt-10 border-t border-zinc-800 print:hidden">
        <h2 className="text-2xl font-bold text-zinc-100 mb-6 flex items-center gap-2 tracking-tight">
          <span className="text-[#c87d55]">🔗</span> Further Reading & Context
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
         {finalRelatedPosts.map((related: ContentItem) => (
            <Link 
              key={related.slug} 
              href={`/${related.slug}`}
              className="group flex flex-col justify-between p-6 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 hover:bg-zinc-800/60 hover:border-zinc-700 transition-all duration-300 shadow-lg hover:shadow-xl"
            >
              <div>
                <span className="text-[10px] uppercase font-bold text-[#c87d55] tracking-widest mb-3 block">
                  {related.category}
                </span>
                <h3 className="text-base font-semibold text-zinc-200 group-hover:text-white mb-2 line-clamp-2 leading-snug">
                  {related.title}
                </h3>
              </div>
              <p className="text-xs text-zinc-500 line-clamp-2 mt-4 pt-3 border-t border-zinc-800/50">
                 {/* Safeguard: Strip HTML logic prevents raw code rendering in cards */}
                 {stripHtml(related.legacyBody || related.content || '').substring(0, 90)}...
              </p>
            </Link>
          ))}
        </div>
      </section>

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
