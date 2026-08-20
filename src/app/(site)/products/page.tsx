import React from "react";

export default function ArsenalProductsPage() {
  const arsenalItems = [
    {
      title: "Chronoverse Vault",
      badge: "PREMIUM ASSETS",
      badgeColor: "text-[#c87d55] bg-[#c87d55]/15 border-[#c87d55]/30",
      description: "Access encrypted dossiers, specialized trading scripts, and high-value digital blueprints.",
      link: "https://vault.chronoversecapital.com",
      btnText: "Access Vault ➔",
      sponsored: false,
    },
    {
      title: "Chronoverse Shop",
      badge: "INTEL REPORTS",
      badgeColor: "text-[#a1a1aa] bg-[#27272a] border-[#3f3f46]",
      description: "Tactical field reports, economic case studies, and wealth preservation frameworks.",
      link: "https://shop.chronoversecapital.com",
      btnText: "Browse Shop ➔",
      sponsored: false,
    },
    {
      title: "Agility Writer AI",
      badge: "LOGISTICS",
      badgeColor: "text-[#a1a1aa] bg-[#27272a] border-[#3f3f46]",
      description: "The high-speed analytical engine behind our rapid content and SEO deployment.",
      link: "https://agilitywriter.ai/?via=ahmed-hassan",
      btnText: "Deploy Engine ➔",
      sponsored: true,
    },
    {
      title: "XM Global Markets",
      badge: "EXECUTION",
      badgeColor: "text-[#a1a1aa] bg-[#27272a] border-[#3f3f46]",
      description: "Primary platform for identifying arbitrage gaps and executing market orders.",
      link: "https://affs.click/mlyV5",
      btnText: "Start Execution ➔",
      sponsored: true,
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 space-y-10 font-mono">
      
      {/* Header Section */}
      <header className="text-center space-y-3 border-b border-[#27272a] pb-8">
        <h1 className="text-4xl md:text-5xl font-extrabold text-[#f4f4f5] tracking-tight">
          🛡️ The <span className="text-[#c87d55]">Arsenal</span>
        </h1>
        <p className="text-[#a1a1aa] text-base italic">
          Declassified Strategic Resources &amp; Infrastructure
        </p>
      </header>

      {/* Intel Disclosure Protocol */}
      <div className="bg-[#0a0a0a] border-l-4 border-l-[#c87d55] border border-[#27272a] p-5 rounded-r-xl text-xs text-[#a1a1aa] leading-relaxed">
        <strong className="text-[#c87d55] font-bold uppercase tracking-wider block mb-1">
          Intel Disclosure:
        </strong>
        Our operations are powered by transparency. Some links below are partner links, supporting Chronoverse intelligence at no additional cost to your capital.
      </div>

      {/* Arsenal Tools Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {arsenalItems.map((item, index) => (
          <div
            key={index}
            className="bg-[#18181b] border border-[#27272a] p-6 rounded-xl flex flex-col justify-between hover:border-[#c87d55]/50 transition-all space-y-4"
          >
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-[#f4f4f5]">{item.title}</h2>
                <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold border ${item.badgeColor}`}>
                  [{item.badge}]
                </span>
              </div>
              <p className="text-[#a1a1aa] text-xs leading-relaxed font-sans">
                {item.description}
              </p>
            </div>

            <div className="pt-2">
              <a
                href={item.link}
                target="_blank"
                rel={item.sponsored ? "nofollow sponsored" : "nofollow noopener"}
                className="inline-block bg-[#27272a] hover:bg-[#c87d55] text-[#f4f4f5] hover:text-black font-bold px-5 py-2.5 rounded-lg text-xs transition-colors border border-[#3f3f46] hover:border-[#c87d55]"
              >
                {item.btnText}
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* Footer Disclaimer */}
      <footer className="border-t border-[#27272a] pt-8 text-center text-xs text-[#52525b]">
        © 2026 Chronoverse Capital | Declassified Archive | Authorized Use Only
      </footer>

    </div>
  );
}