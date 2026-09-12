import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const SHA256_HEX_SIGNATURE_LENGTH_V1 = 64;
const SHA256_SIGNATURE_BYTE_LENGTH_V1 = 32;

export type LemonWebhookSignatureErrorCodeV1 =
  | "missing-signature"
  | "malformed-signature"
  | "invalid-signature"
  | "missing-secret"
  | "invalid-configuration";

export type LemonWebhookSignatureResultV1 =
  | Readonly<{
    ok: true;
  }>
  | Readonly<{
    ok: false;
    error: LemonWebhookSignatureErrorCodeV1;
  }>;

export interface VerifyLemonWebhookSignatureInputV1 {
  /** Exact, unparsed request bytes. Convert a request body to bytes only once. */
  readonly rawBody: Uint8Array;
  /** Exact X-Signature header value. Both uppercase and lowercase hex are valid. */
  readonly signature: string | null | undefined;
  /** Server-only Lemon Squeezy webhook secret. */
  readonly secret: string | null | undefined;
}

/**
 * Verifies Lemon Squeezy's HMAC-SHA256 signature before any payload parsing.
 * The result intentionally contains no calculated or secret-derived values.
 */
export function verifyLemonWebhookSignatureV1({
  rawBody,
  signature,
  secret,
}: VerifyLemonWebhookSignatureInputV1): LemonWebhookSignatureResultV1 {
  if (secret === null || secret === undefined || secret.trim().length === 0) {
    return failure("missing-secret");
  }

  if (signature === null || signature === undefined) {
    return failure("missing-signature");
  }

  if (
    signature.length !== SHA256_HEX_SIGNATURE_LENGTH_V1
    || !/^[0-9a-f]+$/i.test(signature)
  ) {
    return failure("malformed-signature");
  }

  try {
    const receivedSignature = Buffer.from(signature, "hex");
    const expectedSignature = createHmac("sha256", secret)
      .update(rawBody)
      .digest();

    if (
      receivedSignature.length !== SHA256_SIGNATURE_BYTE_LENGTH_V1
      || expectedSignature.length !== SHA256_SIGNATURE_BYTE_LENGTH_V1
    ) {
      return failure("malformed-signature");
    }

    return timingSafeEqual(expectedSignature, receivedSignature)
      ? Object.freeze({ ok: true })
      : failure("invalid-signature");
  } catch {
    return failure("invalid-configuration");
  }
}

function failure(
  error: LemonWebhookSignatureErrorCodeV1,
): LemonWebhookSignatureResultV1 {
  return Object.freeze({ ok: false, error });
}
