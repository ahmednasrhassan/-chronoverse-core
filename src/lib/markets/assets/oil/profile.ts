import {
  defineMarketAssetProfile,
} from "../../core/assetProfile";

export const oilProfile =
  defineMarketAssetProfile({
    id: "oil",

    symbol: "CL=F",

    displayName: "WTI Crude Oil",

    assetClass: "commodity",

    defaultInterval: "1d",

    historyLimit: 600,

    /*
     * ======================================================
     * TECHNICAL PROFILE
     * ======================================================
     */

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

    /*
     * ======================================================
     * SIGNAL PROFILE
     * ======================================================
     */

    signal: {
      bullishThreshold: 0.6,
      bearishThreshold: -0.6,
      neutralThreshold: 0.2,

      calibration: {
        weights: {
          ema: 0.35,
          rsi: 0.15,
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
          epsilon: 0.000001,
          zeroBiasMultiplier: 0.6,
        },

        roc: {
          strongThreshold: 6,
          directionalThreshold: 0.5,

          strongMultiplier: 1,
          directionalMultiplier: 0.75,
          mildMultiplier: 0.35,
        },

        strength: {
          moderateThreshold: 0.4,
          strongThreshold: 0.75,
        },

        confidence: {
          base: 0.4,
          directional: 0.6,
          riskPenalty: 0.35,
        },
      },
    },

    /*
     * ======================================================
     * RISK PROFILE
     * ======================================================
     */

    risk: {
      low: 0.3,
      moderate: 0.6,
      high: 0.8,

      calibration: {
        weights: {
          volatility: 0.3,
          rsi: 0.15,
          roc: 0.2,
          macd: 0.1,
          emaMedium: 0.1,
          emaSlow: 0.15,
        },

        /*
         * Oil normally carries structurally
         * higher realized volatility than Gold.
         */
        volatility: {
          moderateThreshold: 35,
          highThreshold: 55,

          severity: {
            low: 0.2,
            moderate: 0.6,
            high: 1,
          },
        },

        rsi: {
          stretchedLow: 40,
          stretchedHigh: 60,

          severity: {
            low: 0.2,
            moderate: 0.5,
            high: 1,
          },
        },

        /*
         * Wider ROC bands reflect the
         * faster price movement common in oil.
         */
        roc: {
          moderateThreshold: 6,
          highThreshold: 12,

          severity: {
            low: 0.2,
            moderate: 0.6,
            high: 1,
          },
        },

        /*
         * MACD histogram is price-scale dependent,
         * so Oil requires its own threshold.
         */
        macd: {
          highThreshold: 2,

          lowSeverity: 0.3,
          highSeverity: 1,
        },

        emaMedium: {
          moderateThreshold: 6,
          highThreshold: 12,

          severity: {
            low: 0.2,
            moderate: 0.6,
            high: 1,
          },
        },

        emaSlow: {
          moderateThreshold: 12,
          highThreshold: 22,

          severity: {
            low: 0.2,
            moderate: 0.6,
            high: 1,
          },
        },
      },
    },

    /*
     * ======================================================
     * MACRO PROFILE
     * ======================================================
     */

    macro: {
      enabled: true,

      drivers: [
        "inventories",
        "production",
        "global-demand",
        "usd",
      ],
    },

    /*
     * ======================================================
     * REGIME MEMORY PROFILE
     * ======================================================
     */

    regimeMemory: {
      enabled: true,

      maxHistory: 120,
    },
  });