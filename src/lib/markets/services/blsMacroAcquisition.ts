import {
  BlsTransportError, assertBlsTimeseriesRequestV1,
  type BlsTimeseriesLoaderV1, type BlsTimeseriesRequestV1,
} from "../providers/bls/client";
import {
  assertBlsMacroFamilyV1, BlsMacroSeriesValidationError,
  parseBlsMacroSeriesFactsV1, buildBlsCanonicalMacroSeriesV1,
  type BlsMacroFamilyV1,
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
