import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createCipheriv, createHash } from "node:crypto";
import { fixture } from "../../../../services/newsletter/test/fixture.mjs";
import { subscriberId, ENROLLMENT_POLICY, CONSENT_VERSION, CONSENT_TEXT } from "../../../../services/newsletter/src/domain.mjs";
import { NEWSLETTER_AWS_ORIGIN } from "../../../config/newsletterAvailability";
import { GET as optoutGet, POST as optoutPost } from "../../../app/api/newsletter/unsubscribe/route";
import { GET as confirmGet, POST as confirmPost } from "../../../app/api/newsletter/confirm/route";
import { POST as signup } from "../../../app/api/newsletter/route";
import { GET as cronGet, POST as cronPost } from "../../../app/api/cron/send-newsletter/route";
import { POST as publication } from "../../../app/api/webhook/sanity/route";
import { POST as oldFeedback } from "../../../app/api/newsletter/feedback/route";
const v1 = "v1." + "a".repeat(80), v2 = "v2." + "a".repeat(150) + "." + "b".repeat(43);
const path = "https://chronoversecapital.com/api/newsletter/unsubscribe";
function request(url: string, body = "", origin = "https://chronoversecapital.com") {
  return new Request(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin }, body });
}
function originalToken(f: ReturnType<typeof fixture>, email: string) {
  const iv = Buffer.alloc(12, 7), cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(f.keys.legacyV1Key).digest(), iv);
  cipher.setAAD(Buffer.from("chronoverse-newsletter-optout-v1"));
  const encrypted = Buffer.concat([cipher.update(email), cipher.final()]);
  return "v1." + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}
// Explicit offline client redirect-following. The website never fetches AWS.
async function follow(f: ReturnType<typeof fixture>, redirect: Response, original?: Request, origin = "https://chronoversecapital.com") {
  assert.ok([303, 307].includes(redirect.status));
  const url = new URL(redirect.headers.get("location")!);
  assert.equal(url.origin, NEWSLETTER_AWS_ORIGIN); Object.assign(f.env, { PUBLIC_ORIGIN: url.origin });
  const method = redirect.status === 307 ? "POST" : "GET";
  return f.service.api({ version: "2.0", routeKey: `${method} ${url.pathname}`, rawPath: url.pathname, rawQueryString: url.search.slice(1),
    requestContext: { http: { method, sourceIp: "192.0.2.10" } },
    headers: method === "POST" ? { origin, "content-type": "application/x-www-form-urlencoded" } : {},
    body: original ? await original.clone().text() : "" });
}
test("website rejects duplicate/conflicting capabilities before redirect, preserving identical historical query/form tokens", async () => {
  for (const query of [`token=${v1}&token=${v2}`, `token=&token=${v1}`]) {
    assert.equal(optoutGet(new Request(`${path}?${query}`)).status, 400);
    assert.equal((await optoutPost(request(`${path}?${query}`))).status, 400);
  }
  for (const [query, body] of [[`token=${v1}`, `token=${v2}`], ["", `token=${v1}&token=${v2}`], ["token=", `token=${v1}`]]) {
    assert.equal((await optoutPost(request(`${path}?${query}`, body))).status, 400);
  }
  const f = fixture(), token = originalToken(f, "original-form@example.test");
  const req = request(`${path}?token=${token}`, `token=${token}`), redirect = await optoutPost(req.clone());
  assert.equal(redirect.status, 307); assert.equal(f.state.documents.size, 1);
  assert.equal((await follow(f, redirect, req)).statusCode, 200);
  assert.equal(f.state.documents.get(`SUB#${subscriberId("original-form@example.test")}`)?.state, "SUPPRESSED");
});
test("unknown, tampered, wrong-key, missing-key and unsigned legacy requests never suppress another user", async () => {
  for (const mode of ["unknown", "tampered", "wrong-key", "missing-key", "unsigned-email", "persistence-failure"]) {
    const f = fixture(); f.confirmed("protected@example.test"); f.env.DELIVERY_ENABLED = "false";
    let token = originalToken(f, "protected@example.test");
    if (mode === "unknown") token = v1;
    if (mode === "tampered") { const bytes = Buffer.from(token.slice(3), "base64url"); bytes[bytes.length - 1] ^= 1; token = "v1." + bytes.toString("base64url"); }
    if (mode === "wrong-key") f.keys.legacyV1Key = f.keys.capabilityKey;
    if (mode === "missing-key") Reflect.deleteProperty(f.keys, "legacyV1Key");
    if (mode === "persistence-failure") f.deps.store.suppress = async () => { throw new Error("synthetic_storage_failure"); };
    const before = structuredClone(f.state.documents);
    const req = request(mode === "unsigned-email" ? `${path}?email=protected%40example.test` : `${path}?token=${token}`);
    const response = await optoutPost(req.clone());
    if (mode === "unsigned-email") assert.equal(response.status, 400);
    else assert.equal((await follow(f, response, req)).statusCode, mode === "missing-key" ? 410 : mode === "persistence-failure" ? 503 : 400, mode);
    assert.deepEqual(f.state.documents, before); assert.equal(f.state.sends.length, 0);
  }
});
test("AWS after redirect validates v2 identity, purpose and nonce; another subscriber stays unchanged", async () => {
  const f = fixture(), a = f.confirmed("a@example.test"), b = f.confirmed("b@example.test"), before = structuredClone(f.state.documents);
  for (const token of [f.token(a.id).replace(/.$/, "X"), f.token(a.id, "unsubscribe", "x".repeat(32)), f.token("f".repeat(64)), f.token(a.id, "confirm", "u".repeat(32), f.state.time + 60000)]) {
    const req = request(`${path}?token=${token}`), response = await optoutPost(req.clone());
    assert.equal((await follow(f, response, req)).statusCode, 400); assert.deepEqual(f.state.documents, before);
  }
  const req = request(`${path}?token=${f.token(a.id)}&email=b%40example.test`);
  assert.equal((await follow(f, await optoutPost(req.clone()), req)).statusCode, 200);
  assert.equal(f.state.documents.get(`SUB#${a.id}`)?.state, "SUPPRESSED"); assert.equal(f.state.documents.get(`SUB#${b.id}`)?.state, "CONFIRMED");
});
test("redirected confirmation preserves pauses, expiry, nonce and single use without website sending", async () => {
  const f = fixture(), id = subscriberId("pending@example.test"), nonce = "c".repeat(32);
  f.env.DELIVERY_ENABLED = "false";
  f.state.documents.set(`SUB#${id}`, { pk: `SUB#${id}`, id, email: "pending@example.test", state: "PENDING", confirmationNonce: nonce, enrollmentPolicy: ENROLLMENT_POLICY, consentVersion: CONSENT_VERSION, consentText: CONSENT_TEXT, requestedAt: f.state.time - 1000 });
  const call = async (token: string) => { const req = request(`https://chronoversecapital.com/api/newsletter/confirm?token=${token}`); return follow(f, await confirmPost(req.clone()), req); };
  const token = f.token(id, "confirm", nonce, f.state.time + 60000), before = structuredClone(f.state.documents);
  f.env.CONFIRMATION_ENABLED = "false"; assert.equal((await call(token)).statusCode, 503); assert.deepEqual(f.state.documents, before);
  f.env.CONFIRMATION_ENABLED = "true";
  for (const bad of [f.token(id, "confirm", nonce, f.state.time - 1), f.token(id, "confirm", "x".repeat(32), f.state.time + 60000)]) {
    assert.equal((await call(bad)).statusCode, 400); assert.deepEqual(f.state.documents, before);
  }
  assert.equal((await call(token)).statusCode, 200); assert.equal((await call(token)).statusCode, 400);
  assert.equal(f.state.documents.get(`SUB#${id}`)?.state, "CONFIRMED"); assert.equal(f.state.sends.length, 0);
});
test("legacy one-click POST redirects preserve method, suppression and retry with all sending gates off", async () => {
  const f = fixture(), email = "historical@example.test", token = originalToken(f, email);
  for (const key of ["DELIVERY_ENABLED", "REGISTRATION_ENABLED", "CONFIRMATION_ENABLED", "LEGACY_DISPATCH_RETIRED", "COMPLIANCE_APPROVED"] as const) f.env[key] = "false";
  Reflect.deleteProperty(f.keys, "websiteKey");
  const req = request(`${path}?token=${token}`, "List-Unsubscribe=One-Click");
  for (const origin of ["https://chronoversecapital.com", "null"]) assert.equal((await follow(f, await optoutPost(req.clone()), req, origin)).statusCode, 200);
  assert.equal(f.state.documents.get(`SUB#${subscriberId(email)}`)?.state, "SUPPRESSED"); assert.equal(f.state.sends.length, 0);
});
test("GET redirects are scanner safe and never claim mutation or make a website service call", async () => {
  const f = fixture(), job = f.confirmed(), before = structuredClone(f.state.documents), old = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("website must not contact AWS"); };
  try {
    for (const [handler, token, action] of [[optoutGet, f.token(job.id), "unsubscribe"], [confirmGet, v2, "confirm"]] as const) {
      const response = handler(new Request(`https://chronoversecapital.com/api/newsletter/${action}?token=${token}`));
      assert.equal(response.status, 303); assert.equal(await response.text(), "");
      assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal(response.headers.get("referrer-policy"), "no-referrer");
      assert.equal((await follow(f, response)).statusCode, 200);
    }
    assert.deepEqual(f.state.documents, before);
  } finally { globalThis.fetch = old; }
});
test("legacy aliases reject conflicting tokens, hostile origins and invalid content; canonical origin protection remains", async () => {
  const f = fixture(), job = f.confirmed(), token = f.token(job.id), before = structuredClone(f.state.documents);
  for (const [origin, query, body] of [["https://hostile.example", token, ""], ["null", token, `token=${v1}`]]) {
    const result = await f.service.api({ rawPath: "/api/newsletter/unsubscribe", requestContext: { http: { method: "POST" } },
      rawQueryString: `token=${query}`, headers: { origin, "content-type": "application/x-www-form-urlencoded" }, body });
    assert.ok([400, 403].includes(result.statusCode)); assert.deepEqual(f.state.documents, before);
  }
  for (const body of [`token=${token}&token=${token}`, "x".repeat(4097)]) assert.equal((await optoutPost(request(path, body))).status, 400);
  assert.equal((await optoutPost(new Request(`${path}?token=${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) }))).status, 400);
  assert.equal(confirmGet(new Request(`https://chronoversecapital.com/api/newsletter/confirm?token=${v1}`)).status, 400);
  assert.equal(optoutGet(new Request(`${path}?token=%22%3E%3Cscript%3E`)).status, 400);
});
test("website registration is permanently retired; no Vercel bridge, secrets or dispatch routes remain", async () => {
  assert.equal(existsSync("src/lib/newsletterAws/bridge.ts"), false);
  for (const file of ["src/lib/newsletterAws/redirect.ts", "src/app/api/newsletter/route.ts"]) assert.doesNotMatch(readFileSync(file, "utf8"), /fetch\(|process\.env|createHash|secretsmanager|sanity/);
  assert.equal((await signup()).status, 503);
  for (const handler of [cronGet, cronPost, publication]) assert.equal((await handler()).status, 410);
  assert.equal((await oldFeedback()).status, 503);
  assert.deepEqual(JSON.parse(readFileSync("vercel.json", "utf8")).crons, []);
  assert.equal(JSON.parse(readFileSync("vercel.json", "utf8")).git.deploymentEnabled.master, true);
});
