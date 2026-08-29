import React from "react";

export default function ArsenalProductsPage() {
  const arsenalItems = [
    {
      title: "Chronoverse Vault",
      badge: "PREMIUM ASSETS",
      badgeColor: "text-[#C8A7E8] bg-[#C8A7E8]/15 border-[#C8A7E8]/30",
      description: "Access encrypted dossiers, specialized trading scripts, and high-value digital blueprints.",
      link: "https://vault.chronoversecapital.com",
      btnText: "Access Vault ➔",
      sponsored: false,
    },
    {
      title: "Chronoverse Shop",
      badge: "INTEL REPORTS",
      badgeColor: "text-[#CFC5B8] bg-raised border-purple-border",
      description: "Tactical field reports, economic case studies, and wealth preservation frameworks.",
      link: "https://shop.chronoversecapital.com",
      btnText: "Browse Shop ➔",
      sponsored: false,
    },
    {
      title: "Agility Writer AI",
      badge: "LOGISTICS",
      badgeColor: "text-[#CFC5B8] bg-raised border-purple-border",
      description: "The high-speed analytical engine behind our rapid content and SEO deployment.",
      link: "https://agilitywriter.ai/?via=ahmed-hassan",
      btnText: "Deploy Engine ➔",
      sponsored: true,
    },
    {
      title: "XM Global Markets",
      badge: "EXECUTION",
      badgeColor: "text-[#CFC5B8] bg-raised border-purple-border",
      description: "Primary platform for identifying arbitrage gaps and executing market orders.",
      link: "https://affs.click/mlyV5",
      btnText: "Start Execution ➔",
      sponsored: true,
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 space-y-10 font-mono">
      
      {/* Header Section */}
      <header className="text-center space-y-3 border-b border-border pb-8">
        <h1 className="text-4xl md:text-5xl font-extrabold text-[#F3EBDD] tracking-tight">
          🛡️ The <span className="text-[#C8A7E8]">Arsenal</span>
        </h1>
        <p className="text-[#CFC5B8] text-base italic">
          Declassified Strategic Resources &amp; Infrastructure
        </p>
      </header>

      {/* Intel Disclosure Protocol */}
      <div className="bg-[#050506] border-l-4 border-l-[#C8A7E8] border border-border p-5 rounded-r-xl text-xs text-[#CFC5B8] leading-relaxed">
        <strong className="text-[#C8A7E8] font-bold uppercase tracking-wider block mb-1">
          Intel Disclosure:
        </strong>
        Our operations are powered by transparency. Some links below are partner links, supporting Chronoverse intelligence at no additional cost to your capital.
      </div>

      {/* Arsenal Tools Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {arsenalItems.map((item, index) => (
          <div
            key={index}
            className="bg-[#0D0D11] border border-border p-6 rounded-xl flex flex-col justify-between hover:border-[#C8A7E8]/50 transition-all space-y-4"
          >
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-[#F3EBDD]">{item.title}</h2>
                <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold border ${item.badgeColor}`}>
                  [{item.badge}]
                </span>
              </div>
              <p className="text-[#CFC5B8] text-xs leading-relaxed font-sans">
                {item.description}
              </p>
            </div>

            <div className="pt-2">
              <a
                href={item.link}
                target="_blank"
                rel={item.sponsored ? "nofollow sponsored" : "nofollow noopener"}
                className="inline-block bg-raised hover:bg-[#C8A7E8] text-[#F3EBDD] hover:text-black font-bold px-5 py-2.5 rounded-lg text-xs transition-colors border border-purple-border hover:border-[#C8A7E8]"
              >
                {item.btnText}
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* Footer Disclaimer */}
      <footer className="border-t border-border pt-8 text-center text-xs text-muted">
        © 2026 Chronoverse Capital | Declassified Archive | Authorized Use Only
      </footer>

    </div>
  );
}