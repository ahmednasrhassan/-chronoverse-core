import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCipheriv, createHash } from "node:crypto";
import { fixture } from "../../../../services/newsletter/test/fixture.mjs";
import { subscriberId } from "../../../../services/newsletter/src/domain.mjs";
import { GET as optoutGet, POST as optoutPost } from "../../../app/api/newsletter/unsubscribe/route";
import { GET as confirmGet, POST as confirmPost } from "../../../app/api/newsletter/confirm/route";
import { POST as signup } from "../../../app/api/newsletter/route";
import { GET as cronGet, POST as cronPost } from "../../../app/api/cron/send-newsletter/route";
import { POST as publication } from "../../../app/api/webhook/sanity/route";
import { POST as oldFeedback } from "../../../app/api/newsletter/feedback/route";

const v1 = "v1." + "a".repeat(80);
const v2 = "v2." + "a".repeat(150) + "." + "b".repeat(43);
const activationFlags = ["DELIVERY_ENABLED", "REGISTRATION_ENABLED", "CONFIRMATION_ENABLED", "LEGACY_DISPATCH_RETIRED", "COMPLIANCE_APPROVED"] as const;
async function withWebsiteService(f: ReturnType<typeof fixture>, run: () => Promise<void>) {
  const url = process.env.NEWSLETTER_AWS_API_URL, key = process.env.NEWSLETTER_AWS_BRIDGE_KEY, old = globalThis.fetch;
  process.env.NEWSLETTER_AWS_API_URL = "https://synthetic.execute-api.eu-north-1.amazonaws.com";
  process.env.NEWSLETTER_AWS_BRIDGE_KEY = f.keys.websiteKey;
  globalThis.fetch = async (_input, options) => {
    const result = await f.service.api({ rawPath: new URL(String(_input)).pathname, requestContext: { http: { method: "POST" } }, headers: options?.headers, body: String(options?.body) });
    return new Response(result.body, { status: result.statusCode, headers: result.headers });
  };
  try { await run(); } finally {
    globalThis.fetch = old;
    if (url === undefined) delete process.env.NEWSLETTER_AWS_API_URL; else process.env.NEWSLETTER_AWS_API_URL = url;
    if (key === undefined) delete process.env.NEWSLETTER_AWS_BRIDGE_KEY; else process.env.NEWSLETTER_AWS_BRIDGE_KEY = key;
  }
}
function originalToken(f: ReturnType<typeof fixture>, email: string) {
  const iv = Buffer.alloc(12, 7), cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(f.keys.legacyV1Key).digest(), iv);
  cipher.setAAD(Buffer.from("chronoverse-newsletter-optout-v1"));
  const encrypted = Buffer.concat([cipher.update(email), cipher.final()]);
  return "v1." + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

test("website rejects ambiguous tokens before forwarding, retaining the original form's identical query/body token", async () => {
  const old = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ code: "unsubscribe_recorded" }); };
  const path = "https://chronoversecapital.com/api/newsletter/unsubscribe";
  try {
    for (const query of [`token=${v1}&token=${v2}`, `token=&token=${v1}`]) {
      assert.equal((await optoutGet(new Request(`${path}?${query}`))).status, 400);
      assert.equal((await optoutPost(new Request(`${path}?${query}`, { method: "POST" }))).status, 400);
    }
    for (const [query, body] of [[`token=${v1}`, `token=${v2}`], ["", `token=${v1}&token=${v2}`], [`token=`, `token=${v1}`]]) {
      assert.equal((await optoutPost(new Request(`${path}?${query}`, { method: "POST", body }))).status, 400);
    }
    assert.equal(calls, 0);
    const confirmPath = "https://chronoversecapital.com/api/newsletter/confirm";
    assert.equal((await confirmGet(new Request(`${confirmPath}?token=${v2}&token=${v2}`))).status, 400);
    assert.equal((await confirmPost(new Request(`${confirmPath}?token=${v2}`, { method: "POST", body: `token=${v1}` }))).status, 400);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = old; }
  const f = fixture(), token = originalToken(f, "original-form@example.test");
  await withWebsiteService(f, async () => {
    assert.equal((await optoutPost(new Request(`${path}?token=${token}`, { method: "POST", body: `token=${token}` }))).status, 200);
    assert.equal(f.state.documents.get(`SUB#${subscriberId("original-form@example.test")}`)?.state, "SUPPRESSED");
    assert.equal(f.state.sends.length, 0);
  });
});

test("unknown, tampered, wrong-key and unsigned legacy requests cannot suppress any subscriber", async () => {
  for (const scenario of ["unknown", "tampered", "wrong-key", "missing-key", "unsigned-email", "wrong-bridge", "persistence-failure"]) {
    const f = fixture(); f.confirmed("protected@example.test");
    for (const flag of activationFlags) f.env[flag] = "false";
    let token = originalToken(f, "protected@example.test");
    if (scenario === "unknown") token = v1;
    if (scenario === "tampered") { const bytes = Buffer.from(token.slice(3), "base64url"); bytes[bytes.length - 1] ^= 1; token = "v1." + bytes.toString("base64url"); }
    if (scenario === "wrong-key") f.keys.legacyV1Key = f.keys.capabilityKey;
    if (scenario === "missing-key") Reflect.deleteProperty(f.keys, "legacyV1Key");
    if (scenario === "persistence-failure") f.deps.store.suppress = async () => { throw new Error("synthetic-storage-unavailable"); };
    const before = structuredClone(f.state.documents);
    await withWebsiteService(f, async () => {
      if (scenario === "wrong-bridge") process.env.NEWSLETTER_AWS_BRIDGE_KEY = f.keys.capabilityKey;
      const query = scenario === "unsigned-email" ? "email=protected%40example.test" : `token=${token}`;
      const response = await optoutPost(new Request(`https://chronoversecapital.com/api/newsletter/unsubscribe?${query}`, { method: "POST" }));
      assert.equal(response.status, ["missing-key", "wrong-bridge", "persistence-failure"].includes(scenario) ? 503 : 400, scenario);
      assert.deepEqual(f.state.documents, before, scenario); assert.equal(f.state.sends.length, 0);
    });
  }
});

test("v2 website opt-out binds identity, signature, purpose and nonce; another subscriber remains untouched", async () => {
  const f = fixture(), a = f.confirmed("a@example.test"), b = f.confirmed("b@example.test");
  f.env.DELIVERY_ENABLED = "false"; const before = structuredClone(f.state.documents);
  await withWebsiteService(f, async () => {
    const valid = f.token(a.id), parts = valid.split("."); parts[2] = "a".repeat(43);
    for (const token of [parts.join("."), f.token(a.id, "unsubscribe", "x".repeat(32)), f.token("f".repeat(64)), f.token(a.id, "confirm", "u".repeat(32), f.state.time + 60000)]) {
      assert.equal((await optoutPost(new Request(`https://chronoversecapital.com/api/newsletter/unsubscribe?token=${token}`, { method: "POST" }))).status, 400);
      assert.deepEqual(f.state.documents, before);
    }
    assert.equal((await optoutPost(new Request(`https://chronoversecapital.com/api/newsletter/unsubscribe?token=${valid}&email=b%40example.test`, { method: "POST" }))).status, 200);
    assert.equal(f.state.documents.get(`SUB#${a.id}`)?.state, "SUPPRESSED");
    assert.equal(f.state.documents.get(`SUB#${b.id}`)?.state, "CONFIRMED"); assert.equal(f.state.sends.length, 0);
  });
});

test("website v2 confirmation respects pauses, expiry, nonce and single use without sending mail", async () => {
  const f = fixture(), email = "pending@example.test", id = subscriberId(email), nonce = "c".repeat(32);
  f.env.DELIVERY_ENABLED = "false";
  f.state.documents.set(`SUB#${id}`, { pk: `SUB#${id}`, id, email, state: "PENDING", confirmationNonce: nonce });
  const token = f.token(id, "confirm", nonce, f.state.time + 60000);
  const request = (value: string) => new Request(`https://chronoversecapital.com/api/newsletter/confirm?token=${value}`, { method: "POST" });
  await withWebsiteService(f, async () => {
    const before = structuredClone(f.state.documents);
    f.env.CONFIRMATION_ENABLED = "false";
    assert.equal((await confirmPost(request(token))).status, 503); assert.deepEqual(f.state.documents, before);
    f.env.CONFIRMATION_ENABLED = "true";
    for (const value of [f.token(id, "confirm", nonce, f.state.time - 1), f.token(id, "confirm", "x".repeat(32), f.state.time + 60000)]) {
      assert.equal((await confirmPost(request(value))).status, 400); assert.deepEqual(f.state.documents, before);
    }
    assert.equal((await confirmPost(request(token))).status, 200);
    assert.equal(f.state.documents.get(`SUB#${id}`)?.state, "CONFIRMED");
    assert.equal((await confirmPost(request(token))).status, 400); assert.equal(f.state.sends.length, 0);
  });
});
test("original v1 links traverse the website bridge and service suppression with delivery disabled (offline adapters)", async () => {
  const f = fixture();
  for (const flag of activationFlags) f.env[flag] = "false";
  const email = "historical@example.test", iv = Buffer.alloc(12, 5);
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(f.keys.legacyV1Key).digest(), iv);
  cipher.setAAD(Buffer.from("chronoverse-newsletter-optout-v1"));
  const encrypted = Buffer.concat([cipher.update(email), cipher.final()]);
  const token = "v1." + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
  const url = process.env.NEWSLETTER_AWS_API_URL, key = process.env.NEWSLETTER_AWS_BRIDGE_KEY, old = globalThis.fetch;
  process.env.NEWSLETTER_AWS_API_URL = "https://synthetic.execute-api.eu-north-1.amazonaws.com";
  process.env.NEWSLETTER_AWS_BRIDGE_KEY = f.keys.websiteKey;
  let calls = 0;
  globalThis.fetch = async (input, options) => {
    calls++; assert.equal(String(input), `${process.env.NEWSLETTER_AWS_API_URL}/unsubscribe`);
    const result = await f.service.api({ rawPath: "/unsubscribe", requestContext: { http: { method: "POST" } }, headers: options?.headers, body: String(options?.body) });
    return new Response(result.body, { status: result.statusCode, headers: result.headers });
  };
  try {
    const path = `https://chronoversecapital.com/api/newsletter/unsubscribe?token=${token}`;
    assert.equal((await optoutGet(new Request(path))).status, 200); assert.equal(calls, 0);
    for (let retry = 0; retry < 2; retry++) assert.equal((await optoutPost(new Request(path, { method: "POST", body: "List-Unsubscribe=One-Click" }))).status, 200);
    assert.equal(f.state.documents.get(`SUB#${subscriberId(email)}`)?.state, "SUPPRESSED");
    assert.equal(f.state.sends.length, 0); assert.equal(calls, 2);
  } finally {
    globalThis.fetch = old;
    if (url === undefined) delete process.env.NEWSLETTER_AWS_API_URL; else process.env.NEWSLETTER_AWS_API_URL = url;
    if (key === undefined) delete process.env.NEWSLETTER_AWS_BRIDGE_KEY; else process.env.NEWSLETTER_AWS_BRIDGE_KEY = key;
  }
});
test("GET renders scanner-safe confirmation without upstream calls, including legacy links", async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("GET must never contact any service"); };
  try {
    for (const [handler, token, path] of [[optoutGet, v1, "unsubscribe"], [optoutGet, v2, "unsubscribe"], [confirmGet, v2, "confirm"]] as const) {
      const response = await handler(new Request(`https://chronoversecapital.com/api/newsletter/${path}?token=${token}`));
      assert.equal(response.status, 200); assert.match(await response.text(), /<form method="post">/);
      assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    }
  } finally { globalThis.fetch = old; }
});
test("invalid links are rejected; missing AWS configuration never implies successful unsubscribe", async () => {
  const before = process.env.NEWSLETTER_AWS_API_URL; delete process.env.NEWSLETTER_AWS_API_URL;
  try {
    assert.equal((await optoutGet(new Request("https://chronoversecapital.com/api/newsletter/unsubscribe?token=%22%3E%3Cscript%3E"))).status, 400);
    assert.equal((await confirmGet(new Request(`https://chronoversecapital.com/api/newsletter/confirm?token=${v1}`))).status, 400);
    const response = await optoutPost(new Request(`https://chronoversecapital.com/api/newsletter/unsubscribe?token=${v1}`, { method: "POST" }));
    assert.equal(response.status, 503); assert.match(await response.text(), /could not confirm.*recorded/);
  } finally { if (before === undefined) delete process.env.NEWSLETTER_AWS_API_URL; else process.env.NEWSLETTER_AWS_API_URL = before; }
});
test("one-click query and browser form forward only protected capabilities; upstream failures stay truthful", async () => {
  const url = process.env.NEWSLETTER_AWS_API_URL, key = process.env.NEWSLETTER_AWS_BRIDGE_KEY, old = globalThis.fetch;
  process.env.NEWSLETTER_AWS_API_URL = "https://synthetic.execute-api.eu-west-1.amazonaws.com";
  process.env.NEWSLETTER_AWS_BRIDGE_KEY = "synthetic-bridge-key-for-test-only-0123456789";
  let calls = 0;
  globalThis.fetch = async (input, options) => {
    calls++; assert.match(String(input), /\/unsubscribe$|\/confirm$/); assert.equal(options?.redirect, "error");
    assert.deepEqual(JSON.parse(String(options?.body)), { token: v2 });
    return calls === 3 ? new Response("provider-body-must-not-be-relayed", { status: 503 }) : Response.json({ code: String(input).endsWith("/confirm") ? "subscription_confirmed" : "unsubscribe_recorded" });
  };
  try {
    const path = "https://chronoversecapital.com/api/newsletter/unsubscribe";
    assert.equal((await optoutPost(new Request(`${path}?token=${v2}`, { method: "POST", body: "List-Unsubscribe=One-Click" }))).status, 200);
    assert.equal((await confirmPost(new Request("https://chronoversecapital.com/api/newsletter/confirm", { method: "POST", body: `token=${v2}` }))).status, 200);
    const response = await optoutPost(new Request(path, { method: "POST", body: `token=${v2}` }));
    assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /provider-body/);
  } finally {
    globalThis.fetch = old;
    if (url === undefined) delete process.env.NEWSLETTER_AWS_API_URL; else process.env.NEWSLETTER_AWS_API_URL = url;
    if (key === undefined) delete process.env.NEWSLETTER_AWS_BRIDGE_KEY; else process.env.NEWSLETTER_AWS_BRIDGE_KEY = key;
  }
});
test("signup stays paused before reading bodies or contacting AWS; retired routes have no dispatch capability", async () => {
  const old = globalThis.fetch; globalThis.fetch = async () => { throw new Error("No connection allowed"); };
  try {
    const response = await signup(new Request("https://chronoversecapital.com/api/newsletter?enabled=true", { method: "POST", body: "not-json" }));
    assert.equal(response.status, 503); assert.equal((await response.json()).code, "newsletter_signups_paused");
    for (const handler of [cronGet, cronPost, publication]) assert.equal((await handler()).status, 410);
    assert.equal((await oldFeedback()).status, 503);
    for (const path of ["src/app/api/cron/send-newsletter/route.ts", "src/app/api/webhook/sanity/route.ts"]) assert.doesNotMatch(readFileSync(path, "utf8"), /from |process\.env|SESClient|fetch\(/);
    assert.deepEqual(JSON.parse(readFileSync("vercel.json", "utf8")).crons, []);
    assert.equal(JSON.parse(readFileSync("vercel.json", "utf8")).git.deploymentEnabled.master, true);
  } finally { globalThis.fetch = old; }
});
