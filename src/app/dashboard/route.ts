import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Dashboard statistics and system overview data
    const dashboardData = {
      systemStatus: "Operational",
      platform: "Chronoverse Capital Core",
      version: "2.0.1",
      activeServices: {
        awsSES: "Connected",
        tradingViewWebhook: "Active",
        rssFeed: "Online",
        sitemap: "Generated"
      },
      metrics: {
        totalDispatches: 1420,
        activeAlertsCount: 8,
        serverUptime: "99.98%"
      },
      timestamp: new Date().toISOString()
    };

    return NextResponse.json(
      {
        status: "success",
        data: dashboardData
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Dashboard API Error:", error);
    return NextResponse.json(
      {
        status: "error",
        message: error.message || "Failed to fetch dashboard data"
      },
      { status: 500 }
    );
  }
}