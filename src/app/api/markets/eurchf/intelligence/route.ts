/** Compatibility tombstone for a permanently retired market product. */
export async function GET(): Promise<Response> {
  return Response.json({ status: "retired" }, {
    status: 410,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}
