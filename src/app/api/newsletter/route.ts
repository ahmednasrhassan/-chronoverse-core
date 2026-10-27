export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Retired website admission endpoint: never read addresses, proxy or persist.
export function POST() {
  return Response.json({ status: "paused", code: "newsletter_registration_moved" },
    { status: 503, headers: { "Cache-Control": "no-store" } });
}
