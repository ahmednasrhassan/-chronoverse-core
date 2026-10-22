import assert from "node:assert/strict";
import { createLemonCheckoutV1, LemonCheckoutErrorV1, parseLemonCheckoutRequestV1, type LemonCheckoutDependenciesV1 } from "../lemonCheckout";

async function main(): Promise<void> {

  let reads = 0;
  const dependencies = new Proxy({} as LemonCheckoutDependenciesV1, { get() {
    reads += 1;
    throw new Error("Disabled service must not read identity, configuration, credentials or fetch");
  } });
  for (const plan of ["monthly", "annual"] as const) {
    await assert.rejects(createLemonCheckoutV1(plan, dependencies), (error) =>
      error instanceof LemonCheckoutErrorV1 && error.code === "checkout-disabled");
    await assert.rejects(createLemonCheckoutV1(plan), (error) =>
      error instanceof LemonCheckoutErrorV1 && error.code === "checkout-disabled");
  }
  assert.equal(reads, 0);
  assert.equal(parseLemonCheckoutRequestV1({ plan: "monthly" }), "monthly");
  assert.equal(parseLemonCheckoutRequestV1({ plan: "annual" }), "annual");
  for (const value of [null, [], {}, { plan: "weekly" }, { plan: "monthly", userId: "forged" }, { plan: "annual", variantId: "1" }]) {
    assert.equal(parseLemonCheckoutRequestV1(value), null);
  }
  console.log("PASS: shared checkout service fails closed without credentials or dependency access");
}

void main();
