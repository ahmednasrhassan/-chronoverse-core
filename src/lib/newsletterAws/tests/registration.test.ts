import test from "node:test";
import assert from "node:assert/strict";
import { registrationHandler, CONSENT_TEXT, CONSENT_VERSION } from "../registration";
import { signedRegistration } from "../signedRegistration";
import { fixture } from "../../../../services/newsletter/test/fixture.mjs";
import { CONSENT_TEXT as SERVICE_TEXT, CONSENT_VERSION as SERVICE_VERSION } from "../../../../services/newsletter/src/domain.mjs";

const body = { email: "  Reader@Example.test  ", consent: true as const, consentText: CONSENT_TEXT, consentVersion: CONSENT_VERSION };
const request = (input: unknown = body, origin = "https://chronoversecapital.com") => new Request("https://chronoversecapital.com/api/newsletter", {
  method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(input),
});
test("website consent matches the service; pause performs no body read or transport call", async () => {
  assert.equal(CONSENT_TEXT, SERVICE_TEXT); assert.equal(CONSENT_VERSION, SERVICE_VERSION);
  let calls = 0;
  const req = request();
  const response = await registrationHandler(true, async () => { calls++; return 202; })(req);
  assert.equal(response.status, 503); assert.equal(req.bodyUsed, false); assert.equal(calls, 0);
});
test("hostile origins, missing consent, custom target fields and oversized streams never reach AWS", async () => {
  let calls = 0;
  const handler = registrationHandler(false, async () => { calls++; return 202; });
  for (const input of [{ ...body, consent: false }, { ...body, consentText: "yes" }, { ...body, consentVersion: "old" },
    { ...body, email: "not-email" }, { ...body, target: "https://attacker.test" }, { ...body, email: "x".repeat(5000) }]) {
    assert.equal((await handler(request(input))).status, 400);
  }
  assert.equal((await handler(request(body, "https://attacker.test"))).status, 403);
  assert.equal((await handler(request(body, "null"))).status, 403);
  assert.equal(calls, 0);
});
test("only upstream 202 means check-inbox; unknown results are sanitized without retries", async () => {
  for (const outcome of [202, 200, 400, 503, "timeout"]) {
    let calls = 0;
    const response = await registrationHandler(false, async input => {
      calls++; assert.equal(input.email, "reader@example.test");
      if (outcome === "timeout") throw new Error("PRIVATE_PROVIDER_MESSAGE");
      return outcome as number;
    })(request());
    assert.equal(response.status, outcome === 202 ? 202 : 503); assert.equal(calls, 1);
    assert.doesNotMatch(await response.text(), /PRIVATE|reader@|subscribed/);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});
const credentials = async () => ({ accessKeyId: "SYNTHETIC", secretAccessKey: "synthetic-secret-for-offline-tests",
  sessionToken: "synthetic-session", expiration: new Date(Date.now() + 900000) });
test("SigV4 transport pins method, host, origin and region, and requires expiring session credentials", async () => {
  let calls = 0;
  const transport: typeof fetch = async (url, options) => {
    calls++; assert.equal(String(url), "https://lh71lvbqi8.execute-api.eu-north-1.amazonaws.com/register");
    assert.equal(options?.method, "POST"); assert.equal(options?.redirect, "error"); assert.equal(options?.cache, "no-store");
    const h = new Headers(options?.headers);
    assert.equal(h.get("origin"), new URL(String(url)).origin);
    assert.equal(h.get("x-amz-security-token"), "synthetic-session");
    assert.match(h.get("authorization")!, /eu-north-1\/execute-api\/aws4_request/);
    assert.deepEqual(JSON.parse(options?.body as string), body);
    return new Response("upstream private body", { status: 202 });
  };
  assert.equal(await signedRegistration(credentials, transport)(body), 202); assert.equal(calls, 1);
  for (const invalid of [{ ...await credentials(), sessionToken: "" }, { ...await credentials(), expiration: new Date(0) }]) {
    await assert.rejects(signedRegistration(async () => invalid, transport)(body), /registration_unavailable/);
  }
  assert.equal(calls, 1);
});
test("website-to-existing-handler flow honors closed gates then records only pending consent in memory", async () => {
  const f = fixture();
  Object.assign(f.env, { PUBLIC_ORIGIN: "https://lh71lvbqi8.execute-api.eu-north-1.amazonaws.com" });
  const control = f.state.documents.get("CONTROL")!;
  control.registrationEnabled = false; control.confirmationEnabled = false;
  const submit = signedRegistration(credentials, async (url, options) => {
    const target = new URL(String(url));
    const response = await f.service.api({ version: "2.0", routeKey: "POST /register", rawPath: target.pathname,
      requestContext: { http: { method: "POST", sourceIp: "192.0.2.3" } },
      headers: Object.fromEntries(new Headers(options?.headers)), body: options?.body as string });
    return new Response(response.body, { status: response.statusCode });
  });
  const handler = registrationHandler(false, submit);
  assert.equal((await handler(request())).status, 503); assert.equal(f.state.sends.length, 0);
  control.registrationEnabled = true; control.confirmationEnabled = true;
  assert.equal((await handler(request())).status, 202); assert.equal(f.state.sends.length, 1);
  assert.equal([...f.state.documents.values()].filter(x => x.state === "PENDING").length, 1);
  assert.equal(f.state.contacts.size, 0);
});
