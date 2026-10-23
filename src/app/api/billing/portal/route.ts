/** Inert retirement response; no checkout, provider call, or body parsing. */
export async function POST(): Promise<Response> {
  return Response.json({ ok: false, error: "portal-disabled" }, {
    status: 410,
    headers: { "Cache-Control": "no-store" },
  });
}
