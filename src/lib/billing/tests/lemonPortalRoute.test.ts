import assert from "node:assert/strict";
import { createPortalRouteHandlerV1, POST } from "../../../app/api/billing/portal/route";

async function main(): Promise<void> {
  let calls = 0;
  const handler = createPortalRouteHandlerV1({ createPortal: async () => {
    calls += 1;
    throw new Error("Subscription portal must remain dormant in free-only mode");
  } });
  for (const body of ["", "{}", '{"customerId":"forged"}']) {
    const request = new Request("https://chronoversecapital.com/api/billing/portal", { method: "POST", body });
    const response = await handler(request);
    assert.equal(response.status, 410);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { ok: false, error: "portal-disabled" });
    assert.equal(request.bodyUsed, false);
  }
  assert.equal(calls, 0);
  assert.equal((await POST(new Request("https://preview.vercel.app/api/billing/portal", { method: "POST" }))).status, 410);
  console.log("PASS: portal route is disabled before customer lookup or provider calls");
}

void main();
