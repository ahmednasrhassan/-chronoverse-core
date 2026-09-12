import type { CanonicalProductIdV1 } from
  "../services/canonicalProductResultOwnership";

export const VIP_MARKET_IDS_V1 = Object.freeze([
  "eurusd",
  "eurjpy",
  "eurgbp",
  "eurchf",
  "estr",
] as const satisfies readonly CanonicalProductIdV1[]);

const VIP_MARKET_ID_SET_V1 = new Set<CanonicalProductIdV1>(VIP_MARKET_IDS_V1);

export function selectVipMarketV1(
  candidate: string | readonly string[] | undefined,
): CanonicalProductIdV1 {
  if (typeof candidate !== "string") {
    return "eurusd";
  }

  return VIP_MARKET_ID_SET_V1.has(candidate as CanonicalProductIdV1)
    ? candidate as CanonicalProductIdV1
    : "eurusd";
}
