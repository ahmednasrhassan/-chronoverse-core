import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const payload = await request.json();

    // General processing logic for external webhooks
    return NextResponse.json(
      {
        status: "success",
        message: "General webhook processed successfully",
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("General Webhook Error:", error);
    return NextResponse.json(
      {
        status: "error",
        message: error.message || "Failed to process webhook payload",
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
      endpoint: "https://www.chronoversecapital.com/api/webhook",
    },
    { status: 200 }
  );
}