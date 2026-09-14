import { NextResponse } from "next/server";

/**
 * Legacy comments were write-only: the public article query never loaded
 * approved comments, while this unauthenticated route still created Sanity
 * documents. Keep the route explicit and non-mutating until a complete
 * moderation and abuse-prevention workflow is intentionally restored.
 */
export async function POST() {
  return NextResponse.json(
    { status: "disabled", message: "Comments are not currently available" },
    { status: 410 },
  );
}
