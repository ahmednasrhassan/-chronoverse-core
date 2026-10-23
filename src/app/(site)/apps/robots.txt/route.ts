import { APPLICATIONS_ORIGIN } from "@/config/applications";

export const dynamic = "force-static";

export function GET() {
  return new Response(
    [
      "User-agent: *",
      "Allow: /",
      "Disallow: /api/",
      "Disallow: /auth/",
      "Disallow: /account",
      "Disallow: /studio/",
      "",
      `Sitemap: ${APPLICATIONS_ORIGIN}/sitemap.xml`,
      `Host: ${APPLICATIONS_ORIGIN}`,
      "",
    ].join("\n"),
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}
