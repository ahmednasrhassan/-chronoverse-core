/** Obsolete acquisition cron: never contacts providers or persistent storage. */
function retired(): Response {
  return Response.json({ status: "retired" }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
export const GET = retired;
export const POST = retired;
