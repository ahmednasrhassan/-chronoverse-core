import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "../../../app/api/billing/checkout/route";

test("retired checkout stays inert even with an unreadable request", async () => {
  const handler: (request: Request) => Promise<Response> = POST;
  const request = new Proxy({} as Request, { get() { throw new Error("request must not be read"); } });
  const response = await handler(request);
  assert.equal(response.status, 410);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { ok: false, error: "checkout-disabled" });
});
