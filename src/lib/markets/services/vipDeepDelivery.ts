import "server-only";

import type { VipAuthorizedAccessV1 } from "@/lib/auth/guards";
import type { MarketProductVipDeepProjectionV1 } from "../projections/types";
import type { CanonicalProductIdV1 } from "./canonicalProductResultOwnership";

// Retain the boundary contract so callers can prove no dependency is touched.
export interface VipDeepApiDependenciesV1 {
  readonly requireVip: () => PromiseLike<VipAuthorizedAccessV1>;
  readonly loadDeep: () => PromiseLike<MarketProductVipDeepProjectionV1>;
}

// The former authorized delivery implementation is archived. Public API routes
// remain permanently retired and import no authentication or engine runtime.
export async function handleVipDeepApiRequestV1(
  dependencies: VipDeepApiDependenciesV1,
): Promise<Response> {
  void dependencies;
  return retiredDeepResponse();
}

export async function getFiveProductVipDeepResponseV1(
  productId: CanonicalProductIdV1,
): Promise<Response> {
  void productId;
  return retiredDeepResponse();
}

function retiredDeepResponse(): Response {
  return Response.json({ ok: false, error: "not-found" }, {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}
