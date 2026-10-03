import { assertBeaServerV1, assertBeaRequestV1, BeaTransportError, type BeaLoaderV1, type BeaRequestV1 } from "../providers/bea/client";
import { BEA_PCE_FAMILIES_V1, BeaMacroSeriesValidationError, parseBeaMacroSeriesFactsV1, buildBeaCanonicalMacroSeriesV1,
  type BeaMacroFamilyV1,
} from "../providers/bea/macroSeries";
import { BeaMacroSeriesVintagePersistenceError } from "../persistence/beaMacroSeriesVintageRedis";
import type { AppendCanonicalStatisticalSeriesVintageRedisResultV1 } from "../persistence/canonicalStatisticalSeriesVintageRedis";
import type { CanonicalStatisticalSeriesV1 } from "./canonicalObservationSeries";

export interface BeaMacroAcquisitionDependenciesV1 {
  readonly loadResponse: BeaLoaderV1;
  readonly nowUnixSeconds: () => number | Promise<number>;
  readonly appendVintage: (family: BeaMacroFamilyV1, series: CanonicalStatisticalSeriesV1) => Promise<AppendCanonicalStatisticalSeriesVintageRedisResultV1>;
}
export type BeaPersistenceOutcomeV1 = {
  readonly family: BeaMacroFamilyV1;
  readonly result:
    | { readonly status: "acquired" | "unchanged" | "stale" | "conflict"; readonly persistence: AppendCanonicalStatisticalSeriesVintageRedisResultV1 }
    | { readonly status: "persistence-failure" | "validation-failure"; readonly code: BeaMacroSeriesVintagePersistenceError["code"] }
    | { readonly status: "cancelled"; readonly code: "aborted" };
};
export type BeaAcquisitionResultV1 =
  | { readonly status: "provider-acquired"; readonly fetchedAt: number; readonly outcomes: readonly BeaPersistenceOutcomeV1[] }
  | { readonly status: "provider-failure"; readonly code: BeaTransportError["code"] }
  | { readonly status: "validation-failure"; readonly code: BeaMacroSeriesValidationError["code"] | "schema" | "invalid-request" }
  | { readonly status: "clock-failure" }
  | { readonly status: "cancelled"; readonly code: "aborted" };

/** One T10106 response; no implied acquisition transaction with T20804. */
export function acquireBeaRealGdpV1(request: BeaRequestV1, signal: AbortSignal, dependencies: BeaMacroAcquisitionDependenciesV1): Promise<BeaAcquisitionResultV1> {
  return acquireUnit(request, signal, dependencies, ["real-gdp"], "T10106");
}
/** One T20804 response; BOTH selected lines validated before the clock or either append. */
export function acquireBeaPceBundleV1(request: BeaRequestV1, signal: AbortSignal, dependencies: BeaMacroAcquisitionDependenciesV1): Promise<BeaAcquisitionResultV1> {
  return acquireUnit(request, signal, dependencies, BEA_PCE_FAMILIES_V1, "T20804");
}
async function acquireUnit(request: BeaRequestV1, signal: AbortSignal, dependencies: BeaMacroAcquisitionDependenciesV1,
  families: readonly BeaMacroFamilyV1[], tableName: "T10106" | "T20804",
): Promise<BeaAcquisitionResultV1> {
  assertBeaServerV1();
  let fetchedAt: number;
  let captured: readonly { family: BeaMacroFamilyV1; series: CanonicalStatisticalSeriesV1 }[];
  try {
    if (signal.aborted) return Object.freeze({ status: "cancelled", code: "aborted" });
    assertBeaRequestV1(request);
    if (request.tableName !== tableName) throw new BeaTransportError("invalid-request");
    const response = await dependencies.loadResponse(request, signal);
    if (signal.aborted) return Object.freeze({ status: "cancelled", code: "aborted" });
    const facts = families.map((family) => ({ family, facts: parseBeaMacroSeriesFactsV1(family, response, request) }));
    if (signal.aborted) return Object.freeze({ status: "cancelled", code: "aborted" });
    try { fetchedAt = await dependencies.nowUnixSeconds(); }
    catch (error) {
      if (error instanceof TypeError || error instanceof ReferenceError) throw error;
      return Object.freeze({ status: "clock-failure" });
    }
    if (!Number.isSafeInteger(fetchedAt) || fetchedAt < 0) return Object.freeze({ status: "clock-failure" });
    if (signal.aborted) return Object.freeze({ status: "cancelled", code: "aborted" });
    captured = facts.map(({ family, facts }) => ({ family, series: buildBeaCanonicalMacroSeriesV1(family, facts, fetchedAt) }));
  } catch (error) {
    if (error instanceof BeaMacroSeriesValidationError) return Object.freeze({ status: "validation-failure", code: error.code });
    if (error instanceof BeaTransportError) {
      if (error.code === "aborted") return Object.freeze({ status: "cancelled", code: "aborted" });
      return error.code === "schema" || error.code === "invalid-request"
        ? Object.freeze({ status: "validation-failure", code: error.code })
        : Object.freeze({ status: "provider-failure", code: error.code });
    }
    throw error;
  }
  const outcomes: BeaPersistenceOutcomeV1[] = [];
  for (const { family, series } of captured) {
    if (signal.aborted) {
      outcomes.push(Object.freeze({ family, result: Object.freeze({ status: "cancelled", code: "aborted" }) }));
      continue;
    }
    let result: BeaPersistenceOutcomeV1["result"];
    try {
      const persistence = await dependencies.appendVintage(family, series);
      result = Object.freeze({ status: persistence.status === "initialized" || persistence.status === "advanced" ? "acquired" : persistence.status, persistence });
    } catch (error) {
      if (!(error instanceof BeaMacroSeriesVintagePersistenceError)) throw error;
      result = Object.freeze({ status: error.code === "invalid-current" ? "validation-failure" : "persistence-failure", code: error.code });
    }
    // An already-started append can succeed despite cancellation. Never imply rollback.
    outcomes.push(Object.freeze({ family, result }));
  }
  return Object.freeze({ status: "provider-acquired", fetchedAt, outcomes: Object.freeze(outcomes) });
}