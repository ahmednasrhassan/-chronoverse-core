import {
  calculateEMA,
  calculateMACD,
  calculateMomentum,
  calculateRSI,
  calculateVolatility,
} from "../indicators";

import type {
  MarketAssetProfile,
} from "./assetProfile";

export type MarketTechnicalSnapshot = {
  price: number | null;

  emaFast: number | null;
  emaMedium: number | null;
  emaSlow: number | null;

  rsi: number | null;

  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;

  momentum: number | null;
  roc: number | null;

  annualizedVolatility:
    | number
    | null;

  priceVsEmaMedium:
    | number
    | null;

  priceVsEmaSlow:
    | number
    | null;
};

export type MarketIntelligenceEngineInput = {
  profile: MarketAssetProfile;

  closes: readonly number[];
};

/**
 * Chronoverse Capital
 * Shared Market Intelligence Engine
 *
 * Responsibilities:
 * - validate normalized price history
 * - calculate shared technical indicators
 * - obey asset-specific profile settings
 * - remain provider agnostic
 * - remain UI agnostic
 *
 * Asset-specific Risk / Signal / Macro logic
 * will plug into this shared engine separately.
 */
export function calculateMarketTechnicalIntelligence(
  input: MarketIntelligenceEngineInput,
): MarketTechnicalSnapshot {
  const {
    profile,
    closes,
  } = input;

  validateCloses(
    closes,
    profile.displayName,
  );

  if (closes.length === 0) {
    return createEmptyTechnicalSnapshot();
  }

  const price =
    closes[
      closes.length - 1
    ];

  /*
   * ------------------------------------------------------
   * EMA
   * ------------------------------------------------------
   */

  const emaFastSeries =
    calculateEMA(
      closes,
      profile.technical.ema.fast,
    );

  const emaMediumSeries =
    calculateEMA(
      closes,
      profile.technical.ema.medium,
    );

  const emaSlowSeries =
    calculateEMA(
      closes,
      profile.technical.ema.slow,
    );

  /*
   * ------------------------------------------------------
   * RSI
   * ------------------------------------------------------
   */

  const rsiSeries =
    calculateRSI(
      closes,
      profile.technical.rsi.period,
    );

  /*
   * ------------------------------------------------------
   * MACD
   * ------------------------------------------------------
   */

  const macdResult =
    calculateMACD(
      closes,
      profile.technical.macd.fastPeriod,
      profile.technical.macd.slowPeriod,
      profile.technical.macd.signalPeriod,
    );

  /*
   * ------------------------------------------------------
   * MOMENTUM / ROC
   * ------------------------------------------------------
   */

  const momentumResult =
    calculateMomentum(
      closes,
      profile.technical.momentum.period,
    );

  /*
   * ------------------------------------------------------
   * VOLATILITY
   * ------------------------------------------------------
   */

  const volatilityResult =
    calculateVolatility(
      closes,
      profile.technical.volatility.period,
      profile.technical.volatility
        .annualizationFactor,
    );

  /*
   * ------------------------------------------------------
   * LATEST VALUES
   * ------------------------------------------------------
   */

  const emaFast =
    latest(
      emaFastSeries,
    );

  const emaMedium =
    latest(
      emaMediumSeries,
    );

  const emaSlow =
    latest(
      emaSlowSeries,
    );

  const rsi =
    latest(
      rsiSeries,
    );

  const macd =
    latest(
      macdResult.macd,
    );

  const macdSignal =
    latest(
      macdResult.signal,
    );

  const macdHistogram =
    latest(
      macdResult.histogram,
    );

  const momentum =
    latest(
      momentumResult.momentum,
    );

  const roc =
    latest(
      momentumResult.roc,
    );

  const annualizedVolatility =
    latest(
      volatilityResult
        .annualizedVolatility,
    );

  /*
   * ------------------------------------------------------
   * STRUCTURAL DISTANCES
   * ------------------------------------------------------
   */

  const priceVsEmaMedium =
    percentageDistance(
      price,
      emaMedium,
    );

  const priceVsEmaSlow =
    percentageDistance(
      price,
      emaSlow,
    );

  return {
    price,

    emaFast,
    emaMedium,
    emaSlow,

    rsi,

    macd,
    macdSignal,
    macdHistogram,

    momentum,
    roc,

    annualizedVolatility,

    priceVsEmaMedium,
    priceVsEmaSlow,
  };
}

function createEmptyTechnicalSnapshot():
  MarketTechnicalSnapshot {
  return {
    price: null,

    emaFast: null,
    emaMedium: null,
    emaSlow: null,

    rsi: null,

    macd: null,
    macdSignal: null,
    macdHistogram: null,

    momentum: null,
    roc: null,

    annualizedVolatility: null,

    priceVsEmaMedium: null,
    priceVsEmaSlow: null,
  };
}

function latest(
  values: readonly (
    number | null
  )[],
): number | null {
  if (values.length === 0) {
    return null;
  }

  return (
    values[
      values.length - 1
    ] ?? null
  );
}

function percentageDistance(
  price: number,
  reference: number | null,
): number | null {
  if (
    reference === null ||
    reference === 0
  ) {
    return null;
  }

  return (
    (
      (
        price -
        reference
      ) /
      reference
    ) *
    100
  );
}

function validateCloses(
  closes: readonly number[],
  assetName: string,
): void {
  for (
    let index = 0;
    index < closes.length;
    index += 1
  ) {
    const value =
      closes[
        index
      ];

    if (
      !Number.isFinite(
        value,
      ) ||
      value <= 0
    ) {
      throw new Error(
        `[Chronoverse ${assetName}] Invalid close value at index ${index}.`,
      );
    }
  }
}