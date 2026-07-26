import { NextResponse } from "next/server";

export async function GET() {
  const baseUrl = "https://www.chronoversecapital.com";

  // قائمة بجميع الصفحات والمسارات الأساسية في موقعك
  const pages = [
    { url: "", changefreq: "daily", priority: "1.0" },
    { url: "/rss", changefreq: "hourly", priority: "0.8" },
    { url: "/privacy-policy", changefreq: "monthly", priority: "0.3" },
    { url: "/terms-of-service", changefreq: "monthly", priority: "0.3" },
    { url: "/products", changefreq: "weekly", priority: "0.9" },
    { url: "/reports", changefreq: "weekly", priority: "0.9" },
    { url: "/sponsors", changefreq: "weekly", priority: "0.7" },
  ];

  const currentDate = new Date().toISOString().split("T")[0];

  // توليد هيكل ملف الـ XML الخاص بخريطة الموقع
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${pages
    .map(
      (page) => `
    <url>
      <loc>${baseUrl}${page.url}</loc>
      <lastmod>${currentDate}</lastmod>
      <changefreq>${page.changefreq}</changefreq>
      <priority>${page.priority}</priority>
    </url>
  `
    )
    .join("")}
</urlset>`;

  return new NextResponse(sitemapXml, {
    headers: {
      "Content-Type": "application/xml",
    },
  });
}