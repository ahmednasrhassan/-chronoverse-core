export type EcbFxReferenceProductIdV1 =
  | "eurusd"
  | "eurjpy"
  | "eurgbp"
  | "eurchf";

export type EcbFxReferenceCurrencyV1 =
  | "USD"
  | "JPY"
  | "GBP"
  | "CHF";

export interface EcbFxReferenceProductV1 {
  readonly canonicalProductId: EcbFxReferenceProductIdV1;
  readonly ecbSeriesKey: string;
  readonly seriesId: string;
  readonly quoteCurrency: EcbFxReferenceCurrencyV1;
  readonly displayName: string;
  readonly quotation: string;
  readonly unit: string;
  readonly inverted: false;
}

export interface EcbFxReferenceRawObservationV1 {
  readonly seriesId: string;
  readonly period: string;
  readonly value: string;
}

export interface EcbFxReferenceDataResultV1 {
  readonly provider: "ecb";
  readonly requestedSeriesIds: readonly string[];
  readonly observations: readonly EcbFxReferenceRawObservationV1[];
}
