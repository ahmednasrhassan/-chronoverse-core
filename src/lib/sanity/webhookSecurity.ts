import {
  decodeSignatureHeader,
  isValidSignature,
  SIGNATURE_HEADER_NAME,
} from "@sanity/webhook";

const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;
const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;
const MAX_SIGNATURE_FUTURE_SKEW_MS = 60 * 1000;
const MAX_IDEMPOTENCY_KEY_BYTES = 200;
const UNSAFE_HEADER_VALUE_PATTERN = /[\u0000-\u001F\u007F-\u009F]/;
const DOCUMENT_ID_PATTERN = /^(?:drafts\.)?[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;

export class SanityWebhookRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SanityWebhookRequestError";
  }
}

export interface VerifiedSanityWebhook<TPayload extends Record<string, unknown>> {
  readonly payload: TPayload;
  readonly idempotencyKey: string;
  readonly operation: "create" | "update" | "delete";
}

interface VerificationOptions {
  readonly secret?: string;
  readonly expectedProjectId: string;
  readonly expectedDataset: string;
  readonly now?: number;
}

export function isValidSanityDocumentId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 128 &&
    DOCUMENT_ID_PATTERN.test(value) &&
    !value.startsWith("versions.")
  );
}

function isValidIdempotencyKey(value: string | null): value is string {
  return (
    value !== null &&
    value.length > 0 &&
    new TextEncoder().encode(value).byteLength <= MAX_IDEMPOTENCY_KEY_BYTES &&
    !UNSAFE_HEADER_VALUE_PATTERN.test(value)
  );
}

export async function verifySanityWebhookRequest<
  TPayload extends Record<string, unknown>,
>(
  request: Request,
  options: VerificationOptions,
): Promise<VerifiedSanityWebhook<TPayload>> {
  if (!options.secret) {
    throw new SanityWebhookRequestError(
      503,
      "verification_unavailable",
      "Webhook verification is not configured",
    );
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_WEBHOOK_BODY_BYTES) {
    throw new SanityWebhookRequestError(413, "payload_too_large", "Webhook payload is too large");
  }

  const rawBody = await request.text();
  if (!rawBody || new TextEncoder().encode(rawBody).byteLength > MAX_WEBHOOK_BODY_BYTES) {
    throw new SanityWebhookRequestError(413, "payload_too_large", "Webhook payload is too large");
  }

  const signature = request.headers.get(SIGNATURE_HEADER_NAME) || "";
  let signatureTimestamp: number;
  try {
    signatureTimestamp = decodeSignatureHeader(signature).timestamp;
  } catch {
    throw new SanityWebhookRequestError(401, "invalid_signature", "Invalid webhook signature");
  }

  const now = options.now ?? Date.now();
  if (
    now - signatureTimestamp > MAX_SIGNATURE_AGE_MS ||
    signatureTimestamp - now > MAX_SIGNATURE_FUTURE_SKEW_MS
  ) {
    throw new SanityWebhookRequestError(401, "stale_signature", "Invalid webhook signature");
  }

  if (!(await isValidSignature(rawBody, signature, options.secret))) {
    throw new SanityWebhookRequestError(401, "invalid_signature", "Invalid webhook signature");
  }

  if (
    request.headers.get("sanity-project-id") !== options.expectedProjectId ||
    request.headers.get("sanity-dataset") !== options.expectedDataset
  ) {
    throw new SanityWebhookRequestError(401, "invalid_source", "Invalid webhook source");
  }

  const operation = request.headers.get("sanity-operation");
  if (operation !== "create" && operation !== "update" && operation !== "delete") {
    throw new SanityWebhookRequestError(400, "invalid_operation", "Invalid webhook operation");
  }

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!isValidIdempotencyKey(idempotencyKey)) {
    throw new SanityWebhookRequestError(400, "invalid_idempotency_key", "Invalid idempotency key");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new SanityWebhookRequestError(400, "invalid_json", "Malformed webhook payload");
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new SanityWebhookRequestError(400, "invalid_payload", "Malformed webhook payload");
  }

  return {
    payload: payload as TPayload,
    idempotencyKey,
    operation,
  };
}
