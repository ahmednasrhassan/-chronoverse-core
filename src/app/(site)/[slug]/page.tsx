import Link from "next/link";
import AutoTOC from "@/components/autotoc";
import RelatedDropdown from "@/components/relateddropdown";
import { notFound } from "next/navigation";

interface ArticleItem {
  slug: string;
  title: string;
  date: string;
  category: string;
  keywords: string[];
  content: string;
  imageUrl?: string;
}

// Global content registry
const allArticles: ArticleItem[] = [
  {
    slug: "deglobalization-impact",
    title: "The Structural Shift: Deglobalization Impact on Global Capital",
    date: "2026-08-01",
    category: "Articles",
    keywords: ["deglobalization", "macro", "trade", "capital"],
    content: "Detailed structural analysis on global trade flows and capital redirection...",
    imageUrl: "https://via.placeholder.com/800x400/181310/c87d55?text=Deglobalization",
  },
  {
    slug: "macro-liquidity-cycles-2026",
    title: "Global Liquidity Cycles & Historical Macro Pivots 2026",
    date: "2026-07-15",
    category: "Reports",
    keywords: ["liquidity", "macro", "central-banks", "finance"],
    content: "Comprehensive report on central bank balance sheets and interest rate expectations...",
    imageUrl: "https://via.placeholder.com/800x400/181310/c87d55?text=Macro+Liquidity",
  },
  {
    slug: "bitcoin-halving-fractal-analysis",
    title: "Bitcoin Halving Cycle Fractals & On-Chain Supply Metrics",
    date: "2026-06-28",
    category: "Reports",
    keywords: ["crypto", "bitcoin", "fractals", "on-chain"],
    content: "Evaluating post-halving structural price models and long-term holder behavior...",
    imageUrl: "https://via.placeholder.com/800x400/181310/c87d55?text=Bitcoin+Halving",
  },
  {
    slug: "gold-vs-tech-rotation-report",
    title: "The Great Asset Rotation: Gold vs. Mega-Cap Tech",
    date: "2026-05-10",
    category: "Research",
    keywords: ["gold", "tech", "asset-allocation", "macro"],
    content: "Comparative study analyzing institutional capital flows between hard assets and technology equities...",
  },
];

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function UniversalArticlePage({ params }: PageProps) {
  const { slug } = await params;

  // 1. Fetch current article by slug
  const currentPost = allArticles.find((item) => item.slug === slug);

  if (!currentPost) {
    notFound();
  }

  // Auto-generate Smart Image SEO Data (Alt Text & Caption) based on Title and Category
  const autoAltText = `Illustration for ${currentPost.category} covering ${currentPost.title}`;
  const autoCaption = `Figure 1: Visual representation of ${currentPost.title.toLowerCase()} concepts.`;

  // Auto-generate a meta summary snippet from the content (First 120 characters)
  const autoSummary = currentPost.content.length > 120 
    ? currentPost.content.substring(0, 120) + "..." 
    : currentPost.content;

  // 2. Filter related posts across all categories by shared keywords or category
  let relatedPosts = allArticles
    .filter((item) => item.slug !== currentPost.slug)
    .filter((item) => {
      const sameCategory = item.category === currentPost.category;
      const sharedKeywords = item.keywords?.some((kw) =>
        currentPost.keywords?.includes(kw)
      );
      return sameCategory || sharedKeywords;
    });

  // 3. Fallback: Return latest posts if no keyword match is found
  if (relatedPosts.length === 0) {
    relatedPosts = allArticles.filter((item) => item.slug !== currentPost.slug);
  }

  const finalRelatedPosts = relatedPosts.slice(0, 8);

  // Format array for RelatedDropdown component (Limit to 8 posts)
  const formattedRelated = finalRelatedPosts.map((post) => ({
    _id: post.slug,
    title: post.title,
    slug: { current: post.slug },
  }));

  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      
      {/* Article Header & Admin Controls */}
      <div className="mb-8 border-b border-zinc-800 pb-6">
        <div className="flex justify-between items-center mb-3">
          <span className="text-xs font-semibold uppercase text-[#c87d55] tracking-wider bg-[#c87d55]/10 px-2 py-1 rounded">
            {currentPost.category}
          </span>
          
          {/* Admin Edit Button (Navigates to Sanity Studio) */}
          <Link
            href={`/studio/structure/intent/edit/id=${currentPost.slug}`}
            target="_blank"
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 hover:text-white rounded-md transition-colors border border-zinc-700"
            title="Edit this article in Sanity CMS"
          >
            <span>✏️</span> Edit Article
          </Link>
        </div>
        
        <h1 className="text-3xl md:text-4xl font-bold text-zinc-100 mt-2 mb-4 leading-tight">
          {currentPost.title}
        </h1>
        
        {/* Auto-Generated Summary Block */}
        <p className="text-lg text-zinc-400 font-medium italic border-l-2 border-[#c87d55] pl-4 py-1 mb-4">
          {autoSummary}
        </p>
        
        <p className="text-xs text-zinc-500">{currentPost.date}</p>
      </div>

      {/* Dynamic Hero Image Section with Auto-Alt and Auto-Caption */}
      {currentPost.imageUrl && (
        <figure className="mb-10 w-full">
          <div className="relative w-full h-96 rounded-xl overflow-hidden border border-zinc-800">
            <img 
              src={currentPost.imageUrl} 
              alt={autoAltText} 
              title={currentPost.title}
              className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
            />
          </div>
          <figcaption className="text-center text-xs text-zinc-500 mt-3 italic">
            {autoCaption}
          </figcaption>
        </figure>
      )}

      {/* Automatic Table of Contents */}
      <AutoTOC />

      {/* Automatic Related Content Dropdown (Top Context) */}
      <div className="my-8">
        <RelatedDropdown articles={formattedRelated} />
      </div>

      {/* Article Content Area */}
      <article className="prose prose-invert mt-8 max-w-none text-zinc-300 leading-relaxed prose-a:text-[#c87d55] hover:prose-a:text-[#e09870]">
        <p>{currentPost.content}</p>
      </article>

      {/* Deep Dive / Further Reading Grid (Auto-Generated Internal Links) */}
      <section className="mt-16 pt-10 border-t border-zinc-800">
        <h2 className="text-2xl font-bold text-zinc-100 mb-6 flex items-center gap-2">
          <span className="text-[#c87d55]">🔗</span> Further Reading & Context
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {finalRelatedPosts.map((related) => (
            <Link 
              key={related.slug} 
              href={`/${related.slug}`}
              className="group flex flex-col justify-between p-5 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/80 transition-all duration-300"
            >
              <div>
                <span className="text-[10px] uppercase font-bold text-[#c87d55] tracking-widest mb-2 block">
                  {related.category}
                </span>
                <h3 className="text-sm font-semibold text-zinc-200 group-hover:text-white mb-2 line-clamp-2">
                  {related.title}
                </h3>
              </div>
              <p className="text-xs text-zinc-500 line-clamp-2 mt-auto">
                 {/* Generates a smart mini-description for each card */}
                 {related.content.substring(0, 80)}...
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* Article Discussion & Comments Section */}
      <section className="mt-12 pt-8 border-t border-zinc-800">
        <h2 className="text-xl font-semibold text-zinc-100 mb-6 flex items-center gap-2">
          <span className="text-[#c87d55]">💬</span> Discussion & Comments
        </h2>
        <div className="p-6 rounded-xl border border-zinc-800 bg-[#181310] text-center text-zinc-400 text-sm">
          Comments section loaded for: <span className="text-[#c87d55]">{currentPost.slug}</span>
        </div>
      </section>
      
    </main>
  );
}