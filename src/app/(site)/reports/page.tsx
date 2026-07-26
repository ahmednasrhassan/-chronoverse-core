import Link from 'next/link';

export default function ReportsPage() {
  const reports = [
    {
      slug: 'macro-liquidity-cycles-2026',
      title: 'Global Liquidity Cycles & Historical Macro Pivots 2026',
      date: '2026-07-15',
      category: 'Macro Research',
      summary: 'An in-depth analysis of global central bank balance sheets, interest rate cycles, and historical capital reallocation patterns.',
      readTime: '8 min read',
    },
    {
      slug: 'bitcoin-halving-fractal-analysis',
      title: 'Bitcoin Halving Cycle Fractals & On-Chain Supply Metrics',
      date: '2026-06-28',
      category: 'Crypto Intelligence',
      summary: 'Evaluating post-halving structural price models, miner economics, and long-term holder behavior across four consecutive market cycles.',
      readTime: '10 min read',
    },
    {
      slug: 'gold-vs-tech-rotation-report',
      title: 'The Great Asset Rotation: Gold vs. Mega-Cap Tech',
      date: '2026-05-10',
      category: 'Asset Allocation',
      summary: 'Comparative historical study analyzing institutional capital flows between hard store-of-value assets and exponential technology equities.',
      readTime: '6 min read',
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <header className="mb-12 border-b border-[#27272a] pb-8">
        <h1 className="text-4xl font-bold text-[#f4f4f5] mb-4">
          Research & <span className="text-[#c87d55]">Intelligence Reports</span>
        </h1>
        <p className="text-[#a1a1aa] text-lg">
          Institutional-grade research, macro liquidity analysis, and cyclical dynamics.
        </p>
      </header>

      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        {reports.map((report) => (
          <article
            key={report.slug}
            className="bg-[#18181b] border border-[#27272a] rounded-xl p-6 hover:border-[#c87d55]/50 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between text-xs text-[#a1a1aa] mb-3">
                <span className="px-2.5 py-1 rounded-md bg-[#c87d55]/15 text-[#c87d55] border border-[#c87d55]/30 font-medium">
                  {report.category}
                </span>
                <span>{report.readTime}</span>
              </div>
              <h2 className="text-xl font-bold text-[#f4f4f5] mb-3 hover:text-[#c87d55] transition-colors cursor-pointer">
                {report.title}
              </h2>
              <p className="text-[#a1a1aa] text-sm mb-6 line-clamp-3">{report.summary}</p>
            </div>

            <div className="pt-4 border-t border-[#27272a] flex items-center justify-between text-xs text-[#a1a1aa]">
              <span>{report.date}</span>
              <span className="text-[#c87d55] font-semibold hover:underline cursor-pointer">Read Report →</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}