import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      status: "retired",
      message: "This legacy market-data endpoint is not part of Chronoverse V1.",
    },
    { status: 410 },
  );
}
