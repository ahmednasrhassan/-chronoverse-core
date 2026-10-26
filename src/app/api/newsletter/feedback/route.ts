// Preserve retry semantics until the owner reconciles historical SNS subscriptions.
export function POST() {
  return Response.json({ code: "newsletter_feedback_migration_required" }, { status: 503, headers: { "Cache-Control": "no-store" } });
}
