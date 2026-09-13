import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { NextResponse } from "next/server";

import {
  assertWriteTokenConfigured,
  sanityWriteClient,
} from "@/lib/sanity/writeClient";

const sesClient = new SESClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

interface NewsletterRequestBody {
  email?: unknown;
}

interface ExistingSubscriber {
  _id: string;
  active?: boolean;
}

export async function POST(request: Request) {
  let requestBody: NewsletterRequestBody;

  try {
    const parsedBody: unknown = await request.json();
    requestBody =
      parsedBody && typeof parsedBody === "object"
        ? (parsedBody as NewsletterRequestBody)
        : {};
  } catch {
    return invalidEmailResponse();
  }

  const normalizedEmail =
    typeof requestBody.email === "string"
      ? requestBody.email.trim().toLowerCase()
      : "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return invalidEmailResponse();
  }

  const officialEmail =
    process.env.OFFICIAL_EMAIL || "info@chronoversecapital.com";
  const subscribedAt = new Date().toISOString();

  // A successful response means the address is durably present on the
  // distribution list. Email notification is secondary to that state.
  try {
    assertWriteTokenConfigured();
    const existing = await sanityWriteClient.fetch<ExistingSubscriber | null>(
      `*[_type == "subscriber" && email == $email][0]{_id, active}`,
      { email: normalizedEmail },
    );

    if (!existing) {
      await sanityWriteClient.create({
        _type: "subscriber",
        email: normalizedEmail,
        subscribedAt,
        active: true,
        source: "newsletter.chronoversecapital.com",
      });
    } else if (existing.active !== true) {
      await sanityWriteClient
        .patch(existing._id)
        .set({
          subscribedAt,
          active: true,
          source: "newsletter.chronoversecapital.com",
        })
        .commit();
    }
  } catch (subscriberError) {
    console.error("Newsletter subscription persistence failed:", subscriberError);
    return NextResponse.json(
      { status: "error", message: "Subscription could not be completed" },
      { status: 503 },
    );
  }

  try {
    await sesClient.send(
      new SendEmailCommand({
        Source: officialEmail,
        Destination: {
          ToAddresses: [officialEmail, normalizedEmail],
        },
        Message: {
          Subject: {
            Data: "[Newsletter] New Subscription - Chronoverse Dispatch",
            Charset: "UTF-8",
          },
          Body: {
            Html: {
              Data: `
                <div style="font-family: monospace; background-color: #050506; color: #F3EBDD; padding: 24px; border: 1px solid #C8A7E8; border-radius: 8px;">
                  <h2 style="color: #C8A7E8; margin-top: 0;">[Chronoverse Newsletter Subscription]</h2>
                  <p><strong>Subscriber Email:</strong> ${escapeHtml(normalizedEmail)}</p>
                  <p><strong>Source:</strong> newsletter.chronoversecapital.com</p>
                  <hr style="border-color: #292432; margin-top: 20px;" />
                  <span style="font-size: 10px; color: #91889A;">Chronoverse Capital</span>
                </div>
              `,
              Charset: "UTF-8",
            },
          },
        },
      }),
    );
  } catch (notificationError) {
    console.warn("Newsletter confirmation notification failed:", notificationError);
  }

  return NextResponse.json({
    status: "success",
    message: "Subscription recorded",
  });
}

function invalidEmailResponse() {
  return NextResponse.json(
    { status: "error", message: "A valid email address is required" },
    { status: 400 },
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) =>
    (
      {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      } as const
    )[character as "&" | "<" | ">" | '"' | "'"],
  );
}
