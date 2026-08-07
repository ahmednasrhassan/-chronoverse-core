import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { ticker, price, action } = body;

    return NextResponse.json(
      {
        status: "success",
        message: "TradingView alert processed successfully",
        receivedData: {
          ticker: ticker || "N/A",
          price: price || "N/A",
          action: action || "N/A",
          timestamp: new Date().toISOString(),
        },
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("TradingView Webhook Error:", error);
    const message = error instanceof Error ? error.message : "Failed to process TradingView webhook";
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
      system: "Chronoverse Capital TradingView Webhook Relay",
      endpoint: "https://www.chronoversecapital.com/api/tradingview",
    },
    { status: 200 }
  );
}
