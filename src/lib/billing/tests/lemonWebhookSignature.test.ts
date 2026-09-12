import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  verifyLemonWebhookSignatureV1,
  type LemonWebhookSignatureResultV1,
} from "../lemonWebhookSignature";

const SECRET = "test_webhook_secret";
const JSON_BODY =
  '{"meta":{"event_name":"subscription_created"},"data":{"id":"42"}}';
const JSON_SIGNATURE =
  "fb7154a05bbab3ed804df2659730803c9e39172e26ae89bdbb26af6ba956ea24";
const EMPTY_BODY_SIGNATURE =
  "bffa3833ea650aa9711c36ab4d6de76c203486f31a1792bc5158b4965dabf7f0";
const UTF8_BODY = '{"message":"مرحبا 🌍"}';
const UTF8_BODY_SIGNATURE =
  "58977a0785249c2a1a17e6ba9400de071b1d610952090d0655283ca32e56caab";
const WHITESPACE_BODY = '{\n  "data": { "id": "42" }\n}\n';
const WHITESPACE_BODY_SIGNATURE =
  "f49ff00d11824012381c4c16c5baf231335fd33a15aca13a67605e16b8789a1a";

function bytes(value: string): Uint8Array {
  return Buffer.from(value, "utf8");
}

function verify(
  rawBody: Uint8Array,
  signature: string | null | undefined,
  secret: string | null | undefined = SECRET,
): LemonWebhookSignatureResultV1 {
  return verifyLemonWebhookSignatureV1({ rawBody, signature, secret });
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function assertResult(
  actual: LemonWebhookSignatureResultV1,
  expected: LemonWebhookSignatureResultV1,
  label: string,
): void {
  assertEqual(JSON.stringify(actual), JSON.stringify(expected), label);
}

function verifyKnownSignatures(): void {
  assertResult(
    verify(bytes(JSON_BODY), JSON_SIGNATURE),
    { ok: true },
    "known HMAC fixture is valid",
  );
  assertResult(
    verify(bytes(JSON_BODY), JSON_SIGNATURE, "wrong-secret"),
    { ok: false, error: "invalid-signature" },
    "wrong secret is invalid",
  );
  assertResult(
    verify(bytes(`${JSON_BODY}\n`), JSON_SIGNATURE),
    { ok: false, error: "invalid-signature" },
    "modified raw body is invalid",
  );
  assertResult(
    verify(bytes(JSON_BODY), JSON_SIGNATURE.toUpperCase()),
    { ok: true },
    "uppercase hexadecimal signature is valid",
  );
}

function verifyStructuralFailures(): void {
  for (const signature of [null, undefined]) {
    assertResult(
      verify(bytes(JSON_BODY), signature),
      { ok: false, error: "missing-signature" },
      "absent signature has a deterministic failure",
    );
  }

  for (const signature of [
    "",
    "not-hex",
    JSON_SIGNATURE.slice(0, -2),
    `${JSON_SIGNATURE}00`,
  ]) {
    assertResult(
      verify(bytes(JSON_BODY), signature),
      { ok: false, error: "malformed-signature" },
      `malformed signature fails deterministically (${signature.length} chars)`,
    );
  }
}

function verifyRawBodyFixtures(): void {
  assertResult(
    verify(new Uint8Array(), EMPTY_BODY_SIGNATURE),
    { ok: true },
    "empty raw body is valid with its matching signature",
  );
  assertResult(
    verify(bytes(UTF8_BODY), UTF8_BODY_SIGNATURE),
    { ok: true },
    "UTF-8 raw body is valid with its byte-level signature",
  );
  assertResult(
    verify(bytes(WHITESPACE_BODY), WHITESPACE_BODY_SIGNATURE),
    { ok: true },
    "body whitespace and newlines are preserved",
  );
  assertResult(
    verify(bytes(WHITESPACE_BODY.replace("  ", " ")), WHITESPACE_BODY_SIGNATURE),
    { ok: false, error: "invalid-signature" },
    "changing body whitespace invalidates the signature",
  );
}

function verifyConfigurationFailuresDoNotLeak(): void {
  for (const secret of [null, undefined, "", " \t\n"]) {
    const result = verifyLemonWebhookSignatureV1({
      rawBody: bytes(JSON_BODY),
      signature: JSON_SIGNATURE,
      secret,
    });
    assertResult(
      result,
      { ok: false, error: "missing-secret" },
      "missing or blank secret fails closed",
    );
    const serialized = JSON.stringify(result);
    assertEqual(serialized.includes(SECRET), false,
      "failure result does not expose the secret");
    assertEqual(serialized.includes(JSON_SIGNATURE), false,
      "failure result does not expose a calculated signature");
  }
}

function auditVerifierIsolation(): void {
  const source = readFileSync(
    fileURLToPath(new URL("../lemonWebhookSignature.ts", import.meta.url)),
    "utf8",
  );
  const normalized = source.toLowerCase();

  assertEqual(source.includes('import "server-only"'), true,
    "verifier is marked server-only");
  assertEqual(source.includes('createHmac("sha256", secret)'), true,
    "verifier uses HMAC SHA-256");
  assertEqual(source.includes("timingSafeEqual(expectedSignature, receivedSignature)"),
    true, "valid-length signature comparison uses timingSafeEqual");
  assertEqual(source.includes("SHA256_HEX_SIGNATURE_LENGTH_V1"), true,
    "signature length is validated before comparison");

  for (const forbidden of [
    "json.parse",
    "json.stringify",
    "commercialidentity",
    "parseuntrustedlemoncommercialidentityv1",
    "supabase",
    "createclient",
    "fetch(",
    "lemon_squeezy_api_key",
    "process.env",
    "console.",
  ]) {
    assertEqual(normalized.includes(forbidden), false,
      `verifier contains no ${forbidden} dependency or operation`);
  }

  const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)]
    .map((match) => match[1]);
  assertEqual(JSON.stringify(imports), JSON.stringify(["node:crypto"]),
    "verifier has no database or Lemon API dependency");
}

function main(): void {
  verifyKnownSignatures();
  verifyStructuralFailures();
  verifyRawBodyFixtures();
  verifyConfigurationFailuresDoNotLeak();
  auditVerifierIsolation();

  console.log("PASS: Lemon webhook signature verification");
}

main();
