export type MarketDirection =
  | "bullish"
  | "bearish"
  | "neutral";

export type MarketRegime =
  | "opportunity"
  | "caution"
  | "risk";

export type MarketRiskLevel =
  | "low"
  | "moderate"
  | "high";

export type MarketConflictLevel =
  | "none"
  | "low"
  | "moderate"
  | "high";

export interface CoreTechnicalSnapshot {
  emaFast: number | null;
  emaMedium: number | null;
  emaSlow: number | null;

  rsi: number | null;

  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;

  momentum: number | null;
  roc: number | null;

  annualizedVolatility: number | null;
}

export interface CoreSignalResult {
  score: number;
  direction: MarketDirection;
  strength: string;
  confidence: number;
  reasons: string[];
}

export interface CoreRiskResult {
  score: number;
  level: MarketRiskLevel;
  reasons: string[];
}

export interface CoreMacroResult {
  score: number;
  bias: MarketDirection;
  strength: string;
  confidence: number;
  coverage: number;
  reasons: string[];
}

export interface CoreIntelligenceResult {
  price: number | null;

  state: MarketRegime;

  confidence: number;

  summary: string;

  warnings: string[];

  signal: CoreSignalResult;

  risk: CoreRiskResult;

  macro: CoreMacroResult | null;

  indicators: CoreTechnicalSnapshot;
}