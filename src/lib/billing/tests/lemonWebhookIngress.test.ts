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
  readonly scopeCalls: () => number;
  readonly processingCalls: () => number;
}

function createReceiptHarness(
  getWebhookSecret: () => string | null | undefined = () => SECRET,
): ReceiptHarnessV1 {
  const receipts: LemonWebhookReceiptInputV1[] = [];
  const identities = new Set<string>();
  const finalizedIdentities = new Set<string>();
  let calls = 0;
  let scopeCalls = 0;
  let processingCalls = 0;

  return {
    receipts,
    persistenceCalls: () => calls,
    scopeCalls: () => scopeCalls,
    processingCalls: () => processingCalls,
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
      classifyProductionScope: async () => {
        scopeCalls += 1;
        return "in-scope";
      },
      processVerifiedEvent: async (input) => {
        processingCalls += 1;
        const scopedIdentity = JSON.stringify([
          input.storeId,
          input.testMode,
          input.idempotencyKey,
        ]);

        if (finalizedIdentities.has(scopedIdentity)) {
          return "duplicate";
        }

        finalizedIdentities.add(scopedIdentity);
        return input.eventName === "future_signed_event"
          ? "ignored"
          : "processed";
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
    assertEqual(harness.scopeCalls(), 0,
      `${label} signature cannot reach production-scope processing`);
    assertEqual(harness.processingCalls(), 0,
      `${label} signature cannot reach commercial processing`);
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
  assertEqual(harness.processingCalls(), 0,
    "malformed JSON cannot reach commercial processing");
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
  assertEqual(harness.processingCalls(), 0,
    "unsafe logical identity cannot reach commercial processing");
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
  assertEqual((await responseBody(response)).status, "ignored",
    "unknown signed event is safely finalized as ignored");
  assertEqual(harness.persistenceCalls(), 1,
    "valid signed event attempts one receipt insertion");
  assertEqual(harness.processingCalls(), 1,
    "verified event is processed only after receipt insertion");

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
    assertEqual((await responseBody(response)).status, "processed",
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
      classifyProductionScope: async () => "in-scope",
      processVerifiedEvent: async () => "processed",
    },
  );
  const body = await responseBody(response);

  assertEqual(response.status, 500, "trusted database failure returns 500");
  assertEqual(body.error, "persistence-unavailable",
    "database failure response is generic");
  assertEqual(JSON.stringify(body).includes("private database details"), false,
    "database details are not exposed");
}

async function verifyProcessingFailureIsGeneric(): Promise<void> {
  const rawBody = payload();
  const response = await handleLemonWebhookIngressV1(
    request(rawBody, signature(rawBody)),
    {
      getWebhookSecret: () => SECRET,
      persistReceipt: async () => "inserted",
      classifyProductionScope: async () => "in-scope",
      processVerifiedEvent: async () => {
        throw new Error("private processing details");
      },
    },
  );
  const body = await responseBody(response);

  assertEqual(response.status, 500, "trusted processing failure returns 500");
  assertEqual(body.error, "persistence-unavailable",
    "processing infrastructure failure is generic");
  assertEqual(JSON.stringify(body).includes("private processing details"), false,
    "processing details are not exposed");
}

async function verifyFailedDeliveryCanRecover(): Promise<void> {
  const rawBody = payload({ eventName: "subscription_payment_failed",
    objectType: "subscription-invoices", objectId: "91" });
  const receiptKeys = new Set<string>();
  const finalized = new Set<string>();
  let attempts = 0;
  let mutations = 0;
  const dependencies: LemonWebhookIngressDependenciesV1 = {
    getWebhookSecret: () => SECRET,
    classifyProductionScope: async () => "in-scope",
    persistReceipt: async (receipt) => {
      const duplicate = receiptKeys.has(receipt.idempotencyKey);
      receiptKeys.add(receipt.idempotencyKey);
      return duplicate ? "duplicate" : "inserted";
    },
    processVerifiedEvent: async (input) => {
      attempts += 1;
      if (finalized.has(input.idempotencyKey)) return "duplicate";
      if (attempts === 1) throw new Error("transient database failure");
      finalized.add(input.idempotencyKey);
      mutations += 1;
      return "processed";
    },
  };
  const responses = [];
  for (let i = 0; i < 3; i++) responses.push(
    await handleLemonWebhookIngressV1(
      request(rawBody, signature(rawBody)), dependencies));
  assertEqual(responses[0].status, 500,
    "transient processing failure asks the provider to retry");
  assertEqual((await responseBody(responses[1])).status, "processed",
    "redelivery can finish a previously unfinalized receipt");
  assertEqual((await responseBody(responses[2])).status, "duplicate",
    "finalized replay remains idempotent");
  assertEqual(mutations, 1, "commercial mutation occurs once");
}

async function verifyRecordedOrderingFailureCanRecover(): Promise<void> {
  const rawBody = payload({ eventName: "subscription_updated" });
  let receiptState: "absent" | "failed" | "pending" | "processed" =
    "absent";
  let mutationCount = 0;
  let firstAttempt = true;
  const dependencies: LemonWebhookIngressDependenciesV1 = {
    getWebhookSecret: () => SECRET,
    classifyProductionScope: async () => "in-scope",
    persistReceipt: async () => {
      if (receiptState === "absent") {
        receiptState = "pending";
        return "inserted";
      }
      if (receiptState === "failed") {
        receiptState = "pending";
        return "inserted";
      }
      return "duplicate";
    },
    processVerifiedEvent: async () => {
      if (receiptState === "processed") return "duplicate";
      if (firstAttempt) {
        firstAttempt = false;
        receiptState = "failed";
        return "ignored";
      }
      receiptState = "processed";
      mutationCount += 1;
      return "processed";
    },
  };
  const responses = [];
  for (let i = 0; i < 3; i++) responses.push(
    await handleLemonWebhookIngressV1(
      request(rawBody, signature(rawBody)), dependencies));
  assertEqual((await responseBody(responses[0])).status, "ignored",
    "ordering-dependent failure records no commercial mutation");
  assertEqual((await responseBody(responses[1])).status, "processed",
    "exact redelivery reclaims a recoverable failed receipt");
  assertEqual((await responseBody(responses[2])).status, "duplicate",
    "processed receipt cannot be reclaimed");
  assertEqual(mutationCount, 1, "recovery mutates once");
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
  const processAt = ingressSource.indexOf(
    "const processingResult = await dependencies.processVerifiedEvent(",
  );

  assertEqual(arrayBufferAt >= 0 && arrayBufferAt < signatureAt, true,
    "route boundary reads raw bytes before the signature header");
  assertEqual(signatureAt < secretAt && secretAt < verificationAt, true,
    "signature and server secret are resolved before verification");
  assertEqual(verificationAt < parseAt && parseAt < envelopeAt, true,
    "signature verification precedes JSON and envelope parsing");
  assertEqual(envelopeAt < persistAt, true,
    "validated envelope precedes receipt persistence");
  assertEqual(persistAt < processAt, true,
    "receipt persistence precedes commercial processing");
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
  await verifyProcessingFailureIsGeneric();
  await verifyFailedDeliveryCanRecover();
  await verifyRecordedOrderingFailureCanRecover();
  auditIngressSecurityAndIsolation();

  console.log("PASS: Lemon webhook ingress and receipt intake");
}

void main();
