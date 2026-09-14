import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { getSanityWriteClient } from "@/lib/sanity/writeClient";

const MAX_REQUEST_BYTES = 4 * 1024;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface NewsletterRequestBody {
  email?: unknown;
}

interface ExistingSubscriber {
  _id: string;
  active?: boolean;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > MAX_REQUEST_BYTES) return invalidEmailResponse();

  let requestBody: NewsletterRequestBody;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return invalidEmailResponse();
    }
    const parsedBody: unknown = JSON.parse(rawBody);
    requestBody =
      parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)
        ? (parsedBody as NewsletterRequestBody)
        : {};
  } catch {
    return invalidEmailResponse();
  }

  const normalizedEmail =
    typeof requestBody.email === "string"
      ? requestBody.email.trim().toLowerCase()
      : "";

  if (
    normalizedEmail.length > 254 ||
    !EMAIL_PATTERN.test(normalizedEmail)
  ) {
    return invalidEmailResponse();
  }

  const subscribedAt = new Date().toISOString();
  const deterministicId = `subscriber.${createHash("sha256")
    .update(normalizedEmail)
    .digest("hex")}`;

  // A successful response means the normalized address is durably present
  // and active in Sanity. Public signup does not trigger email; delivery is
  // reserved for authenticated newsletter workflows.
  try {
    const sanityWriteClient = getSanityWriteClient();
    const existing = await sanityWriteClient.fetch<ExistingSubscriber | null>(
      `*[_type == "subscriber" && lower(email) == $email][0]{_id, active}`,
      { email: normalizedEmail },
    );

    if (!existing) {
      await sanityWriteClient.createIfNotExists({
        _id: deterministicId,
        _type: "subscriber",
        email: normalizedEmail,
        subscribedAt,
        active: true,
        source: "chronoversecapital.com/newsletter",
      });
    } else if (existing.active !== true) {
      await sanityWriteClient
        .patch(existing._id)
        .set({
          subscribedAt,
          active: true,
          source: "chronoversecapital.com/newsletter",
        })
        .commit();
    }
  } catch (error) {
    console.error(
      "Newsletter subscription persistence failed:",
      error instanceof Error ? error.message : "unknown persistence error",
    );
    return NextResponse.json(
      { status: "error", message: "Subscription could not be completed" },
      { status: 503 },
    );
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
