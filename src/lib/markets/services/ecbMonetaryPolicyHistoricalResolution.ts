import { parseEventInstantV1 } from "../events/eventClock";
import type {
  FiveProductCanonicalProjectionInputV1,
  MarketProductVipEcbPolicyEventStateV1,
} from "../projections/types";

export interface HistoricalEcbMonetaryPolicyOwnershipUnavailableV1 {
  readonly status: "historical-ownership-unavailable";
  readonly reason: "ownership-not-recorded";
  readonly evaluatedAt: string;
}

export type HistoricalEcbMonetaryPolicyResolverV1 = (input: {
  readonly evaluatedAt: string;
}) => HistoricalEcbMonetaryPolicyOwnershipUnavailableV1 |
  PromiseLike<HistoricalEcbMonetaryPolicyOwnershipUnavailableV1>;

/**
 * Historical ownership is not recorded in the existing canonical results or
 * persistence. Per-event snapshots prove possession, not which event owned a
 * past evaluation. Without that binding, no identity or evidence is admissible.
 * This resolver deliberately has no live calendar, active-pointer or memory
 * dependencies and performs no acquisition, progression or historical guessing.
 */
export function resolveHistoricalEcbMonetaryPolicyEventV1(input: {
  readonly evaluatedAt: string;
}): HistoricalEcbMonetaryPolicyOwnershipUnavailableV1 {
  const evaluatedAt = new Date(parseEventInstantV1(input.evaluatedAt, "evaluatedAt")).toISOString();
  return Object.freeze({
    status: "historical-ownership-unavailable",
    reason: "ownership-not-recorded",
    evaluatedAt,
  });
}

/** The canonical computation owns the cutoff; delivery freshness owns no evidence. */
export async function resolveVipEcbPolicyEventForCanonicalV1(
  input: FiveProductCanonicalProjectionInputV1,
  resolveHistory: HistoricalEcbMonetaryPolicyResolverV1 = resolveHistoricalEcbMonetaryPolicyEventV1,
  events = new Map<string, Promise<MarketProductVipEcbPolicyEventStateV1>>(),
): Promise<MarketProductVipEcbPolicyEventStateV1> {
  let evaluatedAt: string;
  try {
    if (input.canonical.availability !== "available") throw new TypeError();
    const cutoff = input.productId === "estr"
      ? input.canonical.data.temporalQualification?.evaluatedAt
      : input.canonical.engineResult.evaluatedAt;
    if (typeof cutoff !== "string") throw new TypeError();
    evaluatedAt = new Date(parseEventInstantV1(cutoff, "evaluatedAt")).toISOString();
  } catch {
    return Object.freeze({ status: "runtime-unavailable",
      reason: "canonical-evaluation-time-unavailable" });
  }
  let event = events.get(evaluatedAt);
  if (event === undefined) {
    event = Promise.resolve().then(() => resolveHistory({ evaluatedAt })).catch(() =>
      Object.freeze({ status: "runtime-unavailable" as const,
        reason: "unexpected-runtime-error" as const }));
    events.set(evaluatedAt, event);
  }
  return event;
}
