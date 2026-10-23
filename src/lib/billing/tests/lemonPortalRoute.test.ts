import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "../../../app/api/billing/portal/route";

test("retired portal stays inert even with an unreadable request", async () => {
  const handler: (request: Request) => Promise<Response> = POST;
  const request = new Proxy({} as Request, { get() { throw new Error("request must not be read"); } });
  const response = await handler(request);
  assert.equal(response.status, 410);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { ok: false, error: "portal-disabled" });
});
