// Retired newsletter publication dispatch. CMS revalidation remains /api/revalidate.
export function POST() {
  return Response.json({ code: "newsletter_dispatch_retired" }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
