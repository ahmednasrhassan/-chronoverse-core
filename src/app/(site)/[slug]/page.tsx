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
  },
  {
    slug: "macro-liquidity-cycles-2026",
    title: "Global Liquidity Cycles & Historical Macro Pivots 2026",
    date: "2026-07-15",
    category: "Reports",
    keywords: ["liquidity", "macro", "central-banks", "finance"],
    content: "Comprehensive report on central bank balance sheets and interest rate expectations...",
  },
  {
    slug: "bitcoin-halving-fractal-analysis",
    title: "Bitcoin Halving Cycle Fractals & On-Chain Supply Metrics",
    date: "2026-06-28",
    category: "Reports",
    keywords: ["crypto", "bitcoin", "fractals", "on-chain"],
    content: "Evaluating post-halving structural price models and long-term holder behavior...",
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

  // Format array for RelatedDropdown component (Limit to 8 posts)
  const formattedRelated = relatedPosts.slice(0, 8).map((post) => ({
    _id: post.slug,
    title: post.title,
    slug: { current: post.slug },
  }));

  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      {/* Article Header */}
      <div className="mb-8 border-b border-zinc-800 pb-6">
        <span className="text-xs font-semibold uppercase text-[#c87d55] tracking-wider">
          {currentPost.category}
        </span>
        <h1 className="text-3xl md:text-4xl font-bold text-zinc-100 mt-2 mb-4">
          {currentPost.title}
        </h1>
        <p className="text-xs text-zinc-500">{currentPost.date}</p>
      </div>

      {/* Automatic Table of Contents */}
      <AutoTOC />

      {/* Automatic Related Content Dropdown (Max 8 Articles) */}
      <RelatedDropdown articles={formattedRelated} />

      {/* Article Content */}
      <article className="prose prose-invert mt-8 max-w-none text-zinc-300 leading-relaxed">
        <p>{currentPost.content}</p>
      </article>

      {/* Article Discussion & Comments Section */}
      <section className="mt-16 pt-8 border-t border-zinc-800">
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