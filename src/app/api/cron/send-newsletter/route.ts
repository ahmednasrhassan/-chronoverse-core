// Permanent tombstone: no scheduler, alias or authenticated caller gains a sender.
export function GET() {
  return Response.json({ code: "newsletter_dispatch_retired" }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
export const POST = GET;
