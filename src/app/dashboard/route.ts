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
        webhookService: "Active",
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
  } catch (error: unknown) {
    console.error("Dashboard API Error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch dashboard data";
    return NextResponse.json(
      {
        status: "error",
        message
      },
      { status: 500 }
    );
  }
}