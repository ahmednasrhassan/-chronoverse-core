import { NextResponse } from "next/server";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { sanityWriteClient } from "@/lib/sanity/writeClient";


/**
 * Newsletter Subdomain Alignment (API layer)
 * -------------------------------------------
 * This route is intentionally kept separate from `/api/amazon` (the generic
 * SES relay/ping endpoint) so that the `newsletter.chronoversecapital.com`
 * subdomain has its own dedicated subscription endpoint, letting future
 * changes to newsletter logic (double opt-in, list segmentation, etc.)
 * evolve independently of the generic contact/ping relay — while both
 * continue to share the same AWS SES client/credentials and are exempt from
 * the `/newsletter` host rewrite in `src/proxy.ts` (matcher excludes
 * `/api/*` entirely), so this endpoint responds identically whether called
 * from the main domain or the newsletter subdomain.
 */
const sesClient = new SESClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { status: "error", message: "A valid email address is required" },
        { status: 400 }
      );
    }

    const officialEmail = process.env.OFFICIAL_EMAIL || "info@chronoversecapital.com";

    // Persist the subscriber to Sanity (best-effort — a failure here should
    // never block the confirmation email/response) so the daily
    // `/api/cron/send-newsletter` job has a distribution list to read from.
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const existing = await sanityWriteClient.fetch(
        `*[_type == "subscriber" && email == $email][0]{_id}`,
        { email: normalizedEmail }
      );

      if (!existing) {
        await sanityWriteClient.create({
          _type: "subscriber",
          email: normalizedEmail,
          subscribedAt: new Date().toISOString(),
          active: true,
          source: "newsletter.chronoversecapital.com",
        });
      }
    } catch (subscriberError) {
      console.warn("Failed to persist subscriber to Sanity:", subscriberError);
    }


    const sendEmailCommand = new SendEmailCommand({
      Source: officialEmail,
      Destination: {
        ToAddresses: [officialEmail],
      },
      Message: {
        Subject: {
          Data: "[Newsletter] New Subscription — ChronoVerse Dispatch",
          Charset: "UTF-8",
        },
        Body: {
          Html: {
            Data: `
              <div style="font-family: monospace; background-color: #0a0a0a; color: #f4f4f5; padding: 24px; border: 1px solid #c87d55; border-radius: 8px;">
                <h2 style="color: #c87d55; margin-top: 0;">[ChronoVerse Newsletter Subscription]</h2>
                <p><strong>Subscriber Email:</strong> ${email}</p>
                <p><strong>Source:</strong> newsletter.chronoversecapital.com</p>
                <hr style="border-color: #27272a; margin-top: 20px;" />
                <span style="font-size: 10px; color: #71717a;">Engineered by ChronoVerse Capital Infrastructure</span>
              </div>
            `,
            Charset: "UTF-8",
          },
        },
      },
    });

    await sesClient.send(sendEmailCommand);

    return NextResponse.json({
      status: "success",
      message: "Subscription confirmed via Amazon SES",
    });
  } catch (error: unknown) {
    console.error("Newsletter SES Execution Error:", error);
    const message = error instanceof Error ? error.message : "Failed to process subscription";
    return NextResponse.json({ status: "error", message }, { status: 500 });
  }
}
