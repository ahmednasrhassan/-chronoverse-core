import type { GoldIntelligenceResult } from "../../assets/gold/intelligence";
import type { FullLiveGoldIntelligenceResult } from "../../assets/gold/liveFull";
import type { OilIntelligenceResult } from "../../assets/oil/intelligence";
import type { LiveOilIntelligenceResult } from "../../assets/oil/runtime";
import type { MarketRiskResult } from "../../core/riskEngine";
import type { MarketSignalResult } from "../../core/signalEngine";
import {
  ENGINE_RESULT_VERSION,
  type EngineMarketDataV3,
  type EngineRegimeV3,
  type EngineResultV3,
} from "../../engine/contracts";

type GoldMacroCompatibility = Pick<
  NonNullable<GoldIntelligenceResult["macro"]>,
  "factors"
>;

type GoldMigrationCompatibility = {
  readonly indicators: GoldIntelligenceResult["indicators"];
};

type OilMacroCompatibility = Pick<
  NonNullable<OilIntelligenceResult["macro"]>,
  "drivers"
>;

type OilMigrationCompatibility = {
  readonly marketData: LiveOilIntelligenceResult["marketData"];
};

const futureLayersNotComputed = {
  crossAsset: { availability: "not-computed" },
  positioning: { availability: "unavailable", reason: "No source configured" },
  scenario: { availability: "not-computed" },
  contradiction: { availability: "not-computed" },
  confidence: { availability: "not-computed" },
  decision: { availability: "not-computed" },
  recommendation: { availability: "not-computed" },
} as const;

const technical = {
  price: 2_400,
  emaFast: 2_390,
  emaMedium: 2_375,
  emaSlow: 2_350,
  rsi: 58,
  macd: 4,
  macdSignal: 3,
  macdHistogram: 1,
  momentum: 12,
  roc: 0.5,
  annualizedVolatility: 18,
  priceVsEmaMedium: 1.05,
  priceVsEmaSlow: 2.13,
};

const signal: MarketSignalResult = {
  score: 0.42,
  direction: "bullish",
  strength: "moderate",
  confidence: 0.72,
  reasons: ["Trend is constructive"],
};

const risk: MarketRiskResult = {
  level: "moderate",
  score: 0.38,
  reasons: ["Volatility is contained"],
};

const state = { state: "opportunity", confidence: 0.72 } as const;

const currentRegime = {
  timestamp: "2026-01-01T00:00:00.000Z",
  state: "opportunity",
  confidence: 0.72,
  signalDirection: "bullish",
  signalConfidence: 0.72,
  macroBias: "bullish",
  macroConfidence: 0.65,
  riskLevel: "moderate",
  riskScore: 0.38,
} as const;

const regimeMemory: FullLiveGoldIntelligenceResult["regimeMemory"] = {
  current: currentRegime,
  previous: null,
  transition: {
    changed: false,
    from: null,
    to: "opportunity",
    direction: "new",
  },
  conviction: {
    current: 72,
    previous: null,
    change: null,
    direction: "stable",
  },
  technical: {
    current: "bullish",
    previous: null,
    confidence: 72,
    previousConfidence: null,
    change: "stable",
  },
  macro: {
    current: "bullish",
    previous: null,
    confidence: 65,
    previousConfidence: null,
    change: "stable",
  },
  risk: {
    currentLevel: "moderate",
    previousLevel: null,
    currentScore: 0.38,
    previousScore: null,
    change: "stable",
  },
};

const goldMacroDetails: GoldMacroCompatibility = {
  factors: {
    realYield10Y: 1.7,
    nominalYield10Y: 4.2,
    dollarIndexProxy: 102,
    inflationExpectation10Y: 2.5,
  },
};

const goldMigrationDetails: GoldMigrationCompatibility = {
  indicators: {
    ema20: 2_390,
    ema50: 2_375,
    ema200: 2_350,
    rsi: 58,
    macd: 4,
    macdSignal: 3,
    macdHistogram: 1,
    momentum: 12,
    roc: 0.5,
    annualizedVolatility: 18,
    priceVsEma50: 1.05,
    priceVsEma200: 2.13,
  },
};

export const goldLikeEngineResult = {
  version: ENGINE_RESULT_VERSION,
  asset: "gold",
  symbol: "XAUUSD",
  evaluatedAt: "2026-01-01T00:00:00.000Z",
  marketData: {
    availability: "available",
    provider: "configured-quote-provider",
    status: "realtime",
    provenance: {
      provider: "configured-quote-provider",
      fetchedAt: 1_767_225_600_000,
      sourceTimestamp: 1_767_225_600,
    },
    historicalWindow: {
      requestedFrom: 1_751_328_000,
      requestedTo: 1_767_225_600,
      firstTimestamp: 1_751_328_000,
      lastTimestamp: 1_767_225_600,
      receivedPoints: 126,
    },
    latestTimestampSeconds: 1_767_225_600,
  },
  technical: { availability: "available", data: technical },
  macro: {
    availability: "available",
    data: {
      direction: "bullish",
      score: 0.35,
      strength: "moderate",
      confidence: 0.65,
      coverage: 1,
      drivers: [
        { id: "real-yield-10y", available: true, contribution: 0.2 },
        { id: "dollar-index", available: true, contribution: 0.15 },
      ],
      reasons: ["Real yields support gold"],
      migrationDetails: goldMacroDetails,
    },
  },
  signal,
  risk,
  state,
  regime: { availability: "available", memory: regimeMemory },
  migrationDetails: goldMigrationDetails,
  ...futureLayersNotComputed,
} as const satisfies EngineResultV3<
  GoldMacroCompatibility,
  GoldMigrationCompatibility
>;

const oilMacroDetails: OilMacroCompatibility = {
  drivers: {
    inventories: { score: -0.4, available: true, reason: "Inventories rose" },
    production: { score: 0, available: true, reason: "Production was stable" },
    globalDemand: { score: 0, available: false, reason: "Series unavailable" },
    usd: { score: 0.1, available: true, reason: "USD weakened" },
  },
};

const oilMigrationDetails: OilMigrationCompatibility = {
  marketData: {
    provider: "configured-history-provider",
    status: "delayed",
  },
};

export const oilLikeEngineResult = {
  version: ENGINE_RESULT_VERSION,
  asset: "oil",
  symbol: "CL=F",
  evaluatedAt: "2026-01-01T00:00:00.000Z",
  marketData: {
    availability: "partial",
    provider: "configured-history-provider",
    status: "delayed",
    latestTimestampSeconds: 1_767_225_600,
  },
  technical: { availability: "available", data: technical },
  macro: {
    availability: "partial",
    missing: ["global-demand"],
    data: {
      direction: "neutral",
      score: 0,
      confidence: 0.45,
      coverage: 0.75,
      drivers: [
        { id: "inventories", available: true, direction: "bearish" },
        { id: "production", available: true, direction: "neutral" },
        { id: "global-demand", available: false, reason: "Series unavailable" },
      ],
      reasons: ["Macro coverage is incomplete"],
      migrationDetails: oilMacroDetails,
    },
  },
  signal,
  risk,
  state,
  regime: {
    availability: "partial",
    current: currentRegime,
    missing: ["previous-snapshot"],
  },
  migrationDetails: oilMigrationDetails,
  ...futureLayersNotComputed,
} as const satisfies EngineResultV3<
  OilMacroCompatibility,
  OilMigrationCompatibility
>;

export const unavailableLayersEngineResult = {
  version: ENGINE_RESULT_VERSION,
  asset: "bitcoin",
  symbol: "BTCUSD",
  evaluatedAt: "2026-01-01T00:00:00.000Z",
  marketData: {
    availability: "unavailable",
    provider: null,
    status: "unavailable",
    reason: "No market data available",
  },
  technical: { availability: "unavailable", reason: "No price history" },
  macro: { availability: "unavailable", reason: "No macro data" },
  signal,
  risk,
  state,
  regime: { availability: "unavailable", reason: "No regime snapshot" },
  ...futureLayersNotComputed,
} as const satisfies EngineResultV3;

// @ts-expect-error Available market data cannot have unavailable status.
const invalidAvailableStatus: EngineMarketDataV3 = {
  availability: "available",
  provider: "provider",
  status: "unavailable",
};

// @ts-expect-error Unavailable market data must have unavailable status.
const invalidUnavailableStatus: EngineMarketDataV3 = {
  availability: "unavailable",
  provider: "provider",
  status: "realtime",
};

// @ts-expect-error Available market data requires a provider.
const invalidAvailableProvider: EngineMarketDataV3 = {
  availability: "available",
  provider: null,
  status: "realtime",
};

// @ts-expect-error Available regime cannot duplicate memory.current.
const invalidAvailableRegime: EngineRegimeV3 = {
  availability: "available",
  memory: regimeMemory,
  current: currentRegime,
};

void invalidAvailableStatus;
void invalidUnavailableStatus;
void invalidAvailableProvider;
void invalidAvailableRegime;
