import assert from "node:assert/strict";

import { createPortalRouteHandlerV1 } from "../../../app/api/billing/portal/route";
import { AccessGuardErrorV1 } from "../../auth/guards";
import { LemonPortalErrorV1 } from "../lemonPortal";

const ROUTE_URL = "https://chronoversecapital.com/api/billing/portal";

function request(body?: string): Request {
  return new Request(ROUTE_URL, { method: "POST", body });
}

async function main(): Promise<void> {
  let calls = 0;
  const successHandler = createPortalRouteHandlerV1({
    createPortal: async () => {
      calls += 1;
      return "https://chronoverse.lemonsqueezy.com/billing?signature=fake";
    },
  });
  const success = await successHandler(request());
  assert.equal(success.status, 200);
  assert.deepEqual(await success.json(), {
    url: "https://chronoverse.lemonsqueezy.com/billing?signature=fake",
  });
  assert.equal(calls, 1);

  for (const body of [
    "{}",
    JSON.stringify({ customerId: "7001" }),
    JSON.stringify({ subscriptionId: "9001" }),
    JSON.stringify({ userId: "11111111-1111-4111-8111-111111111111" }),
    JSON.stringify({ storeId: "294379" }),
  ]) {
    const response = await successHandler(request(body));
    assert.equal(response.status, 400);
  }
  assert.equal(calls, 1, "non-empty bodies never reach portal resolution");

  let anonymousCalls = 0;
  const anonymousHandler = createPortalRouteHandlerV1({
    createPortal: async () => {
      anonymousCalls += 1;
      throw new AccessGuardErrorV1("authentication-required");
    },
  });
  const anonymous = await anonymousHandler(request());
  assert.equal(anonymous.status, 401);
  assert.deepEqual(await anonymous.json(), {
    ok: false,
    error: "authentication-required",
  });
  assert.equal(anonymousCalls, 1);

  for (const [code, status, publicCode] of [
    ["customer-not-found", 404, "billing-customer-not-found"],
    ["customer-mapping-invalid", 409, "billing-customer-unavailable"],
    ["provider-unavailable", 503, "portal-unavailable"],
    ["invalid-provider-response", 503, "portal-unavailable"],
    ["configuration-unavailable", 503, "portal-unavailable"],
  ] as const) {
    const handler = createPortalRouteHandlerV1({
      createPortal: async () => { throw new LemonPortalErrorV1(code); },
    });
    const response = await handler(request());
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { ok: false, error: publicCode });
  }

  console.log("PASS: Lemon portal route rejects identity input and fails safely");
}

void main();
