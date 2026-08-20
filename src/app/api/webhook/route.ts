import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    await request.json();

    // General processing logic for external webhooks
    return NextResponse.json(
      {
        status: "success",
        message: "General webhook processed successfully",
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("General Webhook Error:", error);
    const message = error instanceof Error ? error.message : "Failed to process webhook payload";
    return NextResponse.json(
      {
        status: "error",
        message,
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      status: "active",
      system: "Chronoverse Capital General Webhook Dispatcher",
      endpoint: "https://chronoversecapital.com/api/webhook",
    },
    { status: 200 }
  );
}