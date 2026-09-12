import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  handleLemonWebhookIngressV1,
  type LemonWebhookIngressDependenciesV1,
  type LemonWebhookReceiptInputV1,
} from "../lemonWebhookIngress";

const SECRET = "test_ingress_secret";
const ROUTE_URL =
  "https://vip.chronoversecapital.com/api/webhooks/lemon-squeezy";

interface ReceiptHarnessV1 {
  readonly dependencies: LemonWebhookIngressDependenciesV1;
  readonly receipts: LemonWebhookReceiptInputV1[];
  readonly persistenceCalls: () => number;
}

function createReceiptHarness(
  getWebhookSecret: () => string | null | undefined = () => SECRET,
): ReceiptHarnessV1 {
  const receipts: LemonWebhookReceiptInputV1[] = [];
  const identities = new Set<string>();
  let calls = 0;

  return {
    receipts,
    persistenceCalls: () => calls,
    dependencies: {
      getWebhookSecret,
      persistReceipt: async (receipt) => {
        calls += 1;
        receipts.push(receipt);
        const scopedIdentity = JSON.stringify([
          receipt.storeId,
          receipt.testMode,
          receipt.idempotencyKey,
        ]);

        if (identities.has(scopedIdentity)) {
          return "duplicate";
        }

        identities.add(scopedIdentity);
        return "inserted";
      },
    },
  };
}

function payload(overrides: {
  readonly eventName?: string;
  readonly customData?: unknown;
  readonly objectType?: string;
  readonly objectId?: string;
  readonly storeId?: number;
  readonly testMode?: boolean;
  readonly updatedAt?: string;
  readonly deliveryNoise?: string;
} = {}): string {
  const meta: Record<string, unknown> = {
    event_name: overrides.eventName ?? "subscription_updated",
  };

  if (Object.prototype.hasOwnProperty.call(overrides, "customData")) {
    meta.custom_data = overrides.customData;
  }

  return JSON.stringify({
    meta,
    data: {
      type: overrides.objectType ?? "subscriptions",
      id: overrides.objectId ?? "subscription-42",
      attributes: {
        store_id: overrides.storeId ?? 7,
        test_mode: overrides.testMode ?? false,
        updated_at: overrides.updatedAt ?? "2026-09-12T08:15:30.123456Z",
        delivery_noise: overrides.deliveryNoise,
      },
    },
  });
}

function signature(rawBody: string, secret = SECRET): string {
  return createHmac("sha256", secret)
    .update(Buffer.from(rawBody, "utf8"))
    .digest("hex");
}

function request(rawBody: string, requestSignature?: string): Request {
  const headers = new Headers({ "Content-Type": "application/json" });

  if (requestSignature !== undefined) {
    headers.set("X-Signature", requestSignature);
  }

  return new Request(ROUTE_URL, {
    method: "POST",
    headers,
    body: rawBody,
  });
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

async function verifySignatureFailuresDoNotPersist(): Promise<void> {
  const rawBody = payload({
    customData: { chronoverse_user_id: "not-trusted-before-verification" },
  });

  for (const [label, requestSignature] of [
    ["missing", undefined],
    ["empty", ""],
    ["malformed", "not-hex"],
    ["invalid", "0".repeat(64)],
  ] as const) {
    const harness = createReceiptHarness();
    const response = await handleLemonWebhookIngressV1(
      request(rawBody, requestSignature),
      harness.dependencies,
    );

    assertEqual(response.status, 401, `${label} signature is unauthorized`);
    assertEqual(harness.persistenceCalls(), 0,
      `${label} signature cannot reach persistence`);
    assertEqual((await responseBody(response)).error, "invalid-signature",
      `${label} signature receives a deterministic response`);
  }
}

async function verifyJsonParsingFollowsSignature(): Promise<void> {
  const malformedJson = '{"meta":{"custom_data":';
  const harness = createReceiptHarness();

  const invalidSignatureResponse = await handleLemonWebhookIngressV1(
    request(malformedJson, "0".repeat(64)),
    harness.dependencies,
  );
  assertEqual(invalidSignatureResponse.status, 401,
    "malformed JSON is not parsed before signature rejection");

  const validSignatureResponse = await handleLemonWebhookIngressV1(
    request(malformedJson, signature(malformedJson)),
    harness.dependencies,
  );
  assertEqual(validSignatureResponse.status, 400,
    "verified malformed JSON is rejected after signature verification");
  assertEqual((await responseBody(validSignatureResponse)).error, "invalid-json",
    "verified malformed JSON has a deterministic response");
  assertEqual(harness.persistenceCalls(), 0,
    "malformed JSON cannot reach persistence");
}

async function verifyUnsafeEnvelopeFailsClosed(): Promise<void> {
  const rawBody = JSON.stringify({
    meta: { event_name: "subscription_updated" },
    data: {
      type: "subscriptions",
      id: "subscription-42",
      attributes: {
        store_id: 7,
        test_mode: false,
      },
    },
  });
  const harness = createReceiptHarness();
  const response = await handleLemonWebhookIngressV1(
    request(rawBody, signature(rawBody)),
    harness.dependencies,
  );

  assertEqual(response.status, 400,
    "verified payload without an object-version timestamp is rejected");
  assertEqual((await responseBody(response)).error, "invalid-event-envelope",
    "unsafe logical identity has a deterministic response");
  assertEqual(harness.persistenceCalls(), 0,
    "unsafe logical identity cannot fall back to payload hashing");
}

async function verifyAcceptedReceiptPreservesMetadata(): Promise<void> {
  const rawBody = '{\n  "meta": {"event_name":"future_signed_event",' +
    '"custom_data":{"chronoverse_user_id":' +
    '"11111111-1111-4111-8111-111111111111"}},\n' +
    '  "data": {"type":"future_objects","id":"object-9",' +
    '"attributes":{"store_id":17,"test_mode":true,' +
    '"updated_at":"2026-09-12T08:15:30.123456Z"}}\n}\n';
  const harness = createReceiptHarness();
  const response = await handleLemonWebhookIngressV1(
    request(rawBody, signature(rawBody)),
    harness.dependencies,
  );

  assertEqual(response.status, 200, "valid signed event is accepted");
  assertEqual((await responseBody(response)).status, "accepted",
    "first receipt is reported as accepted");
  assertEqual(harness.persistenceCalls(), 1,
    "valid signed event attempts one receipt insertion");

  const receipt = harness.receipts[0];
  assertEqual(receipt.storeId, "17", "store_id is preserved");
  assertEqual(receipt.testMode, true, "test_mode is preserved");
  assertEqual(receipt.eventType, "future_signed_event",
    "unknown signed event name is recorded without dispatch");
  assertEqual(receipt.upstreamObjectType, "future_objects",
    "upstream object type is preserved");
  assertEqual(receipt.upstreamObjectId, "object-9",
    "upstream object id is preserved");
  assertEqual(receipt.upstreamEventAt, "2026-09-12T08:15:30.123456Z",
    "upstream object version time is preserved");
  assertEqual("processingStatus" in receipt, false,
    "processing state is fixed inside the receipt RPC");
  assertEqual(
    receipt.payloadSha256,
    createHash("sha256").update(Buffer.from(rawBody, "utf8")).digest("hex"),
    "payload SHA-256 hashes the exact whitespace-sensitive raw bytes",
  );
  assertEqual(receipt.idempotencyKey.includes(receipt.payloadSha256), false,
    "logical idempotency is independent from the payload hash");
  assertEqual("customData" in receipt, false,
    "custom_data and raw identity are not persisted in the receipt");
}

async function verifyDuplicateReceiptIsSuccessful(): Promise<void> {
  const firstBody = payload({ deliveryNoise: "first serialization" });
  const replayBody = payload({ deliveryNoise: "different serialization" });
  const harness = createReceiptHarness();

  const first = await handleLemonWebhookIngressV1(
    request(firstBody, signature(firstBody)),
    harness.dependencies,
  );
  const duplicate = await handleLemonWebhookIngressV1(
    request(replayBody, signature(replayBody)),
    harness.dependencies,
  );

  assertEqual(first.status, 200, "first delivery succeeds");
  assertEqual(duplicate.status, 200, "logical duplicate succeeds");
  assertEqual((await responseBody(duplicate)).status, "duplicate",
    "logical duplicate is reported idempotently");
  assertEqual(harness.receipts[0].idempotencyKey,
    harness.receipts[1].idempotencyKey,
    "same signed event/object/version facts produce the same logical key");
  assertEqual(harness.receipts[0].payloadSha256 ===
    harness.receipts[1].payloadSha256, false,
    "different raw deliveries retain distinct payload fingerprints");
}

async function verifyScopedIdentityAndConfigurationFailure(): Promise<void> {
  const live = payload({ storeId: 21, testMode: false });
  const test = payload({ storeId: 21, testMode: true });
  const otherStore = payload({ storeId: 22, testMode: false });
  const harness = createReceiptHarness();

  for (const rawBody of [live, test, otherStore]) {
    const response = await handleLemonWebhookIngressV1(
      request(rawBody, signature(rawBody)),
      harness.dependencies,
    );
    assertEqual((await responseBody(response)).status, "accepted",
      "store and mode scope prevent cross-environment collisions");
  }

  assertEqual(harness.persistenceCalls(), 3,
    "each store/mode scope receives an independent receipt");

  const unavailable = createReceiptHarness(() => " \t\n");
  const response = await handleLemonWebhookIngressV1(
    request(live, signature(live)),
    unavailable.dependencies,
  );
  const body = await responseBody(response);
  assertEqual(response.status, 500, "blank server secret fails closed");
  assertEqual(body.error, "configuration-unavailable",
    "configuration error is generic");
  assertEqual(JSON.stringify(body).includes(SECRET), false,
    "configuration response does not expose the secret");
  assertEqual(unavailable.persistenceCalls(), 0,
    "configuration failure cannot reach persistence");
}

async function verifyPersistenceFailureIsGeneric(): Promise<void> {
  const rawBody = payload();
  const response = await handleLemonWebhookIngressV1(
    request(rawBody, signature(rawBody)),
    {
      getWebhookSecret: () => SECRET,
      persistReceipt: async () => {
        throw new Error("private database details");
      },
    },
  );
  const body = await responseBody(response);

  assertEqual(response.status, 500, "trusted database failure returns 500");
  assertEqual(body.error, "persistence-unavailable",
    "database failure response is generic");
  assertEqual(JSON.stringify(body).includes("private database details"), false,
    "database details are not exposed");
}

function auditIngressSecurityAndIsolation(): void {
  const ingressSource = readFileSync(
    fileURLToPath(new URL("../lemonWebhookIngress.ts", import.meta.url)),
    "utf8",
  );
  const routeSource = readFileSync(
    fileURLToPath(new URL(
      "../../../app/api/webhooks/lemon-squeezy/route.ts",
      import.meta.url,
    )),
    "utf8",
  );
  const normalized = ingressSource.toLowerCase();
  const arrayBufferAt = ingressSource.indexOf("request.arrayBuffer()");
  const signatureAt = ingressSource.indexOf('request.headers.get("X-Signature")');
  const secretAt = ingressSource.indexOf("dependencies.getWebhookSecret()");
  const verificationAt = ingressSource.indexOf("verifyLemonWebhookSignatureV1({");
  const parseAt = ingressSource.indexOf("parseJsonBodyV1(rawBody)");
  const envelopeAt = ingressSource.indexOf(
    "parseLemonWebhookEnvelopeV1(parsedBody.value)",
  );
  const persistAt = ingressSource.indexOf("dependencies.persistReceipt(");

  assertEqual(arrayBufferAt >= 0 && arrayBufferAt < signatureAt, true,
    "route boundary reads raw bytes before the signature header");
  assertEqual(signatureAt < secretAt && secretAt < verificationAt, true,
    "signature and server secret are resolved before verification");
  assertEqual(verificationAt < parseAt && parseAt < envelopeAt, true,
    "signature verification precedes JSON and envelope parsing");
  assertEqual(envelopeAt < persistAt, true,
    "validated envelope precedes receipt persistence");
  assertEqual(ingressSource.includes('import "server-only"'), true,
    "ingress and secret access are server-only");
  assertEqual(ingressSource.includes("LEMON_SQUEEZY_WEBHOOK_SECRET"), true,
    "ingress resolves only the requested Lemon webhook secret");
  assertEqual(
    ingressSource.includes(
      'client.rpc(LEMON_WEBHOOK_RECEIPT_RPC_V1, {',
    ),
    true,
    "trusted persistence invokes the narrow public receipt RPC",
  );
  assertEqual(
    ingressSource.includes(
      'LEMON_WEBHOOK_RECEIPT_RPC_V1 = "ingest_lemon_webhook_receipt_v1"',
    ),
    true,
    "trusted persistence uses the versioned receipt RPC",
  );
  assertEqual(ingressSource.includes('.schema("app_private")'), false,
    "ingress does not request the unexposed private schema");
  assertEqual(ingressSource.includes('"lemon_webhook_receipts"'), false,
    "ingress performs no direct table mutation");
  assertEqual(routeSource.includes("export async function POST"), true,
    "authoritative App Router route exports POST");
  assertEqual(routeSource.includes("handleLemonWebhookIngressV1(request)"), true,
    "route delegates to the secured ingress boundary");

  for (const forbidden of [
    "parseuntrustedlemoncommercialidentityv1",
    "lemon_customers",
    "lemon_subscriptions",
    "vip_active",
    "resolveaccessv1",
    "requirevipv1",
    "entitlement",
    "fetch(",
    "raw_payload",
    "request.json()",
    "console.",
  ]) {
    assertEqual(normalized.includes(forbidden), false,
      `ingress contains no ${forbidden} processing or dependency`);
  }
}

async function main(): Promise<void> {
  await verifySignatureFailuresDoNotPersist();
  await verifyJsonParsingFollowsSignature();
  await verifyUnsafeEnvelopeFailsClosed();
  await verifyAcceptedReceiptPreservesMetadata();
  await verifyDuplicateReceiptIsSuccessful();
  await verifyScopedIdentityAndConfigurationFailure();
  await verifyPersistenceFailureIsGeneric();
  auditIngressSecurityAndIsolation();

  console.log("PASS: Lemon webhook ingress and receipt intake");
}

void main();
