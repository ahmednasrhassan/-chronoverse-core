import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      status: "retired",
      message: "Gold is not a Chronoverse V1 launch product.",
    },
    { status: 410 },
  );
}
