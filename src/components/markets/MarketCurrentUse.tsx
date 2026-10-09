import type { MarketProductProjectionV1 } from "@/lib/markets/projections/types";

/** Presentation only: the projection owns eligibility; no clock or data work here. */
export function isCurrentUseEligible(projection: MarketProductProjectionV1 | null): boolean {
  return projection?.availability === "available" && projection.currentUse?.status === "eligible";
}

export function analysisLabel(projection: MarketProductProjectionV1, label: string): string {
  return isCurrentUseEligible(projection) ? label : `Prior ${label.toLowerCase()}`;
}

export default function MarketCurrentUse({ projection, productKind }: {
  readonly projection: MarketProductProjectionV1 | null;
  readonly productKind?: "fx" | "rate";
}) {
  const currentUse = projection?.currentUse;
  const eligible = isCurrentUseEligible(projection);
  const context = (projection?.productKind ?? productKind) === "rate" ? "rate context" : "analytical posture";
  const explanation = currentUse?.status === "stale"
    ? "Evidence is stale."
    : currentUse?.status === "unavailable" || projection === null
      ? "Source or result is unavailable."
      : currentUse?.reason === "assessment-time-unavailable"
        ? "Assessment time is unavailable."
        : currentUse?.reason === "provenance-incomplete"
          ? "Freshness provenance is incomplete."
          : "Freshness is unknown.";
  const evaluatedAt = projection?.availability === "available" &&
      projection.tier === "vip-deep" && projection.productKind === "fx"
    ? projection.details.engine.evaluatedAt
    : null;

  return (
    <div
      data-current-use={currentUse?.status ?? "unavailable"}
      className="my-3 border-l-2 border-[#C8A7E8]/60 pl-3 text-xs leading-5 text-[#CFC5B8]"
    >
      <p className="font-semibold text-[#F3EBDD]">
        {eligible ? `Current ${context} eligible` : `WAIT / Current ${context} unavailable`}
      </p>
      <p>{eligible ? "Evidence is within cadence; analytical qualifications still apply." : explanation}</p>
      {!eligible && projection?.availability === "available" ? (
        <p>
          Prior analysis / {evaluatedAt !== null && Number.isFinite(Date.parse(evaluatedAt)) ? `Evaluated ${evaluatedAt}` : `Reference ${projection.referenceDate}`}
        </p>
      ) : null}
      {currentUse?.assessedAt ? <p>Assessed {currentUse.assessedAt}</p> : null}
    </div>
  );
}
