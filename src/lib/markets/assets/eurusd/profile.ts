import {
  defineMarketAssetProfile,
} from "../../core/assetProfile";

export const eurusdProfile =
  defineMarketAssetProfile({
    id: "eurusd",

    symbol: "EURUSD=X",

    displayName: "EUR/USD",

    assetClass: "forex",

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
      bullishThreshold: 0.8,
      bearishThreshold: -0.75,
      neutralThreshold: 0.3,

      calibration: {
        weights: {
          ema: 0.25,
          rsi: 0.25,
          macd: 0.25,
          roc: 0.25,
        },

        ema: {
          toleranceRatio: 0.0001,
          minimumTolerance: 0.000001,
          allAveragesMultiplier: 0.55,
          moderateBiasMultiplier: 0.25,
        },

        rsi: {
          extremeMultiplier: 0.75,
        },

        macd: {
          epsilon: 0.0001,
          zeroBiasMultiplier: 0.6,
        },

        roc: {
          strongThreshold: 2.7,
          directionalThreshold: 1.1,
          strongMultiplier: 1,
          directionalMultiplier: 0.75,
          mildMultiplier: 0.35,
        },

        strength: {
          moderateThreshold: 0.65,
          strongThreshold: 0.9,
        },

        confidence: {
          base: 0.4,
          directional: 0.6,
          riskPenalty: 0.35,
        },
      },
    },

    risk: {
      low: 0.2,
      moderate: 0.25,
      high: 0.5,

      calibration: {
        weights: {
          volatility: 0.2,
          rsi: 0.15,
          roc: 0.2,
          macd: 0.15,
          emaMedium: 0.15,
          emaSlow: 0.15,
        },

        volatility: {
          moderateThreshold: 10.5,
          highThreshold: 14,
          severity: {
            low: 0.2,
            moderate: 0.6,
            high: 1,
          },
        },

        rsi: {
          stretchedLow: 40,
          stretchedHigh: 62,
          severity: {
            low: 0.2,
            moderate: 0.6,
            high: 1,
          },
        },

        roc: {
          moderateThreshold: 2,
          highThreshold: 3.4,
          severity: {
            low: 0.2,
            moderate: 0.6,
            high: 1,
          },
        },

        macd: {
          highThreshold: 0.0035,
          lowSeverity: 0.2,
          highSeverity: 1,
        },

        emaMedium: {
          moderateThreshold: 2.2,
          highThreshold: 3.8,
          severity: {
            low: 0.2,
            moderate: 0.6,
            high: 1,
          },
        },

        emaSlow: {
          moderateThreshold: 4.7,
          highThreshold: 8,
          severity: {
            low: 0.2,
            moderate: 0.6,
            high: 1,
          },
        },
      },
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
