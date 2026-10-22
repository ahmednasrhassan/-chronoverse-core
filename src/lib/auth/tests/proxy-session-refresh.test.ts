import assert from "node:assert/strict";
import { test } from "node:test";

import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

import { config, createChronoverseProxyV1 } from "../../../proxy";

const APEX = "chronoversecapital.com";
const COOKIE = "sb-proxy-refresh-test-auth-token";
const AUTH_URL = "https://proxy-refresh-test.supabase.co";
const USER = { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated" };

function token(exp: number): string {
  // Test-only symmetric JWT; the SDK verifies it through the intercepted /user endpoint.
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: USER.id, exp, aud: USER.aud })}.c2lnbmF0dXJl`;
}

test("expired sessions refresh through the real Supabase SDK and reach request and response cookies", async (t) => {
  const now = Math.floor(Date.now() / 1000);
  const refreshedToken = token(now + 3600);
  const expiredSession = {
    access_token: token(now - 3600), refresh_token: "expired-session-refresh-token",
    expires_at: now - 3600, expires_in: 3600, token_type: "bearer", user: USER,
  };
  const cookieValue = `base64-${Buffer.from(JSON.stringify(expiredSession)).toString("base64url")}`;
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = AUTH_URL;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-local-test-key";
  t.after(() => {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousKey;
  });

  let refreshCalls = 0;
  let verificationCalls = 0;
  // No network escapes this test: any unexpected request fails immediately.
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert.equal(url.origin, AUTH_URL);
    if (url.pathname === "/auth/v1/token") {
      assert.equal(url.searchParams.get("grant_type"), "refresh_token");
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(String(init?.body)), { refresh_token: "expired-session-refresh-token" });
      refreshCalls += 1;
      return Response.json({
        access_token: refreshedToken, refresh_token: "rotated-refresh-token",
        expires_in: 3600, token_type: "bearer", user: USER,
      });
    }
    assert.equal(url.pathname, "/auth/v1/user");
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${refreshedToken}`);
    verificationCalls += 1;
    return Response.json(USER);
  });

  const handler = createChronoverseProxyV1();
  const variants: Array<Record<string, string>> = [
    {}, { rsc: "1", "next-router-state-tree": "[]" },
    { rsc: "1", "next-router-prefetch": "1", purpose: "prefetch" },
  ];
  for (const pathname of ["/account", "/auth/confirm", "/billing/history", "/account/profile"]) {
    for (const variant of variants) {
      const headers = { host: APEX, cookie: `${COOKIE}=${cookieValue}`, ...variant };
      const url = `https://${APEX}${pathname}?_rsc=test`;
      assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url, headers }), true);
      const incoming = new NextRequest(url, { headers });
      const response = await handler(incoming);
      const refreshed = response.cookies.getAll().filter(({ name, value }) => name.startsWith(COOKIE) && value);
      assert.ok(refreshed.length > 0, "SDK emits refreshed session cookies");
      for (const cookie of refreshed) {
        assert.equal(incoming.cookies.get(cookie.name)?.value, cookie.value, "server request receives rotation");
        assert.ok(response.headers.get("x-middleware-request-cookie")?.includes(`${cookie.name}=${cookie.value}`),
          "downstream render receives refreshed cookies");
        assert.equal(cookie.path, "/");
        assert.equal(cookie.sameSite, "lax");
        assert.ok(cookie.maxAge! > 0);
      }
      const combined = refreshed.map(({ value }) => value).join("");
      const session = JSON.parse(Buffer.from(combined.slice("base64-".length), "base64url").toString());
      assert.equal(session.access_token, refreshedToken);
      assert.equal(session.refresh_token, "rotated-refresh-token");
      assert.equal(response.headers.get("x-robots-tag"), null);
    }
  }
  assert.equal(refreshCalls, 12, "each expired protected request refreshes exactly once");
  assert.equal(verificationCalls, 12, "claims are verified after refresh");

  const publicRequest = new NextRequest(`https://${APEX}/reports`, {
    headers: { host: APEX, cookie: `${COOKIE}=${cookieValue}` },
  });
  assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: publicRequest.url }), false);
  // Even if invoked directly, the public path keeps its existing no-refresh behavior.
  assert.equal((await handler(publicRequest)).headers.get("set-cookie"), null);
  assert.equal(refreshCalls, 12);
});
