import assert from "node:assert/strict";
import { handleVipDeepApiRequestV1, getFiveProductVipDeepResponseV1, type VipDeepApiDependenciesV1 } from "../../services/vipDeepDelivery";
import { GET as eurusd } from "../../../../app/api/markets/eurusd/intelligence/route";
import { GET as eurjpy } from "../../../../app/api/markets/eurjpy/intelligence/route";
import { GET as eurgbp } from "../../../../app/api/markets/eurgbp/intelligence/route";
import { GET as eurchf } from "../../../../app/api/markets/eurchf/intelligence/route";
import { GET as estr } from "../../../../app/api/markets/estr/intelligence/route";

async function main(): Promise<void> {
  let reads = 0;
  for (const role of ["anonymous", "user", "vip_active", "admin", "owner"]) {
    const dependencies = new Proxy({} as VipDeepApiDependenciesV1, { get() {
      reads += 1;
      throw new Error(`No identity or Deep reads allowed for ${role}`);
    } });
    const response = await handleVipDeepApiRequestV1(dependencies);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { ok: false, error: "not-found" });
  }
  assert.equal(reads, 0);
  for (const productId of ["eurusd", "eurjpy", "eurgbp", "eurchf", "estr"] as const) {
    const response = await getFiveProductVipDeepResponseV1(productId);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  for (const handler of [eurusd, eurjpy, eurgbp, eurchf, estr]) {
    const response = await handler();
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.doesNotMatch(await response.text(), /confidence|technical|provenance|engine|signal|risk/);
  }
  console.log("PASS: all five Deep APIs deny every identity before authentication or data loading");
}

void main();
