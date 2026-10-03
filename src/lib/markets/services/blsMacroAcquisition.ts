import {
  BlsTransportError, assertBlsTimeseriesRequestV1,
  assertBlsLaborTimeseriesRequestV1,
  type BlsLaborTimeseriesLoaderV1, type BlsLaborTimeseriesRequestV1,
  type BlsTimeseriesLoaderV1, type BlsTimeseriesRequestV1,
} from "../providers/bls/client";
import {
  assertBlsMacroFamilyV1, BlsMacroSeriesValidationError,
  parseBlsMacroSeriesFactsV1, buildBlsCanonicalMacroSeriesV1,
  BLS_LABOR_FAMILIES_V1, type BlsLaborFamilyV1, type BlsMacroFamilyV1,
} from "../providers/bls/macroSeries";
import {
  BlsMacroSeriesVintagePersistenceError,
  type AppendBlsMacroSeriesVintageRedisResultV1,
} from "../persistence/blsMacroSeriesVintageRedis";
import type { CanonicalStatisticalSeriesV1 } from "./canonicalObservationSeries";

export interface BlsMacroAcquisitionDependenciesV1 {
  readonly loadResponse: BlsTimeseriesLoaderV1;
  /** Trusted completion clock, after validated source-fact normalization. */
  readonly nowUnixSeconds: () => number | Promise<number>;
  readonly appendVintage: (family: BlsMacroFamilyV1, series: CanonicalStatisticalSeriesV1) => Promise<AppendBlsMacroSeriesVintageRedisResultV1>;
}

export interface BlsLaborAcquisitionDependenciesV1 extends Omit<BlsMacroAcquisitionDependenciesV1, "loadResponse"> {
  readonly loadResponse: BlsLaborTimeseriesLoaderV1;
}
type BlsLaborPrePersistenceFailureV1 = Extract<BlsMacroAcquisitionResultV1,
  { status: "provider-failure" | "validation-failure" | "clock-failure" }>;
export type BlsLaborPersistenceOutcomeV1 = {
  readonly family: BlsLaborFamilyV1;
  readonly result: Exclude<BlsMacroAcquisitionResultV1, { status: "provider-failure" | "clock-failure" }>
    | { readonly status: "cancelled"; readonly code: "aborted" };
};
export type BlsLaborAcquisitionResultV1 = BlsLaborPrePersistenceFailureV1 | {
  /** Complete valid provider bundle. Consult every outcome for storage success. */
  readonly status: "provider-acquired";
  readonly fetchedAt: number;
  readonly outcomes: readonly BlsLaborPersistenceOutcomeV1[];
};

/** Inactive dependency-only bundle entry point. Three keys are NOT one transaction. */
export async function acquireBlsLaborBundleV1(
  request: BlsLaborTimeseriesRequestV1,
  signal: AbortSignal,
  dependencies: BlsLaborAcquisitionDependenciesV1,
): Promise<BlsLaborAcquisitionResultV1> {
  if (typeof window !== "undefined") throw new Error("BLS acquisition is server-only.");
  let captured: readonly { family: BlsLaborFamilyV1; series: CanonicalStatisticalSeriesV1 }[];
  let fetchedAt: number;
  try {
    assertBlsLaborTimeseriesRequestV1(request);
    if (signal.aborted) throw new BlsTransportError("aborted");
    const response = await dependencies.loadResponse(request, signal);
    const facts = BLS_LABOR_FAMILIES_V1.map((family) => ({
      family, observations: parseBlsMacroSeriesFactsV1(family, response, request),
    }));
    if (signal.aborted) throw new BlsTransportError("aborted");
    // The whole provider response is validated before this trusted completion boundary.
    fetchedAt = await dependencies.nowUnixSeconds();
    if (!Number.isSafeInteger(fetchedAt) || fetchedAt < 0) return Object.freeze({ status: "clock-failure" });
    if (signal.aborted) throw new BlsTransportError("aborted");
    captured = facts.map(({ family, observations }) => ({
      family, series: buildBlsCanonicalMacroSeriesV1(family, observations, fetchedAt),
    }));
  } catch (error) {
    if (error instanceof BlsMacroSeriesValidationError) return Object.freeze({ status: "validation-failure", code: error.code });
    if (error instanceof BlsTransportError) {
      return error.code === "schema" || error.code === "invalid-request"
        ? Object.freeze({ status: "validation-failure", code: error.code })
        : Object.freeze({ status: "provider-failure", code: error.code });
    }
    throw error;
  }
  const outcomes: BlsLaborPersistenceOutcomeV1[] = [];
  for (const { family, series } of captured) {
    if (signal.aborted) {
      outcomes.push(Object.freeze({ family, result: Object.freeze({ status: "cancelled", code: "aborted" }) }));
      continue;
    }
    let result: BlsLaborPersistenceOutcomeV1["result"];
    try {
      const persistence = await dependencies.appendVintage(family, series);
      switch (persistence.status) {
        case "initialized": case "advanced": result = Object.freeze({ status: "acquired", persistence }); break;
        case "unchanged": result = Object.freeze({ status: "unchanged", persistence }); break;
        case "stale": result = Object.freeze({ status: "stale", persistence }); break;
        case "conflict": result = Object.freeze({ status: "conflict", persistence }); break;
      }
    } catch (error) {
      if (!(error instanceof BlsMacroSeriesVintagePersistenceError)) throw error;
      result = error.code === "invalid-current"
        ? Object.freeze({ status: "validation-failure", code: error.code })
        : Object.freeze({ status: "persistence-failure", code: error.code });
    }
    // Expected storage failures do not hide or roll back other immutable successes.
    outcomes.push(Object.freeze({ family, result }));
  }
  return Object.freeze({ status: "provider-acquired", fetchedAt, outcomes: Object.freeze(outcomes) });
}
export type BlsMacroAcquisitionResultV1 =
  | { readonly status: "acquired"; readonly persistence: Extract<AppendBlsMacroSeriesVintageRedisResultV1, { status: "initialized" | "advanced" }> }
  | { readonly status: "unchanged"; readonly persistence: Extract<AppendBlsMacroSeriesVintageRedisResultV1, { status: "unchanged" }> }
  | { readonly status: "stale"; readonly persistence: Extract<AppendBlsMacroSeriesVintageRedisResultV1, { status: "stale" }> }
  | { readonly status: "conflict"; readonly persistence: Extract<AppendBlsMacroSeriesVintageRedisResultV1, { status: "conflict" }> }
  | { readonly status: "provider-failure"; readonly code: BlsTransportError["code"] }
  | { readonly status: "validation-failure"; readonly code: BlsMacroSeriesValidationError["code"] | "invalid-request" | "schema" | "invalid-current" }
  | { readonly status: "persistence-failure"; readonly code: BlsMacroSeriesVintagePersistenceError["code"] }
  | { readonly status: "clock-failure" };

/** Explicit inactive dependency-only entry point; no registration, timers or runtime caller. */
export async function acquireBlsMacroSeriesV1(
  family: BlsMacroFamilyV1,
  request: BlsTimeseriesRequestV1,
  signal: AbortSignal,
  dependencies: BlsMacroAcquisitionDependenciesV1,
): Promise<BlsMacroAcquisitionResultV1> {
  if (typeof window !== "undefined") throw new Error("BLS acquisition is server-only.");
  try {
    assertBlsMacroFamilyV1(family);
    assertBlsTimeseriesRequestV1(request);
    if (signal.aborted) throw new BlsTransportError("aborted");
    const response = await dependencies.loadResponse(request, signal);
    const observations = parseBlsMacroSeriesFactsV1(family, response, request);
    // Reading and source-fact validation finish before the capture boundary is sampled.
    if (signal.aborted) throw new BlsTransportError("aborted");
    const fetchedAt = await dependencies.nowUnixSeconds();
    if (!Number.isSafeInteger(fetchedAt) || fetchedAt < 0) return Object.freeze({ status: "clock-failure" });
    if (signal.aborted) throw new BlsTransportError("aborted");
    const series = buildBlsCanonicalMacroSeriesV1(family, observations, fetchedAt);
    const persistence = await dependencies.appendVintage(family, series);
    switch (persistence.status) {
      case "initialized": case "advanced": return Object.freeze({ status: "acquired", persistence });
      case "unchanged": return Object.freeze({ status: "unchanged", persistence });
      case "stale": return Object.freeze({ status: "stale", persistence });
      case "conflict": return Object.freeze({ status: "conflict", persistence });
    }
  } catch (error) {
    if (error instanceof BlsMacroSeriesValidationError) return Object.freeze({ status: "validation-failure", code: error.code });
    if (error instanceof BlsTransportError) {
      if (error.code === "schema" || error.code === "invalid-request") {
        return Object.freeze({ status: "validation-failure", code: error.code });
      }
      return Object.freeze({ status: "provider-failure", code: error.code });
    }
    if (error instanceof BlsMacroSeriesVintagePersistenceError) {
      return error.code === "invalid-current"
        ? Object.freeze({ status: "validation-failure", code: error.code })
        : Object.freeze({ status: "persistence-failure", code: error.code });
    }
    throw error;
  }
}
