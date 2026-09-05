import {
  defineMarketAssetProfile,
} from "../../core/assetProfile";

export const naturalGasProfile =
  defineMarketAssetProfile({
    id: "naturalGas",

    symbol: "NG=F",

    displayName: "Natural Gas (Henry Hub)",

    assetClass: "commodity",

    defaultInterval: "1d",

    historyLimit: 600,

    technical: {
      ema: {
        fast: 20,
        medium: 50,
        slow: 200,
      },

      rsi: {
        period: 14,

        oversold: 30,
        neutralLow: 45,
        neutralHigh: 55,
        overbought: 70,
      },

      macd: {
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
      },

      momentum: {
        period: 10,
      },

      volatility: {
        period: 20,
        annualizationFactor: 252,
      },
    },

    signal: {
      bullishThreshold: 0.6,
      bearishThreshold: -0.6,
      neutralThreshold: 0.2,
    },

    risk: {
      low: 0.3,
      moderate: 0.6,
      high: 0.8,
    },

    macro: {
      enabled: false,
      drivers: [],
    },

    regimeMemory: {
      enabled: false,
      maxHistory: 120,
    },
  });
