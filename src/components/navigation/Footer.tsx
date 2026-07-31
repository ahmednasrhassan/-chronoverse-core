import Link from 'next/link';

export default function Footer() {
  // Exact 14 Administrative & Site Routes matching your folder structure in src/app/(site)
  const adminLinks = [
    { title: 'About Us', href: '/about' },
    { title: 'Privacy Policy', href: '/privacy-policy' },
    { title: 'Terms of Service', href: '/terms-of-service' },
    { title: 'Disclaimer', href: '/disclaimer' },
    { title: 'DMCA Notice', href: '/dmca' },
    { title: 'Editorial Policy', href: '/editorial-policy' },
    { title: 'Contact Us', href: '/contact' },
    { title: 'FAQ', href: '/faq' },
    { title: 'Manifesto', href: '/manifesto' },
    { title: 'Intelligence', href: '/intelligence' },
    { title: 'Reports', href: '/reports' },
    { title: 'Archive', href: '/archive' },
    { title: 'Markets', href: '/markets' },
    { title: 'Sponsors', href: '/sponsors' },
  ];

  return (
    <footer className="w-full bg-[#0d0a08] border-t border-zinc-800/80 text-zinc-400 py-12 md:py-16 mt-auto font-sans">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        
        {/* Main Footer Grid - Adjusted for Mobile Desktop Mode & standard Mobile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-10 md:gap-8 pb-10 border-b border-zinc-800/80">
          
          {/* Column 1: Brand Info (Takes 4 cols on desktop) */}
          <div className="md:col-span-4 flex flex-col space-y-4">
            <Link href="/" className="inline-block">
              <span className="text-lg md:text-xl font-extrabold tracking-wider text-zinc-100">
                CHRONOVERSE <span className="text-[#c87d55]">CAPITAL</span>
              </span>
              <div className="text-[10px] text-zinc-500 font-mono tracking-widest mt-0.5">
                www.chronoversecapital.com
              </div>
            </Link>
            <p className="text-xs md:text-sm text-zinc-400 leading-relaxed max-w-xs md:max-w-sm">
              Providing deep-dive macroeconomic research, financial historical perspectives, and data-driven market insights designed for institutional-level understanding.
            </p>
          </div>

          {/* Column 2: Exact 14 Administrative & Site Links (Takes 5 cols on desktop) */}
          <div className="md:col-span-5">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-200 mb-5">
              Governance & Directory
            </h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs md:text-sm">
              {adminLinks.map((link) => (
                <Link
                  key={link.title}
                  href={link.href}
                  className="hover:text-[#c87d55] transition-colors text-zinc-400 truncate"
                >
                  {link.title}
                </Link>
              ))}
            </div>
          </div>

          {/* Column 3: Ecosystem & Partners (Takes 3 cols on desktop) */}
          <div className="md:col-span-3 sm:col-span-2 md:col-span-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-200 mb-5">
              Ecosystem & Tools
            </h3>
            <ul className="space-y-3.5 text-xs md:text-sm">
              <li>
                <a
                  href="https://shop.chronoversecapital.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center text-zinc-300 hover:text-[#c87d55] transition-colors group"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#c87d55] mr-2.5 group-hover:scale-125 transition-transform"></span>
                  Gumroad Store
                </a>
              </li>
              <li>
                <a
                  href="https://vault.chronoversecapital.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center text-zinc-300 hover:text-[#c87d55] transition-colors group"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2.5 group-hover:scale-125 transition-transform"></span>
                  Lemon Squeezy Vault
                </a>
              </li>
              <li>
                <a
                  href="https://affs.click/mlyV5"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center text-zinc-300 hover:text-[#c87d55] transition-colors group"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-2.5 group-hover:scale-125 transition-transform"></span>
                  XM Trading Platform
                </a>
              </li>
              <li>
                <a
                  href="https://agilitywriter.ai/?via=ahmed-hassan"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center text-zinc-300 hover:text-[#c87d55] transition-colors group"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 mr-2.5 group-hover:scale-125 transition-transform"></span>
                  Agility Writer AI
                </a>
              </li>
            </ul>
          </div>

        </div>

        {/* Disclaimer Notice */}
        <div className="py-6 border-b border-zinc-800/50 text-[11px] md:text-xs text-zinc-500 leading-relaxed max-w-6xl">
          <span className="font-semibold text-zinc-400 mr-1">Financial Disclaimer:</span>
          The content provided on ChronoVerse Capital is for informational and educational purposes only and should not be construed as financial, investment, or legal advice. Trading and investing in financial markets carry a high level of risk. Always consult with a licensed financial professional before making investment decisions.
        </div>

        {/* Copyright */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-500 gap-y-3">
          <p className="text-center sm:text-left">&copy; {new Date().getFullYear()} ChronoVerse Capital. All rights reserved.</p>
          <p className="text-[10px] md:text-[11px] font-mono text-zinc-600 tracking-wider">
            Powered by Next.js & Sanity CDN
          </p>
        </div>

      </div>
    </footer>
  );
}