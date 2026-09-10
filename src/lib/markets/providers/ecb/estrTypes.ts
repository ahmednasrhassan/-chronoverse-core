import type {
  CanonicalObservationSeriesV1,
} from "../../services/canonicalObservationSeries";

export type EcbEstrDataTypeV1 = "WT" | "RP" | "CM";
export type EcbEstrPublicationTypeV1 = "standard" | "republication";
export type EcbEstrCalculationMethodV1 = "normal" | "contingency";

export interface EcbEstrRawObservationV1 {
  readonly seriesId: string;
  readonly frequency: string;
  readonly benchmarkItem: string;
  readonly dataType: EcbEstrDataTypeV1;
  readonly period: string;
  readonly value: string;
  readonly observationStatus: string;
  readonly confidentialityStatus: string;
  readonly unitMeasure: string;
  readonly unitMultiplier: string;
}

export interface EcbEstrDataResultV1 {
  readonly provider: "ecb";
  readonly observations: readonly EcbEstrRawObservationV1[];
}

export interface EcbEstrObservationMetadataV1 {
  /** ECB reference date, not publication date. */
  readonly referenceDate: string;
  /** UTC-midnight encoding of referenceDate under the canonical convention. */
  readonly timestamp: number;
  readonly observationStatus: Readonly<{
    readonly headline: string;
    readonly publicationType: string;
    readonly calculationMethod: string;
  }>;
  readonly confidentialityStatus: Readonly<{
    readonly headline: string;
    readonly publicationType: string;
    readonly calculationMethod: string;
  }>;
  readonly publicationType: EcbEstrPublicationTypeV1;
  readonly calculationMethod: EcbEstrCalculationMethodV1;
}

export interface EcbEstrSeriesV1 {
  readonly schemaVersion: "ecb-estr-series-v1";
  readonly dataflow: "ECB/EST/1.0";
  readonly seriesKey: "B.EU000A2X2A25.WT";
  readonly canonicalSeries: CanonicalObservationSeriesV1;
  readonly observationMetadata: readonly EcbEstrObservationMetadataV1[];
}
