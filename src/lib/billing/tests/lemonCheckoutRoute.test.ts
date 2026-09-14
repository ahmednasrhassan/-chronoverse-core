import assert from "node:assert/strict";

import { createCheckoutRouteHandlerV1 } from "../../../app/api/billing/checkout/route";
import { AccessGuardErrorV1 } from "../../auth/guards";
import { LemonCheckoutErrorV1 } from "../lemonCheckout";

function request(body: string): Request {
  return new Request("https://chronoversecapital.com/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

async function main(): Promise<void> {
  const plans: string[] = [];
  const successHandler = createCheckoutRouteHandlerV1({
    createCheckout: async (plan) => {
      plans.push(plan);
      return "https://chronoverse.lemonsqueezy.com/checkout/custom/id";
    },
  });

  for (const plan of ["monthly", "annual"] as const) {
    const response = await successHandler(request(JSON.stringify({ plan })));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      url: "https://chronoverse.lemonsqueezy.com/checkout/custom/id",
    });
  }
  assert.deepEqual(plans, ["monthly", "annual"]);

  for (const body of [
    "not-json",
    "{}",
    JSON.stringify({ plan: "weekly" }),
    JSON.stringify({ plan: "monthly", variantId: "999" }),
    JSON.stringify({ plan: "monthly", productId: "999" }),
    JSON.stringify({ plan: "monthly", storeId: "999" }),
    JSON.stringify({ plan: "monthly", userId: "attacker" }),
  ]) {
    const response = await successHandler(request(body));
    assert.equal(response.status, 400);
  }

  let anonymousProviderCalls = 0;
  const anonymousHandler = createCheckoutRouteHandlerV1({
    createCheckout: async () => {
      anonymousProviderCalls += 1;
      throw new AccessGuardErrorV1("authentication-required");
    },
  });
  const anonymousResponse = await anonymousHandler(
    request(JSON.stringify({ plan: "monthly" })),
  );
  assert.equal(anonymousResponse.status, 401);
  assert.deepEqual(await anonymousResponse.json(), {
    ok: false,
    error: "authentication-required",
  });
  assert.equal(anonymousProviderCalls, 1);

  const unavailableHandler = createCheckoutRouteHandlerV1({
    createCheckout: async () => {
      throw new LemonCheckoutErrorV1("provider-unavailable");
    },
  });
  const unavailableResponse = await unavailableHandler(
    request(JSON.stringify({ plan: "monthly" })),
  );
  assert.equal(unavailableResponse.status, 503);
  const publicError = JSON.stringify(await unavailableResponse.json());
  assert.equal(publicError.includes("test-api-key"), false);
  assert.equal(publicError.includes("provider"), false);

  console.log("PASS: Lemon checkout route authentication and request boundary");
}

void main();
