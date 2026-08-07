import { NextResponse } from "next/server";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

// Initialize Amazon SES Client (Safely reads credentials from environment variables)
const sesClient = new SESClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

export async function POST(request: Request) {
  try {
    const { email, subject, message } = await request.json();

    if (!email) {
      return NextResponse.json(
        { status: "error", message: "Email parameter is required" },
        { status: 400 }
      );
    }

    const recipientEmail =
      process.env.OFFICIAL_EMAIL || "info@chronoversecapital.com";

    // Setup Amazon SES Email Command Payload
    const sendEmailCommand = new SendEmailCommand({
      Source: recipientEmail,
      Destination: {
        ToAddresses: [recipientEmail],
      },
      Message: {
        Subject: {
          Data: subject || "Chronoverse Capital System Notification / Ping",
          Charset: "UTF-8",
        },
        Body: {
          Html: {
            Data: `
              <div style="font-family: monospace; background-color: #0a0a0a; color: #f4f4f5; padding: 24px; border: 1px solid #c87d55; border-radius: 8px;">
                <h2 style="color: #c87d55; margin-top: 0;">[Chronoverse AWS SES Relay Dispatch]</h2>
                <p><strong>Sender:</strong> ${email}</p>
                <p><strong>Payload:</strong></p>
                <blockquote style="background-color: #18181b; padding: 12px; border-left: 4px solid #c87d55; font-size: 14px; color: #a1a1aa;">
                  ${message || "New newsletter subscription / system ping."}
                </blockquote>
                <hr style="border-color: #27272a; margin-top: 20px;" />
                <span style="font-size: 10px; color: #71717a;">Engineered by Chronoverse Capital Infrastructure</span>
              </div>
            `,
            Charset: "UTF-8",
          },
        },
      },
    });

    // Send email via AWS SES
    await sesClient.send(sendEmailCommand);

    return NextResponse.json({
      status: "success",
      message: "Email dispatched successfully via Amazon SES",
    });
  } catch (error: any) {
    console.error("AWS SES Execution Error:", error);
    return NextResponse.json(
      {
        status: "error",
        message: error.message || "Failed to dispatch email through AWS SES",
      },
      { status: 500 }
    );
  }
}