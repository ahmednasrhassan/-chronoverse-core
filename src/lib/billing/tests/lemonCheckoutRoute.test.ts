import assert from "node:assert/strict";
import { createCheckoutRouteHandlerV1, POST } from "../../../app/api/billing/checkout/route";

async function main(): Promise<void> {

  let calls = 0;
  const handler = createCheckoutRouteHandlerV1({ createCheckout: async () => {
    calls += 1;
    throw new Error("Disabled checkout must never reach authentication or provider code");
  } });
  for (const body of ["", "not-json", "{}", '{"plan":"monthly"}', '{"plan":"annual"}', '{"role":"owner"}']) {
    const request = new Request("https://preview.vercel.app/api/billing/checkout", { method: "POST", body });
    const response = await handler(request);
    assert.equal(response.status, 410);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { ok: false, error: "checkout-disabled" });
    assert.equal(request.bodyUsed, false, "deny before reading even malformed request data");
  }
  assert.equal(calls, 0);
  assert.equal((await POST(new Request("https://chronoversecapital.com/api/billing/checkout", { method: "POST" }))).status, 410);
  console.log("PASS: checkout route is disabled before all dependencies and request parsing");
}

void main();
