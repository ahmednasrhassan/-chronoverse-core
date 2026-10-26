import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { SESv2Client, GetContactCommand, GetSuppressedDestinationCommand, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { fixture } from "./fixture.mjs";
import { CONSENT_TEXT, CONSENT_VERSION, subscriberId } from "../src/domain.mjs";
import { publicOrigin } from "../src/http.mjs";
import { createAwsDependencies } from "../src/aws.mjs";
import { createService } from "../src/service.mjs";
import { createCipheriv, createHash } from "node:crypto";

function request(f, path, method = "POST", body = "", options = {}) {
  return { version: "2.0", routeKey: `${method} ${path}`, rawPath: path, rawQueryString: "",
    requestContext: { http: { method, sourceIp: "192.0.2.10" } },
    headers: { origin: f.env.PUBLIC_ORIGIN, "content-type": "application/x-www-form-urlencoded" }, body, ...options };
}
const register = (f, email = "new@example.test", options) => f.service.api(request(f, "/register", "POST", new URLSearchParams({ email, consent: "yes" }).toString(), options));
function confirmation(f, email = "new@example.test") {
  const row = f.state.documents.get(`SUB#${subscriberId(email)}`);
  return f.token(row.id, "confirm", row.confirmationNonce, f.state.time + 60000);
}

test("AWS registration page and action work without any website bridge key, CMS or website request", async () => {
  const f = fixture(); delete f.keys.websiteKey;
  const page = await f.service.api(request(f, "/register", "GET"));
  assert.equal(page.statusCode, 200); assert.match(page.body, /type="email"/); assert.match(page.body, /name="consent"/);
  assert.match(page.headers["content-security-policy"], /form-action 'self'/); assert.equal(page.headers["cache-control"], "no-store");
  const result = await register(f); assert.equal(result.statusCode, 202); assert.doesNotMatch(result.body, /new@example|v2\./);
  const row = f.state.documents.get(`SUB#${subscriberId("new@example.test")}`);
  assert.equal(row.state, "PENDING"); assert.equal(row.source, `${f.env.PUBLIC_ORIGIN}/register`);
  assert.equal(row.consentText, CONSENT_TEXT); assert.equal(row.consentVersion, CONSENT_VERSION);
  assert.match(f.state.sends[0].message.text, /https:\/\/synthetic\.execute-api\.eu-north-1\.amazonaws\.com\/confirm\?token=/);
  assert.doesNotMatch(f.state.sends[0].message.text, /chronoversecapital\.com/);
});

test("public signup requires explicit consent, configured same origin and trusted API Gateway IP context", async () => {
  for (const mutation of [
    event => { event.headers.origin = "https://hostile.example.test"; },
    event => { delete event.requestContext.http.sourceIp; event.headers["x-vercel-forwarded-for"] = "192.0.2.10"; event.headers["x-forwarded-for"] = "192.0.2.10"; },
    event => { event.requestContext.http.sourceIp = "not-an-ip"; },
    event => { event.version = "1.0"; },
    event => { event.routeKey = "ANY /{proxy+}"; },
    event => { event.body = "email=new%40example.test&consent=no"; },
    event => { event.body = "email=new%40example.test&consent=yes&consent=no"; },
    event => { event.isBase64Encoded = true; },
  ]) {
    const f = fixture(), e = request(f, "/register", "POST", "email=new%40example.test&consent=yes"); mutation(e);
    const result = await f.service.api(e); assert.ok([400, 403].includes(result.statusCode));
    assert.equal(f.state.sends.length, 0); assert.equal(f.state.documents.size, 1); assert.equal(f.state.rates.size, 0);
  }
  const f = fixture(); f.env.PUBLIC_ORIGIN = ""; assert.equal((await register(f)).statusCode, 503); assert.equal(f.state.sends.length, 0);
});

test("spoofed headers cannot evade the ten-per-hour source-IP limit and responses do not reveal audience membership", async () => {
  const f = fixture(); let last;
  for (let i = 0; i < 12; i++) last = await register(f, `reader-${i}@example.test`, {
    headers: { origin: f.env.PUBLIC_ORIGIN, "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": `192.0.2.${i + 20}`, "x-vercel-forwarded-for": `198.51.100.${i + 20}` },
  });
  assert.equal(f.state.sends.length, 10); assert.equal(last.statusCode, 202);
  const before = f.state.sends.length; const again = await register(f, "reader-0@example.test"); assert.equal(again.body, last.body); assert.equal(f.state.sends.length, before);
});

test("JSON public registration overrides client fingerprints and requires the exact consent contract", async () => {
  const f = fixture(); delete f.keys.websiteKey;
  const e = request(f, "/subscribe", "POST", JSON.stringify({ email: "new@example.test", consent: true, consentVersion: CONSENT_VERSION, consentText: CONSENT_TEXT, clientFingerprint: "forged" }),
    { headers: { origin: f.env.PUBLIC_ORIGIN, "content-type": "application/json" } });
  assert.equal((await f.service.api(e)).statusCode, 202);
  assert.ok([...f.state.rates.keys()].some(k => /^CLIENT#[a-f0-9]{64}:/.test(k)));
  assert.ok([...f.state.rates.keys()].every(k => !k.includes("forged") && !k.includes("192.0.2.10")));
  const other = fixture(); e.body = JSON.stringify({ email: "new@example.test", consent: true, consentText: "different", consentVersion: CONSENT_VERSION });
  assert.equal((await other.service.api(e)).statusCode, 400); assert.equal(other.state.sends.length, 0);
});

test("GET management pages do not read secrets, change consent or echo capability values", async () => {
  const f = fixture(); const job = f.confirmed(), token = f.token(job.id), documents = structuredClone(f.state.documents);
  const secretReader = f.deps.secrets; f.deps.secrets = async () => { throw new Error("GET must not read secrets"); };
  for (const action of ["confirm", "unsubscribe"]) {
    const cap = action === "confirm" ? f.token(job.id, "confirm", "c".repeat(32), f.state.time + 60000) : token;
    const result = await f.service.api(request(f, `/${action}`, "GET", "", { rawQueryString: `token=${cap}` }));
    assert.equal(result.statusCode, 200); assert.match(result.body, /method="post"/); assert.ok(!result.body.includes(cap));
    assert.equal(result.headers["referrer-policy"], "no-referrer"); assert.equal(result.headers["x-content-type-options"], "nosniff");
  }
  f.deps.secrets = secretReader; assert.deepEqual(f.state.documents, documents); assert.equal(f.state.sends.length, 0);
});

test("independent confirmation remains purpose-bound, expiring, single-use and POST-only", async () => {
  const f = fixture(); delete f.keys.websiteKey; await register(f); const token = confirmation(f);
  const e = request(f, "/confirm", "POST", "action=confirm", { rawQueryString: `token=${token}` });
  assert.equal((await f.service.api({ ...e, requestContext: { http: { method: "GET" } } })).statusCode, 200);
  assert.equal(f.state.documents.get(`SUB#${subscriberId("new@example.test")}`).state, "PENDING");
  assert.equal((await f.service.api(e)).statusCode, 200); assert.equal((await f.service.api(e)).statusCode, 400);
  assert.equal(f.state.documents.get(`SUB#${subscriberId("new@example.test")}`).state, "CONFIRMED");
  assert.equal(f.state.sends.length, 1);
  const other = fixture(); await register(other); const expired = confirmation(other); other.state.time += 60001;
  assert.equal((await other.service.api(request(other, "/confirm", "POST", "action=confirm", { rawQueryString: `token=${expired}` }))).statusCode, 400);
});

test("safe POST and RFC8058 one-click unsubscribe work while every activation control and bridge is unavailable", async () => {
  const f = fixture(), job = f.confirmed(), token = f.token(job.id); delete f.keys.websiteKey;
  for (const flag of ["DELIVERY_ENABLED", "REGISTRATION_ENABLED", "CONFIRMATION_ENABLED", "LEGACY_DISPATCH_RETIRED", "COMPLIANCE_APPROVED"]) f.env[flag] = "false";
  f.state.documents.delete("CONTROL");
  const event = request(f, "/unsubscribe", "POST", "List-Unsubscribe=One-Click", {
    rawQueryString: `token=${token}`, headers: { "content-type": "application/x-www-form-urlencoded" },
  });
  assert.equal((await f.service.api(event)).statusCode, 200);
  const saved = structuredClone(f.state.documents.get(`SUB#${job.id}`)); assert.equal(saved.state, "SUPPRESSED");
  assert.equal((await f.service.api({ ...event, body: "action=unsubscribe" })).statusCode, 200);
  assert.deepEqual(f.state.documents.get(`SUB#${job.id}`), saved); assert.equal(f.state.sends.length, 0);
});

test("invalid, duplicate, conflicting and wrong-purpose unsubscribe tokens cannot suppress anyone", async () => {
  const f = fixture(), job = f.confirmed(), valid = f.token(job.id), confirm = f.token(job.id, "confirm", "c".repeat(32), f.state.time + 10000);
  for (const query of ["token=invalid", `token=${valid}&token=${valid}`, `token=${confirm}`, `token=${valid}x`]) {
    assert.equal((await f.service.api(request(f, "/unsubscribe", "POST", "action=unsubscribe", { rawQueryString: query }))).statusCode, 400);
    assert.equal(f.state.documents.get(`SUB#${job.id}`).state, "CONFIRMED");
  }
  assert.equal((await f.service.api(request(f, "/unsubscribe", "POST", JSON.stringify({ token: valid }), {
    rawQueryString: `token=${valid}`, headers: { "content-type": "application/json" },
  }))).statusCode, 400);
});

test("public flows preserve provider/ledger suppression and disabled registration before any invitation", async () => {
  for (const state of ["SUPPRESSED", "HOLD", "provider"]) {
    const f = fixture(), email = "new@example.test", id = subscriberId(email);
    if (state === "provider") f.state.suppressed.add(email); else f.state.documents.set(`SUB#${id}`, { pk: `SUB#${id}`, id, email, state });
    assert.equal((await register(f)).statusCode, 202); assert.equal(f.state.sends.length, 0);
  }
  const f = fixture(); f.env.REGISTRATION_ENABLED = "false";
  assert.equal((await register(f)).statusCode, 503); assert.equal(f.state.sends.length, 0); assert.equal(f.state.rates.size, 0);
});

test("unknown and administrative routes are absent; configuration rejects credentials, paths and unsafe origins", async () => {
  const f = fixture();
  for (const path of ["/admin", "/publish", "/content", "/restore"]) assert.equal((await f.service.api(request(f, path))).statusCode, 404);
  for (const value of ["", "http://example.test", "https://user:password@example.test", "https://example.test/path", "https://example.test/", "https://example.test?token=x"]) assert.throws(() => publicOrigin({ PUBLIC_ORIGIN: value }), /not_configured/);
  assert.equal((await f.service.api(request(f, "/confirm", "DELETE"))).statusCode, 405);
});

test("unapproved legacy campaigns, expired approvals and revoked content controls cannot send or consume claims", async () => {
  for (const state of ["legacy", "expired", "revoked"]) {
    const f = fixture(), job = f.confirmed(), campaign = f.state.documents.get(`CAMPAIGN#${job.campaign}`);
    if (state === "legacy") delete campaign.articles[0].contentManifest;
    if (state === "expired") campaign.articles[0].contentManifest.expiresAt = f.state.time - 1;
    if (state === "revoked") f.state.documents.get("CONTROL").contentSourceApproved = false;
    if (state === "revoked") await assert.rejects(() => f.service.deliver(job), /sending_paused/); else await f.service.deliver(job);
    assert.equal(f.state.sends.length, 0); assert.equal(f.state.documents.has(`MAIL#${job.campaign}#${job.id}`), false);
  }
});

test("independent digest uses its AWS unsubscribe URL and SES adapter constructs one-click headers", async () => {
  const f = fixture(), job = f.confirmed(); await f.service.deliver(job);
  const message = f.state.sends[0].message; assert.match(message.unsubscribeUrl, /^https:\/\/synthetic\.execute-api\.eu-north-1\.amazonaws\.com\/unsubscribe\?token=v2\./);
  assert.doesNotMatch(message.unsubscribeUrl, /chronoversecapital\.com/);
  const commands = [];
  mock.method(DynamoDBDocumentClient.prototype, "send", async command => {
    if (command instanceof UpdateCommand) return {};
    assert.ok(command instanceof GetCommand); return { Item: f.state.documents.get(command.input.Key.pk) };
  });
  mock.method(SESv2Client.prototype, "send", async command => {
    if (command instanceof GetSuppressedDestinationCommand) throw Object.assign(new Error("synthetic"), { name: "NotFoundException" });
    if (command instanceof GetContactCommand) return f.state.contacts.get(command.input.EmailAddress);
    assert.ok(command instanceof SendEmailCommand); commands.push(command); return { MessageId: "synthetic-message" };
  });
  try {
    const deps = createAwsDependencies({ ...f.env, AWS_REGION: "eu-north-1", TABLE_NAME: "synthetic" });
    await deps.mail.send("reader@example.test", message, { kind: "digest", id: job.id, campaign: job.campaign });
    const headers = commands[0].input.Content.Simple.Headers;
    assert.deepEqual(headers, [{ Name: "List-Unsubscribe", Value: `<${message.unsubscribeUrl}>` }, { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" }]);
  } finally { mock.restoreAll(); }
});

test("planner prepares an approved issue without contacting any HTTP endpoint and sends only the frozen content", async () => {
  const f = fixture(); let fetched = 0;
  const service = createService({ ...f.deps, articles: async () => { fetched++; return f.deps.articles(); } }, f.env);
  await service.plan({ kind: "weekly" }); assert.equal(fetched, 1);
  f.deps.articles = async () => { throw new Error("website unavailable"); };
  await service.plan({ kind: "weekly" }); assert.equal(fetched, 1); assert.equal(f.state.sends.length, 0);
});

test("AWS public legacy unsubscribe preserves original-key continuity and never guesses a missing key", async () => {
  const f = fixture(), email = "historical@example.test", id = subscriberId(email);
  const iv = Buffer.alloc(12, 7), cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(f.keys.legacyV1Key).digest(), iv);
  cipher.setAAD(Buffer.from("chronoverse-newsletter-optout-v1"));
  const bytes = Buffer.concat([cipher.update(email), cipher.final()]);
  const token = "v1." + Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString("base64url");
  const originalKey = f.keys.legacyV1Key; delete f.keys.legacyV1Key; delete f.keys.websiteKey;
  const event = request(f, "/unsubscribe", "POST", "List-Unsubscribe=One-Click", { rawQueryString: `token=${token}`, headers: { "content-type": "application/x-www-form-urlencoded" } });
  assert.equal((await f.service.api(event)).statusCode, 503); assert.equal(f.state.documents.has(`SUB#${id}`), false);
  f.keys.legacyV1Key = originalKey;
  assert.equal((await f.service.api(event)).statusCode, 200); assert.equal(f.state.documents.get(`SUB#${id}`).state, "SUPPRESSED");
  assert.equal(f.state.sends.length, 0);
});

test("existing management path aliases are served on AWS without requiring a Next.js forwarder", async () => {
  const f = fixture(); delete f.keys.websiteKey; await register(f);
  const confirm = confirmation(f), confirmQuery = `token=${confirm}`;
  assert.equal((await f.service.api(request(f, "/api/newsletter/confirm", "GET", "", { rawQueryString: confirmQuery }))).statusCode, 200);
  assert.equal((await f.service.api(request(f, "/api/newsletter/confirm", "POST", "action=confirm", { rawQueryString: confirmQuery }))).statusCode, 200);
  const row = f.state.documents.get(`SUB#${subscriberId("new@example.test")}`), token = f.token(row.id, "unsubscribe", row.unsubscribeNonce);
  const event = request(f, "/api/newsletter/unsubscribe", "GET", "", { rawQueryString: `token=${token}` });
  assert.equal((await f.service.api(event)).statusCode, 200); assert.equal(row.state, "CONFIRMED");
  assert.equal((await f.service.api({ ...event, body: "List-Unsubscribe=One-Click", headers: { "content-type": "application/x-www-form-urlencoded" }, requestContext: { http: { method: "POST" } } })).statusCode, 200);
  assert.equal(f.state.documents.get(`SUB#${row.id}`).state, "SUPPRESSED");
});
