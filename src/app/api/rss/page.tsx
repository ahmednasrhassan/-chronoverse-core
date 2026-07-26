import React from "react";
import Link from "next/link";

// Metadata for SEO optimization
export const metadata = {
  title: "RSS Feed & News Wire | ChronoVerse Capital",
  description: "Real-time market insights, global financial intelligence, and institutional updates from ChronoVerse Capital.",
};

// Mock or dynamic market feed data representing professional institutional articles
const rssArticles = [
  {
    id: "cv-01",
    title: "ChronoVerse Capital Expands High-Frequency Infrastructure via Amazon AWS SES Relay",
    description: "Institutional deployment of resilient messaging pipelines ensures sub-second alert transmission across global capital markets.",
    date: "July 26, 2026",
    category: "Infrastructure",
    link: "/insights/aws-infrastructure-expansion"
  },
  {
    id: "cv-02",
    title: "Global Liquidity Shifts: Q3 Macroeconomic Outlook for Private Equity",
    description: "An analytical breakdown of emerging capital flows, interest rate adjustments, and venture asset valuations in volatile markets.",
    date: "July 24, 2026",
    category: "Macro Economics",
    link: "/insights/q3-liquidity-shifts"
  },
  {
    id: "cv-03",
    title: "Algorithmic Risk Mitigation in Cross-Border Digital Asset Portfolios",
    description: "Implementing automated circuit breakers and multi-tier cryptographic routing to protect institutional capital commitments.",
    date: "July 20, 2026",
    category: "Risk Management",
    link: "/insights/algorithmic-risk-mitigation"
  }
];

export default function RSSFeedPage() {
  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#0a0a0a", color: "#f4f4f5", fontFamily: "monospace", padding: "40px 20px" }}>
      <div style={{ maxWidth: "800px", margin: "0 auto" }}>
        
        {/* Header Section */}
        <div style={{ borderBottom: "1px solid #27272a", paddingBottom: "24px", marginBottom: "40px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <span style={{ color: "#c87d55", fontSize: "12px", letterSpacing: "2px", textTransform: "uppercase" }}>// Global Feed Stream</span>
            <h1 style={{ fontSize: "28px", fontWeight: "bold", margin: "8px 0 0 0", color: "#ffffff" }}>ChronoVerse RSS Wire</h1>
          </div>
          <Link href="/" style={{ color: "#a1a1aa", textDecoration: "none", fontSize: "14px", border: "1px solid #27272a", padding: "6px 12px", borderRadius: "4px" }}>
            ← Back to Terminal
          </Link>
        </div>

        {/* Introduction */}
        <p style={{ color: "#a1a1aa", fontSize: "14px", lineHeight: "1.6", marginBottom: "32px" }}>
          Welcome to ChronoVerse Capital automated intelligence wire. Syndicated data feeds, market indicators, and protocol updates are broadcasted here in real-time.
        </p>

        {/* Articles Feed List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {rssArticles.map((article) => (
            <article key={article.id} style={{ backgroundColor: "#121214", border: "1px solid #27272a", borderRadius: "8px", padding: "24px", transition: "border-color 0.2s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <span style={{ fontSize: "11px", backgroundColor: "#18181b", color: "#c87d55", padding: "4px 8px", borderRadius: "4px", border: "1px solid #c87d5540" }}>
                  {article.category}
                </span>
                <span style={{ fontSize: "12px", color: "#71717a" }}>{article.date}</span>
              </div>
              
              <h2 style={{ fontSize: "18px", fontWeight: "600", margin: "0 0 10px 0", color: "#f4f4f5" }}>
                {article.title}
              </h2>
              
              <p style={{ fontSize: "14px", color: "#a1a1aa", margin: "0 0 16px 0", lineHeight: "1.5" }}>
                {article.description}
              </p>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Link href={article.link} style={{ color: "#c87d55", textDecoration: "none", fontSize: "13px", fontWeight: "bold" }}>
                  Read Full Wire Dispatch →
                </Link>
              </div>
            </article>
          ))}
        </div>

        {/* Footer info */}
        <div style={{ marginTop: "60px", textAlign: "center", borderTop: "1px solid #27272a", paddingTop: "20px", color: "#71717a", fontSize: "12px" }}>
          ChronoVerse Capital Infrastructure. Automated RSS Protocol Active.
        </div>

      </div>
    </main>
  );
}