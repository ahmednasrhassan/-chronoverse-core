import "server-only";

import {
  AccessGuardErrorV1,
  requireVipV1,
  type VipAuthorizedAccessV1,
} from "@/lib/auth/guards";
import {
  projectFiveProductVipDeepV1,
} from "../projections/fiveProductProjections";
import type {
  MarketProductVipDeepProjectionV1,
} from "../projections/types";
import {
  getCanonicalProductResultV1,
  type CanonicalProductResultMapV1,
} from "./canonicalProductResults";
import type { CanonicalProductIdV1 } from
  "./canonicalProductResultOwnership";

export interface VipDeepApiDependenciesV1<TCanonical> {
  readonly requireVip: () => PromiseLike<VipAuthorizedAccessV1>;
  readonly loadCanonical: () => PromiseLike<TCanonical>;
  readonly buildProjection: (
    canonical: TCanonical,
  ) => MarketProductVipDeepProjectionV1;
}

/** Authorizes first, then reads shared truth and builds the Deep projection. */
export async function handleVipDeepApiRequestV1<TCanonical>(
  dependencies: VipDeepApiDependenciesV1<TCanonical>,
): Promise<Response> {
  try {
    await dependencies.requireVip();
  } catch (error) {
    return accessFailureResponseV1(error);
  }

  try {
    const canonical = await dependencies.loadCanonical();
    const projection = dependencies.buildProjection(canonical);

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
    loadCanonical: () => getCanonicalProductResultV1(productId),
    buildProjection: (canonical) => projectProductV1(productId, canonical),
  });
}

function projectProductV1<TProductId extends CanonicalProductIdV1>(
  productId: TProductId,
  canonical: CanonicalProductResultMapV1[TProductId],
): MarketProductVipDeepProjectionV1 {
  switch (productId) {
    case "eurusd":
      return projectFiveProductVipDeepV1({
        productId,
        canonical: canonical as CanonicalProductResultMapV1["eurusd"],
      });
    case "eurjpy":
      return projectFiveProductVipDeepV1({
        productId,
        canonical: canonical as CanonicalProductResultMapV1["eurjpy"],
      });
    case "eurgbp":
      return projectFiveProductVipDeepV1({
        productId,
        canonical: canonical as CanonicalProductResultMapV1["eurgbp"],
      });
    case "eurchf":
      return projectFiveProductVipDeepV1({
        productId,
        canonical: canonical as CanonicalProductResultMapV1["eurchf"],
      });
    case "estr":
      return projectFiveProductVipDeepV1({
        productId,
        canonical: canonical as CanonicalProductResultMapV1["estr"],
      });
  }
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
