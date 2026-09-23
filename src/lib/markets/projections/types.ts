import type { EcbFxProductionIntelligenceV1 } from
  "../assets/ecbFxProductionRuntime";
import type { EstrProductionRuntimeResultV1 } from
  "../assets/estr/runtime";
import type {
  CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1,
  CanonicalObservationSeriesMetadataV1,
  CanonicalSourceSubstitutionV1,
} from
  "../services/canonicalObservationSeries";
import type { EngineMarketDataFreshnessV3 } from
  "../engine/marketDataFreshness";
import type { EcbMonetaryPolicyEventIntelligenceV1 } from
  "../events/ecbMonetaryPolicyIntelligence";

export const MARKET_PRODUCT_PROJECTION_VERSION_V1 =
  "market-product-projection-v1" as const;

export type MarketProductProjectionTierV1 = "free-lite" | "vip-deep";

export type FxProjectionProductIdV1 =
  | "eurusd"
  | "eurjpy"
  | "eurgbp"
  | "eurchf";

export type MarketProjectionProductIdV1 = FxProjectionProductIdV1 | "estr";

export type MarketProjectionDisplayNameV1 =
  | "EUR/USD"
  | "EUR/JPY"
  | "EUR/GBP"
  | "EUR/CHF"
  | "\u20acSTR";

export type MarketProductVipEcbPolicyEventRelevanceV1 =
  | "euro-policy-context"
  | "direct-euro-rate-policy-context";

/** Stable Deep projection state; deliberately independent of the runtime type. */
export type MarketProductVipEcbPolicyEventStateV1 =
  | {
      readonly status: "available";
      readonly canonicalEventId: string;
      readonly canonicalMeetingDate: string;
      readonly currentMeetingDate: string;
      readonly selectedSnapshotKnownAt: number;
      readonly selectionState: "current-window" | "next-scheduled";
      readonly intelligence: EcbMonetaryPolicyEventIntelligenceV1;
      readonly source: {
        readonly sourceUrl: string;
        readonly fetchedAt: number;
      };
    }
  | {
      readonly status: "source-unavailable" | "source-malformed";
      readonly sourceUrl: string;
      readonly reason: string;
    }
  | {
      readonly status: "no-relevant-event";
      readonly sourceUrl: string;
      readonly fetchedAt: number;
    }
  | {
      readonly status: "reconciliation-required";
      readonly reason:
        | "active-date-missing"
        | "new-earlier-event"
        | "schedule-normalization"
        | "decision-date-mismatch";
      readonly canonicalEventId?: string;
      readonly currentMeetingDate?: string;
      readonly conflictingMeetingDate?: string;
    }
  | {
      readonly status: "persistence-unavailable";
      readonly owner: "active-event" | "event-memory";
      readonly reason: string;
    }
  | {
      readonly status: "stored-state-invalid";
      readonly owner: "active-event" | "event-memory";
    }
  | {
      readonly status: "insufficient-as-known-state";
      readonly canonicalEventId: string;
      readonly evaluatedAt: string;
    }
  | {
      readonly status: "runtime-unavailable";
      readonly reason: "unexpected-runtime-error";
    };

export type MarketProductVipEcbPolicyEventContextV1<
  TRelevance extends MarketProductVipEcbPolicyEventRelevanceV1 =
    MarketProductVipEcbPolicyEventRelevanceV1,
> =
  MarketProductVipEcbPolicyEventStateV1 & {
    readonly relevance: TRelevance;
  };

export interface CanonicalProjectionUnavailableInputV1 {
  readonly availability: "unavailable";
  readonly reason: string;
  readonly missing?: readonly string[];
}

export type FxCanonicalProjectionResultV1 =
  | EcbFxProductionIntelligenceV1
  | CanonicalProjectionUnavailableInputV1;

export type FiveProductCanonicalProjectionInputV1 =
  | {
      readonly productId: FxProjectionProductIdV1;
      readonly canonical: FxCanonicalProjectionResultV1;
    }
  | {
      readonly productId: "estr";
      readonly canonical: EstrProductionRuntimeResultV1;
    };

export interface MarketProjectionProvenanceV1 {
  readonly version: typeof CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1;
  readonly provider: string;
  readonly source: string;
  readonly originalPublisher: string | null;
  readonly substitution: CanonicalSourceSubstitutionV1;
  readonly seriesId: string;
  readonly canonicalProductId: MarketProjectionProductIdV1;
  readonly interval: CanonicalObservationSeriesMetadataV1["interval"];
  readonly status: CanonicalObservationSeriesMetadataV1["status"];
  readonly unit: string;
  readonly seriesKind: CanonicalObservationSeriesMetadataV1["seriesKind"];
  readonly referenceDate: string;
  readonly fetchedAt: number;
  /** Latest observation/reference time; never a publication timestamp. */
  readonly observationTimestamp: number;
  readonly sourceTimestamp: number;
  /** Null means no source-supplied publication time is known. */
  readonly releaseTimestamp: number | null;
  readonly publicationType?: "standard" | "republication";
  readonly freshness: EngineMarketDataFreshnessV3 | "not-assessed";
  readonly freshnessAssessedAt: string | null;
}

export type MarketProjectionCurrentValueV1 =
  | {
      readonly kind: "fx-reference-rate";
      readonly value: number;
      readonly unit: string;
    }
  | {
      readonly kind: "rate-percent";
      readonly value: number;
      readonly unit: "percent";
    };

interface AvailableProjectionBaseV1<
  TTier extends MarketProductProjectionTierV1,
  TProductId extends MarketProjectionProductIdV1,
  TProductKind extends "fx" | "rate",
  TDetails,
> {
  readonly version: typeof MARKET_PRODUCT_PROJECTION_VERSION_V1;
  readonly tier: TTier;
  readonly availability: "available";
  readonly productId: TProductId;
  readonly displayName: MarketProjectionDisplayNameV1;
  readonly productKind: TProductKind;
  readonly currentValue: TProductKind extends "fx"
    ? Extract<MarketProjectionCurrentValueV1, { readonly kind: "fx-reference-rate" }>
    : Extract<MarketProjectionCurrentValueV1, { readonly kind: "rate-percent" }>;
  readonly referenceDate: string;
  readonly fetchedAt: number;
  readonly sourceTimestamp: number;
  readonly interval: CanonicalObservationSeriesMetadataV1["interval"];
  readonly status: CanonicalObservationSeriesMetadataV1["status"];
  readonly provenance: MarketProjectionProvenanceV1;
  readonly details: TDetails;
}

export interface FxFreeLiteDetailsV1 {
  readonly kind: "fx";
  readonly direction: EcbFxProductionIntelligenceV1["intelligence"]["signal"]["direction"];
  readonly signalStrength: EcbFxProductionIntelligenceV1["intelligence"]["signal"]["strength"];
  readonly marketState: EcbFxProductionIntelligenceV1["intelligence"]["state"];
  readonly riskLevel: EcbFxProductionIntelligenceV1["intelligence"]["risk"]["level"];
  readonly annualizedVolatility:
    EcbFxProductionIntelligenceV1["intelligence"]["technical"]["annualizedVolatility"];
}

type EstrAvailableRuntimeV1 = Extract<
  EstrProductionRuntimeResultV1,
  { readonly availability: "available" }
>["data"];

export interface EstrFreeLiteDetailsV1 {
  readonly kind: "rate";
  readonly currentRatePercent: number;
  readonly direction: EstrAvailableRuntimeV1["marketState"]["data"]["direction"];
  readonly signalStrength:
    EstrAvailableRuntimeV1["marketState"]["data"]["signalStrength"];
  readonly riskLevel: EstrAvailableRuntimeV1["marketState"]["data"]["riskLevel"];
  readonly levelRegime:
    EstrAvailableRuntimeV1["marketState"]["data"]["levelRegime"];
  readonly volatilityRegime:
    EstrAvailableRuntimeV1["marketState"]["data"]["volatilityRegime"];
}

type FxEngineResultV3 = EcbFxProductionIntelligenceV1["engineResult"];

export type FxVipEngineProjectionV1 = Pick<
  FxEngineResultV3,
  | "version"
  | "evaluatedAt"
  | "macro"
  | "regime"
  | "crossAsset"
  | "positioning"
  | "scenario"
  | "invalidation"
  | "contradiction"
  | "confidence"
  | "decision"
  | "decisionLifecycle"
  | "recommendation"
>;

export interface FxVipDeepDetailsV1 extends FxFreeLiteDetailsV1 {
  readonly ecbPolicyEvent: MarketProductVipEcbPolicyEventContextV1<
    "euro-policy-context"
  >;
  readonly confidence: EcbFxProductionIntelligenceV1["intelligence"]["confidence"];
  readonly technical: EcbFxProductionIntelligenceV1["intelligence"]["technical"];
  readonly signal: EcbFxProductionIntelligenceV1["intelligence"]["signal"];
  readonly risk: EcbFxProductionIntelligenceV1["intelligence"]["risk"];
  readonly calibration: EcbFxProductionIntelligenceV1["calibration"];
  /** Deep Engine V3 intelligence with raw market-data candles excluded. */
  readonly engine: FxVipEngineProjectionV1;
}

export interface EstrVipDeepDetailsV1 extends EstrFreeLiteDetailsV1 {
  readonly ecbPolicyEvent: MarketProductVipEcbPolicyEventContextV1<
    "direct-euro-rate-policy-context"
  >;
  readonly rateFeatures: EstrAvailableRuntimeV1["features"];
  readonly signal: EstrAvailableRuntimeV1["signal"]["data"];
  readonly risk: EstrAvailableRuntimeV1["risk"]["data"];
  readonly marketState: EstrAvailableRuntimeV1["marketState"]["data"];
  readonly engineEvidence:
    EstrAvailableRuntimeV1["engineAdapter"]["data"]["engineEvidence"];
}

export type FxFreeLiteProjectionV1 = AvailableProjectionBaseV1<
  "free-lite",
  FxProjectionProductIdV1,
  "fx",
  FxFreeLiteDetailsV1
>;

export type EstrFreeLiteProjectionV1 = AvailableProjectionBaseV1<
  "free-lite",
  "estr",
  "rate",
  EstrFreeLiteDetailsV1
>;

export type FxVipDeepProjectionV1 = AvailableProjectionBaseV1<
  "vip-deep",
  FxProjectionProductIdV1,
  "fx",
  FxVipDeepDetailsV1
>;

export type EstrVipDeepProjectionV1 = AvailableProjectionBaseV1<
  "vip-deep",
  "estr",
  "rate",
  EstrVipDeepDetailsV1
>;

export interface MarketProductUnavailableProjectionV1 {
  readonly version: typeof MARKET_PRODUCT_PROJECTION_VERSION_V1;
  readonly tier: MarketProductProjectionTierV1;
  readonly availability: "unavailable";
  readonly productId: MarketProjectionProductIdV1;
  readonly displayName: MarketProjectionDisplayNameV1;
  readonly productKind: "fx" | "rate";
  readonly reason: string;
  readonly missing?: readonly string[];
}

export type MarketProductFreeLiteProjectionV1 =
  | FxFreeLiteProjectionV1
  | EstrFreeLiteProjectionV1
  | MarketProductUnavailableProjectionV1;

export type MarketProductVipDeepProjectionV1 =
  | FxVipDeepProjectionV1
  | EstrVipDeepProjectionV1
  | MarketProductUnavailableProjectionV1;

export type MarketProductProjectionV1 =
  | MarketProductFreeLiteProjectionV1
  | MarketProductVipDeepProjectionV1;
