import assert from "node:assert/strict";
import { test } from "node:test";
import { handleNewsletterSignup as POST } from "../../newsletter/signup";
import { POST as publicSignup } from "../../../app/api/newsletter/route";
import { GET as optoutGet, POST as optoutPost } from "../../../app/api/newsletter/unsubscribe/route";
import { createNewsletterStore } from "../../newsletter/store";
import { createUnsubscribeToken, emailKey, readUnsubscribeToken } from "../../newsletter/tokens";
import { newsletterFixture, syntheticConfig } from "./newsletter-fixture";

// Keep storage/reactivation regressions against the retained server-only handler.
// The public route is tested separately and cannot reach it during this pause.

const email = "reader@example.test";
const request = (body: unknown) => new Request("https://chronoversecapital.com/api/newsletter", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

test("paused public signup never reads addresses, creates records or reactivates existing subscribers", async () => {
  const fixture = newsletterFixture();
  const old = process.env.NEWSLETTER_SENDING_ENABLED;
  process.env.NEWSLETTER_SENDING_ENABLED = "true";
  try {
    fixture.put({ _id: "subscriber.inactive", _type: "subscriber", email, active: false });
    fixture.put({ _id: "subscriber.active", _type: "subscriber", email: "active@example.test", active: true });
    fixture.put({ _id: "subscriber.suppressed", _type: "subscriber", email: "suppressed@example.test", active: false, suppressed: true });
    const before = structuredClone([...fixture.documents]);
    for (const body of [{ email: "new@example.test" }, { email }, { email: "active@example.test" }, { email: "suppressed@example.test" }, {}, null]) {
      const input = request(body);
      const response = await publicSignup(input);
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(await response.json(), {
        status: "paused", code: "newsletter_signups_paused",
        message: "Newsletter signups are temporarily paused while delivery is suspended. No new subscriptions are being accepted.",
      });
      assert.equal(input.bodyUsed, false, "pause is enforced before parsing an address");
    }
    assert.equal((await publicSignup(new Request(request({}), { body: "{" }))).status, 503);
    assert.deepEqual([...fixture.documents], before);
    assert.deepEqual(fixture.calls, [], "not even an authenticated storage read is needed");
  } finally {
    fixture.close();
    if (old === undefined) delete process.env.NEWSLETTER_SENDING_ENABLED;
    else process.env.NEWSLETTER_SENDING_ENABLED = old;
  }
});

test("signup validates input before authenticated persistence", async () => {
  const fixture = newsletterFixture();
  try {
    for (const body of [null, [], {}, { email: false }, { email: "invalid" }, { email: "control\u0000@example.test" }, { email: `${"a".repeat(250)}@example.test` }, { email, extra: "x".repeat(4096) }]) {
      assert.equal((await POST(request(body))).status, 400);
    }
    assert.equal((await POST(new Request(request({}), { body: "{" }))).status, 400);
    assert.equal(fixture.calls.length, 0);
  } finally { fixture.close(); }
});

test("a stale lookup cannot reactivate or confirm a suppressed deterministic record", async () => {
  const fixture = newsletterFixture();
  try {
    const id = `subscriber.${emailKey(email)}`;
    fixture.put({ _id: id, _type: "subscriber", email, active: false, suppressed: true });
    fixture.failures.add("stale-lookup");
    assert.equal((await POST(request({ email }))).status, 409);
    assert.equal(fixture.documents.get(id)?.active, false);
    assert.deepEqual(await createNewsletterStore().recipients(), []);
  } finally { fixture.close(); }
});

test("real signup/store path saves private normalized IDs, reads them back and deduplicates", async () => {
  const fixture = newsletterFixture();
  try {
    assert.equal((await POST(request({ email: " Reader@Example.Test " }))).status, 200);
    const stored = fixture.documents.get(`subscriber.${emailKey(email)}`)!;
    assert.equal(stored.email, email); assert.equal(stored.active, true);
    assert.deepEqual(await createNewsletterStore().recipients(), [email]);
    assert.equal((await POST(request({ email }))).status, 200);
    assert.equal([...fixture.documents.values()].filter(doc => doc._type === "subscriber").length, 1);
    assert.ok(fixture.calls.every(call => call.authenticated));
  } finally { fixture.close(); }
});

for (const stale of [false, true]) test(`inactive record reactivates with ${stale ? "stale" : "current"} lookup`, async () => {
  const fixture = newsletterFixture();
  try {
    const id = stale ? `subscriber.${emailKey(email)}` : "legacy-subscriber";
    fixture.put({ _id: id, _type: "subscriber", email, active: false });
    if (stale) fixture.failures.add("stale-lookup");
    assert.equal((await POST(request({ email }))).status, 200);
    assert.equal(fixture.documents.get(id)?.active, true);
    assert.deepEqual(await createNewsletterStore().recipients(), [email]);
  } finally { fixture.close(); }
});

test("recipient selection excludes drafts, invalid, inactive, suppressed records and duplicates", async () => {
  const fixture = newsletterFixture();
  try {
    for (const [id, address, active, suppressed] of [
      ["subscriber.one", email, true, false], ["legacy-copy", " Reader@Example.Test ", true, false],
      ["drafts.hidden", "draft@example.test", true, false], ["inactive", "inactive@example.test", false, false],
      ["suppressed", "suppressed@example.test", true, true], ["invalid", "bad-address", true, false],
      ["legacy-unconfirmed", "unknown@example.test", undefined, false],
    ] as const) fixture.put({ _id: id, _type: "subscriber", email: address, active, suppressed });
    assert.deepEqual(await createNewsletterStore().recipients(), [email]);
    fixture.failures.add("read");
    await assert.rejects(createNewsletterStore().recipients());
  } finally { fixture.close(); }
});

for (const operation of ["read", "create", "patch"]) test(`signup ${operation} failure cannot report success`, async () => {
  const fixture = newsletterFixture();
  try {
    if (operation === "patch") fixture.put({ _id: "old", _type: "subscriber", email, active: false });
    fixture.failures.add(operation);
    const response = await POST(request({ email }));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).status, "error");
  } finally { fixture.close(); }
});

test("missing dedicated reader/writer credentials fail closed without broad-token fallback", async () => {
  const fixture = newsletterFixture();
  try {
    for (const name of ["SANITY_NEWSLETTER_READ_TOKEN", "SANITY_NEWSLETTER_WRITE_TOKEN"]) {
      const previous = process.env[name]; delete process.env[name];
      try { assert.equal((await POST(request({ email }))).status, 503); }
      finally { process.env[name] = previous; }
    }
    assert.equal(fixture.documents.size, 0);
  } finally { fixture.close(); }
});

test("opaque opt-out still suppresses all copies and blocks retained signup reactivation", async () => {
  const fixture = newsletterFixture();
  try {
    await POST(request({ email }));
    fixture.put({ _id: "legacy-copy", _type: "subscriber", email, active: true });
    const token = createUnsubscribeToken(email, syntheticConfig.unsubscribeSecret);
    assert.ok(!token.includes(email));
    assert.equal(readUnsubscribeToken(token, "wrong-secret"), null);
    assert.equal(readUnsubscribeToken(token + "x", syntheticConfig.unsubscribeSecret), null);
    const url = `https://chronoversecapital.com/api/newsletter/unsubscribe?token=${token}`;
    const confirmation = await optoutGet(new Request(url));
    assert.equal(confirmation.status, 200); assert.ok(!(await confirmation.text()).includes(email));
    assert.equal(fixture.documents.get(`subscriber.${emailKey(email)}`)?.active, true);
    for (let i = 0; i < 2; i++) {
      const response = await optoutPost(new Request(url, { method: "POST", body: "List-Unsubscribe=One-Click" }));
      assert.equal(response.status, 200); assert.ok(!(await response.text()).includes(email));
    }
    assert.equal(fixture.documents.get("legacy-copy")?.active, false);
    assert.equal((await publicSignup(request({ email }))).status, 503);
    assert.equal((await POST(request({ email }))).status, 409);
    assert.deepEqual(await createNewsletterStore().recipients(), []);
    fixture.failures.add("transaction");
    assert.equal((await optoutPost(new Request(url, { method: "POST" }))).status, 503);
    assert.equal((await optoutPost(new Request(url.replace(token, "forged"), { method: "POST" }))).status, 400);
  } finally { fixture.close(); }
});
