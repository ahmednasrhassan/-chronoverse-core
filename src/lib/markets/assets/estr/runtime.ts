import type { CanonicalObservationSeriesMetadataV1 } from
  "../../services/canonicalObservationSeries";
import {
  ECB_ESTR_DATAFLOW_V1,
  ECB_ESTR_SERIES_KEY_V1,
} from "../../providers/ecb/estrContract";
import { getCanonicalEcbEstrSourceV1 } from
  "../../providers/ecb/estrSeriesCache";
import type {
  EcbEstrObservationMetadataV1,
  EcbEstrSeriesV1,
} from "../../providers/ecb/estrTypes";
import {
  calculateRateFeaturesV1,
  type RateFeatureSnapshotV1,
} from "../../indicators/rateFeatures";
import { CANONICAL_TEMPORAL_ADMISSION_POLICY_VERSION_V1 } from
  "../../services/canonicalTemporalAdmission";
import {
  qualifyCanonicalTemporalSourceV1,
  validateCanonicalTemporalQualificationV1,
  type CanonicalTemporalQualificationEnvelopeV1,
  type CanonicalTemporalQualificationRejectionReasonV1,
} from "../../services/canonicalTemporalQualification";

import {
  adaptEstrRateMarketStateToEngineV3,
  type EstrRateEngineV3AdapterResultV1,
} from "./engineAdapter";
import {
  calculateEstrRateMarketStateV1,
  type EstrRateMarketStateResultV1,
} from "./marketState";
import {
  calculateEstrRateRiskV1,
  type EstrRateRiskResultV1,
} from "./risk";
import {
  calculateEstrRateSignalV1,
  type EstrRateSignalResultV1,
} from "./signal";

export const ESTR_RUNTIME_MINIMUM_HISTORY_V1 = 200;

export type EstrProductionRuntimeMissingFieldV1 =
  | "source"
  | "sourceIdentity"
  | "temporal"
  | "history"
  | "features"
  | "signal"
  | "risk"
  | "marketState"
  | "engineAdapter";

type AvailableEstrSignal = Extract<
  EstrRateSignalResultV1,
  { readonly availability: "available" }
>;
type AvailableEstrRisk = Extract<
  EstrRateRiskResultV1,
  { readonly availability: "available" }
>;
type AvailableEstrMarketState = Extract<
  EstrRateMarketStateResultV1,
  { readonly availability: "available" }
>;
type AvailableEstrEngineAdapter = Extract<
  EstrRateEngineV3AdapterResultV1,
  { readonly availability: "available" }
>;

export interface EstrProductionRuntimeSourceV1 {
  readonly dataflow: typeof ECB_ESTR_DATAFLOW_V1;
  readonly seriesKey: typeof ECB_ESTR_SERIES_KEY_V1;
  readonly provenance: CanonicalObservationSeriesMetadataV1;
  readonly latestObservationMetadata: EcbEstrObservationMetadataV1;
}

export interface EstrProductionRuntimeDataV1 {
  /** Present on fresh qualified computations; legacy results remain representable. */
  readonly temporalQualification?: CanonicalTemporalQualificationEnvelopeV1;
  readonly productId: "estr";
  readonly product: "€STR";
  /** Latest official reference-rate level in percentage points. */
  readonly currentRatePercent: number;
  readonly latestReferenceDate: string;
  /** Latest official ECB reference date encoded as UTC midnight. */
  readonly sourceTimestamp: number;
  readonly fetchedAt: number;
  readonly source: EstrProductionRuntimeSourceV1;
  readonly features: RateFeatureSnapshotV1;
  readonly signal: AvailableEstrSignal;
  readonly risk: AvailableEstrRisk;
  readonly marketState: AvailableEstrMarketState;
  readonly engineAdapter: AvailableEstrEngineAdapter;
}

export type EstrProductionRuntimeResultV1 =
  | {
      readonly availability: "available";
      readonly data: EstrProductionRuntimeDataV1;
    }
  | {
      readonly availability: "unavailable";
      readonly reason: string;
      readonly missing: readonly EstrProductionRuntimeMissingFieldV1[];
    }
  | EstrProductionRuntimeTemporalUnavailableV1;

export interface EstrProductionRuntimeTemporalUnavailableV1 {
  readonly availability: "unavailable";
  readonly productId: "estr";
  readonly reason: CanonicalTemporalQualificationRejectionReasonV1;
  readonly policyVersion: typeof CANONICAL_TEMPORAL_ADMISSION_POLICY_VERSION_V1;
  readonly missing: readonly ["temporal"];
}

export interface EstrProductionRuntimeDependenciesV1 {
  readonly loadSource?: () => Promise<EcbEstrSeriesV1>;
  readonly evaluatedAt?: string;
  readonly now?: () => Date;
}

/**
 * Runs the server-side €STR production pipeline from one cached official source.
 * The default loader is the shared daily ECB full-history cache.
 */
export async function getEstrProductionRuntimeV1(
  dependencies: EstrProductionRuntimeDependenciesV1 = {},
): Promise<EstrProductionRuntimeResultV1> {
  // Capture caller-owned dependencies synchronously. An explicitly undefined or
  // malformed cutoff is never replaced by an acquisition-completion clock.
  let captured: CapturedEstrDependencies;
  try {
    captured = captureDependencies(dependencies);
  } catch {
    return temporalUnavailable("invalid-input");
  }
  let source: EcbEstrSeriesV1;

  try {
    const loadSource = captured.loadSource;
    source = await loadSource();
  } catch {
    return unavailable(
      "Official ECB €STR source is unavailable.",
      "source",
    );
  }

  let evaluatedAt = captured.evaluatedAt;
  if (!captured.hasCutoff) {
    try {
      // Sample the original clock exactly once, after complete acquisition.
      const now = captured.now!;
      evaluatedAt = Date.prototype.toISOString.call(now());
    } catch {
      return temporalUnavailable("invalid-evaluation-instant");
    }
  }

  // The approved helper sees the original COMPLETE wrapper before any structural
  // reads or analytical work. No normalization, selection, or truncation occurs.
  const admitted = qualifyCanonicalTemporalSourceV1({ productId: "estr", source,
    evaluatedAt: evaluatedAt as string });
  if (admitted.status === "rejected") return temporalUnavailable(admitted.reason);

  let temporalQualification: CanonicalTemporalQualificationEnvelopeV1;
  try {
    const ownedSource = structuredClone(source);
    const verified = validateCanonicalTemporalQualificationV1(admitted.qualification,
      { productId: "estr", source: ownedSource, evaluatedAt: evaluatedAt as string });
    if (verified.status === "rejected") return temporalUnavailable(verified.reason);
    freezeOwnedSource(ownedSource);
    source = ownedSource;
    temporalQualification = verified.qualification;
  } catch {
    return temporalUnavailable("invalid-input");
  }

  const observations = source.canonicalSeries.observations;

  if (observations.length < ESTR_RUNTIME_MINIMUM_HISTORY_V1) {
    return unavailable(
      `Official ECB €STR history requires at least ${ESTR_RUNTIME_MINIMUM_HISTORY_V1} observations.`,
      "history",
    );
  }

  let features: RateFeatureSnapshotV1;

  try {
    features = calculateRateFeaturesV1(observations);
  } catch {
    return unavailable(
      "Official ECB €STR rate features are unavailable.",
      "features",
    );
  }

  const signal = calculateEstrRateSignalV1(features);
  if (signal.availability === "unavailable") {
    return unavailable(signal.reason, "signal");
  }

  const risk = calculateEstrRateRiskV1(features);
  if (risk.availability === "unavailable") {
    return unavailable(risk.reason, "risk");
  }

  const marketState = calculateEstrRateMarketStateV1(features, {
    signal,
    risk,
  });
  if (marketState.availability === "unavailable") {
    return unavailable(marketState.reason, "marketState");
  }

  const engineAdapter = adaptEstrRateMarketStateToEngineV3({ marketState });
  if (engineAdapter.availability === "unavailable") {
    return unavailable(engineAdapter.reason, "engineAdapter");
  }

  const provenance = source.canonicalSeries.metadata;
  const latestObservationMetadata = source.observationMetadata.at(-1)!;

  return Object.freeze({
    availability: "available",
    data: Object.freeze({
      temporalQualification,
      productId: "estr",
      product: "€STR",
      currentRatePercent: features.currentRate,
      latestReferenceDate: latestObservationMetadata.referenceDate,
      sourceTimestamp: provenance.sourceTimestamp!,
      fetchedAt: provenance.fetchedAt,
      source: Object.freeze({
        dataflow: source.dataflow,
        seriesKey: source.seriesKey,
        provenance,
        latestObservationMetadata,
      }),
      features,
      signal,
      risk,
      marketState,
      engineAdapter,
    }),
  });
}

interface CapturedEstrDependencies {
  readonly hasCutoff: boolean;
  readonly evaluatedAt: unknown;
  readonly loadSource: () => Promise<EcbEstrSeriesV1>;
  readonly now?: () => Date;
}

function captureDependencies(dependencies: EstrProductionRuntimeDependenciesV1): CapturedEstrDependencies {
  if (dependencies === null || typeof dependencies !== "object") throw new TypeError("Invalid dependencies");
  const prototype = Object.getPrototypeOf(dependencies);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError("Invalid dependency prototype");
  const values: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(dependencies)) {
    if (key !== "loadSource" && key !== "evaluatedAt" && key !== "now") throw new TypeError("Invalid dependency key");
    const descriptor = Object.getOwnPropertyDescriptor(dependencies, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new TypeError("Invalid dependency property");
    values[key] = descriptor.value;
  }
  for (const key of ["loadSource", "evaluatedAt", "now"] as const) {
    if (key in dependencies && !Object.hasOwn(values, key)) throw new TypeError("Inherited dependency");
  }
  const hasCutoff = Object.hasOwn(values, "evaluatedAt");
  if (values.evaluatedAt !== null && values.evaluatedAt !== undefined &&
    !["string", "number", "boolean"].includes(typeof values.evaluatedAt)) throw new TypeError("Executable cutoff");
  if ((values.loadSource !== undefined && typeof values.loadSource !== "function") ||
    (values.now !== undefined && typeof values.now !== "function")) throw new TypeError("Invalid dependency callback");
  return Object.freeze({
    hasCutoff,
    evaluatedAt: values.evaluatedAt,
    loadSource: (values.loadSource as CapturedEstrDependencies["loadSource"] | undefined) ?? getCanonicalEcbEstrSourceV1,
    now: hasCutoff ? undefined : (values.now as (() => Date) | undefined) ?? (() => new Date()),
  });
}

/** Only independently cloned and revalidated passive data reaches this walk. */
function freezeOwnedSource(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  for (const child of Object.values(value)) freezeOwnedSource(child);
  Object.freeze(value);
}

function temporalUnavailable(
  reason: CanonicalTemporalQualificationRejectionReasonV1,
): EstrProductionRuntimeTemporalUnavailableV1 {
  return Object.freeze({ availability: "unavailable", productId: "estr", reason,
    policyVersion: CANONICAL_TEMPORAL_ADMISSION_POLICY_VERSION_V1,
    missing: Object.freeze(["temporal"] as const) });
}

function unavailable(
  reason: string,
  missing: EstrProductionRuntimeMissingFieldV1,
): EstrProductionRuntimeResultV1 {
  return Object.freeze({
    availability: "unavailable",
    reason,
    missing: Object.freeze([missing]),
  });
}
