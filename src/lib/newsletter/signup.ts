import "server-only";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { getNewsletterWriteClient } from "@/lib/newsletter/clients";
import { createNewsletterStore } from "@/lib/newsletter/store";
import { boundedText } from "@/lib/newsletter/body";
import { normalizeEmail } from "@/lib/newsletter/config";

const MAX_REQUEST_BYTES = 4 * 1024;

interface NewsletterRequestBody {
  email?: unknown;
}

interface ExistingSubscriber {
  _id: string;
  active?: boolean;
  suppressed?: boolean;
}

export async function handleNewsletterSignup(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > MAX_REQUEST_BYTES) return invalidEmailResponse();

  let requestBody: NewsletterRequestBody;
  try {
    const rawBody = await boundedText(request, MAX_REQUEST_BYTES);
    if (rawBody === null) {
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

  const normalizedEmail = normalizeEmail(requestBody.email);

  if (!normalizedEmail) {
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
    if (await createNewsletterStore().isSuppressed(normalizedEmail)) {
      return NextResponse.json({ status: "error", message: "Subscription could not be completed. Please contact support." }, { status: 409 });
    }
    const sanityWriteClient = getNewsletterWriteClient();
    const existing = await sanityWriteClient.fetch<ExistingSubscriber | null>(
      `*[_type == "subscriber" && lower(email) == $email && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0]{_id, active, suppressed}`,
      { email: normalizedEmail },
    );

    if (existing?.suppressed === true) {
      return NextResponse.json({ status: "error", message: "Subscription could not be completed. Please contact support." }, { status: 409 });
    }

    // createIfNotExists can return an existing document after a stale lookup
    // or a concurrent signup. Inspect that result before claiming it is active.
    const subscriber: ExistingSubscriber = existing ??
      await sanityWriteClient.createIfNotExists({
        _id: deterministicId,
        _type: "subscriber",
        email: normalizedEmail,
        subscribedAt,
        active: true,
        source: "chronoversecapital.com/newsletter",
      });
    if (subscriber.suppressed === true) {
      return NextResponse.json({ status: "error", message: "Subscription could not be completed. Please contact support." }, { status: 409 });
    }
    if (subscriber.active !== true) {
      await sanityWriteClient
        .patch(subscriber._id)
        .set({
          subscribedAt,
          active: true,
          source: "chronoversecapital.com/newsletter",
        })
        .commit();
    }
    // Opt-out wins over a concurrent public signup; suppression is never reset.
    if (await createNewsletterStore().isSuppressed(normalizedEmail)) {
      await createNewsletterStore().suppress(normalizedEmail, "unsubscribe");
      return NextResponse.json({ status: "error", message: "Subscription could not be completed. Please contact support." }, { status: 409 });
    }
  } catch {
    // Provider errors may contain the submitted address or request credentials.
    console.error("Newsletter subscription persistence failed");
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
