/**
 * Chronoverse Capital
 * Shared Indicator Types
 */

export type IndicatorValue = number | null;

export type IndicatorSeries = IndicatorValue[];

export type IndicatorDirection =
  | "bullish"
  | "bearish"
  | "neutral";

export type IndicatorStrength =
  | "weak"
  | "moderate"
  | "strong";

export type IndicatorSignal = {
  direction: IndicatorDirection;
  strength: IndicatorStrength;
  confidence: number;
  reason?: string;
};

export type IndicatorSnapshot = {
  ema?: IndicatorSeries;
  rsi?: IndicatorSeries;
  macd?: {
    macd: IndicatorSeries;
    signal: IndicatorSeries;
    histogram: IndicatorSeries;
  };
  momentum?: {
    momentum: IndicatorSeries;
    roc: IndicatorSeries;
  };
  volatility?: {
    standardDeviation: IndicatorSeries;
    annualizedVolatility: IndicatorSeries;
  };
};