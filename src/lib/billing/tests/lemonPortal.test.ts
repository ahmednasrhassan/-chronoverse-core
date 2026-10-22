import assert from "node:assert/strict";
import { createLemonCustomerPortalV1, LemonPortalErrorV1, parseLemonCustomerPortalResponseV1, safeLemonPortalUrlV1, type LemonPortalDependenciesV1 } from "../lemonPortal";

async function main(): Promise<void> {
  let reads = 0;
  const dependencies = new Proxy({} as LemonPortalDependenciesV1, { get() { reads += 1; throw new Error("Unexpected portal dependency"); } });
  await assert.rejects(createLemonCustomerPortalV1(dependencies), (error) => error instanceof LemonPortalErrorV1 && error.code === "portal-disabled");
  await assert.rejects(createLemonCustomerPortalV1(), (error) => error instanceof LemonPortalErrorV1 && error.code === "portal-disabled");
  assert.equal(reads, 0);
  // Retain historical provider-response validation independently of disabled delivery.
  const url = "https://chronoverse.lemonsqueezy.com/billing?signature=fixture";
  const payload = { data: { type: "customers", id: "7001", attributes: { store_id: 294379, test_mode: false, urls: { customer_portal: url } } } };
  assert.equal(parseLemonCustomerPortalResponseV1(payload, "7001", "294379"), url);
  assert.equal(parseLemonCustomerPortalResponseV1(payload, "7002", "294379"), null);
  assert.equal(parseLemonCustomerPortalResponseV1(payload, "7001", "999"), null);
  assert.equal(parseLemonCustomerPortalResponseV1({ data: {} }, "7001", "294379"), null);
  for (const unsafe of ["", "javascript:alert(1)", "http://x.lemonsqueezy.com/billing", "https://user:pass@x.lemonsqueezy.com/billing", "https://x.lemonsqueezy.com:8443/billing", "https://lemonsqueezy.com.evil.example/billing", "https://x.lemonsqueezy.com/#billing"]) {
    assert.equal(safeLemonPortalUrlV1(unsafe), null);
  }
  console.log("PASS: disabled portal service retains historical URL and identity validation");
}

void main();
