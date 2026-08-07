import Link from 'next/link';
import Image from 'next/image';
import SocialGroup from '../socialicons';
import { siteConfig } from '@/config/siteConfig';
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
          
          {/* Column 1: Brand Info & Social Icons (Takes 4 cols on desktop) */}
          <div className="md:col-span-4 flex flex-col space-y-4">
            <Link href="/" className="inline-flex items-center gap-3">
              <Image
                src="/logo.svg"
                alt="Chronoverse Capital logo"
                width={36}
                height={36}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full shrink-0"
              />
              <div className="flex flex-col">
                <span className="text-lg md:text-xl font-extrabold tracking-wider text-zinc-100">
                  CHRONOVERSE <span className="text-[#c87d55]">CAPITAL</span>
                </span>
                <div className="text-[10px] text-zinc-500 font-mono tracking-widest mt-0.5">
                  www.chronoversecapital.com
                </div>
              </div>
            </Link>
            <p className="text-xs md:text-sm text-zinc-400 leading-relaxed max-w-xs md:max-w-sm">
              Providing deep-dive macroeconomic research, financial historical perspectives, and data-driven market insights designed for institutional-level understanding.
            </p>

            {/* Registered Mailing Address */}
            <p className="text-[11px] text-zinc-500 leading-relaxed max-w-xs md:max-w-sm font-mono">
              {siteConfig.postalAddress.full}
            </p>


            {/* Social Icons Embedded Directly (LinkedIn, X, Reddit, Pinterest) */}
            <div className="flex items-center gap-4 pt-2">
              {/* LinkedIn */}
              <a
                href="https://www.linkedin.com/in/ahmed-n-hassan-09b739238"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn"
                className="text-zinc-400 hover:text-[#0a66c2] transition-colors duration-200"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.25V10.9H6.46M7.86 6.7a1.62 1.62 0 1 0 0 3.24 1.62 1.62 0 0 0 0-3.24z" />
                </svg>
              </a>

              {/* X / Twitter */}
              <a
                href="https://x.com/ChronoVerseCap"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="X (Twitter)"
                className="text-zinc-400 hover:text-white transition-colors duration-200"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>

              {/* Reddit */}
              <a
                href="https://www.reddit.com/u/Prestigious_Mine_321/s/Pd8RhR79Z4"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Reddit"
                className="text-zinc-400 hover:text-[#ff4500] transition-colors duration-200"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.363.043-.538A1.758 1.758 0 0 1 4.08 12.00a1.754 1.754 0 0 1 1.754-1.754c.463 0 .898.18 1.207.49 1.194-.858 2.85-1.419 4.674-1.488l.944-4.42 3.25.688a1.25 1.25 0 0 1 1.102-.772zm-7.01 7.252a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5zm4 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5zm-5.02 4.148a.38.38 0 0 0-.268.65 5.56 5.56 0 0 0 3.288 1.05 5.56 5.56 0 0 0 3.288-1.05.38.38 0 0 0-.268-.65 4.805 4.805 0 0 1-3.02.83 4.805 4.805 0 0 1-3.02-.83z" />
                </svg>
              </a>

              {/* Pinterest */}
              <a
                href="https://pin.it/5qmsex75a"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Pinterest"
                className="text-zinc-400 hover:text-[#e60023] transition-colors duration-200"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.367 18.592 0 12.017 0z" />
                </svg>
              </a>
            </div>
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
          <div className="md:col-span-3 sm:col-span-2">
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
          The content provided on Chronoverse Capital is for informational and educational purposes only and should not be construed as financial, investment, or legal advice. Trading and investing in financial markets carry a high level of risk. Always consult with a licensed financial professional before making investment decisions.
        </div>

        {/* Copyright */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-500 gap-y-3">
          <p className="text-center sm:text-left">&copy; {new Date().getFullYear()} Chronoverse Capital. All rights reserved.</p>
          <p className="text-[10px] md:text-[11px] font-mono text-zinc-600 tracking-wider">
            Powered by Next.js & Sanity CDN
          </p>
        </div>

      </div>
    </footer>
  );
}