import "server-only";

import {
  AccessGuardErrorV1,
  requireVipV1,
  type VipAuthorizedAccessV1,
} from "@/lib/auth/guards";
import type {
  MarketProductVipDeepProjectionV1,
} from "../projections/types";
import {
  getFiveProductVipDeepProjectionV1,
} from "./canonicalProductResults";
import type { CanonicalProductIdV1 } from
  "./canonicalProductResultOwnership";

export interface VipDeepApiDependenciesV1 {
  readonly requireVip: () => PromiseLike<VipAuthorizedAccessV1>;
  readonly loadDeep: () => PromiseLike<MarketProductVipDeepProjectionV1>;
}

/** Authorizes first, then invokes the shared event-aware Deep service. */
export async function handleVipDeepApiRequestV1(
  dependencies: VipDeepApiDependenciesV1,
): Promise<Response> {
  try {
    await dependencies.requireVip();
  } catch (error) {
    return accessFailureResponseV1(error);
  }

  try {
    const projection = await dependencies.loadDeep();

    return Response.json(projection, {
      status: projection.availability === "unavailable" ? 503 : 200,
    });
  } catch {
    return Response.json(
      { ok: false, error: "market-data-unavailable" },
      { status: 500 },
    );
  }
}

/** Five-product route adapter; it owns no canonical or identity cache. */
export function getFiveProductVipDeepResponseV1(
  productId: CanonicalProductIdV1,
): Promise<Response> {
  switch (productId) {
    case "eurusd":
      return handleProductV1("eurusd");
    case "eurjpy":
      return handleProductV1("eurjpy");
    case "eurgbp":
      return handleProductV1("eurgbp");
    case "eurchf":
      return handleProductV1("eurchf");
    case "estr":
      return handleProductV1("estr");
  }
}

function handleProductV1<TProductId extends CanonicalProductIdV1>(
  productId: TProductId,
): Promise<Response> {
  return handleVipDeepApiRequestV1({
    requireVip: requireVipV1,
    loadDeep: () => getFiveProductVipDeepProjectionV1(productId),
  });
}

function accessFailureResponseV1(error: unknown): Response {
  if (error instanceof AccessGuardErrorV1) {
    if (error.code === "authentication-required") {
      return Response.json(
        { ok: false, error: "authentication-required" },
        { status: 401 },
      );
    }

    if (error.code === "vip-required") {
      return Response.json(
        { ok: false, error: "vip-required" },
        { status: 403 },
      );
    }
  }

  return Response.json(
    { ok: false, error: "access-unavailable" },
    { status: 500 },
  );
}
