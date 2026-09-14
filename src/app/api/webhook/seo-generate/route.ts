import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * This legacy public mutation endpoint had no trustworthy way to authenticate
 * a Studio browser request. SEO generation now runs inside the authenticated
 * Studio action and writes with the editor's own Sanity permissions.
 */
export async function POST() {
  return disabledResponse();
}

export async function GET() {
  return disabledResponse();
}

function disabledResponse() {
  return NextResponse.json(
    {
      status: "disabled",
      message: "Use the authenticated Sanity Studio document action",
    },
    { status: 410 },
  );
}
