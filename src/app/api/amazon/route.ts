/** Retired legacy email dispatch. Newsletter and signed webhook delivery are separate. */
export async function POST() {
  return Response.json(
    { status: "disabled", message: "This legacy email endpoint is unavailable." },
    { status: 410 },
  );
}
